#!/usr/bin/env python3
"""Print one PR's review conversation as JSON, from the authenticated user's side.

  feedback.py <pr> [--mode review|respond]

Output:

  {pr, url, title, author, viewer, base_branch, head_branch, head_sha, my_latest,
   header,
   threads:  [{thread_id, root_comment_id, path, line, resolved, outdated,
               started_by_me, unanswered, comments: [{id, author, bot, body,
               created_at, url}]}],
   reviews:  [{id, author, bot, state, body, submitted_at, url, after_my_latest}],
   comments: [{id, author, bot, body, created_at, url, after_my_latest}]}

`threads` are the inline review threads. `root_comment_id` is the id a reply
must target, since GitHub accepts replies only on a thread's first comment.
A thread is `unanswered` when it is unresolved and its latest comment is
someone else's.

`reviews` holds every review with a summary body (a review with an empty body
is only the container for its inline comments), and `comments` the PR's
conversation comments. Neither can be threaded, so whether one still needs an
answer is a judgment, not a fact the API records. `after_my_latest` marks those
someone else wrote after `my_latest`, the newest thing I posted anywhere on the
PR (the rule watch-pr wakes on); an older one may or may not have been answered.

`header` is the PR summary that opens triage, rendered as markdown so every
pass shows it the same way: an identity table (number, author's display name,
title) and a line with the branches, head, size, and where this pass stands.
That last part depends on `--mode`: a review counts my open prior threads, a
response counts the unanswered items. Without `--mode` it is left out.

Nothing is filtered out. A reviewer reads its own `started_by_me` threads; an
author reads every `unanswered` thread, and every review body and comment that
is not its own.
"""

import argparse
import json
import sys

from pr_api import pr_view, repo_slug, rest_list, review_threads, viewer_login


def person(author):
    """(login, is_bot) from a GraphQL author or a REST user."""
    if not author:
        return "ghost", False
    login = author.get("login", "ghost")
    bot = author.get("__typename") == "Bot" or author.get("type") == "Bot" or login.endswith("[bot]")
    return login, bot


def count(n, noun):
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def standing(mode, threads, reviews, comments, my_latest):
    """Where this pass stands, for the header: what the review or response is about."""
    if mode == "review":
        if my_latest is None:
            return "first review"
        open_prior = sum(1 for t in threads if t["started_by_me"] and not t["resolved"])
        return f"re-review of {count(open_prior, 'open prior thread')}" if open_prior else "re-review"
    if mode == "respond":
        n = sum(1 for t in threads if t["unanswered"])
        n += sum(1 for item in reviews + comments if item["after_my_latest"])
        return count(n, "unanswered comment")
    return None


def render_header(pr, view, stand):
    # The number stays plain text: Claude Code renders a markdown link as its text
    # followed by the URL in parentheses, which would bury the author's name. The
    # bare URL ending the line below stays clickable in a terminal.
    author = view.get("author") or {}
    name = author.get("name") or author.get("login") or "ghost"
    ident = f"#{pr} {name}"
    title = view["title"].replace("|", "\\|")
    width = max(len(ident), len(title))
    facts = [f"`{view['baseRefName']}` ← `{view['headRefName']}` at `{view['headRefOid'][:7]}`",
             f"{count(view['changedFiles'], 'file')}, +{view['additions']}/−{view['deletions']}"]
    if stand:
        facts.append(stand)
    facts.append(view["url"])
    return (f"| {ident.ljust(width)} |\n| {'-' * width} |\n| {title.ljust(width)} |\n\n"
            + " · ".join(facts))


def main():
    parser = argparse.ArgumentParser(description="Print one PR's review conversation as JSON.")
    parser.add_argument("pr", type=int)
    parser.add_argument("--mode", choices=["review", "respond"])
    args = parser.parse_args()
    pr = args.pr

    slug = repo_slug()
    me = viewer_login()
    view = pr_view(pr)

    threads = []
    for node in review_threads(slug, pr):
        comments = []
        for c in node["comments"]["nodes"]:
            login, bot = person(c["author"])
            comments.append({"id": c["databaseId"], "author": login, "bot": bot, "body": c["body"],
                             "created_at": c["createdAt"], "url": c["url"]})
        if not comments:
            continue
        threads.append({
            "thread_id": node["id"],
            "root_comment_id": comments[0]["id"],
            "path": node["path"],
            "line": node["line"] if node["line"] is not None else node["originalLine"],
            "resolved": node["isResolved"],
            "outdated": node["isOutdated"],
            "started_by_me": comments[0]["author"] == me,
            "unanswered": not node["isResolved"] and comments[-1]["author"] != me,
            "comments": comments,
        })

    reviews = []
    for r in rest_list(f"repos/{slug}/pulls/{pr}/reviews"):
        login, bot = person(r.get("user"))
        reviews.append({"id": r["id"], "author": login, "bot": bot, "state": r["state"],
                        "body": r.get("body") or "", "submitted_at": r.get("submitted_at"),
                        "url": r.get("html_url")})

    comments = []
    for c in rest_list(f"repos/{slug}/issues/{pr}/comments"):
        login, bot = person(c.get("user"))
        comments.append({"id": c["id"], "author": login, "bot": bot, "body": c.get("body") or "",
                         "created_at": c["created_at"], "url": c.get("html_url")})

    # ISO-8601 UTC timestamps from GitHub compare correctly as strings.
    mine = [c["created_at"] for t in threads for c in t["comments"] if c["author"] == me]
    mine += [r["submitted_at"] for r in reviews if r["author"] == me and r["submitted_at"]]
    mine += [c["created_at"] for c in comments if c["author"] == me]
    my_latest = max(mine) if mine else None

    def after_mine(author, when):
        return author != me and (my_latest is None or (when or "") > my_latest)

    reviews = [dict(r, after_my_latest=after_mine(r["author"], r["submitted_at"])) for r in reviews if r["body"].strip()]
    comments = [dict(c, after_my_latest=after_mine(c["author"], c["created_at"])) for c in comments]

    json.dump({
        "pr": pr,
        "url": view["url"],
        "title": view["title"],
        "author": (view.get("author") or {}).get("login"),
        "viewer": me,
        "base_branch": view["baseRefName"],
        "head_branch": view["headRefName"],
        "head_sha": view["headRefOid"],
        "my_latest": my_latest,
        "header": render_header(pr, view, standing(args.mode, threads, reviews, comments, my_latest)),
        "threads": threads,
        "reviews": reviews,
        "comments": comments,
    }, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
