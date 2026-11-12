#!/usr/bin/env python3
"""List and fetch GitHub PRs for github-pr's review queue.

`ready` lists the open, non-draft PRs awaiting my review, with the evidence for
grouping related ones (stacks, shared Jira keys, shared files), and says which
I have already reviewed at their current head. That is read from GitHub, not
from local state: a PR is done when one of my recent submitted reviews names
its current head commit, so a rerun skips it until the author pushes.

`fetch` brings a PR's head into git's object store under a private ref,
refs/github-pr-review/<n>/head, and its base into origin/<base>, so a reviewer
reads the diff and the code around it with no checkout.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from itertools import combinations

from pr_api import viewer_login


SEARCH = "is:open -is:draft review-requested:@me -author:@me"
GH_FIELDS = "number,title,url,author,baseRefName,headRefName,headRefOid,createdAt"
JIRA_KEY = re.compile(r"\b([A-Z][A-Z0-9]+-[0-9]+)\b")
SHARED_FILES_SHOWN = 5
# My latest reviews on one PR. gh pr list's reviews field stops at the first
# 100, oldest first, and every thread reply is a review, so on a busy PR my
# latest could fall off it; asking for my own last ones sees them.
MY_REVIEWS_QUERY = """
query($owner: String!, $name: String!, $pr: Int!, $author: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviews(last: 100, author: $author) { nodes { state body commit { oid } } }
    }
  }
}
"""


class QueueError(Exception):
    pass


def run(argv, cwd=None):
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True)


def emit(obj, code=0):
    print(json.dumps(obj, separators=(",", ":")))
    raise SystemExit(code)


def judgment(reason, **partial):
    emit({"status": "needs_judgment", "reason": reason, **partial}, 2)


def checked(argv, cwd=None, label=None):
    proc = run(argv, cwd=cwd)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise QueueError(f"{label or ' '.join(argv)} failed ({proc.returncode}): {detail}")
    return proc.stdout.strip()


def repo_root(path):
    proc = run(["git", "-C", path, "rev-parse", "--show-toplevel"])
    if proc.returncode == 0:
        return proc.stdout.strip()
    judgment(f"{path!r} is not a git checkout")


def gh_json(repo, *args):
    proc = run(["gh", *args], cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise QueueError(f"gh {' '.join(args)} failed ({proc.returncode}): {detail}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as error:
        raise QueueError(f"gh returned invalid JSON: {proc.stdout[:200]}") from error


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
        "created_at": raw.get("createdAt", ""),
    }


def counts(review):
    """A review that finishes a pass: an approval, a change request, or a
    comment review with a body. An empty comment review is a lone thread
    reply; pending and dismissed reviews don't count either."""
    state = review.get("state")
    return state in ("APPROVED", "CHANGES_REQUESTED") or (
        state == "COMMENTED" and (review.get("body") or "").strip() != "")


def reviewed_at_head(repo, number, head, me):
    """Whether one of my reviews that counts is at the PR's current head. A
    review's commit is null after a force-push drops it, which counts as not
    at the head."""
    data = gh_json(repo, "api", "graphql", "-f", f"query={MY_REVIEWS_QUERY}",
                   "-F", "owner={owner}", "-F", "name={repo}", "-F", f"pr={number}",
                   "-f", f"author={me}")
    pr = ((data.get("data") or {}).get("repository") or {}).get("pullRequest") or {}
    return any(counts(review) and head and (review.get("commit") or {}).get("oid") == head
               for review in (pr.get("reviews") or {}).get("nodes") or [])


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
    me = viewer_login()
    raw = gh_json(repo, "pr", "list", "--search", SEARCH, "--limit", str(args.limit),
                  "--json", f"{GH_FIELDS},files,additions,deletions")
    open_prs = gh_json(repo, "pr", "list", "--state", "open", "--limit", "500",
                       "--json", "number,headRefName")
    items = []
    for entry in raw:
        item = pr_item(entry)
        item["files"] = [f.get("path") for f in entry.get("files") or [] if f.get("path")]
        item["size"] = {"additions": entry.get("additions"), "deletions": entry.get("deletions"),
                        "files": len(item["files"])}
        reviewed = reviewed_at_head(repo, item["number"], item["head_sha"], me)
        item["state"] = "reviewed" if reviewed else "new"
        items.append(item)
    pairs = relations(items, open_prs)
    for item in items:
        del item["files"]
    emit({"items": items, "relations": pairs})


def head_ref(number):
    return f"refs/github-pr-review/{number}/head"


def fetch_head(repo, number):
    proc = run(["git", "fetch", "--no-tags", "origin", f"+refs/pull/{number}/head:{head_ref(number)}"],
               cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip()
        if "couldn't find remote ref" in detail.lower():
            judgment(f"PR #{number} is not available from origin", pr_number=number)
        raise QueueError(f"git fetch of PR #{number}'s head failed ({proc.returncode}): {detail}")
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


def parser():
    root = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = root.add_subparsers(dest="command", required=True)

    def command(name, func, help):
        p = sub.add_parser(name, help=help)
        p.add_argument("--repo", default=os.getcwd())
        p.set_defaults(func=func)
        return p

    ready = command("ready", command_ready, "list open PRs awaiting my review, with their relationships")
    ready.add_argument("--limit", type=int, default=50)

    fetch = command("fetch", command_fetch, "fetch a PR's current head and base, with no checkout")
    fetch.add_argument("--pr-number", type=int, required=True)
    return root


def main():
    args = parser().parse_args()
    try:
        args.func(args)
    except QueueError as error:
        print(f"github-pr queue: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
