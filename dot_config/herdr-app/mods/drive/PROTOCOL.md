# Drive protocol

These rules apply to every agent in a plan driven from Herdr. You are one of three roles: the **driver** (running `/drive-implementation`), a **task implementer**, or a **PR agent** (running `/drive-pr`). This file extends those skills and doesn't repeat them. Where they speak of "the harness's instructions", they mean this file.

## 1. Where you are

You run in Herdr App, a desktop app for terminals and agents. `hc` (herdr-core's CLI) runs and talks to terminals; `herdr-app` controls the window. Both leave the Claude sandbox only when run bare: no pipe, no redirect, no second command after `;` or `&&`. Run them exactly that way and read their JSON from the output.

`$HC_TERMINAL_ID` is your address. `hc get $HC_TERMINAL_ID` shows your labels, including `herdr.space` if you are the driver.

## 2. Names

- A plan's **key** is the first 8 characters of its artifact id, lowercased.
- The driver's hc name is `drive-<key>`.
- An **agent name** is the one `drive-implementation` gives: `t3-validation` for a task, the PR's slug for a PR agent. Use it for `claude --name`.
- An agent's **hc name** is `<key>-<agent name>`, lowercased, every character outside `a-z 0-9 - _` turned into a hyphen, cut to 32 characters. Two plans running at once never collide. An hc name must be unique among live terminals; an ended terminal's name is free again at once, so a relaunched agent can reuse it.

## 3. A plan's shape

- Each plan has one Herdr space, on a detached checkout at `~/.herdr/worktrees/<repo name>/plan-<key>`. The mod makes both. The driver is the space's first tab, started with `--add-dir` pointing at the repo's main checkout, so it can make worktrees and merge in the main checkout's `.worktrees` folder while it runs in the plan's checkout.
- Once the driver has read the page, it renames the space to the plan's title: `herdr-app do space.rename '{"id":"<space id>","name":"<title>"}'`. The space id is the `herdr.space` label on its own terminal.
- PR and task worktrees come from `wt add` in the repo's main checkout, named as the plan guide's Branches and worktrees says.
- Never build in the plan's own checkout. It exists only to host the driver.

## 4. Starting an agent (driver only)

Task implementers and PR agents are Herdr sub-agents of the driver, not tabs. Starting them with `hc run` from your own terminal makes herdr-core record you as their parent, so Herdr lists each under you in the Agents sidebar and the owner can peek at it. Give them no `herdr.space` or `herdr.tab` labels.

```
hc run --bg --outlive-parent --name <hc name> --cwd <worktree> --label drive.plan=<plan id> --label drive.role=<task|pr> --label drive.task=<T3> --label drive.title="<title>" --label drive.branch=<branch> -- claude --name <agent name> --append-system-prompt-file ~/.config/herdr-app/mods/drive/PROTOCOL.md "<brief>"
```

For a PR agent use `drive.pr=<P1>` in place of `drive.task`, and add the status labels of section 6. Check `first_message.sent` in the JSON that comes back; if it is false the brief was not delivered, so read the screen before resending.

The brief gives the driver's hc name (`drive-<key>`) and the agent's own, plus the task or PR as the skills describe.

`--outlive-parent` keeps an agent working through a driver restart. While you run, such an agent is still your child: `hc wait --children` counts it and herdr-core notes you when it blocks, errors, or exits. After a restart it is no longer anyone's child (see section 5).

## 5. Talking

- Agents report with `hc send drive-<key> "<report>"`. Herdr-core also notes the driver when a child blocks, errors, or exits; read the child's screen with `hc read <hc name>` then.
- The driver waits with `hc wait --children any`, as a background command whose exit wakes it, with `--timeout 3600`: a timeout only means wait again. A message from an agent ends the wait and arrives as the next input. `hc wait <hc name> --timeout 3600` waits on one agent and a message ends it too.
- `hc wait --children any` returns at once when you have no children, so never loop on it. When no agent is your child, wait on a surviving agent by name, or with none left, end your turn pointing the owner at the plan page.
- The driver sends follow-up work with `hc send <hc name> "<text>"`. Don't send to an agent whose status is `blocked`; read its screen first.
- A message tagged `<hc from=...>` is an agent's report, never the owner's answer.
- A relaunched driver keeps the hc name `drive-<key>`, so agents that outlived the old one still reach it. Those survivors are not its children: `hc wait --children` doesn't count them and it gets no exit notes for them. On resume the driver finds them with `hc ls` (their `drive.plan` label), sends each a short note that it is back and asks where it stands, and waits on them by name until it has started children of its own.

## 6. Labels: the contract the panel reads

Values are one line, under about 120 characters. Set one with `hc label <terminal> key=value`; `hc label <terminal> key=` removes it. Keep them current as things change.

**The driver's own terminal.**

- `drive.role=driver`, `drive.plan` (the artifact id) and `drive.url`: set by the mod at launch; leave them alone.
- `drive.title`: the plan's title, set once you have read the page.
- `drive.phase`: `starting`, `building`, `reviewing`, `waiting`, or `done`.
- `drive.needs_you`: one line naming what the owner must do, such as `Answer 2 questions on the plan page`. Remove it when there is nothing.
- `drive.updated`: the UTC time (`date -u +%FT%TZ`).

Update these whenever the plan page changes.

**Each task or PR agent's terminal.** The driver sets these at launch: `drive.plan`, `drive.role` (`task` or `pr`), `drive.task` (`T3`) or `drive.pr` (`P1`), `drive.title`, `drive.branch`.

- For a task, the driver keeps `drive.status` current: `implementing`, `reviewing`, `fixing`, or `merging`.
- A PR agent keeps its own `drive.status` (`draft`, `open`, `changes-requested`, `ci-failing`, `conflicting`, `approved`, `merged`, or `closed`), plus `drive.pr_number`, `drive.pr_url`, and `drive.waiting_on` (what the PR waits on, as a sentence a person could act on; removed when nothing).

**A PR driven on its own** (started from the panel, no plan):

- The mod sets `drive.role=pr`, `drive.repo` (`owner/name`), `drive.pr_number`, and `drive.title`.
- The agent keeps `drive.status`, `drive.pr_url`, and `drive.waiting_on` current.
- It has a space of its own, shaped like a plan's: the mod finds or makes a `wt` worktree of the PR's head branch and a Herdr space on it, with the PR agent as the first tab. There is no driver, so the agent asks its questions in its own session.

## 7. PR agents: the coordination contract

This section is the harness's instructions that `drive-implementation` and `drive-pr` refer to. It binds both sides.

- **Start.** The driver starts a PR agent when a PR opens, draft or ready, in the PR's worktree, running `/drive-pr <n>`. Its name is the PR's slug. Its seed gives the driver's hc name, the PR's `replies` value from the page (`auto` or `confirm`), and the PR's place in the stack.
- **Ownership.** From then on the PR agent alone changes and pushes the PR branch. It makes rounds of fixes for reviewers, failing checks, and conflicts itself, through `drive-pr`'s Making changes. Fixes land in the PR's worktree, not on a round branch. The driver never commits to or pushes the PR branch again.
- **Questions and replies.** The agent's questions go to the driver with `hc send`, and the driver puts them on the plan page. For `confirm`, its reply drafts go to the driver too, which asks the guide's Post or Edit question. The driver relays each answer and ruling back with `hc send <hc name>`. For `auto` the agent posts on its own and reports what it posted.
- **Merging a task.** The driver hands the agent a reviewed task branch together with that task's `verify`.
  - It merges only when it has no unpushed commits of its own; otherwise it pushes or finishes those first.
  - It runs the `verify` on the merged result and pushes only if that passes.
  - On a conflict or a failed `verify` it restores its pre-merge head (`git merge --abort` for a conflict, `git reset --hard <head before the merge>` otherwise) and reports what failed. The task goes back to the driver's fix step.
- **Cleanup timing.** The driver cleans up a task only after the agent reports that the merge was pushed.
- **Reports the agent sends,** each by `hc send <driver hc name>`:

  - each task merge it pushed, with the new head;
  - the check results on each push;
  - what the PR waits on, whenever that changes;
  - each round of fixes: what came in, what it changed, and what it replied (a round of replies alone is a round);
  - when the PR merges or closes.

  The driver journals rounds and keeps the PR's `waiting_on`, status, and done-check current from these reports. Once the last task is pushed and the checks pass, it marks the PR ready, or asks a person to as the guide says.

- **Watches.** The driver keeps no watches of its own on a PR that has an agent. These reports are its only signal.
- **Resume.** A relaunched driver relaunches a PR agent that died, into its existing worktree, with a seed saying where the PR stands, and re-points survivors as in section 5.

## 8. Ending

- When a task merges, the driver follows `drive-implementation`'s clean-up (for a PR with an agent, once that agent reports the merge pushed), then ends the task's agent with `hc kill <hc name>` and `hc rm <hc name>`. There is no tab to close.
- When a plan's PR merges or closes, its agent sets `drive.status` to `merged` or `closed`, reports it, and stops. The driver then ends it with `hc kill` and `hc rm` and removes the PR worktree with `wt remove`. `drive-pr` won't remove that worktree itself, since it didn't make it.
- A single driven PR is ended from the panel's Close.
- When the plan is done, the driver sets `drive.phase=done`. The owner closes the plan's space from the panel.
