#!/usr/bin/env python3
"""Print one PR's review conversation as JSON, from the authenticated user's side.

  feedback.py <pr>

Output:

  {pr, url, title, author, viewer, base_branch, head_branch, head_sha, my_latest,
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

Nothing is filtered out. A reviewer reads its own `started_by_me` threads; an
author reads every `unanswered` thread, and every review body and comment that
is not its own.
"""

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


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        sys.exit("usage: feedback.py <pr>")
    pr = int(sys.argv[1])

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
        "threads": threads,
        "reviews": reviews,
        "comments": comments,
    }, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
