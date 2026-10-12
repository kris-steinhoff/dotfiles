#!/usr/bin/env python3
"""Print one PR's summary: its metadata as markdown, in the same shape every time.

  summary.py <pr>

  | **#<n>** <title, cut at 60 characters> |
  | --- |
  | **<author's display name>** · <url> |
  | Ready <Thu, Oct 8, 14:03> · stacked on #<n> |

  - <reviewer's display name>: <approved|commented|requested changes|dismissed>, <n> comments
  ...

  <n> files, +<additions>/−<deletions> · <base branch> ← <head branch>

The ready time is when the PR last left draft, or when it was opened if it
never was one, in local time; a PR still in draft shows Draft instead. The
stacked segment is left out when the PR's base is not another open PR's head
branch, and the review list when there are no reviews. GitHub
records each reply in a review thread as a review of its own, with no body
and only the reply as its comment; those are left out, since a reply is not a
review, and a review's count covers only the comments that start a thread.

Everything goes through `gh`, which infers the repository from the working
directory (or GH_REPO).
"""

import argparse
import datetime
import json
import os
import subprocess
import sys

QUERY = """
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      number title url additions deletions changedFiles baseRefName headRefName isDraft createdAt
      timelineItems(itemTypes: READY_FOR_REVIEW_EVENT, last: 1) {
        nodes { ... on ReadyForReviewEvent { createdAt } }
      }
      author { login ... on User { name } }
      reviews(first: 100) {
        nodes {
          state body submittedAt
          author { login ... on User { name } }
          comments(first: 100) { nodes { replyTo { id } } }
        }
      }
    }
  }
}
"""

TITLE_LIMIT = 60
STATES = {"APPROVED": "approved", "CHANGES_REQUESTED": "requested changes", "COMMENTED": "commented",
          "DISMISSED": "dismissed"}


def gh(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        sys.exit(f"gh {' '.join(args[:3])} failed: {result.stderr.strip()}")
    return result.stdout


def count(n, noun):
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def display_name(author):
    author = author or {}
    return author.get("name") or author.get("login") or "ghost"


def ready(view):
    if view["isDraft"]:
        return "Draft"
    events = view["timelineItems"]["nodes"]
    stamp = events[-1]["createdAt"] if events else view["createdAt"]
    at = datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone()
    return f"Ready {at:%a}, {at:%b} {at.day}, {at:%H:%M}"


def cell(text):
    return text.replace("|", "\\|")


def main():
    parser = argparse.ArgumentParser(description="Print one PR's metadata summary as markdown.")
    parser.add_argument("pr", type=int)
    pr = parser.parse_args().pr

    # gh's PR commands honor GH_REPO, but `gh repo view` without an argument reads
    # only the checkout, so pass it through to keep them pointed alike.
    repo = [os.environ["GH_REPO"]] if os.environ.get("GH_REPO") else []
    slug = json.loads(gh("repo", "view", *repo, "--json", "nameWithOwner"))["nameWithOwner"]
    owner, name = slug.split("/", 1)
    view = json.loads(gh("api", "graphql", "-f", f"query={QUERY}", "-f", f"owner={owner}", "-f", f"name={name}",
                         "-F", f"pr={pr}"))["data"]["repository"]["pullRequest"]

    title = view["title"]
    if len(title) > TITLE_LIMIT:
        title = title[:TITLE_LIMIT - 1].rstrip() + "…"
    status = ready(view)
    # A base that is another open PR's head branch means this PR is stacked on it.
    stacked = json.loads(gh("pr", "list", "--head", view["baseRefName"], "--state", "open",
                            "--json", "number", "--limit", "1"))
    if stacked:
        status += f" · stacked on #{stacked[0]['number']}"
    lines = [f"| **#{pr}** {cell(title)} |", "| --- |", f"| **{cell(display_name(view['author']))}** · {view['url']} |",
             f"| {status} |"]

    reviews = []
    for r in sorted(view["reviews"]["nodes"], key=lambda r: r.get("submittedAt") or ""):
        if r["state"] not in STATES:
            continue
        started = sum(1 for c in r["comments"]["nodes"] if not c.get("replyTo"))
        if not (r.get("body") or "").strip() and not started:
            continue
        reviews.append(f"- {display_name(r['author'])}: {STATES[r['state']]}, {count(started, 'comment')}")
    if reviews:
        lines += [""] + reviews

    lines += ["", f"{count(view['changedFiles'], 'file')}, +{view['additions']}/−{view['deletions']}"
                  f" · {view['baseRefName']} ← {view['headRefName']}"]

    print("\n".join(lines))


if __name__ == "__main__":
    main()
