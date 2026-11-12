#!/usr/bin/env python3
"""Fetch a GitHub PR's code for github-pr's review, with no checkout.

Brings the PR's head into git's object store under a private ref,
refs/github-pr-review/<n>/head, and its base into origin/<base>, so a reviewer
reads the diff and the code around it with git alone. Prints the PR as JSON
with its merge base, whether the head moved since the last fetch, and where it
sits in a stack: stacked_on, the open PR whose head branch is this PR's base,
and stacked_under, the open PRs based on this PR's head branch.

Exit codes: 0 success; 1 a gh or git call failed (a message on stderr);
2 a usage error, or a needs_judgment JSON on stdout (such as --repo not being
a git checkout).
"""

import argparse
import json
import os
import subprocess
import sys


GH_FIELDS = "number,title,url,author,baseRefName,headRefName,headRefOid,createdAt,isCrossRepository"


class FetchError(Exception):
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
        raise FetchError(f"{label or ' '.join(argv)} failed ({proc.returncode}): {detail}")
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
        raise FetchError(f"gh {' '.join(args)} failed ({proc.returncode}): {detail}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as error:
        raise FetchError(f"gh returned invalid JSON: {proc.stdout[:200]}") from error


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


def head_ref(number):
    return f"refs/github-pr-review/{number}/head"


def fetch_head(repo, number):
    proc = run(["git", "fetch", "--no-tags", "origin", f"+refs/pull/{number}/head:{head_ref(number)}"],
               cwd=repo)
    if proc.returncode != 0:
        detail = proc.stderr.strip()
        if "couldn't find remote ref" in detail.lower():
            judgment(f"PR #{number} is not available from origin", pr_number=number)
        raise FetchError(f"git fetch of PR #{number}'s head failed ({proc.returncode}): {detail}")
    return checked(["git", "rev-parse", head_ref(number)], cwd=repo, label="resolve fetched PR head")


def view(repo, number):
    raw = gh_json(repo, "pr", "view", str(number), "--json", GH_FIELDS)
    return pr_item(raw), bool(raw.get("isCrossRepository"))


def stack(repo, item, cross_repository):
    """The open PR this one is stacked on, and the open PRs stacked on it.

    A fork's PR is never a stack's lower PR: its head branch lives in the fork,
    so one named main would otherwise sit under every PR based on main. The
    same rule as github-review-queue's stacked_on, so the two agree."""
    open_prs = gh_json(repo, "pr", "list", "--state", "open", "--limit", "500",
                       "--json", "number,headRefName,baseRefName,isCrossRepository")
    by_head = {pr["headRefName"]: pr["number"] for pr in open_prs
               if pr.get("headRefName") and not pr.get("isCrossRepository")}
    below = by_head.get(item["base_branch"])
    stacked_under = [] if cross_repository or not item["head_branch"] else sorted(
        pr["number"] for pr in open_prs
        if pr.get("number") != item["number"] and pr.get("baseRefName") == item["head_branch"])
    return {"stacked_on": below if below != item["number"] else None, "stacked_under": stacked_under}


def fetch(repo, number):
    """Bring the PR's current head and base into git's object store, with no checkout."""
    previous = run(["git", "rev-parse", "--verify", "-q", head_ref(number)], cwd=repo).stdout.strip()
    item, cross_repository = view(repo, number)
    head = fetch_head(repo, number)
    if head != item["head_sha"]:
        item, cross_repository = view(repo, number)
        head = fetch_head(repo, number)
    if head != item["head_sha"]:
        judgment(f"PR #{number} moved while its head was being fetched; retry",
                 pr_number=number, reported_head=item["head_sha"], fetched_head=head)
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
    result.update(stack(repo, item, cross_repository))
    emit(result)


def parser():
    root = argparse.ArgumentParser(prog="fetch.py", description=__doc__,
                                   formatter_class=argparse.RawDescriptionHelpFormatter)
    root.add_argument("pr_number", type=int, help="the PR's number")
    root.add_argument("--repo", default=os.getcwd(), help="the repository's checkout (default: the current directory)")
    return root


def main():
    args = parser().parse_args()
    try:
        fetch(repo_root(args.repo), args.pr_number)
    except FetchError as error:
        print(f"github-pr fetch: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
