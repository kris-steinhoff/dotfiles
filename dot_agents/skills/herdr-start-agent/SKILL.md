---
name: herdr-start-agent
description: "Start a coding agent in an existing Herdr shell pane, mapping a short model hint to the agent's CLI flag and optionally handing it a first prompt. Use when you already have a pane (from herdr-worktree, a pane split, or a tab) and want an agent running in it. Requires HERDR_ENV=1."
---

# Herdr start agent

Starts a supported agent in a pane something else already made, maps a short model hint like `opus` to that agent's own CLI flag, and, if you give it one, submits a first prompt and confirms it landed.

This skill assumes the `herdr` skill for CLI discovery, ID handling, and the safety rules. It does not repeat them.

It does not create layout. `agent start` needs an available shell pane, so you supply `--pane`. Get one from `herdr-worktree` (its `pane_id`), from a `pane split`, or from a tab you opened. `herdr-work-task` chains task lookup, `herdr-worktree`, and this skill for the "have <agent> work on #123" flow.

## Run it

```bash
scripts/start-agent [<name>] --pane <pane-id> --kind <kind> [--model <hint>] [--prompt <text> | --prompt-file <path>]
```

It checks `HERDR_ENV`, waits for the pane to reach a shell prompt, starts the agent, and (if a prompt was given) submits it. It prints a JSON summary on stdout:

```json
{ "name": "rate-limit-headers", "kind": "claude", "pane_id": "w3J:p1", "model": "opus", "prompted": true }
```

Tell the user the agent name and where it is running. When `prompted` is true the agent already has its task and is working on it.

**The name is optional.** Omit it and the script picks the first free name based on the kind (`claude`, then `claude-2`, ...). Pass one when you want a meaningful handle, such as the worktree's slug. Names must match `[a-z][a-z0-9_-]{0,31}`.

**`--model` is a short hint, not a full flag.** `--model opus` becomes `-- --model opus` for most kinds and `-- -m opus` for `gemini` and `codex`. The per-kind exceptions live in the `MODEL_FLAGS` table in the script. Add an entry there when a kind needs a different flag. Omit `--model` to let the agent use its own default.

**The prompt is optional.** Without one, the agent is left at its prompt, ready for input. With one, the script submits it fire-and-forget: it returns as soon as the agent reacts, not when the turn finishes, so do not then poll `herdr agent get`. Use `--prompt-file` for anything long or multi-line.

## If the prompt does not submit

The script exits 1 and names the pane. The agent is running there with no prompt in it. Read the pane before doing anything else:

```bash
herdr agent read <name>
```

Tell the user what you see. Do not send keys blindly, and do not start a second agent in the same pane. A stall on the first submission is already resubmitted once automatically, since the first prompt after `agent start` is the one that tends to get swallowed.

## If `agent start` fails

The script exits 1 with herdr's own error and starts nothing. The pane is the caller's, so this skill does not close it. A common cause is a pane that is not an available shell (an editor, a command, or an agent is already running in it). The script waits for a shell prompt first to avoid the startup race, which you can skip with `--no-wait-shell`.

## If the script fails

It prints herdr's own error rather than interpreting it. Read that first.

The script is short and is the specification of the exact commands, so read it before improvising a replacement, and check the current CLI with `herdr agent start --help` and `herdr agent prompt --help`. Herdr's installed binary is always the authority over anything written down here.
