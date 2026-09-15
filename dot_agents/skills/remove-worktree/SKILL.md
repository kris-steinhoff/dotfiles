---
name: remove-worktree
description: Deterministic dispatch teardown primitive that removes one worktree and closes its Herdr workspace. Destructive, so fail-closed: it refuses (needs-judgment, with a reason) a dirty tree, unpushed commits, a live agent, or the active workspace unless forced. Reach for it to tear down a dispatch-created worktree the user asked to remove, or directly when a user wants a worktree gone. Leaves branches untouched. Requires HERDR_ENV=1.
---

# remove-worktree

A Herdr dispatch teardown primitive. Destructive, so fail-closed. Run the script; read its one-line JSON result.

```bash
scripts/remove-worktree --worktree <path-or-workspace-id> [--force] [--repo <path>]
```

Load once per session; takes no `args`. Run the script above directly via Bash for each worktree you process — don't re-invoke this skill per item.

`--worktree` is a path or a Herdr workspace_id. `--repo` (default: cwd) is the git repo used for the worktree-list lookup. Requires `HERDR_ENV=1`; the removal drives the `herdr` CLI. `herdr worktree remove` handles both the git worktree removal and closing the Herdr workspace in one call; branches (local and PR-head refs) are left untouched.

## Safety gate

Unless `--force` is given, it refuses (exit 2, with a specific reason) when any of these hold:

1. The tree is dirty (uncommitted changes).
2. The branch's work isn't verifiably pushed — no upstream configured at all (even with zero commits, a brand-new branch is still unverified, distinct from actually having unpushed commits), or real commits ahead of its upstream (no-upstream is treated as unsafe too, erring conservative).
3. A live agent still occupies a pane in the worktree's workspace.
4. It is the caller's own active workspace (`open_workspace_id == $HERDR_WORKSPACE_ID`).

Past the gate (checks clean, or `--force`), it always passes `--force` to the underlying `herdr worktree remove` — our own checks are the real safety validation, so herdr's generic checks would only add friction.

Idempotent: an already-removed worktree (unresolvable, or herdr reports it gone) is a success, not an error.

## Output (stdout, JSON)

`{ removed, path }` — `removed` is `true` on success.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`), or an unsafe removal without `--force`. stdout is `{"status": "needs_judgment", "reason": ...}` with the failing condition and any known partial fields.
- `1` — real error (an unexpected git/herdr failure). Diagnostics on stderr.
