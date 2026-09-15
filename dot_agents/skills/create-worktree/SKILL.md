---
name: create-worktree
description: Deterministic dispatch primitive that creates a git + Herdr worktree on a branch. Reach for it as a step in a Herdr dispatch, or directly when a user wants only a worktree on a branch. It assembles the worktree, resolves name collisions by suffixing, and converges on re-run, so no caller runs a check-then-retry loop. Not for raw Herdr control (use the herdr skill for that). Requires HERDR_ENV=1.
---

# create-worktree

A Herdr dispatch primitive. Run the script; read its one-line JSON result. It is deterministic, idempotent, and self-contained, so a caller trusts those properties instead of re-checking them.

```bash
scripts/create-worktree --branch <name> [--base <ref>] [--label <text>] [--repo <path>]
```

Load once per session; takes no `args`. Run the script above directly via Bash for each branch you process — don't re-invoke this skill per item.

Requires `HERDR_ENV=1`; it drives the `herdr` CLI. `--repo` defaults to the current directory.

## What it does

It creates the git worktree and the Herdr workspace on `--branch`, stamps a provenance marker (`<path>/.herdr-dispatch.json`) so teardown can later recognize it as dispatch-created, and returns the shell pane to launch an agent in.

Collisions and re-runs are handled without a caller loop:

- A worktree already on the exact branch **that carries our marker** is our own prior creation, so it is reused (`created: false`).
- A worktree already on that branch that is **not** ours is a real collision, so the branch is auto-suffixed (`-2`, `-3`, ...) to the next free name and created fresh.
- Otherwise it creates fresh on the requested branch, checking out an existing bare branch if one is there. This is what makes `fetch-pr-head` then `create-worktree` chain cleanly.

## Output (stdout, JSON)

`{ workspace_id, path, pane_id, branch, created }`

- `branch` is the final name after any collision suffix.
- `created` is `false` only when it converged onto our own existing worktree; `true` when a fresh worktree was created this run.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`). stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error (git or herdr failed, or malformed herdr JSON). Diagnostics on stderr.

A name collision is never an error; it is resolved by suffixing.
