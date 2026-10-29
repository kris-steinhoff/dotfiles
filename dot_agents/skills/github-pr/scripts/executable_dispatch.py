#!/usr/bin/env python3
"""Enumerate, group, and track GitHub PR reviews for an idempotent review queue.

The helper owns only deterministic local and GitHub state. Placement and agent
launch stay in the dispatch skill, under Herdr or Orca, and grouping related
PRs is the calling agent's judgment; `ready` supplies the relationships it
judges from.

A review needs no checkout. `fetch` brings a PR's head into git's object store
under a private ref, refs/github-pr-review/<n>/head, and the reviewer reads the
diff and the code around it from there.

State lives in one file per GitHub repository,
~/.local/state/github-pr/reviews/<owner>/<repo>.json, so every clone and
checkout of it sees the same queue:

  prs        per PR: status (assigned, active, complete), head_sha, reviewer
  reviewers  per reviewer tab: place, and the PRs it reviews, in order

A PR belongs to a reviewer only when the PR's own record names it. A
reviewer's list says only the order, so a stale entry there, left when a PR
moved to another reviewer, is ignored and pruned. A review started by hand
claims its PR with no reviewer.

Every write holds a lock beside the file, because the queue's session, its
reviewers, and hand-started reviews update it independently.
"""

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path


SEARCH = "is:open -is:draft review-requested:@me -author:@me"
GH_FIELDS = "number,title,url,author,baseRefName,headRefName,headRefOid"
JIRA_KEY = re.compile(r"\b([A-Z][A-Z0-9]+-[0-9]+)\b")
SHARED_FILES_SHOWN = 5
# A hand-started review's claim lapses after this long without completing,
# since nothing can tell whether the session that made it is still open.
HAND_CLAIM_HOURS = 12
STATE_ROOT = Path(os.environ.get("GITHUB_PR_STATE_DIR")
                  or Path.home() / ".local" / "state" / "github-pr" / "reviews")
REMOTE = re.compile(r"github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$")


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


def gh_json(repo, *args):
    proc = run(["gh", *args], cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise DispatchError(f"gh {' '.join(args)} failed ({proc.returncode}): {detail}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as error:
        raise DispatchError(f"gh returned invalid JSON: {proc.stdout[:200]}") from error


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


def queued_prs(repo, limit, fields=GH_FIELDS):
    return gh_json(repo, "pr", "list", "--search", SEARCH, "--limit", str(limit), "--json", fields)


# State


def state_path(repo):
    """<owner>/<repo>.json under the state root, for origin's GitHub repository."""
    url = run(["git", "remote", "get-url", "origin"], cwd=repo).stdout.strip()
    match = REMOTE.search(url)
    if match:
        owner, name = match.groups()
    else:
        # An SSH host alias hides github.com; gh resolves it.
        owner, _, name = gh_json(repo, "repo", "view", "--json", "nameWithOwner")["nameWithOwner"].partition("/")
    return STATE_ROOT / owner / f"{name}.json"


@contextmanager
def state(repo, write=False):
    """The queue's state, locked; written back on a clean exit when `write`."""
    path = state_path(repo)
    directory = path.parent
    try:
        directory.mkdir(parents=True, exist_ok=True)
        lock = open(path.with_suffix(".lock"), "a")
    except OSError as error:
        raise DispatchError(f"cannot open review state in {directory}: {error}") from error
    with lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        data.setdefault("prs", {})
        data.setdefault("reviewers", {})
        yield data
        if write:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=directory,
                                             prefix=f".{path.stem}.", delete=False) as handle:
                json.dump(data, handle, indent=1, sort_keys=True)
                handle.write("\n")
            os.replace(handle.name, path)


def head_ref(number):
    return f"refs/github-pr-review/{number}/head"


def owned(data, name, number):
    """The PR's record when it names this reviewer, else None."""
    record = data["prs"].get(str(number))
    return record if record and record.get("reviewer") == name else None


def drop_pr(repo, data, number):
    """Forget one PR's pass and its fetched head."""
    data["prs"].pop(str(number), None)
    run(["git", "update-ref", "-d", head_ref(number)], cwd=repo)


# Reviewers


def dispatch_script():
    # The dispatch skill sits beside this one in the canonical skills
    # directory; resolve() follows the per-harness symlinks back to it.
    scripts = Path(__file__).resolve().parents[2] / "dispatch" / "scripts"
    for name in ("dispatch", "executable_dispatch"):
        if (scripts / name).is_file():
            return str(scripts / name)
    raise DispatchError(f"dispatch script not found in {scripts}")


def reviewer_alive(place):
    """True, False, or None when the workspace tool can't be asked. None counts
    as alive everywhere, so a hiccup never relaunches a reviewer that is still
    working."""
    proc = run([dispatch_script(), "agent", "status", "--agent", place])
    if proc.returncode != 0:
        return None
    try:
        return bool(json.loads(proc.stdout).get("alive"))
    except (ValueError, AttributeError):
        return None


def close_reviewer(place):
    proc = run([dispatch_script(), "terminal", "close", "--place", place])
    return None if proc.returncode == 0 else (proc.stderr.strip() or proc.stdout.strip()
                                              or f"dispatch terminal close exited {proc.returncode}")


def reviewer_view(name, reviewer, data):
    """A reviewer with the PR it is on and the one it should be sent next."""
    order = [n for n in reviewer.get("prs") or [] if owned(data, name, n)]
    status = {n: owned(data, name, n).get("status") for n in order}
    active = next((n for n in order if status[n] == "active"), None)
    pending = next((n for n in order if status[n] == "assigned"), None)
    return {"name": name, "place": reviewer.get("place"), "prs": order,
            "active": active, "next": None if active else pending}


# Commands


def relations(items, open_prs):
    """Pairs of queued PRs that look related, and what each PR is stacked on."""
    by_head = {pr["headRefName"]: pr["number"] for pr in open_prs if pr.get("headRefName")}
    for item in items:
        below = by_head.get(item["base_branch"])
        item["stacked_on"] = below if below != item["number"] else None
        text = f"{item['title']} {item['head_branch'].upper()}"
        item["jira_keys"] = sorted(set(JIRA_KEY.findall(text)))
    pairs = []
    for a, b in combinations(items, 2):
        shared = sorted(set(a["files"]) & set(b["files"]))
        keys = sorted(set(a["jira_keys"]) & set(b["jira_keys"]))
        stacked = a["stacked_on"] == b["number"] or b["stacked_on"] == a["number"]
        if not (shared or keys or stacked):
            continue
        pair = {"prs": [a["number"], b["number"]]}
        if stacked:
            lower, upper = (b, a) if a["stacked_on"] == b["number"] else (a, b)
            pair["stacked"] = {"lower": lower["number"], "upper": upper["number"]}
        if keys:
            pair["jira_keys"] = keys
        if shared:
            pair["shared_files"] = len(shared)
            pair["files"] = shared[:SHARED_FILES_SHOWN]
        pairs.append(pair)
    return pairs


def command_ready(args):
    repo = repo_root(args.repo)
    raw = queued_prs(repo, args.limit, f"{GH_FIELDS},files,additions,deletions")
    open_prs = gh_json(repo, "pr", "list", "--state", "open", "--limit", "500",
                       "--json", "number,headRefName")
    items = []
    for entry in raw:
        item = pr_item(entry)
        item["files"] = [f.get("path") for f in entry.get("files") or [] if f.get("path")]
        item["size"] = {"additions": entry.get("additions"), "deletions": entry.get("deletions"),
                        "files": len(item["files"])}
        items.append(item)
    pairs = relations(items, open_prs)
    with state(repo) as data:
        prs, reviewers = data["prs"], data["reviewers"]
        for item in items:
            record = prs.get(str(item["number"])) or {}
            status = record.get("status")
            if status == "complete" and record.get("head_sha") != item["head_sha"]:
                status = None  # a finished pass at an older head: review the new one
            item["state"] = status or "new"
            item["reviewer"] = record.get("reviewer") if status in ("assigned", "active") else None
            if status == "active" and not item["reviewer"]:
                item["claimed_by_hand"] = True
        views = [reviewer_view(name, r, data) for name, r in sorted(reviewers.items())]
    for item in items:
        del item["files"]
    emit({"items": items, "relations": pairs, "reviewers": views})


def command_assign(args):
    repo = repo_root(args.repo)
    with state(repo, write=True) as data:
        reviewer = data["reviewers"].get(args.reviewer)
        if reviewer and args.place and reviewer.get("place") != args.place:
            judgment(f"reviewer {args.reviewer!r} already runs at {reviewer.get('place')}",
                     reviewer=args.reviewer)
        if not reviewer:
            if not args.place:
                judgment(f"reviewer {args.reviewer!r} is new, so it needs --place", reviewer=args.reviewer)
            reviewer = data["reviewers"][args.reviewer] = {"place": args.place, "prs": [],
                                                           "created_at": now()}
        for number in args.prs:
            record = data["prs"].get(str(number)) or {}
            if record.get("status") in ("assigned", "active") and record.get("reviewer") != args.reviewer:
                holder = record.get("reviewer")
                judgment(f"PR #{number} is already with reviewer {holder!r}" if holder
                         else f"PR #{number} is being reviewed by hand", pr_number=number)
        for number in args.prs:
            record = data["prs"].get(str(number)) or {}
            for name, other in data["reviewers"].items():
                if name != args.reviewer and number in other.get("prs", []):
                    other["prs"].remove(number)
            if number not in reviewer["prs"]:
                reviewer["prs"].append(number)
            if record.get("status") not in ("assigned", "active"):
                data["prs"][str(number)] = {"status": "assigned", "reviewer": args.reviewer,
                                            "assigned_at": now()}
        view = reviewer_view(args.reviewer, reviewer, data)
    emit(view)


def command_mark(args):
    repo = repo_root(args.repo)
    with state(repo, write=True) as data:
        record = data["prs"].get(str(args.pr_number))
        if not record or record.get("status") not in ("assigned", "active"):
            judgment(f"PR #{args.pr_number} isn't assigned to a reviewer", pr_number=args.pr_number)
        record.update({"status": "active", "head_sha": args.head_sha, "active_at": now()})
    emit({"status": "active", "pr_number": args.pr_number, "reviewer": record.get("reviewer")})


def held_elsewhere(record, reviewer):
    """Judgment when another reviewer, or a hand review, has this PR in progress."""
    if record.get("status") in ("assigned", "active") and record.get("reviewer") != reviewer:
        holder = record.get("reviewer")
        return (f"reviewer {holder!r} has this PR in progress" if holder
                else "a review started by hand has this PR in progress")
    return None


def command_claim(args):
    """Record a review as in progress before it starts, so the queue leaves the PR alone."""
    repo = repo_root(args.repo)
    with state(repo, write=True) as data:
        record = data["prs"].get(str(args.pr_number)) or {}
        problem = held_elsewhere(record, args.reviewer)
        if problem:
            judgment(f"PR #{args.pr_number}: {problem}", pr_number=args.pr_number,
                     reviewer=record.get("reviewer"))
        if args.reviewer:
            if not record:
                judgment(f"PR #{args.pr_number} isn't assigned to reviewer {args.reviewer!r}",
                         pr_number=args.pr_number)
        else:
            data["prs"][str(args.pr_number)] = {"status": "active", "reviewer": None,
                                                "claimed_at": now()}
    emit({"claimed": True, "pr_number": args.pr_number, "reviewer": args.reviewer})


def command_complete(args):
    repo = repo_root(args.repo)
    with state(repo, write=True) as data:
        record = data["prs"].get(str(args.pr_number)) or {}
        problem = held_elsewhere(record, args.reviewer)
        if problem:
            judgment(f"PR #{args.pr_number}: {problem}, so this review can't close its pass",
                     pr_number=args.pr_number, reviewer=record.get("reviewer"))
        record.update({"status": "complete", "head_sha": args.head_sha, "completed_at": now(),
                       "reviewer": args.reviewer})
        data["prs"][str(args.pr_number)] = record
    emit({"status": "complete", "pr_number": args.pr_number, "head_sha": args.head_sha})


def fetch_head(repo, number):
    proc = run(["git", "fetch", "--no-tags", "origin", f"+refs/pull/{number}/head:{head_ref(number)}"],
               cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip()
        if "couldn't find remote ref" in detail.lower():
            judgment(f"PR #{number} is not available from origin", pr_number=number)
        raise DispatchError(f"git fetch of PR #{number}'s head failed ({proc.returncode}): {detail}")
    return checked(["git", "rev-parse", head_ref(number)], cwd=repo, label="resolve fetched PR head")


def command_fetch(args):
    """Bring the PR's current head and base into git's object store, with no checkout."""
    repo = repo_root(args.repo)
    previous = run(["git", "rev-parse", "--verify", "-q", head_ref(args.pr_number)], cwd=repo).stdout.strip()
    item = pr_item(gh_json(repo, "pr", "view", str(args.pr_number), "--json", GH_FIELDS))
    head = fetch_head(repo, args.pr_number)
    if head != item["head_sha"]:
        item = pr_item(gh_json(repo, "pr", "view", str(args.pr_number), "--json", GH_FIELDS))
        head = fetch_head(repo, args.pr_number)
    if head != item["head_sha"]:
        judgment(f"PR #{args.pr_number} moved while its head was being fetched; retry",
                 pr_number=args.pr_number, reported_head=item["head_sha"], fetched_head=head)
    base_ref = f"refs/remotes/origin/{item['base_branch']}"
    checked(["git", "fetch", "--no-tags", "origin", f"+refs/heads/{item['base_branch']}:{base_ref}"],
            cwd=repo, label=f"fetch base branch {item['base_branch']}")
    merge_base = checked(["git", "merge-base", base_ref, head], cwd=repo, label="find merge base")
    result = {**item, "merge_base": merge_base, "moved": bool(previous) and previous != head}
    if result["moved"]:
        result["previous_head"] = previous
        # A force-push leaves the old head off the new history, so a diff
        # between the two heads is all that compares them.
        result["rewritten"] = run(["git", "merge-base", "--is-ancestor", previous, head],
                                  cwd=repo).returncode != 0
    emit(result)


def command_cleanup(args):
    """Close finished reviewers, forget the passes of reviewers that are gone,
    and drop records the queue no longer needs."""
    repo = repo_root(args.repo)
    queue = {item["number"]: item["headRefOid"] for item in queued_prs(repo, 200, "number,headRefOid")}
    items = []
    with state(repo, write=args.apply) as data:
        prs, reviewers = data["prs"], data["reviewers"]
        for name, reviewer in sorted(reviewers.items()):
            item = {"reviewer": name, "place": reviewer.get("place"), "prs": list(reviewer.get("prs") or [])}
            mine = [n for n in item["prs"] if owned(data, name, n)]
            # A PR whose review was withdrawn before its turn came leaves the reviewer's list.
            withdrawn = [n for n in mine if owned(data, name, n)["status"] == "assigned" and n not in queue]
            unfinished = [n for n in mine if n not in withdrawn
                          and owned(data, name, n)["status"] in ("assigned", "active")]
            if unfinished:
                alive = reviewer_alive(reviewer["place"])
                if alive is False:
                    item.update(action="forget", reason="its reviewer is gone; its unfinished PRs go back "
                                "to the queue", requeued=[n for n in unfinished if n in queue])
                else:
                    item.update(action="keep", reason="it has PRs left to review" if alive
                                else "the workspace tool couldn't say whether it is alive")
            else:
                item.update(action="close", reason="every PR it was given is finished")
            if withdrawn:
                item["withdrawn"] = withdrawn
            items.append(item)
            if not args.apply:
                continue
            reviewer["prs"] = [n for n in mine if n not in withdrawn]
            for number in withdrawn:
                drop_pr(repo, data, number)
            if item["action"] == "forget":
                for number in unfinished:
                    drop_pr(repo, data, number)
            if item["action"] in ("forget", "close"):
                # A gone reviewer's tab may still hold a shell; close that too.
                problem = close_reviewer(reviewer["place"])
                item["closed"] = problem is None
                if problem:
                    item["problem"] = problem
                if not problem or item["action"] == "forget":
                    del reviewers[name]
        if args.apply:
            # A finished pass is kept only while it still answers a review
            # request at the head it reviewed; it is what stops a re-review.
            # A hand-started review keeps its claim until it lapses.
            attached = {n for name, r in reviewers.items() for n in r.get("prs") or [] if owned(data, name, n)}
            lapsed = (datetime.now(timezone.utc) - timedelta(hours=HAND_CLAIM_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
            for key, record in list(prs.items()):
                number = int(key)
                if number in attached:
                    continue
                if record.get("status") == "active" and not record.get("reviewer") \
                        and record.get("claimed_at", "") > lapsed:
                    continue
                if record.get("status") != "complete" or queue.get(number) != record.get("head_sha"):
                    drop_pr(repo, data, number)
    emit({"items": items})


def parser():
    root = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = root.add_subparsers(dest="command", required=True)

    def command(name, func, help):
        p = sub.add_parser(name, help=help)
        p.add_argument("--repo", default=os.getcwd())
        p.set_defaults(func=func)
        return p

    ready = command("ready", command_ready, "list open PRs awaiting review, with their relationships and state")
    ready.add_argument("--limit", type=int, default=50)

    assign = command("assign", command_assign, "give PRs, in order, to a reviewer tab")
    assign.add_argument("--reviewer", required=True, help="the reviewer agent's name")
    assign.add_argument("--place", help="the reviewer's place, from dispatch (required for a new reviewer)")
    assign.add_argument("--prs", required=True, type=lambda v: [int(n) for n in v.split(",") if n],
                        help="comma-separated PR numbers, in review order")

    mark = command("mark", command_mark, "record that a reviewer has been sent a PR")
    mark.add_argument("--pr-number", type=int, required=True)
    mark.add_argument("--head-sha", required=True)

    claim = command("claim", command_claim, "record a review as in progress before it starts")
    claim.add_argument("--pr-number", type=int, required=True)
    claim.add_argument("--reviewer", help="the queue reviewer's name, when review ready sent the PR")

    complete = command("complete", command_complete, "record a terminal decision for one pass")
    complete.add_argument("--pr-number", type=int, required=True)
    complete.add_argument("--head-sha", required=True)
    complete.add_argument("--reviewer", help="the queue reviewer's name, when review ready sent the PR")

    fetch = command("fetch", command_fetch, "fetch a PR's current head and base, with no checkout")
    fetch.add_argument("--pr-number", type=int, required=True)

    cleanup = command("cleanup", command_cleanup, "close finished reviewers and forget gone ones")
    cleanup.add_argument("--apply", action="store_true", help="act on what it classifies")
    return root


def main():
    args = parser().parse_args()
    try:
        args.func(args)
    except DispatchError as error:
        fail(str(error))


if __name__ == "__main__":
    main()
