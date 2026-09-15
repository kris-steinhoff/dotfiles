---
name: list-stale-worktrees
description: Deterministic dispatch teardown primitive that enumerates the repo's worktrees with status and flags the stale ones. Read-only and advisory — it removes nothing and also surfaces worktrees it did not create, so a human can decide. Reach for it to survey worktrees before a reap, or directly when a user asks which worktrees are stale. Not for raw git or Herdr control. Part of the Herdr dispatch flow; runs standalone except the live-agent field.
---

# list-stale-worktrees

A Herdr dispatch teardown primitive. Read-only and advisory, it removes nothing. Run the script; read its JSON list.

```bash
scripts/list-stale-worktrees [--repo <path>] [--stale-after <minutes>]
```

Load once per session; takes no `args`. Run the script above directly via Bash — don't re-invoke this skill per repo.

`--repo` (default: cwd) is the git repo to enumerate. `--stale-after` (default `1440`, 24h) is the idle-minutes threshold for the stale flag. It enumerates via `herdr worktree list` when Herdr is available (needed for the live-agent field) and falls back to `git worktree list` otherwise, so it also runs standalone. The primary checkout (the entry at the repo root) is skipped — it is never a teardown candidate.

## Output (stdout, JSON)

A list of `inspect-worktree`-shaped records, each with `ours` and `stale`:

`{ path, branch, ours, dirty, ahead, behind, pr_state, agent_live, idle_minutes, prunable, stale }`

- `stale` — the worktree has been idle at least `--stale-after` minutes and has no live agent.
- The other fields carry `inspect-worktree`'s meanings. One worktree's degraded per-entry data (e.g. a flaky `gh` call) never fails the run — that entry's fields degrade gracefully and the survey continues.

It only reports. Removing is `remove-worktree`'s job, and only for what the user asks to tear down.

## Exit codes

- `0` — success, the JSON list on stdout.
- `1` — real error (the worktree enumeration itself failed). Diagnostics on stderr.
