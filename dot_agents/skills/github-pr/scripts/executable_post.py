#!/usr/bin/env python3
"""Post a confirmed batch of PR messages from one JSON object.

  post.py [--dry-run] [batch.json]      (default: stdin)

One batch carries whatever a pass posts (see references/posting.md):

  {pr, head_sha, header,
   event?, body?, comments?: [{path, line, body}],   # a review, when event is set
   thread_replies?: [{in_reply_to, body}],           # replies on existing threads
   issue_comment?: {body},                           # one conversation comment
   resolve?: [root_comment_id],                      # threads to mark resolved
   rerequest?: [login],                              # reviewers to ask for another review
   commits?: [sha]}                                  # commits the text cites

  event in {APPROVE, REQUEST_CHANGES, COMMENT}

Every check runs before anything is posted, and --dry-run runs only the checks.
The batch is refused when the PR's head is no longer `head_sha` (it was written
against code that has since moved), when an inline comment anchors to a line
that is not a RIGHT-side position in the diff (the reviews API would reject the
whole review) or to a file GitHub gives no patch for, when a reply targets
anything but a thread's first comment, when a thread to resolve was not started
by me, when a reviewer to re-request is a bot, me, or someone who has not
reviewed the PR, or when a cited commit is not on the PR. `header` is required and
prepended verbatim to every message posted; this script requires attribution
but does not decide its text.

Order of posting: the review, then thread replies, then the conversation
comment, then resolutions, then re-requests. Each later step is a separate call, so one that
fails is reported without undoing what already landed, and the steps still
owed are printed as a remainder batch. Retry with that batch, never the
original, which would post the review a second time.
"""

import argparse
import json
import sys

from pr_api import gh, pr_commits, pr_view, repo_slug, resolve_thread, rest_list, review_threads, viewer_login

EVENTS = {"APPROVE", "REQUEST_CHANGES", "COMMENT"}
FILES_API_CAP = 3000  # the most files GitHub's PR files API lists


def anchorable_lines(slug, pr):
    """Map each changed path to the set of RIGHT-side line numbers in the PR diff.

    A line is anchorable only if it is an added (+) or context ( ) line inside a
    hunk, the positions GitHub accepts an inline comment on. The lines come from
    the PR files API rather than `gh pr diff`, which GitHub refuses outright for a
    PR of more than 300 files. Like the diff, each file's patch is against the
    PR's actual base (baseRefName), so stacked PRs resolve against the immediate
    base, not the trunk.

    Returns (lines, unpatched, listed): `unpatched` holds the paths GitHub lists
    without a patch (a binary or very large file, or any file once a large PR's
    total diff passes GitHub's limit), and `listed` is how many files the API
    returned, which GitHub caps at 3000.
    """
    files = rest_list(f"repos/{slug}/pulls/{pr}/files")
    lines = {}
    unpatched = set()
    for f in files:
        if f.get("patch") is None:
            unpatched.add(f["filename"])
            continue
        anchorable = lines.setdefault(f["filename"], set())
        right = 0
        # split("\n"), not splitlines(), which also breaks on form feeds and
        # other separators that can sit inside a line of code.
        for line in f["patch"].split("\n"):
            if line.startswith("@@"):
                # @@ -l,s +r,s @@  — start the RIGHT counter at r
                plus = line.split("+", 1)[1]
                right = int(plus.split(",", 1)[0].split(" ", 1)[0])
            elif line.startswith(("+", " ")):
                anchorable.add(right)
                right += 1
    return lines, unpatched, len(files)


def check(batch):
    """Validate the batch against GitHub. Returns (problems, context)."""
    problems = []
    pr = batch["pr"]
    event = batch.get("event")
    comments = batch.get("comments", [])
    replies = batch.get("thread_replies", [])
    resolve = batch.get("resolve", [])
    cites = batch.get("commits", [])
    rerequest = batch.get("rerequest", [])

    if not (batch.get("header") or "").strip():
        problems.append("header is required: every posted message carries the attribution line")
    if event is not None and event not in EVENTS:
        problems.append(f"invalid event {event!r}")
    if event is None and (comments or (batch.get("body") or "").strip()):
        problems.append("body and comments belong to a review and need an event; "
                        "conversation text goes in issue_comment")
    if not (event or replies or batch.get("issue_comment") or resolve or rerequest):
        problems.append("nothing to post")

    def needs_body(item, what):
        if not isinstance(item, dict) or not isinstance(item.get("body"), str) or not item["body"].strip():
            problems.append(f"{what} needs a non-empty string body")

    for c in comments:
        needs_body(c, f"inline comment {c.get('path')}:{c.get('line')}" if isinstance(c, dict) else "inline comment")
    for r in replies:
        needs_body(r, f"reply to {r.get('in_reply_to')}" if isinstance(r, dict) else "reply")
    if batch.get("issue_comment") is not None:
        needs_body(batch["issue_comment"], "issue_comment")
    if problems:
        return problems, {"slug": None, "head": None, "to_resolve": []}

    slug = repo_slug()
    head = pr_view(pr)["headRefOid"]
    if batch.get("head_sha") != head:
        problems.append(f"PR head is {head[:12]}, not head_sha {str(batch.get('head_sha'))[:12]}: "
                        "the batch was written against code that has moved")

    valid, unpatched, listed = anchorable_lines(slug, pr) if comments else ({}, set(), 0)
    for c in comments:
        anchor = f"{c['path']}:{c['line']}"
        if c["path"] in unpatched:
            problems.append(f"anchor {anchor} can't be checked: GitHub gives no patch for {c['path']} "
                            "(binary, too large, or past where GitHub stops diffing a large PR); "
                            "post this finding in the review body")
        elif c["path"] not in valid and listed >= FILES_API_CAP:
            problems.append(f"anchor {anchor} can't be checked: GitHub lists only the PR's first "
                            f"{FILES_API_CAP} files, and {c['path']} is not among them")
        elif c["line"] not in valid.get(c["path"], set()):
            problems.append(f"anchor {anchor} is not a RIGHT-side position in the diff")

    threads = review_threads(slug, pr) if (replies or resolve) else []
    me = viewer_login() if (resolve or rerequest) else None
    roots = {}
    replies_of = {}
    for t in threads:
        nodes = t["comments"]["nodes"]
        if not nodes:
            continue
        roots[nodes[0]["databaseId"]] = (t, (nodes[0]["author"] or {}).get("login"))
        for n in nodes[1:]:
            replies_of[n["databaseId"]] = nodes[0]["databaseId"]

    for r in replies:
        cid = int(r["in_reply_to"])
        if cid in replies_of:
            problems.append(f"reply target {cid} is a reply; target its thread's first comment {replies_of[cid]}")
        elif cid not in roots:
            problems.append(f"reply target {cid} is not a review thread on this PR")

    to_resolve = []
    for cid in map(int, resolve):
        if cid not in roots:
            problems.append(f"resolve target {cid} is not a review thread's first comment on this PR")
            continue
        thread, starter = roots[cid]
        if starter != me:
            problems.append(f"resolve target {cid} is {starter}'s thread; only threads I started are resolved")
        elif thread["isResolved"]:
            print(f"note: thread {cid} is already resolved; skipping it", file=sys.stderr)
        else:
            to_resolve.append((cid, thread["id"]))

    reviewed = {}
    for r in rest_list(f"repos/{slug}/pulls/{pr}/reviews") if rerequest else []:
        user = r.get("user") or {}
        reviewed[user.get("login")] = user.get("type") == "Bot" or str(user.get("login")).endswith("[bot]")
    for login in rerequest:
        if login == me:
            problems.append(f"re-request target {login} is me")
        elif login not in reviewed:
            problems.append(f"re-request target {login} has not reviewed this PR")
        elif reviewed[login]:
            problems.append(f"re-request target {login} is a bot; only human reviewers are re-requested")

    on_pr = pr_commits(slug, pr) if cites else []
    for sha in cites:
        if len(sha) < 7 or not any(full.startswith(sha) for full in on_pr):
            problems.append(f"cited commit {sha} is not on the PR")

    return problems, {"slug": slug, "head": head, "to_resolve": to_resolve}


def main():
    ap = argparse.ArgumentParser(description="Post a confirmed batch of PR messages.")
    ap.add_argument("batch", nargs="?", help="batch JSON file (default: stdin)")
    ap.add_argument("--dry-run", action="store_true", help="run every check, post nothing")
    args = ap.parse_args()

    batch = json.loads(open(args.batch).read() if args.batch else sys.stdin.read())
    pr = batch["pr"]
    problems, ctx = check(batch)

    event = batch.get("event")
    replies = batch.get("thread_replies", [])
    issue_comment = batch.get("issue_comment")
    rerequest = batch.get("rerequest", [])
    print(f"PR #{pr}: review {event or '(none)'}, {len(batch.get('comments', []))} inline comment(s), "
          f"{len(replies)} reply(ies), {'1' if issue_comment else 'no'} conversation comment, "
          f"{len(ctx['to_resolve'])} thread(s) to resolve, {len(rerequest)} reviewer(s) to re-request")
    if problems:
        print("\n".join(f"  BAD {p}" for p in problems))
        sys.exit("refusing to post; fix the batch and dry-run again" if not args.dry_run else 1)
    if args.dry_run:
        print("all checks passed")
        return

    slug, header = ctx["slug"], batch["header"]

    def with_header(text):
        return f"{header}\n\n{text}"

    if event:
        payload = {
            "commit_id": ctx["head"],
            "event": event,
            "body": with_header(batch.get("body", "")),
            "comments": [{"path": c["path"], "line": c["line"], "side": "RIGHT", "body": with_header(c["body"])}
                         for c in batch.get("comments", [])],
        }
        res = gh("api", f"repos/{slug}/pulls/{pr}/reviews", "-X", "POST", "--input", "-",
                 input=json.dumps(payload), check=False)
        if res.returncode != 0:
            sys.exit(f"posting review failed: {res.stderr.strip()}")
        print(f"posted review: {json.loads(res.stdout).get('html_url', '')}")

    owed = {"thread_replies": [], "issue_comment": None, "resolve": [], "rerequest": []}
    for r in replies:
        cid = int(r["in_reply_to"])
        res = gh("api", f"repos/{slug}/pulls/{pr}/comments/{cid}/replies", "-X", "POST", "--input", "-",
                 input=json.dumps({"body": with_header(r["body"])}), check=False)
        if res.returncode != 0:
            owed["thread_replies"].append(r)
            print(f"  reply on {cid} failed: {res.stderr.strip()}", file=sys.stderr)
        else:
            print(f"  replied on {cid}")

    if issue_comment:
        res = gh("api", f"repos/{slug}/issues/{pr}/comments", "-X", "POST", "--input", "-",
                 input=json.dumps({"body": with_header(issue_comment["body"])}), check=False)
        if res.returncode != 0:
            owed["issue_comment"] = issue_comment
            print(f"  conversation comment failed: {res.stderr.strip()}", file=sys.stderr)
        else:
            print(f"  posted conversation comment: {json.loads(res.stdout).get('html_url', '')}")

    for cid, thread_id in ctx["to_resolve"]:
        res = resolve_thread(thread_id)
        if res.returncode != 0:
            owed["resolve"].append(cid)
            print(f"  resolving thread {cid} failed: {res.stderr.strip()}", file=sys.stderr)
        else:
            print(f"  resolved thread {cid}")

    if rerequest:
        res = gh("api", f"repos/{slug}/pulls/{pr}/requested_reviewers", "-X", "POST", "--input", "-",
                 input=json.dumps({"reviewers": rerequest}), check=False)
        if res.returncode != 0:
            owed["rerequest"] = rerequest
            print(f"  re-requesting review failed: {res.stderr.strip()}", file=sys.stderr)
        else:
            print(f"  re-requested review from {', '.join(rerequest)}")

    remainder = {k: v for k, v in owed.items() if v}
    if remainder:
        # The review (if any) landed, so the remainder carries no event, body,
        # or comments; cited commits stay so a retry still checks them.
        remainder = {"pr": pr, "head_sha": batch["head_sha"], "header": header, **remainder,
                     "commits": batch.get("commits", [])}
        print("\nremainder batch (retry with this, not the original):", file=sys.stderr)
        print(json.dumps(remainder, indent=2, ensure_ascii=False), file=sys.stderr)
        sys.exit("some steps failed after the first landed; see above")


if __name__ == "__main__":
    main()
