---
name: herdr-pr-review
description: "Start a code review agent on a GitHub pull request in a new Herdr tab, then stop. Use when the user asks to review a PR in another tab, hand a PR to a review agent, or kick off a background review. Fire and forget: it does not wait for or read the review. Requires HERDR_ENV=1."
---

# Herdr PR review

Hands one pull request to a fresh agent in its own tab of the current workspace, confirms the prompt landed, and stops.

This skill assumes the `herdr` skill for CLI discovery, ID handling, and the safety rules. It does not repeat them.

## What this deliberately does not do

It does not wait for the review, read the agent's output, or report findings. The review lands in a tab the user can look at when they want it. If you find yourself polling `herdr agent get`, you are doing something this skill is not for.

## Run it

```bash
scripts/pr-review [<pr>] [--kind <kind>] [--focus]
```

With no argument it takes the current branch's pull request. It checks `HERDR_ENV`, resolves the PR, opens a tab in the current workspace, starts the agent, and submits `/review <pr>`, printing a JSON summary on stdout:

```json
{ "pr": 1, "agent": "review-1", "kind": "claude", "tab_id": "wE:t8", "pane_id": "wE:pQ" }
```

Tell the user the tab and the agent name, and stop. Do not read the pane.

**Exit 2 means it needs you to decide.** The PR was not named and the current branch has no pull request, or the one named does not exist. Open pull requests are listed on stderr. Ask which, then run it again with that number. Do not guess.

**The kind defaults to `claude`** because `/review` is a Claude Code slash command and other kinds do not have it. Pass `--kind` only when the user names one, and expect to give a different prompt by hand if you do.

**Focus stays where the user is** unless you pass `--focus`. The point is to start a review, not to interrupt one.

**A PR already under review** gets the next free name: `review-7`, then `review-7-2`. Nothing running is ever replaced.

## What the script handles for you

The prompt goes in with `--wait --until working --until idle --until done --timeout 15000`. That combination is what makes this fire and forget without being blind. It returns as soon as the agent reacts rather than when the review finishes, while still getting Herdr's five-second submission check, and the `idle`/`done` entries cover a turn that settles before Herdr samples `working`.

A stall on the first submission is resubmitted once, automatically. `agent_prompt_stalled` almost always means the keystrokes did not land rather than that the agent is thinking quietly, and the first prompt after `agent start` is the one that gets swallowed.

If `agent start` fails, the tab it just opened is closed again, so a failed run leaves nothing behind.

## If it still cannot submit

The script exits 1 and tells you the tab. The agent is running there with no prompt in it.

Read the pane before doing anything else:

```bash
herdr agent read <agent-name>
```

Tell the user what you see. Do not send keys blindly, and do not start a second agent on the same PR.

## Why a tab and not a worktree

`/review` reads the pull request through the GitHub API. It does not need the branch checked out, so a tab in the current workspace is the whole requirement.

Use `herdr-pr-worktree` when you want the PR's code on disk.

## If the script fails

It prints herdr's own error rather than interpreting it. Read that first.

The script is short and is the specification of the exact commands, so read it before improvising a replacement, and check the current CLI with `herdr agent prompt --help`. Herdr's installed binary is always the authority over anything written down here.
