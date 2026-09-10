---
name: launch-agent-in-pane
description: Deterministic dispatch primitive that launches an agent in a Herdr pane, seeds it, and threads a report-back target. Reach for it as the launch step of a Herdr dispatch (after create-worktree yields a pane), or directly when a user wants an agent started in a known pane with a seed prompt. It derives a unique agent name and hands off without blocking. Not for raw Herdr control. Requires HERDR_ENV=1.
---

# launch-agent-in-pane

A Herdr dispatch primitive. It takes any pane and is therefore uniform across placements. Run the script; read its one-line JSON result.

```bash
scripts/launch-agent-in-pane --pane-id <id> --kind <kind> \
  [--model <hint>] [--seed-prompt <text>] [--report-to-pane <pane>]
```

Requires `HERDR_ENV=1`; it drives the `herdr` CLI.

## What it does

- If `--pane-id` already hosts a live agent (a pane holds one occupant at a time, so this is our own prior launch), converges onto it: returns its existing name without restarting it or re-delivering the seed prompt, which may already be mid-turn. A pane occupied by a _different_ kind than requested is a needs-judgment case, not a silent override.
- Otherwise, derives a unique agent name from `--kind` (e.g. `claude`), auto-suffixing (`-2`, `-3`, ...) past any live agent already holding the name.
- Starts the agent in the pane, passing the model hint after `--` using the kind's flag: `--model` for most kinds, `-m` for `gemini` and `codex`.
- Delivers `--seed-prompt` without waiting on the agent's turn, so dispatch hands off rather than blocks.
- When `--report-to-pane` is given, appends a line to the seed telling the agent to report results back to that pane (the caller's `$HERDR_PANE_ID`).

Kinds: `claude`, `codex`, `gemini`, `copilot`, `opencode`. Adding a kind is one entry in the script's model-flag table.

## Output (stdout, JSON)

`{ agent_name, kind, pane_id }` — `agent_name` is the final unique name.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`), or the target pane already hosts a live agent of a different kind than requested. stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error (the agent failed to start, or malformed herdr JSON). Diagnostics on stderr.
