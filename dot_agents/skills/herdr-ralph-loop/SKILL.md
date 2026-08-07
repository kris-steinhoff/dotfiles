---
name: herdr-ralph-loop
description: "Run a Ralph loop in Herdr: one agent in its own tab, cleared and re-prompted from the same prompt file until it stops itself. Use when the user asks to grind a backlog unattended, run a prompt on repeat, keep an agent working until a task list is empty, or set up a Ralph loop. Requires HERDR_ENV=1."
---

# Herdr Ralph loop

A Ralph loop submits the same prompt to a fresh context over and over. Progress accumulates in git and in a backlog file rather than in the conversation, so each pass re-orients from disk and the work can outrun any single context window.

This skill assumes the `herdr` skill for CLI discovery, ID handling, and the safety rules. It does not repeat them.

## What this deliberately does not do

It does not watch the loop. `scripts/ralph-loop start` builds the topology, launches the loop, confirms it began, and returns. The loop then runs in a driver pane the user can look at. If you find yourself polling `herdr agent get` after starting it, the driver pane is already doing that job.

## The prompt file is the job

The script is plumbing. Whether the loop achieves anything is decided almost entirely by the prompt, and a prompt that works interactively usually fails here because it assumes the agent remembers the last pass. A Ralph prompt has to re-read its own state every time.

`assets/PROMPT.md` is the template. Before starting a loop, make sure the prompt does four things:

- **Orients from disk.** Read the backlog, read `git log`, read the spec. Never "continue where you left off."
- **Picks exactly one item.** One item per pass is what keeps each context small enough to be worth clearing.
- **Writes back.** The backlog is the only channel between iterations. Discoveries that are not written down are lost.
- **Can stop itself.** `touch .ralph/STOP` when the backlog is empty. Without this the loop only ever stops at the iteration cap.

If the user has no backlog file, help them write one before starting the loop. A Ralph loop over an unordered pile of work produces an unordered pile of commits.

## Run it

```bash
scripts/ralph-loop start [--prompt FILE] [--max N] [--worktree [BRANCH]] [--yolo] [--kind KIND] [--timeout MS] [--focus] [-- <agent-args...>]
```

It creates a tab, splits a small driver pane below, starts the agent above, and hands the driver the loop. It prints a JSON summary on stdout:

```json
{ "agent": "ralph-prompt", "workdir": "/…", "branch": null, "tab_id": "wE:t8", "agent_pane": "wE:pQ", "driver_pane": "wE:pR", "stop_file": "/…/.ralph/STOP", "log": "/…/.ralph/loop.jsonl" }
```

Tell the user the tab, the iteration cap, and the stop file, then stop.

**`--max` defaults to 10 and there is no unlimited setting.** A loop that cannot end on its own is a loop nobody is accountable for. Raise the cap deliberately.

**`--worktree` puts the loop on its own branch** in a Herdr worktree workspace, which is where an unattended loop belongs. Without it the loop commits to the branch the user is standing on.

**`--yolo` requires `--worktree`.** It adds `--dangerously-skip-permissions`, without which the agent will hit an approval prompt on the first pass and the loop will stop `blocked`. The worktree is what keeps that contained. If the user genuinely wants it against the current checkout, they can pass the flag themselves after `--`.

**Focus stays where the user is** unless you pass `--focus`.

## How an iteration works

Iteration 1 goes to the freshly started agent as-is. Every later iteration sends `/clear` first, confirms the reset actually happened, then submits the prompt file's current contents with `--wait`.

That confirmation is not decoration. The agent's lifecycle status is already `idle` or `done` the instant `/clear` is typed, so waiting on the status proves nothing and the next prompt lands in the _old_ context. The loop then quietly stops being a Ralph loop and becomes one long accumulating conversation, with nothing in the log to say so. The script instead watches the agent's session identity, which only changes once the clear is real, and stops the loop if it never does.

Two things still follow from using `/clear`, and both are worth saying out loud to the user:

**The context reset is `/clear`, not a new process.** It is the agent's own reset, so it is as good as `/clear` is, and no better. Anything the agent wrote to `CLAUDE.md`, to its todo state, or to the repository carries over by design. If a run needs a guaranteed-cold start each pass, this engine is the wrong one.

**The prompt file is re-read every pass.** Editing it mid-run steers the next iteration. That is the intended way to correct a loop that is going sideways, and it is faster than stopping and restarting.

## Stopping

| Want                        | Do                                |
| --------------------------- | --------------------------------- |
| Stop after the current pass | `touch <workdir>/.ralph/STOP`     |
| Stop now                    | Ctrl-C in the driver pane         |
| See what it has done        | `cat <workdir>/.ralph/loop.jsonl` |

The loop also stops on its own when the agent goes `blocked`, when the agent exits, when a prompt cannot be submitted, or at the cap. The driver prints the reason as its last line.

`.ralph/` ignores itself with a `.gitignore` of `*`, so the agent's own commits never pick it up.

Teardown of a worktree workspace is not automated, deliberately. Removing a workspace by ID is one typo from removing someone else's. Do it by hand when the user asks:

```bash
herdr worktree remove --workspace <workspace_id>
```

## When the loop stops early

Read the driver pane's last line first. It names the reason.

`blocked` is the common one: the agent hit an approval or a question. Read it before doing anything else.

```bash
herdr agent read <agent-name>
```

Tell the user what it is asking. Do not answer an approval prompt on their behalf, and do not restart the loop over an unanswered question.

## If the script fails

It prints herdr's own error rather than interpreting it. Read that first.

The script is short and is the specification of the exact commands, so read it before improvising a replacement, and check the current CLI with `herdr agent prompt --help`. Herdr's installed binary is always the authority over anything written down here.
