---
name: watch-pr
description: Deterministic PR primitive that blocks until a GitHub pull request reaches the state being waited for — its CI finishes, someone reviews or comments, its head moves, or it merges or closes — then exits with one JSON line. Run it as a background task so its exit wakes the session instead of polling on a timer. Invoke whenever an agent needs to wait on a PR's CI, review, push, or merge. Not for listing or reviewing PRs.
---

# watch-pr

A PR primitive. Run the script in the background; its exit is the event. It prints nothing until then, so an empty output means the watch is still running.

```bash
scripts/watch-pr <number> --until ci|review|push|closed [--repo <path>] [--sha <oid>] [--since <iso>] [--include-bots] [--fail-fast] [--interval <s>] [--checks-grace <s>] [--timeout <s>] [--max-failures <n>]
```

Load once per session; takes no `args`. Start one watch per wait, as a background command where the harness supports it (Claude Code: `run_in_background`), and read its output when it exits. `--repo` (default: cwd) is the git repo `gh` detects the GitHub repo from. It drives only `gh`, so under a network sandbox `api.github.com` must be allowed.

## Events

- **`ci`** — every check on one commit has finished. The commit is the PR head at start, or `--sha` to name the one just pushed. A short `--sha` is resolved through the local clone. The watch waits for checks to appear, since a fresh push has none for a while. Then it reports only after two polls in a row find everything finished, so a check suite that starts after the first one completes is not missed. With `--fail-fast` it reports on the first failed check instead.
- **`review`** — someone other than me has reviewed or commented more recently than my own latest review or comment on the PR. That covers reviews, top-level comments, and replies in review threads. "Me" is the authenticated `gh` user, and bots are ignored unless `--include-bots` is passed. `--since` replaces that baseline with a fixed time: `now`, or any ISO 8601 time (one with no offset is read as UTC). Anything else is needs-judgment.
- **`push`** — the PR head moved off the watched commit (`--sha`, or the head at start).
- **`closed`** — the PR merged or closed.

Every watch also ends if the PR merges or closes first, and at `--timeout` (default 12 hours).

A `--sha` that is already in the PR's history but isn't its head has been moved off, so `push` reports `pushed` and `ci` reports `superseded` at once. A `--sha` the PR doesn't contain yet is treated as a push GitHub hasn't shown: the head counts as having moved off it only once it has been seen there, or after two minutes.

The review rule is what makes the watch safe to re-arm. An agent posting as my account raises the baseline with its own replies instead of tripping the watch, even though GitHub records each thread reply as a review. And a review that arrived while nothing was watching still counts as unanswered, so a restarted session can re-arm without remembering where it left off. The watch then exits at once if something is already waiting. One consequence: after pushing fixes for a review without replying to it, the review still counts as unanswered. Reply, or re-arm with `--since` set to now.

A failed `gh` call is retried with backoff and never read as the event. Only a run of more than `--max-failures` consecutive failures (default 10), or reaching `--timeout` while polls are failing, ends the watch, as an error.

## Output (stdout, JSON)

`{ pr, url, until, outcome, summary, pr_state, ... }`

- `outcome`:
  - `ci`: `pass`, `fail`, `none` (no checks appeared within `--checks-grace`, default 600s), or `superseded` (the head moved before the checks finished).
  - `review`: `activity`.
  - `push`: `pushed`.
  - Any event: `merged`, `closed`, or `timeout`.
- `summary` is one human-readable line saying what happened.
- `pr_state` is a snapshot at exit: `state`, `is_draft`, `mergeable`, `review_decision`, `head_sha`. It is worth a glance whatever the event, since it shows a merge conflict or an approval.
- `ci` adds `sha`, `failed`, `pending` (check names), and `total`.
- `review` adds `since` (the baseline used) and `items`, each `{author, at, kind, state, url}` with `kind` one of `review`, `comment`, `thread_comment`, oldest first.
- `push` and `superseded` add `sha` (the watched commit) and `new_sha` (the head now).
- `timeout` carries whatever was still outstanding: the pending checks, or the review baseline.

The API reads are capped at 100 per list: the first 100 checks, and the newest 100 reviews, comments, threads, and comments per thread. A PR busier than that may be judged on partial data.

## Exit codes

- `0` — success, including `timeout`. Result on stdout.
- `2` — needs judgment: no GitHub repo resolved from `--repo`, the PR does not exist, `gh` is not authenticated, or `--sha` or `--since` can't be read. stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error: repeated `gh` failures or malformed output. Diagnostics on stderr.
