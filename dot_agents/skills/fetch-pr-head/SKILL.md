---
name: fetch-pr-head
description: Deterministic dispatch primitive that fetches a PR's head commit into a local branch, so a worktree can be built on it. Reach for it as the source step of a Herdr dispatch that puts a PR on disk (chained with create-worktree), or directly when a user wants a PR's code on a local branch. Works for same-repo and fork PRs. Not for raw git or Herdr control. Part of the Herdr dispatch flow (HERDR_ENV=1).
---

# fetch-pr-head

A Herdr dispatch primitive, the source step that (chained with `create-worktree`) puts a PR on disk. Run the script; read its one-line JSON result.

```bash
scripts/fetch-pr-head --pr-number <n> [--branch <name>] [--repo <path>]
```

Load once per session; takes no `args`. Run the script above directly via Bash for each PR you process — don't re-invoke this skill per item.

It always fetches through the pull-request head ref, which works uniformly for same-repo and fork PRs:

```
git fetch --force origin pull/<n>/head:<branch>
```

`--branch` defaults to `pr-<n>`. `--repo` defaults to the current directory. `--force` so a re-run converges even when the PR head was rebased or force-pushed since the last fetch, so it is safe to retry. It drives only git and needs no Herdr socket, so it also runs standalone.

## Output (stdout, JSON)

`{ branch, pr_number }` — `branch` is the local ref now at the PR head.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: the PR does not exist on origin, or the target branch is checked out in another worktree (git refuses to fetch into it). stdout is `{"status": "needs_judgment", "reason": ...}` with any known partial fields. Pick a different branch name, or ask.
- `1` — real error (an unexpected git failure). Diagnostics on stderr.
