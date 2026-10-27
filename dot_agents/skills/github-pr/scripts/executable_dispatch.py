#!/usr/bin/env python3
"""Enumerate and prepare GitHub PR reviews for an idempotent Herdr workflow.

The helper deliberately owns only deterministic local/GitHub state. Placement
and agent launch remain in the dispatch skill. Review state is stored inside
the .herdr-dispatch.json marker that `dispatch worktree create` stamps.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


MARKER_NAME = ".herdr-dispatch.json"
MARKER_TAG = "herdr-dispatch"
SEARCH = "is:open -is:draft review-requested:@me -author:@me"
GH_FIELDS = "number,title,url,author,baseRefName,headRefName,headRefOid"


class DispatchError(Exception):
    pass


class Judgment(Exception):
    def __init__(self, reason, **partial):
        super().__init__(reason)
        self.reason = reason
        self.partial = partial


def run(argv, cwd=None):
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True)


def emit(obj, code=0):
    print(json.dumps(obj, separators=(",", ":")))
    raise SystemExit(code)


def judgment(reason, **partial):
    emit({"status": "needs_judgment", "reason": reason, **partial}, 2)


def fail(message):
    print(f"github-pr dispatch: {message}", file=sys.stderr)
    raise SystemExit(1)


def checked(argv, cwd=None, label=None):
    proc = run(argv, cwd=cwd)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise DispatchError(f"{label or ' '.join(argv)} failed ({proc.returncode}): {detail}")
    return proc.stdout.strip()


def repo_root(path):
    proc = run(["git", "-C", path, "rev-parse", "--show-toplevel"])
    if proc.returncode == 0:
        return proc.stdout.strip()
    judgment(f"{path!r} is not a git checkout")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pr_item(raw):
    author = raw.get("author") or {}
    return {
        "number": raw.get("number"),
        "title": raw.get("title", ""),
        "url": raw.get("url", ""),
        # The author's full name, or their login when they have none (a bot).
        "author": author.get("name") or author.get("login", ""),
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
            f"PR #{number} moved while its head was being fetched; retry",
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


def herdr_result(*args):
    proc = run(["herdr", *args])
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout).get("result")
    except ValueError:
        return None


def reviewer_alive(state):
    """Whether the pass's recorded reviewer still runs in Herdr: True, False,
    or None when Herdr can't be asked. None counts as alive everywhere, so a
    Herdr hiccup never relaunches a reviewer that is still working."""
    if os.environ.get("HERDR_ENV") != "1":
        return None
    name = state.get("agent_name")
    if name and run(["herdr", "agent", "get", name]).returncode == 0:
        return True
    workspace = state.get("workspace_id")
    listed = herdr_result("workspace", "list")
    if not isinstance(listed, dict) or not isinstance(listed.get("workspaces"), list):
        return None
    open_ids = {w.get("workspace_id") for w in listed["workspaces"] if isinstance(w, dict)}
    if workspace not in open_ids:
        return False
    agents = herdr_result("agent", "list")
    if isinstance(agents, dict):
        agents = agents.get("agents")
    if not isinstance(agents, list):
        return None
    return any(isinstance(a, dict) and a.get("workspace_id") == workspace for a in agents)


def orphaned(state):
    """An active pass whose reviewer is gone: its agent and workspace closed,
    or its workspace open with no agent left in it."""
    return state.get("status") == "active" and reviewer_alive(state) is False


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
        if recorded_status == "active":
            if orphaned(state):
                # Its reviewer died mid-pass. Relaunch it at the PR's current head,
                # but only from a clean checkout still at the head it was reviewing.
                head = checked(["git", "rev-parse", "HEAD"], cwd=path)
                if dirty(path) or head != state.get("head_sha", current):
                    judgment(
                        f"PR #{args.pr_number}'s reviewer is gone, but its worktree has local "
                        "changes or a different HEAD, so it can't be relaunched as is",
                        pr_number=args.pr_number,
                        head_branch=branch,
                        worktree=path,
                    )
                if head != wanted:
                    checked(["git", "reset", "--hard", wanted], cwd=path, label="refresh orphaned review worktree")
                state.update({"head_sha": wanted, "status": "prepared", "prepared_at": now()})
                for key in ("pane_id", "workspace_id", "agent_name"):
                    state.pop(key, None)
                marker["github_pr_review"] = state
                write_marker(path, marker)
                emit(action_payload("dispatch", item, worktree=path, refreshed=head != wanted, relaunched=True))
            if current == wanted:
                emit(action_payload("already_active", item, worktree=path))
            # Its live reviewer moves the checkout itself, with `advance`.
            emit(
                action_payload(
                    "stale",
                    item,
                    worktree=path,
                    checked_out_head=current,
                    active_head=state.get("head_sha", current),
                )
            )

        if current == wanted:
            if recorded_status == "complete":
                emit(action_payload("complete", item, worktree=path))
            emit(action_payload("dispatch", item, worktree=path, refreshed=False))

        # A completed pass, or a prepared one whose launch never happened, at an
        # old head: move it to the new one.
        if dirty(path):
            judgment(
                f"review worktree for PR #{args.pr_number} is dirty and cannot be refreshed",
                pr_number=args.pr_number,
                head_branch=branch,
                worktree=path,
            )

        checked(["git", "reset", "--hard", wanted], cwd=path, label="refresh review worktree")
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


def cleanup_verdict(entry, state, queued):
    number = state["pr_number"]
    path = entry["path"]
    if state.get("status") != "complete":
        if orphaned(state):
            if number in queued:
                return "keep", "its reviewer is gone; the next prepare relaunches it"
            return "keep", "its reviewer is gone and review is no longer requested"
        return "keep", "the review pass has not reached a terminal decision"
    if number in queued:
        return "keep", "review is requested again, so the next prepare refreshes it"
    if os.path.realpath(os.getcwd()).startswith(os.path.realpath(path) + os.sep):
        return "keep", "it is the current working directory"
    if dirty(path):
        return "keep", "the worktree has uncommitted changes"
    head = checked(["git", "rev-parse", "HEAD"], cwd=path)
    if state.get("head_sha") and head != state["head_sha"]:
        return "keep", f"HEAD {head} is not the reviewed head {state['head_sha']}"
    return "remove", "the review pass is complete"


def dispatch_script():
    # The dispatch skill sits beside this one in the canonical skills
    # directory; resolve() follows the per-harness symlinks back to it.
    scripts = Path(__file__).resolve().parents[2] / "dispatch" / "scripts"
    for name in ("dispatch", "executable_dispatch"):
        if (scripts / name).is_file():
            return str(scripts / name)
    raise DispatchError(f"dispatch script not found in {scripts}")


def remove_finished(repo, item):
    """Remove one worktree cleanup just marked `remove`, then release its branch.

    The force covers only what cleanup_verdict has already checked: the
    exact-head branch has no upstream, and the finished reviewer may still idle
    in its pane. Returns the fields to add to the item.
    """
    proc = run([dispatch_script(), "worktree", "remove", "--worktree", item["worktree"],
                "--repo", repo, "--force"])
    if proc.returncode != 0:
        lines = proc.stdout.strip().splitlines()
        try:
            reason = json.loads(lines[-1]).get("reason")
        except (IndexError, ValueError, AttributeError):
            reason = None
        return {"removed": False, "released": False,
                "problem": reason or proc.stderr.strip() or f"dispatch worktree remove exited {proc.returncode}"}
    try:
        release_branch(repo, item["pr_number"])
    except (Judgment, DispatchError) as error:
        return {"removed": True, "released": False, "problem": str(error)}
    return {"removed": True, "released": True}


def command_cleanup(args):
    repo = repo_root(args.repo)
    candidates = []
    for entry in worktrees(repo):
        marker = read_marker(entry["path"])
        state = review_state(marker)
        if marker.get("created_by") == MARKER_TAG and isinstance(state.get("pr_number"), int):
            candidates.append((entry, state))
    if not candidates:
        emit({"items": []})
    queued = {
        item.get("number")
        for item in gh_json(repo, "pr", "list", "--search", SEARCH, "--limit", "200", "--json", "number")
    }
    items = []
    for entry, state in candidates:
        action, reason = cleanup_verdict(entry, state, queued)
        item = {
            "action": action,
            "reason": reason,
            "pr_number": state["pr_number"],
            "head_branch": entry.get("branch", ""),
            "worktree": entry["path"],
            "workspace_id": state.get("workspace_id"),
            "agent_name": state.get("agent_name"),
        }
        if args.apply and action == "remove":
            item.update(remove_finished(repo, item))
        items.append(item)
    emit({"items": items})


def release_branch(repo, number):
    """Delete a removed review's local branch and this helper's refs, or raise Judgment."""
    claim = claimed_branch(repo, number)
    if not claim:
        raise Judgment(f"PR #{number} has no branch claimed by this helper", pr_number=number)
    branch = claim.removeprefix("refs/heads/")
    checkout = worktree_for_branch(repo, branch)
    if checkout:
        raise Judgment(
            f"branch {branch!r} is still checked out; remove its worktree first",
            pr_number=number,
            head_branch=branch,
            worktree=checkout["path"],
        )
    head_ref = f"refs/github-pr-review/{number}/head"
    tip = branch_sha(repo, branch)
    fetched = run(["git", "rev-parse", "--verify", head_ref], cwd=repo).stdout.strip()
    if tip:
        # Delete only commits fetched from the PR; anything else exists nowhere but here.
        on_pr = fetched and run(["git", "merge-base", "--is-ancestor", tip, fetched], cwd=repo).returncode == 0
        if not on_pr:
            raise Judgment(
                f"branch {branch!r} holds commits that are not on PR #{number}'s fetched head",
                pr_number=number,
                head_branch=branch,
                local_head=tip,
            )
        checked(["git", "update-ref", "-d", claim, tip], cwd=repo, label=f"delete branch {branch}")
    checked(["git", "symbolic-ref", "--delete", claim_ref(number)], cwd=repo, label="drop branch claim")
    if fetched:
        checked(["git", "update-ref", "-d", head_ref, fetched], cwd=repo, label="drop fetched PR head")
    return {"released": True, "pr_number": number, "head_branch": branch}


def command_release(args):
    try:
        emit(release_branch(repo_root(args.repo), args.pr_number))
    except Judgment as j:
        judgment(j.reason, **j.partial)


def command_complete(args):
    args.status = "complete"
    args.pane_id = None
    args.workspace_id = None
    args.agent_name = None
    command_mark(args)


def command_advance(args):
    """Move a live pass's own worktree to the PR's current head.

    Git refuses to fetch into a branch that is checked out, so the reviewer
    can't pull the new head into its branch directly; the helper fetches it to
    its private ref and resets the clean checkout onto it instead.
    """
    root, marker, state, head = assert_review_worktree(args.worktree, args.pr_number)
    if state.get("status") == "complete":
        judgment(
            f"PR #{args.pr_number}'s pass is complete; a new review request starts a new one",
            pr_number=args.pr_number,
            worktree=root,
        )
    item = verified_metadata(root, args.pr_number)
    wanted = item["head_sha"]
    result = {"pr_number": args.pr_number, "head_sha": wanted, "worktree": root}
    if head == wanted:
        emit({"advanced": False, **result})
    branch = checked(["git", "branch", "--show-current"], cwd=root)
    if branch != item["head_branch"]:
        judgment(
            f"worktree is on {branch!r}, not PR #{args.pr_number}'s head branch {item['head_branch']!r}",
            worktree=root,
            pr_number=args.pr_number,
        )
    if dirty(root):
        judgment(
            f"review worktree for PR #{args.pr_number} has local changes, so it can't move to the new head",
            worktree=root,
            pr_number=args.pr_number,
            previous_head=head,
            pr_head=wanted,
        )
    # A force-push leaves the old head off the new history, so a diff between
    # the two heads is all that compares them.
    rewritten = run(["git", "merge-base", "--is-ancestor", head, wanted], cwd=root).returncode != 0
    checked(["git", "reset", "--hard", wanted], cwd=root, label="advance review worktree")
    state.update({"head_sha": wanted, "advanced_at": now()})
    marker["github_pr_review"] = state
    write_marker(root, marker)
    emit({"advanced": True, "previous_head": head, "rewritten": rewritten, **result})


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

    advance = sub.add_parser("advance", help="move a live pass's worktree to the PR's current head")
    advance.add_argument("--worktree", default=os.getcwd())
    advance.add_argument("--pr-number", type=int, required=True)
    advance.set_defaults(func=command_advance)

    cleanup = sub.add_parser("cleanup", help="classify completed review worktrees for removal")
    cleanup.add_argument("--repo", default=os.getcwd())
    cleanup.add_argument("--apply", action="store_true",
                         help="remove each worktree marked remove and release its branch")
    cleanup.set_defaults(func=command_cleanup)

    release = sub.add_parser("release", help="delete a removed review's local branch and refs")
    release.add_argument("--pr-number", type=int, required=True)
    release.add_argument("--repo", default=os.getcwd())
    release.set_defaults(func=command_release)
    return root


def main():
    args = parser().parse_args()
    try:
        args.func(args)
    except DispatchError as error:
        fail(str(error))


if __name__ == "__main__":
    main()
