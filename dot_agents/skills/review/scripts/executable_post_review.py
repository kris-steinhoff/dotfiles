#!/usr/bin/env python3
"""Post one pull-request review from a review JSON.

Lands a review as a single reviews-API call so the summary body and its inline
comments arrive together, not as a scatter of separate comments. Input is one
review object (see reference.md):

  {pr, event, body, comments: [{path, line, body}], footer?}

  event in {APPROVE, REQUEST_CHANGES, COMMENT}

--dry-run validates every inline anchor against the PR's own diff and posts
nothing. Always dry-run first: the reviews API rejects the whole call if any
comment anchors to a line that is not a RIGHT-side position in the diff, so one
bad anchor would otherwise sink the batch.

The repo is inferred from the working directory via `gh`. The footer, when
given, is appended verbatim to the body and to every inline comment; this script
does not synthesize attribution.
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


def main():
    ap = argparse.ArgumentParser(description="Post one PR review from a review JSON.")
    ap.add_argument("review", nargs="?", help="review JSON file (default: stdin)")
    ap.add_argument("--dry-run", action="store_true", help="validate anchors, post nothing")
    args = ap.parse_args()

    raw = open(args.review).read() if args.review else sys.stdin.read()
    review = json.loads(raw)

    pr = review["pr"]
    event = review["event"]
    if event not in {"APPROVE", "REQUEST_CHANGES", "COMMENT"}:
        sys.exit(f"invalid event: {event!r}")
    footer = review.get("footer")
    comments = review.get("comments", [])

    valid = anchorable_lines(pr)
    bad = [
        c for c in comments
        if c["line"] not in valid.get(c["path"], set())
    ]

    if args.dry_run:
        print(f"PR #{pr}: {event}, {len(comments)} inline comment(s)")
        for c in comments:
            ok = c["line"] in valid.get(c["path"], set())
            print(f"  [{'ok ' if ok else 'BAD'}] {c['path']}:{c['line']}")
        if bad:
            print(f"\n{len(bad)} anchor(s) are not RIGHT-side positions in the diff; "
                  "move them to the summary body or fix the line.")
            sys.exit(1)
        print("\nall anchors valid")
        return

    if bad:
        spots = ", ".join("{}:{}".format(c["path"], c["line"]) for c in bad)
        sys.exit(
            f"refusing to post: {len(bad)} anchor(s) are not in the diff "
            f"({spots}). Re-run with --dry-run."
        )

    def with_footer(text):
        return f"{text}\n\n{footer}" if footer else text

    payload = {
        "event": event,
        "body": with_footer(review.get("body", "")),
        "comments": [
            {"path": c["path"], "line": c["line"], "side": "RIGHT", "body": with_footer(c["body"])}
            for c in comments
        ],
    }

    result = subprocess.run(
        ["gh", "api", f"repos/{repo_slug()}/pulls/{pr}/reviews", "-X", "POST", "--input", "-"],
        input=json.dumps(payload), capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        sys.exit(f"posting review failed: {result.stderr.strip()}")
    url = json.loads(result.stdout).get("html_url", "")
    print(f"posted review to PR #{pr}: {url}")


if __name__ == "__main__":
    main()
