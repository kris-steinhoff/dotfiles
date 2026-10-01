# Review queue dispatch

The queue is designed for repeated invocation. `scripts/dispatch.py` owns GitHub enumeration, exact-head preparation, and the small state record stored inside the worktree's existing `.herdr-dispatch.json` marker. Run it by its full path from the skill directory.

## Enumerate

```bash
scripts/dispatch.py ready [--repo <path>] [--limit <n>]
```

It returns `{items: [...]}` for open, non-draft PRs in the current repository matching `review-requested:@me -author:@me`. Each item contains `number`, `title`, `url`, `base_branch`, `head_branch`, and `head_sha`. An empty list is success: report that nothing is waiting and stop.

## Prepare each PR

For every item, run:

```bash
scripts/dispatch.py prepare --pr-number <n> [--repo <path>]
```

The helper fetches `refs/pull/<n>/head` to an internal ref, verifies the current GitHub metadata, and returns one action:

- `dispatch` — the exact local branch is ready for a worktree and reviewer.
- `already_active` — this head already has an unfinished reviewer; do nothing.
- `complete` — this exact head already reached a terminal decision; do nothing even if GitHub still reports a review request.
- `stale` — the PR moved while its recorded pass is active; report the old and new SHAs and leave the checkout untouched.

A needs-judgment response identifies an unrelated exact-name collision, a dirty completed worktree that cannot be refreshed, or an inaccessible PR. Skip that PR and report the reason; never rename, overwrite, hard-reset, or otherwise repair an unrelated branch. The helper records branch ownership in a private symbolic ref before creating the local branch, so an interrupted run can converge without mistaking an existing same-named branch for its own. If an active marker is stale but its agent no longer exists, use `inspect-worktree`; only when it reports no live agent and a clean checkout may you mark the abandoned pass complete and prepare again.

For a completed, clean worktree whose PR has moved, `prepare` safely resets only that dispatch-created, same-PR checkout to the newly fetched head and returns `dispatch`. It records the pass as prepared so another loop invocation will converge.

## Create and launch

For `dispatch`, run the generic `create-worktree` primitive on the returned `head_branch`, with no alternate branch and no base. Verify its returned `branch` is exactly `head_branch`; otherwise stop and report the collision.

Immediately claim the worktree before launching:

```bash
scripts/dispatch.py mark --worktree <path> --pr-number <n> --head-sha <sha> --status prepared --pane-id <pane> --workspace-id <workspace>
```

Seed the reviewer with this outcome, filling in the actual values:

```text
Run `/github-pr-review <n>` on this PR against `<base_branch>`. Work interactively with Kris here through finding triage and final posting confirmation.
```

Use a Claude agent named `review-<n>` in the worktree pane. For a new pane, use the `launch-agent-in-pane` primitive. If a completed worktree was refreshed and its prior Claude agent still occupies the pane, use the `herdr` skill to prompt that existing agent with the new seed instead; do not create another worktree or agent merely to redeliver it. Do not thread report-back—the review remains interactive in its own pane.

After the seed is successfully delivered, record the active pass and agent name:

```bash
scripts/dispatch.py mark --worktree <path> --pr-number <n> --head-sha <sha> --status active --pane-id <pane> --workspace-id <workspace> --agent-name <name>
```

Summarize only what this invocation did: newly launched or refreshed PRs, already-active or completed PRs skipped, stale heads deferred, and collisions or errors needing attention. Do not poll launched reviewers.

## Complete a pass

The interactive reviewer records its terminal decision from the PR worktree:

```bash
scripts/dispatch.py complete --worktree <path> --pr-number <n> --head-sha <sha>
```

This updates only the review state inside the existing provenance marker. It does not remove the worktree, stop the agent, change GitHub, or claim that a review was posted.
