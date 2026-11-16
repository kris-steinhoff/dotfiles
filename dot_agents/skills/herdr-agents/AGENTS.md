# herdr-agents

`herdr-agents` says how an agent inside the Herdr desktop app starts, names, and talks to other agents through herdr-core's `hc`. This file is for sessions working on the skill; chezmoi leaves it out of the deployed copy.

## Design

The core skills stay neutral about where they run and say only when to follow this one. It is a skill rather than a prompt appended at launch, because a driver is started by hand in any tab, where only a skill reaches it; a sub-agent gets it by its brief naming the skill. It is canonical rather than Claude-only, since Herdr runs other agent CLIs too.

Agents are hc sub-agents rather than tabs: they nest under their parent in Herdr's Agents list, herdr-core's parent and child reporting (`hc wait --children`, a note when a child blocks or exits) comes free, and the tab bar doesn't grow. The price is that they end with their parent, so a resumed driver relaunches the ones in flight. They start with `hc run --rm`, so ending one is a single `hc kill`.

An agent that changes code is started in its own worktree through `claude --worktree`, or with `--cwd` in a worktree that exists, because Claude Code's sandbox lets a session write a linked worktree's git dir only when it was started in that worktree. A driver that ran `wt add` itself failed halfway, since `.git/worktrees` is read-only to every other session. `WT_BASE` passes the base branch through to the `WorktreeCreate` hook (`dot_claude/AGENTS.md`).

The one label, `plan.driver`, is for the plan mod's Go to driver button (`dot_config/herdr-app/AGENTS.md`). Status shows in the plan itself, and Herdr already marks an agent waiting on a question as blocked.

## Testing

Only a real run in Herdr shows the skill works: run `/drive-implementation` on a small local plan in a scratch repository, from a Herdr tab, after `chezmoi apply`. Check that task agents and reviewers appear under the driver in the Agents list, that their reports wake the driver, that each task's worktree is cut from its PR branch, and that the Plan tab's Go to driver reaches it.
