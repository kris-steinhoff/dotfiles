#!/usr/bin/env python3
"""Post one pull-request review from a review JSON.

Lands a review as a single reviews-API call so the summary body and its inline
comments arrive together, not as a scatter of separate comments. On a re-review
it also replies on the threads of still-open prior findings rather than
re-posting them. Input is one review object (see reference.md):

  {pr, event, body,
   comments: [{path, line, body}],            # fresh inline comments
   thread_replies: [{in_reply_to, body}],     # replies on prior threads
   header?}

  event in {APPROVE, REQUEST_CHANGES, COMMENT}

--dry-run validates every inline anchor against the PR's own diff and every
reply target against the PR's existing review comments, and posts nothing. Always
dry-run first: the reviews API rejects the whole call if any comment anchors to a
line that is not a RIGHT-side position in the diff, so one bad anchor would
otherwise sink the batch, and a reply to a stale comment id just errors.

The repo is inferred from the working directory via `gh`. The header, when
given, is prepended verbatim to the body, every inline comment, and every reply;
this script does not decide attribution.
"""

import argparse
import json
import subprocess
import sys


def gh(*args, check=True):
    """Run a gh command and return stdout."""
    result = subprocess.run(
        ["gh", *args], capture_output=True, text=True, check=False
    )
    if check and result.returncode != 0:
        sys.exit(f"gh {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def repo_slug():
    return gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()


def anchorable_lines(pr):
    """Map each changed path to the set of RIGHT-side line numbers in the PR diff.

    A line is anchorable only if it is an added (+) or context ( ) line inside a
    hunk — the positions GitHub accepts an inline comment on. `gh pr diff` diffs
    the PR against its actual base (baseRefName), so stacked PRs resolve against
    the immediate base, not the trunk.
    """
    diff = gh("pr", "diff", str(pr))
    lines = {}
    path = None
    right = 0
    for line in diff.splitlines():
        if line.startswith("+++ "):
            target = line[4:].strip()
            path = None if target == "/dev/null" else target[2:] if target.startswith("b/") else target
        elif line.startswith("@@"):
            # @@ -l,s +r,s @@  — start the RIGHT counter at r
            plus = line.split("+", 1)[1]
            right = int(plus.split(",", 1)[0].split(" ", 1)[0])
        elif path is not None and line.startswith("+") and not line.startswith("+++"):
            lines.setdefault(path, set()).add(right)
            right += 1
        elif path is not None and line.startswith(" "):
            lines.setdefault(path, set()).add(right)
            right += 1
        elif line.startswith("-") and not line.startswith("---"):
            pass  # LEFT side; does not advance the RIGHT counter
    return lines


def review_comment_ids(slug, pr):
    """Ids of the existing review (inline) comments on the PR — the reply targets."""
    out = gh("api", f"repos/{slug}/pulls/{pr}/comments", "--paginate", "-q", ".[].id")
    return {int(tok) for tok in out.split() if tok.strip()}


def main():
    ap = argparse.ArgumentParser(description="Post one PR review from a review JSON.")
    ap.add_argument("review", nargs="?", help="review JSON file (default: stdin)")
    ap.add_argument("--dry-run", action="store_true", help="validate anchors and reply targets, post nothing")
    args = ap.parse_args()

    raw = open(args.review).read() if args.review else sys.stdin.read()
    review = json.loads(raw)

    pr = review["pr"]
    event = review["event"]
    if event not in {"APPROVE", "REQUEST_CHANGES", "COMMENT"}:
        sys.exit(f"invalid event: {event!r}")
    header = review.get("header")
    comments = review.get("comments", [])
    thread_replies = review.get("thread_replies", [])

    slug = repo_slug()

    valid = anchorable_lines(pr)
    bad_anchors = [c for c in comments if c["line"] not in valid.get(c["path"], set())]

    valid_ids = review_comment_ids(slug, pr) if thread_replies else set()
    bad_replies = [r for r in thread_replies if int(r["in_reply_to"]) not in valid_ids]

    if args.dry_run:
        print(f"PR #{pr}: {event}, {len(comments)} inline comment(s), {len(thread_replies)} reply(ies)")
        print(f"header: {header}" if header else "header: (none)")
        for c in comments:
            ok = c["line"] in valid.get(c["path"], set())
            print(f"  [{'ok ' if ok else 'BAD'}] {c['path']}:{c['line']}")
        for r in thread_replies:
            ok = int(r["in_reply_to"]) in valid_ids
            print(f"  [{'ok ' if ok else 'BAD'}] reply to comment {r['in_reply_to']}")
        if bad_anchors:
            print(f"\n{len(bad_anchors)} anchor(s) are not RIGHT-side positions in the diff; "
                  "re-anchor each to a nearby changed line (qualify the body) or, if truly "
                  "homeless, move it to the summary body under a name.")
        if bad_replies:
            print(f"\n{len(bad_replies)} reply target(s) are not existing review comments on this PR.")
        if bad_anchors or bad_replies:
            sys.exit(1)
        print("\nall anchors and reply targets valid")
        return

    if bad_anchors or bad_replies:
        problems = []
        if bad_anchors:
            problems.append(f"{len(bad_anchors)} bad anchor(s): "
                            + ", ".join("{}:{}".format(c["path"], c["line"]) for c in bad_anchors))
        if bad_replies:
            problems.append(f"{len(bad_replies)} bad reply target(s): "
                            + ", ".join(str(r["in_reply_to"]) for r in bad_replies))
        sys.exit("refusing to post: " + "; ".join(problems) + ". Re-run with --dry-run.")

    def with_header(text):
        return f"{header}\n\n{text}" if header else text

    payload = {
        "event": event,
        "body": with_header(review.get("body", "")),
        "comments": [
            {"path": c["path"], "line": c["line"], "side": "RIGHT", "body": with_header(c["body"])}
            for c in comments
        ],
    }

    result = subprocess.run(
        ["gh", "api", f"repos/{slug}/pulls/{pr}/reviews", "-X", "POST", "--input", "-"],
        input=json.dumps(payload), capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        sys.exit(f"posting review failed: {result.stderr.strip()}")
    url = json.loads(result.stdout).get("html_url", "")
    print(f"posted review to PR #{pr}: {url}")

    # Replies on prior threads are separate POSTs; the review above already
    # landed, so a failed reply is reported but does not undo it.
    failed = 0
    for r in thread_replies:
        cid = int(r["in_reply_to"])
        res = subprocess.run(
            ["gh", "api", f"repos/{slug}/pulls/{pr}/comments/{cid}/replies", "-X", "POST", "--input", "-"],
            input=json.dumps({"body": with_header(r["body"])}),
            capture_output=True, text=True, check=False,
        )
        if res.returncode != 0:
            failed += 1
            print(f"  reply to comment {cid} failed: {res.stderr.strip()}", file=sys.stderr)
        else:
            print(f"  replied on comment {cid}")
    if failed:
        sys.exit(f"{failed} of {len(thread_replies)} thread repl(y/ies) failed to post")


if __name__ == "__main__":
    main()
