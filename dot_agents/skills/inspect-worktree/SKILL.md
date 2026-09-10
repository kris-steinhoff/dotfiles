---
name: inspect-worktree
description: Deterministic dispatch teardown primitive that reports the state of one worktree, read-only. Reach for it to inform a teardown decision or to orient on a worktree, or directly when a user asks what state a worktree is in. It returns branch, cleanliness, ahead/behind, PR state, live-agent, idle age, and a reap-safe flag. Not for raw git or Herdr control. Part of the Herdr dispatch flow; runs standalone except the live-agent field.
---

# inspect-worktree

A Herdr dispatch teardown primitive. Read-only, it changes nothing. Run the script; read its one-line JSON result.

```bash
scripts/inspect-worktree --worktree <path-or-workspace-id> [--repo <path>]
```

`--worktree` is a path or a Herdr workspace_id. `--repo` (default: cwd) is the git repo used for the worktree-list lookup. It drives git and `gh` for most fields, so it runs standalone; only the live-agent field needs the Herdr socket (`HERDR_ENV=1`), and degrades to `false` without it.

## Output (stdout, JSON)

`{ path, branch, ours, dirty, ahead, behind, pr_state, agent_live, idle_minutes, prunable }`

- `ours` — the dispatch provenance marker (`.herdr-dispatch.json`) is present.
- `ahead`/`behind` — vs the branch's upstream if configured, else vs `origin/<base>` from the provenance marker if that ref exists, else `null` (never a fabricated number).
- `pr_state` — `merged` / `open` / `closed` / `none` / `branch-gone`. A flaky `gh` call degrades to `none` rather than erroring the whole read.
- `agent_live` — a live agent occupies some pane in the worktree's workspace.
- `idle_minutes` — best-effort: a live agent's activity timestamp if one can be found, else the last-commit time as a "last touched" proxy, else `null`.
- `prunable` — `not dirty and not agent_live and pr_state in {merged, closed, branch-gone}`, the reap heuristic. This is **not** git/herdr's own `is_prunable` (that means the admin entry outlived its working directory — a different concept).

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: the worktree cannot be found. stdout is `{"status": "needs_judgment", "reason": ...}`. Ask or pick a different target.
- `1` — real error (an unexpected git/subprocess failure). Diagnostics on stderr.
