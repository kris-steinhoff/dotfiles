---
name: create-tab
description: Deterministic dispatch primitive that adds a tab (with a pane) to an existing Herdr workspace, for placements that want a tab rather than a split pane or a fresh worktree. Reach for it as the placement step of a Herdr dispatch, or directly when a user wants a new tab in a known workspace. Not for raw Herdr control (use the herdr skill for that). Requires HERDR_ENV=1.
---

# create-tab

A Herdr dispatch primitive. Run the script; read its one-line JSON result.

```bash
scripts/create-tab --workspace-id <id> [--label <text>] [--cwd <path>]
```

Requires `HERDR_ENV=1`; it drives the `herdr` CLI.

## What it does

`herdr tab create` takes a workspace id directly, so — unlike `create-pane` — there is no source-pane lookup. It creates the tab with `--no-focus` and returns the tab and its root pane, read defensively from herdr's response (its subcommands don't name fields consistently). Every call adds a genuinely new tab — this is not a collision-prone resource, so there is no dedup or convergence logic; a retry simply adds another tab, which is safe.

## Output (stdout, JSON)

`{ tab_id, pane_id, workspace_id }` — `pane_id` is the tab's root pane, ready to launch an agent in with `launch-agent-in-pane`.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`). stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error (the tab create failed — e.g. the workspace does not exist — or malformed herdr JSON). Diagnostics on stderr.
