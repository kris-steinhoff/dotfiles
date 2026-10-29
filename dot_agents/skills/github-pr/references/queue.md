# Review queue dispatch

The queue is designed for repeated invocation. `scripts/dispatch.py` owns GitHub enumeration, exact-head preparation, and the small state record stored inside the worktree's existing `.herdr-dispatch.json` marker. Run it by its full path from the skill directory.

Under a sandbox that proxies network access, the helper's `gh` calls reach `api.github.com`, so a run that has to declare its hosts (such as `allowed_domains` in Claude Code's auto mode) lists that host for each `cleanup`, `ready`, and `prepare` call.

## Clean up finished reviews

Each pass starts by removing review worktrees that no longer need a reviewer:

```bash
scripts/dispatch.py cleanup --apply [--repo <path>]
```

Run it as its own command, with nothing chained before or after it. It returns `{items: [...]}`, one per dispatch-created review worktree in the repository, each with `action` (`remove` or `keep`), `reason`, `pr_number`, `head_branch`, `worktree`, `place`, `workspace_id`, and `agent_name`. A worktree is marked `remove` when its pass is complete, its review is not requested again, and its checkout is clean and still at the reviewed head. The review's outcome does not matter: an approval, a request for changes, and a pass finished without posting are all done with their worktree. A PR that needs another look comes back through a fresh review request, and the next `prepare` builds a new worktree for it; the re-review reads my earlier findings from GitHub, not from the old checkout. A pass still in progress, a review requested again, or local work in the checkout keeps the worktree. So does a pass whose reviewer is gone (its workspace or terminal closed, or its agent exited), which the helper asks Herdr or Orca about; its reason says so, and the next `prepare` relaunches it while review is still requested. Report those as needing a reviewer, not as mid-review.

With `--apply`, the helper acts on each `remove` item as soon as it has checked it. It removes the worktree with `dispatch worktree remove --force`, which closes its Herdr workspace or Orca terminals and the finished reviewer idling there; the force is expected, because the exact-head branch has no upstream and the check just made covers everything that gate protects. It then deletes the PR's local branch and the helper's private refs, but only when the branch's commits are on the PR's fetched head. Each acted-on item gains `removed` and `released`, and a `problem` when either failed: a branch left behind holds work found nowhere else, so leave it and report it. Never remove a `keep` item yourself, and never remove a worktree this helper did not create. Report each removal in the pass summary. Without `--apply`, `cleanup` only classifies, which is how to look before acting; `scripts/dispatch.py release --pr-number <n>` remains for releasing one PR's branch by hand.

## Enumerate

```bash
scripts/dispatch.py ready [--repo <path>] [--limit <n>]
```

It returns `{items: [...]}` for open, non-draft PRs in the current repository matching `review-requested:@me -author:@me`. Each item contains `number`, `title`, `url`, `author` (the author's full name, or their login when they have none), `base_branch`, `head_branch`, and `head_sha`. An empty list is success: report that nothing is waiting and stop.

## Prepare each PR

For every item, run:

```bash
scripts/dispatch.py prepare --pr-number <n> [--repo <path>]
```

The helper fetches `refs/pull/<n>/head` to an internal ref, verifies the current GitHub metadata, and returns one action:

- `dispatch` — the exact local branch is ready for a worktree and reviewer.
- `already_active` — this head already has a reviewer at work; do nothing.
- `complete` — this exact head already reached a terminal decision; do nothing even if GitHub still reports a review request.
- `stale` — the PR moved while its recorded pass is active and its reviewer is still there; report the old and new SHAs and leave the checkout untouched. The reviewer moves its own worktree to the new head with `dispatch.py advance` before it triages or posts (see "Keep up with the head" in `SKILL.md`), so this needs no action.

A needs-judgment response identifies an unrelated exact-name collision, a dirty completed worktree that cannot be refreshed, or an inaccessible PR. Skip that PR and report the reason; never rename, overwrite, hard-reset, or otherwise repair an unrelated branch. The helper records branch ownership in a private symbolic ref before creating the local branch, so an interrupted run can converge without mistaking an existing same-named branch for its own. A pass whose reviewer is gone, with a clean checkout still at the head it was reviewing, comes back as `dispatch` with `relaunched: true`: the helper has moved it to the PR's current head if the PR moved, reset it to prepared, and the steps below give it a new reviewer in the same worktree. With local changes or another HEAD it is needs-judgment instead. Never mark such a pass complete to get it moving: `complete` drops the PR from the queue until its head moves.

For a completed (or prepared but never launched), clean worktree whose PR has moved, `prepare` safely resets only that dispatch-created, same-PR checkout to the newly fetched head and returns `dispatch`. It records the pass as prepared so another loop invocation will converge.

## Create and launch

For `dispatch`, run `dispatch worktree create` (the `dispatch` skill) on the returned `head_branch`, with no alternate branch and no base. Pass `--label "Review #<n> <author>"`, such as `Review #254 Ada Lovelace`, so the worktree reads as its PR in the workspace tool's sidebar while staying short enough not to be cut off; the summary that opens the reviewer's session carries the title. Verify its returned `branch` is exactly `head_branch`; otherwise stop and report the collision. For a refreshed or relaunched PR it reuses the existing worktree (`created: false`), reopening a Herdr workspace on it if the old one was closed, or under Orca opening a terminal there if none is open. Under Orca, a needs-judgment result saying the repo isn't in Orca or hides non-Orca worktrees stops the whole queue, since every PR would hit it: report the reason, which names the setting for the user to change, and launch nothing.

In a project that uses the `worktree-layout` skill, the review worktree nests in the clone's `.worktrees/`, so also pass `--path <clone>/.worktrees/<head_branch with "/" replaced by "-">`. For a head branch `feat/rate-limit-headers`, that is `<clone>/.worktrees/feat-rate-limit-headers`.

Immediately claim the worktree before launching, with the `place` from that result, and under Herdr its `pane_id` and `workspace_id` too:

```bash
scripts/dispatch.py mark --worktree <path> --pr-number <n> --head-sha <sha> --status prepared --place <place> [--pane-id <pane> --workspace-id <workspace>]
```

Use a Claude agent named `review-<n>` at the worktree's place. For a new place, start it with `dispatch agent launch --place <place> --kind claude --name review-<n>` and no seed prompt. If a completed worktree was refreshed and its prior Claude agent still occupies the place, reuse that agent; do not create another worktree or agent merely to redeliver the prompts. Do not thread report-back—the review remains interactive in its own pane.

Then send the agent two prompts with `dispatch agent send`, in order, addressed to its place. The first shows the PR's summary as a turn of its own, and `--wait` holds the second until that turn is over:

```bash
dispatch agent send --agent <place> --message "/summarize-github-pr <n>" --wait
dispatch agent send --agent <place> --message "Run \`/github-pr review <n>\` on this PR against \`<base_branch>\`. Work interactively with Kris here through finding triage and final posting confirmation."
```

The order matters. An agent prints the summary as its final message when the summary is the whole turn, but run in the middle of a longer turn, it narrates past the summary instead of showing it. So the summary can't be part of the review prompt.

After the second prompt is delivered, record the active pass and the `agent_name` the launch returned (under Herdr it may carry a suffix):

```bash
scripts/dispatch.py mark --worktree <path> --pr-number <n> --head-sha <sha> --status active --place <place> [--pane-id <pane> --workspace-id <workspace>] --agent-name <name>
```

Summarize only what this invocation did: worktrees cleaned up, newly launched or refreshed PRs, already-active or completed PRs skipped, stale heads deferred, and collisions or errors needing attention. Do not poll launched reviewers.

## Complete a pass

The interactive reviewer records its terminal decision from the PR worktree:

```bash
scripts/dispatch.py complete --worktree <path> --pr-number <n> --head-sha <sha>
```

This updates only the review state inside the existing provenance marker. It does not remove the worktree, stop the agent, change GitHub, or claim that a review was posted; a later `review ready` pass removes the worktree once `cleanup` marks it `remove`.
