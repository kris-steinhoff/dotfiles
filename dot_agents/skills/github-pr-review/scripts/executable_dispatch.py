#!/usr/bin/env python3
"""Enumerate and prepare GitHub PR reviews for an idempotent Herdr workflow.

The helper deliberately owns only deterministic local/GitHub state. Herdr
placement and agent launch remain in their generic skills. Review state is
stored inside create-worktree's existing .herdr-dispatch.json marker.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


MARKER_NAME = ".herdr-dispatch.json"
MARKER_TAG = "herdr-dispatch"
SEARCH = "is:open -is:draft review-requested:@me -author:@me"
GH_FIELDS = "number,title,url,baseRefName,headRefName,headRefOid"


class DispatchError(Exception):
    pass


def run(argv, cwd=None):
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True)


def emit(obj, code=0):
    print(json.dumps(obj, separators=(",", ":")))
    raise SystemExit(code)


def judgment(reason, **partial):
    emit({"status": "needs_judgment", "reason": reason, **partial}, 2)


def fail(message):
    print(f"github-pr-review dispatch: {message}", file=sys.stderr)
    raise SystemExit(1)


def checked(argv, cwd=None, label=None):
    proc = run(argv, cwd=cwd)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise DispatchError(f"{label or ' '.join(argv)} failed ({proc.returncode}): {detail}")
    return proc.stdout.strip()


def repo_root(path):
    proc = run(["git", "-C", path, "rev-parse", "--show-toplevel"])
    if proc.returncode != 0:
        judgment(f"{path!r} is not a git checkout")
    return proc.stdout.strip()


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pr_item(raw):
    return {
        "number": raw.get("number"),
        "title": raw.get("title", ""),
        "url": raw.get("url", ""),
        "base_branch": raw.get("baseRefName", ""),
        "head_branch": raw.get("headRefName", ""),
        "head_sha": raw.get("headRefOid", ""),
    }


def gh_json(repo, *args):
    proc = run(["gh", *args], cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise DispatchError(f"gh {' '.join(args)} failed ({proc.returncode}): {detail}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as error:
        raise DispatchError(f"gh returned invalid JSON: {proc.stdout[:200]}") from error


def command_ready(args):
    repo = repo_root(args.repo)
    raw = gh_json(
        repo,
        "pr",
        "list",
        "--search",
        SEARCH,
        "--limit",
        str(args.limit),
        "--json",
        GH_FIELDS,
    )
    emit({"items": [pr_item(item) for item in raw]})


def pr_metadata(repo, number):
    raw = gh_json(repo, "pr", "view", str(number), "--json", GH_FIELDS)
    item = pr_item(raw)
    if not item["head_branch"] or not item["head_sha"]:
        judgment(f"PR #{number} has no usable head branch or commit", pr_number=number)
    proc = run(["git", "check-ref-format", "--branch", item["head_branch"]], cwd=repo)
    if proc.returncode != 0:
        judgment(
            f"PR #{number} head branch {item['head_branch']!r} is not a valid local branch name",
            pr_number=number,
            head_branch=item["head_branch"],
        )
    return item


def fetch_head(repo, number):
    target = f"refs/github-pr-review/{number}/head"
    refspec = f"+refs/pull/{number}/head:{target}"
    proc = run(["git", "fetch", "origin", refspec], cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip()
        lowered = detail.lower()
        if "couldn't find remote ref" in lowered or "not found" in lowered:
            judgment(f"PR #{number} is not available from origin", pr_number=number)
        raise DispatchError(f"git fetch {refspec} failed ({proc.returncode}): {detail}")
    return checked(["git", "rev-parse", target], cwd=repo, label="resolve fetched PR head")


def verified_metadata(repo, number):
    item = pr_metadata(repo, number)
    fetched = fetch_head(repo, number)
    if fetched != item["head_sha"]:
        item = pr_metadata(repo, number)
        fetched = fetch_head(repo, number)
    if fetched != item["head_sha"]:
        judgment(
            f"PR #{number} moved while it was being prepared; retry on the next queue pass",
            pr_number=number,
            reported_head=item["head_sha"],
            fetched_head=fetched,
        )
    return item


def branch_sha(repo, branch):
    proc = run(["git", "rev-parse", "--verify", f"refs/heads/{branch}"], cwd=repo)
    return proc.stdout.strip() if proc.returncode == 0 else None


def claim_ref(number):
    return f"refs/github-pr-review/{number}/branch"


def claimed_branch(repo, number):
    proc = run(["git", "symbolic-ref", "--quiet", claim_ref(number)], cwd=repo)
    return proc.stdout.strip() if proc.returncode == 0 else None


def claim_branch(repo, number, branch):
    wanted = f"refs/heads/{branch}"
    existing = claimed_branch(repo, number)
    if existing and existing != wanted:
        judgment(
            f"PR #{number} was previously prepared as {existing.removeprefix('refs/heads/')!r}, not {branch!r}",
            pr_number=number,
            head_branch=branch,
            claimed_branch=existing.removeprefix("refs/heads/"),
        )
    if not existing:
        checked(
            ["git", "symbolic-ref", claim_ref(number), wanted],
            cwd=repo,
            label=f"claim exact PR branch {branch}",
        )


def worktrees(repo):
    output = checked(["git", "worktree", "list", "--porcelain"], cwd=repo)
    entries = []
    current = {}
    for line in output.splitlines():
        if line.startswith("worktree "):
            if current:
                entries.append(current)
            current = {"path": line.removeprefix("worktree ")}
        elif line.startswith("branch "):
            ref = line.removeprefix("branch ")
            current["branch"] = ref.removeprefix("refs/heads/")
    if current:
        entries.append(current)
    return entries


def worktree_for_branch(repo, branch):
    return next((entry for entry in worktrees(repo) if entry.get("branch") == branch), None)


def marker_path(worktree):
    return os.path.join(worktree, MARKER_NAME)


def read_marker(worktree):
    try:
        with open(marker_path(worktree), encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def write_marker(worktree, marker):
    path = marker_path(worktree)
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=worktree, prefix=f".{MARKER_NAME}.", delete=False
        ) as handle:
            json.dump(marker, handle, separators=(",", ":"))
            handle.write("\n")
            temporary = handle.name
        os.replace(temporary, path)
    except OSError as error:
        raise DispatchError(f"cannot write {path}: {error}") from error


def review_state(marker):
    state = marker.get("github_pr_review")
    return state if isinstance(state, dict) else {}


def dirty(worktree):
    return bool(checked(["git", "status", "--porcelain"], cwd=worktree))


def action_payload(action, item, **extra):
    return {"action": action, **item, **extra}


def command_prepare(args):
    repo = repo_root(args.repo)
    item = verified_metadata(repo, args.pr_number)
    branch = item["head_branch"]
    wanted = item["head_sha"]
    current = branch_sha(repo, branch)
    checkout = worktree_for_branch(repo, branch)
    claim = claimed_branch(repo, args.pr_number)
    expected_claim = f"refs/heads/{branch}"

    if checkout:
        path = checkout["path"]
        marker = read_marker(path)
        state = review_state(marker)
        marker_matches = state.get("pr_number") == args.pr_number
        interrupted_creation = not state and claim == expected_claim
        if marker.get("created_by") != MARKER_TAG or not (marker_matches or interrupted_creation):
            judgment(
                f"exact PR head branch {branch!r} is already checked out by unrelated work",
                pr_number=args.pr_number,
                head_branch=branch,
                worktree=path,
            )

        recorded_status = state.get("status", "prepared" if interrupted_creation else "active")
        if current == wanted:
            if recorded_status == "complete":
                emit(action_payload("complete", item, worktree=path))
            if recorded_status == "prepared":
                emit(action_payload("dispatch", item, worktree=path, refreshed=False))
            emit(action_payload("already_active", item, worktree=path))

        if recorded_status != "complete":
            emit(
                action_payload(
                    "stale",
                    item,
                    worktree=path,
                    checked_out_head=current,
                    active_head=state.get("head_sha", current),
                )
            )
        if dirty(path):
            judgment(
                f"completed review worktree for PR #{args.pr_number} is dirty and cannot be refreshed",
                pr_number=args.pr_number,
                head_branch=branch,
                worktree=path,
            )

        checked(["git", "reset", "--hard", wanted], cwd=path, label="refresh completed review worktree")
        state.update(
            {
                "pr_number": args.pr_number,
                "head_branch": branch,
                "head_sha": wanted,
                "status": "prepared",
                "prepared_at": now(),
            }
        )
        state.pop("completed_at", None)
        marker["github_pr_review"] = state
        write_marker(path, marker)
        emit(action_payload("dispatch", item, worktree=path, refreshed=True))

    if current:
        if claim != expected_claim:
            judgment(
                f"unrelated local branch {branch!r} conflicts with PR #{args.pr_number}'s exact head name",
                pr_number=args.pr_number,
                head_branch=branch,
                local_head=current,
                pr_head=wanted,
            )
        if current != wanted:
            judgment(
                f"prepared branch {branch!r} does not match PR #{args.pr_number}'s current head",
                pr_number=args.pr_number,
                head_branch=branch,
                local_head=current,
                pr_head=wanted,
            )
    if not current:
        claim_branch(repo, args.pr_number, branch)
        checked(
            ["git", "update-ref", f"refs/heads/{branch}", wanted],
            cwd=repo,
            label=f"create exact PR branch {branch}",
        )
    emit(action_payload("dispatch", item, refreshed=False))


def assert_review_worktree(worktree, number, head_sha=None):
    root = repo_root(worktree)
    marker = read_marker(root)
    if marker.get("created_by") != MARKER_TAG:
        judgment(f"{root!r} is not a dispatch-created worktree", worktree=root)
    current = checked(["git", "rev-parse", "HEAD"], cwd=root)
    if head_sha and current != head_sha:
        judgment(
            f"worktree HEAD {current} does not match the review head {head_sha}",
            worktree=root,
            pr_number=number,
            head_sha=current,
        )
    state = review_state(marker)
    if state and state.get("pr_number") not in (None, number):
        judgment(
            f"worktree is already recorded for PR #{state.get('pr_number')}",
            worktree=root,
            pr_number=number,
        )
    return root, marker, state, current


def command_mark(args):
    root, marker, state, current = assert_review_worktree(
        args.worktree, args.pr_number, args.head_sha
    )
    branch = checked(["git", "branch", "--show-current"], cwd=root)
    state.update(
        {
            "pr_number": args.pr_number,
            "head_branch": branch,
            "head_sha": current,
            "status": args.status,
            f"{args.status}_at": now(),
        }
    )
    for key in ("pane_id", "workspace_id", "agent_name"):
        value = getattr(args, key)
        if value:
            state[key] = value
    if args.status != "complete":
        state.pop("completed_at", None)
    marker["github_pr_review"] = state
    write_marker(root, marker)
    emit({"status": args.status, "pr_number": args.pr_number, "head_sha": current, "worktree": root})


def command_complete(args):
    args.status = "complete"
    args.pane_id = None
    args.workspace_id = None
    args.agent_name = None
    command_mark(args)


def parser():
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)

    ready = sub.add_parser("ready", help="list open PRs awaiting review")
    ready.add_argument("--repo", default=os.getcwd())
    ready.add_argument("--limit", type=int, default=50)
    ready.set_defaults(func=command_ready)

    prepare = sub.add_parser("prepare", help="prepare one PR's exact local head branch")
    prepare.add_argument("--pr-number", type=int, required=True)
    prepare.add_argument("--repo", default=os.getcwd())
    prepare.set_defaults(func=command_prepare)

    mark = sub.add_parser("mark", help="record a prepared or active review pass")
    mark.add_argument("--worktree", required=True)
    mark.add_argument("--pr-number", type=int, required=True)
    mark.add_argument("--head-sha", required=True)
    mark.add_argument("--status", choices=("prepared", "active"), required=True)
    mark.add_argument("--pane-id")
    mark.add_argument("--workspace-id")
    mark.add_argument("--agent-name")
    mark.set_defaults(func=command_mark)

    complete = sub.add_parser("complete", help="record a terminal decision for one pass")
    complete.add_argument("--worktree", default=os.getcwd())
    complete.add_argument("--pr-number", type=int, required=True)
    complete.add_argument("--head-sha", required=True)
    complete.set_defaults(func=command_complete)
    return root


def main():
    args = parser().parse_args()
    try:
        args.func(args)
    except DispatchError as error:
        fail(str(error))


if __name__ == "__main__":
    main()
