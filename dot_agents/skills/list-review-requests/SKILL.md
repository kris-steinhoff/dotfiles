---
name: list-review-requests
description: Deterministic dispatch primitive that enumerates the open, non-draft PRs in the current repo awaiting my or my team's review. The plural cousin of resolve-task — where that types one ref, this lists the review queue as the source-enumeration step of a batch review dispatch. Enumeration is dumb: it lists what GitHub says is awaiting review and stops there. Not for raw gh or Herdr control. Part of the Herdr dispatch flow (HERDR_ENV=1).
---

# list-review-requests

A Herdr dispatch primitive. Run the script; read its one-line JSON result.

```bash
scripts/list-review-requests [--repo <path>] [--limit <n>]
```

Load once per session; takes no `args`. Run the script above directly via Bash — it returns the whole queue in one call.

`--repo` (default: cwd) is the git repo path `gh` detects the GitHub repo from. `--limit` (default: 50) caps how many PRs come back. It drives only `gh` and needs no Herdr socket, so it also runs standalone.

## What it does

One `gh pr list` search in the current repo:

```
is:open -is:draft review-requested:@me -author:@me
```

- `review-requested:@me` is deliberately the union of directly-requested and team-requested PRs — GitHub folds both into that qualifier, so the queue covers both. Do not split it.
- `-is:draft` drops drafts; `-author:@me` drops my own PRs.

Enumeration is dumb on purpose. It carries no first-review / re-review tag and probes no prior findings — the reviewer works that out itself, later.

Current-repo scope is v1: the queue is whatever repo you invoke from. There is no cross-repo aggregation yet.

## Output (stdout, JSON)

`{ items: [ { number, title, url, base_branch }, ... ] }`

- `base_branch` maps `gh`'s `baseRefName` (snake_case, matching resolve-task's `base_branch`).
- An empty queue is a success with `{"items": []}`, not a needs-judgment case.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not in a git repo, or `gh` cannot resolve a GitHub repo from it. stdout is `{"status": "needs_judgment", "reason": ...}`. Fall back to asking.
- `1` — real error (an unexpected subprocess or network failure). Diagnostics on stderr.
