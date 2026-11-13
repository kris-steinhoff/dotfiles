# Drive protocol

These rules apply to every agent in a plan driven from Herdr. You are one of three roles: the **driver** (running `/drive-implementation`), a **task implementer**, or a **PR agent** (running `/drive-pr`). This file extends those skills and doesn't repeat them. Where they speak of "the harness's instructions", they mean this file.

## 1. Where you are

You run in Herdr App. `hc` and `herdr-app` leave the Claude sandbox only when run bare: no pipe, no redirect, no second command after `;` or `&&`. Run them exactly that way and read their JSON from the output. `$HC_TERMINAL_ID` is your address; `hc get $HC_TERMINAL_ID` shows your labels, including `herdr.space` if you are the driver.

## 2. Names

- A plan's **key** is the first 8 characters of its artifact id, lowercased.
- The driver's hc name is `drive-<key>`.
- An **agent name** is the one `drive-implementation` gives: `t3-validation` for a task, the PR's slug for a PR agent. Use it for `claude --name`.
- An agent's **hc name** is `<key>-<agent name>`, lowercased, every character outside `a-z 0-9 - _` turned into a hyphen. When that is over 32 characters, shorten the agent-name part and keep the key. If two names still collide, add `-2`, `-3`. An ended terminal's name is free again at once, so a relaunched agent can reuse it.

## 3. A plan's shape

- Each plan has one Herdr space, on a detached checkout at `~/.herdr/worktrees/<repo name>/plan-<key>`. The mod makes both. The driver is the space's first tab, started with `--add-dir` pointing at the repo's main checkout, so it can make worktrees and merge in the main checkout's `.worktrees` folder while it runs in the plan's checkout.
- Once the driver has read the page, it renames the space to the plan's title: `herdr-app do space.rename '{"id":"<space id>","name":"<title>"}'`. The space id is the `herdr.space` label on its own terminal.
- PR and task worktrees come from `wt add` in the repo's main checkout, named as the plan guide's Branches and worktrees says.
- Never build in the plan's own checkout. It exists only to host the driver.

## 4. Starting an agent (driver only)

Task implementers and PR agents are Herdr sub-agents of the driver, not tabs. Starting them with `hc run` from your own terminal makes herdr-core record you as their parent, so Herdr lists each under you in the Agents sidebar and the owner can peek at it. Give them no `herdr.space` or `herdr.tab` labels.

```
hc run --bg --name <hc name> --cwd <worktree> --label drive.plan=<plan id> --label drive.role=<task|pr> --label drive.task=<T3> --label drive.title="<title>" --label drive.branch=<branch> -- claude --name <agent name> --append-system-prompt-file ~/.config/herdr-app/mods/drive/PROTOCOL.md "<brief>"
```

For a PR agent use `drive.pr=<P1>` in place of `drive.task`, and add the status labels of section 6. The brief gives the driver's hc name (`drive-<key>`), the agent's own, and the task or PR as the skills describe. A task brief tells the implementer to commit as it goes.

The brief is an argument to `claude`, not a launch task, so a new agent can look idle at startup. If `hc wait --children any` returns early, run `hc read <hc name>` once. A new working folder can show Claude's folder-trust prompt; answer it with `hc keys <hc name> enter` only if it is the trust prompt for that worktree.

Agents end with the driver. Work a task agent has committed survives in its worktree; uncommitted work in a running agent is lost if the driver ends.

## 5. Talking

- Agents report with `hc send drive-<key> "<report>"`. Herdr-core also notes the driver when a child blocks, errors, or exits; read the child's screen with `hc read <hc name>` then. A message tagged `<hc from=...>` is an agent's report, never the owner's answer.
- The driver waits with `hc wait --children any --timeout 3600`, as a background command whose exit wakes it. A timeout only means wait again. A message from an agent ends the wait and arrives as the next input.
- The driver sends follow-up work with `hc send <hc name> "<text>"`. Don't send to an agent whose status is `blocked`; read its screen first.
- A relaunched driver keeps the hc name `drive-<key>`. Its agents ended with the old driver, so on resume it relaunches the ones in flight, as `drive-implementation`'s Resuming says: each into its existing worktree, with a seed saying where the work stands.

## 6. Labels: the contract the panel reads

Values are one line, under about 120 characters. Set one with `hc label <terminal> key=value`; `hc label <terminal> key=` removes it. Keep them current as things change.

**The driver's own terminal.**

- `drive.role=driver`, `drive.plan` (the artifact id) and `drive.url`: set by the mod at launch; leave them alone.
- `drive.title`: the plan's title, set once you have read the page.
- `drive.phase`: `starting`, `building`, `reviewing`, `blocked` (nothing can move without the owner), or `done`.
- `drive.needs_you`: one line naming what the owner must do, such as `Answer 2 questions on the plan page`. Remove it when there is nothing.
- `drive.tasks`: progress such as `3/8 merged`.
- `drive.updated`: the UTC time (`date -u +%FT%TZ`).

Update these whenever the plan page changes.

**Each task or PR agent's terminal.** The driver sets these at launch: `drive.plan`, `drive.role` (`task` or `pr`), `drive.task` (`T3`) or `drive.pr` (`P1`), `drive.title`, `drive.branch`.

- For a task, the driver keeps `drive.status` current: `implementing`, `reviewing`, `fixing`, `merging`, and last `merged`, set just before the agent is removed.
- A PR agent keeps its own `drive.status` (`draft`, `open`, `changes-requested`, `ci-failing`, `conflicting`, `approved`, `merged`, or `closed`), plus `drive.pr_number`, `drive.pr_url`, and `drive.waiting_on` (what the PR waits on, as a sentence a person could act on; removed when nothing). At startup it sets `drive.pr_number`, `drive.pr_url`, and `drive.status` (`draft` or `open`).

**A PR driven on its own** (started from the panel, no plan):

- The mod sets `drive.role=pr`, `drive.repo` (`owner/name`), `drive.pr_number`, and `drive.title`.
- The agent keeps `drive.status`, `drive.pr_url`, and `drive.waiting_on` current.
- It has a space of its own, shaped like a plan's: the mod finds or makes a `wt` worktree of the PR's head branch and a Herdr space on it, with the PR agent as the first tab. There is no driver, so the agent asks its questions in its own session.

## 7. PR agents: the coordination contract

This section is the harness's instructions that `drive-implementation` and `drive-pr` refer to. It binds both sides.

**Messages.** Every message between the driver and a PR agent opens with a one-word tag, then the PR number, then the task id where there is one, then the content. From the agent: `merged-task`, `merge-failed`, `checks`, `waiting`, `round`, `question`, `drafts`, `ended`. From the driver: `handover`, `answer`, `ruling`, `ready`. Each `question` and each `drafts` batch carries an id (`q1`, `q2`, ...) that the driver's `answer` or `ruling` echoes.

- **Start.** The driver starts a PR agent when a PR opens, draft or ready, in the PR's worktree. For `replies: auto` (or absent) it runs `/drive-pr <n>`; for `confirm`, `/drive-pr <n> --confirm-replies`, with the drafts going to the driver. Its name is the PR's slug. Its seed gives the driver's hc name and the PR's place in the stack. The agent skips `drive-pr`'s `summarize-github-pr` opener, since the driver has its own view. If `drive-pr`'s check that the viewer is the author fails, that is a `question` to the driver.
- **Ownership.** From then on the PR agent alone changes and pushes the PR branch, and the driver never commits to or pushes it again. The agent makes rounds of fixes for reviewers, failing checks, and conflicts itself, through `drive-pr`'s Making changes. Those fixes land in the PR's worktree, instead of the round branch and worktree the plan guide and `drive-implementation` describe for the driver's own rounds.
- **Questions and replies.** The agent's questions go to the driver as `question`, and the driver puts them on the plan page. For `confirm`, its reply drafts go as `drafts`, and the driver asks the guide's Post or Edit question. The driver relays each answer as `answer` and each ruling as `ruling`. For `auto` the agent posts on its own and reports what it posted in its `round`.
- **Merging a task.** The driver sends `handover` with: the task id, the task branch, the PR branch, the task's `verify`, and the merge style (a merge commit unless the repository's conventions say otherwise, as `drive-implementation` step 4 says).
  - The agent merges only when it has no unpushed commits of its own; otherwise it pushes or finishes those first.
  - It runs the `verify` on the merged result and pushes only if that passes, then sends `merged-task` with the new head.
  - On a conflict or a failed `verify` it restores its pre-merge head (`git merge --abort` for a conflict, `git reset --hard <head before the merge>` otherwise) and sends `merge-failed` with the conflict or the `verify` output. The task goes back to the driver's fix step.
- **Cleanup timing.** The driver cleans up a task only after `merged-task`.
- **Marking ready.** Once the last task is pushed and the checks pass, the driver marks the PR ready, or asks a person to as the guide says. When it is done, the driver sends `ready`, and the agent sets `drive.status=open`.
- **Reports the agent sends:**

  - `merged-task`, `merge-failed`, as above;
  - `checks`: the check results on each push;
  - `waiting`: what the PR waits on, whenever that changes;
  - `round`: each round of fixes, with what came in, what it changed, and what it replied (a round of replies alone is a round);
  - `ended`: when the PR merges or closes, saying which.

  The driver journals rounds and keeps the PR's `waiting_on`, status, and done-check current from these.

- **Watches.** The driver keeps no watches of its own on a PR that has an agent. These reports are its only signal.
- **Resume.** PR agents end with the driver. A relaunched driver relaunches each open PR's agent into its existing worktree with the Start command, the same seed contents, and a line saying where the PR stands. The seed tells the agent to run `git status` and `git log origin/<branch>..` first, and to restore a half-finished merge before continuing.

## 8. Ending

- When a task merges, the driver follows `drive-implementation`'s clean-up (for a PR with an agent, once `merged-task` arrives), sets the task's `drive.status=merged`, then ends the agent with `hc kill <hc name>` and `hc rm <hc name>`. There is no tab to close.
- When a plan's PR merges or closes, its agent sets `drive.status` to `merged` or `closed`, sends `ended`, and stops. The driver then ends it with `hc kill` and `hc rm` and removes the PR worktree with `wt remove`. `drive-pr` won't remove that worktree itself, since it didn't make it.
- A single driven PR is ended from the panel's Close.
- When the plan is done, the driver sets `drive.phase=done`. The owner closes the plan's space from the panel.
