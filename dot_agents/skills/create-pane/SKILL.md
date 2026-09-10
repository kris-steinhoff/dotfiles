---
name: create-pane
description: Deterministic dispatch primitive that adds a pane to an existing Herdr workspace, so an agent can launch into an existing checkout rather than a fresh worktree. Reach for it as the placement step of a Herdr dispatch when the work belongs in a sibling pane, or directly when a user wants a new pane in a known workspace. Not for raw Herdr control (use the herdr skill for that). Requires HERDR_ENV=1.
---

# create-pane

A Herdr dispatch primitive. Run the script; read its one-line JSON result.

```bash
scripts/create-pane --workspace-id <id> [--cwd <path>] [--direction right|down]
```

Requires `HERDR_ENV=1`; it drives the `herdr` CLI.

## What it does

`herdr pane split` splits an existing pane, not a workspace, so this finds a pane in the target workspace first (preferring one with no agent running, else the first pane, the same way `create-worktree` picks its shell pane) and splits it with `--no-focus`. `herdr` requires `--direction`; this defaults to `right`, overridable. Every call adds a genuinely new pane — this is not a collision-prone resource, so there is no dedup or convergence logic; a retry simply adds another pane, which is safe.

## Output (stdout, JSON)

`{ pane_id, workspace_id }` — `pane_id` is the new pane, ready to launch an agent in with `launch-agent-in-pane`.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`), or the workspace has no pane to split from (or does not exist). stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error (the split failed, or malformed herdr JSON). Diagnostics on stderr.
