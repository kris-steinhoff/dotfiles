# drive-implementation

`/drive-implementation <plan>` works the tasks in a plan that `/plan-implementation` wrote, keeps the plan current, and drives the plan's PRs through review until a person merges or closes them. The plan's `meta/guide` owns the schema, statuses, questions, delivery, and handover, so the skill holds only how the owner likes implementation to run: an agent and worktree per task, a fresh review of every task, and PRs driven by `drive-pr` with the plan standing in for its session.

## Worktrees and the sandbox

Claude Code's sandbox makes `.git/worktrees` read-only except for the worktree a session was started in. So a sandboxed driver can't create or remove a worktree, and can't merge or commit in a PR's worktree, all of which an earlier design asked of it and which failed halfway. The design follows from that:

- The driver works from the main checkout and only moves branch pointers and pushes, which write `.git/refs` and objects, both writable.
- Each task agent is started with `claude --worktree`, whose `WorktreeCreate` hook (`dot_claude/AGENTS.md`) creates the worktree outside the sandbox, cut from the PR branch through `WT_BASE`. The agent owns that worktree, so it can commit there. A relaunched agent started with `--cwd` in an existing worktree owns it too.
- PR branches are never checked out, so there are no PR worktrees. A task lands by merging the PR branch into itself in its own worktree, after which the driver fast-forwards the PR branch with `git fetch . <task>:<PR>`. That keeps merge commits, so tasks cut from earlier history are never orphaned, and runs the task's `verify` on exactly what lands.
- Worktrees outlive their tasks, since the driver can't remove them; the owner removes a finished plan's worktrees.

These were checked in a scratch repository in November 2026: an agent started with `--worktree` committed and merged in its worktree, a session started in an existing worktree could write its git dir, and the driver's fast-forward and push succeeded from the main checkout.

## PRs

Driving a PR is its own skill, `drive-pr`, because it is just as useful for a PR no plan made. The driver runs it for each open PR in its own session, with questions in the plan and code changes made by fix-round agents through the same cycle as tasks. Each PR's `replies` field says whether replies need the owner's confirmation; the default is `auto`. Driving starts when a PR opens rather than when it's marked ready, because a draft can fall behind its base too, and auto mode may refuse `gh pr ready`, which makes marking it ready a person's step. A plan is `done` only once every PR has merged or closed.

## Herdr

In Herdr the work runs as a tree the owner can follow in the Agents list: task agents are the driver's `hc` children, and each review is a child of the task agent it reviews. The driver still starts every review and receives its findings, because it decides what goes back to the implementer, and an implementer that started its own reviewer could steer the review; `--parent` lets the driver start it under the task agent anyway. `--no-notify` keeps herdr-core's notes about the reviewer out of the implementer's input, so the driver waits on the reviewer by address, since it isn't the driver's child. How to use `hc` comes from its own manual (`hc --skill`), which the global instructions point at; the skill adds only the start command that gives a task agent its own worktree, and the `plan.driver` label the plan mod's Go to driver button looks for (`dot_config/herdr-app/AGENTS.md`).

## Resuming

The plan is the only record. A resume reconciles it with the worktrees, agents, and PRs, and relaunches whatever was in flight, since sub-agents end with their session. On a local plan, `plan-store wait` runs alongside the other waits, so an edit made outside the session wakes the driver as a comment does on a plan page.
