---
name: list-review-requests
description: Deterministic dispatch primitive that enumerates the review queue in the current repo — open, non-draft PRs where my or my team's review is requested, plus PRs I already reviewed that have new commits or a reply in one of my review threads since. Each item says why it is in the queue, so a first review can be told from a re-review. The plural cousin of resolve-task — where that types one ref, this lists the queue as the source-enumeration step of a batch review dispatch. Not for raw gh or Herdr control. Part of the Herdr dispatch flow (HERDR_ENV=1).
---

# list-review-requests

A Herdr dispatch primitive. Run the script; read its one-line JSON result.

```bash
scripts/list-review-requests [--repo <path>] [--limit <n>]
```

Load once per session; takes no `args`. Run the script above directly via Bash — it returns the whole queue in one call.

`--repo` (default: cwd) is the git repo path `gh` detects the GitHub repo from. `--limit` (default: 50) caps how many PRs come back. It drives only `gh` and needs no Herdr socket, so it also runs standalone.

## What it does

The queue is the union of two sources, deduped by PR number so a PR that qualifies both ways appears once.

**Requested.** One `gh pr list` search, unchanged from when this was the whole queue:

```
is:open -is:draft review-requested:@me -author:@me
```

- `review-requested:@me` is deliberately the union of directly-requested and team-requested PRs — GitHub folds both into that qualifier, so the queue covers both. Do not split it.
- `-is:draft` drops drafts; `-author:@me` drops my own PRs.

**Waiting on a re-review.** Authors don't reliably re-request review after pushing fixes, so a PR I already reviewed would otherwise drop out of the queue. A second search, `is:open -is:draft reviewed-by:@me -author:@me`, finds the candidates, and one batched GraphQL query reads my reviews and each PR's review threads. A candidate joins the queue when, since my latest review:

- **new commits** — the PR's head is no longer the commit my latest review was made against. Any head change counts: new commits, a force-push, or merging the base branch in.
- **thread reply** — in a review thread I commented in, the latest comment is someone else's and was posted after my latest review. A thread where I have already answered the reply does not count, and neither do top-level PR conversation comments, only review threads.

"My latest review" is the most recent submitted review I authored, in any state: approved, changes requested, commented, or dismissed. Pending reviews never count. One kind of COMMENTED review is skipped: GitHub records each reply I post in an existing thread as a review with no body whose only comments are replies. That is conversation, not a review of the code, and counting it would let a thread reply after a push hide the push.

"Me" is the authenticated `gh` user; nothing is hard-coded.

Current-repo scope is v1: the queue is whatever repo you invoke from. There is no cross-repo aggregation yet.

## Output (stdout, JSON)

`{ items: [ { number, title, url, base_branch, reasons }, ... ] }`

- `base_branch` maps `gh`'s `baseRefName` (snake_case, matching resolve-task's `base_branch`).
- `reasons` lists every reason the PR is in the queue, in this order: `requested`, `new_commits`, `thread_reply`. A requested PR I reviewed before carries its re-review reasons too. `new_commits` or `thread_reply` means a re-review. `requested` alone is usually a first review, though it can also be a re-request on a PR with nothing new since my last review.
- Requested PRs come first in `gh`'s order, then the re-review-only ones. `--limit` applies to each search and to the combined list.
- An empty queue is a success with `{"items": []}`, not a needs-judgment case.

The API reads are capped at 100 per list: my reviews on a PR, its review threads, and comments per thread or review. A PR busier than that may be judged on partial data.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not in a git repo, or `gh` cannot resolve a GitHub repo from it. stdout is `{"status": "needs_judgment", "reason": ...}`. Fall back to asking.
- `1` — real error (an unexpected subprocess or network failure). Diagnostics on stderr.
