## Herdr delegation

When Herdr is available (`HERDR_ENV=1`) and the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162", "review every PR waiting on my team" — treat it as a Herdr request: recognize the intent, then drive the mechanics through skills rather than typing the CLI by hand — the `herdr` skill for raw control, and the dispatch-primitive skills below (`create-worktree`, `fetch-pr-head`, `launch-agent-in-pane`, `resolve-task`, `list-review-requests`) for the mechanical steps of getting a task onto a branch and an agent running against it.

### Parse the request

- **Placement** — worktree, sibling pane, or tab. Take it from the words; when unstated, choose by task nature: code-writing → worktree; a PR review → worktree too, since the `/review` reviewer reads around the diff and, on a re-review, verifies prior findings against the code on disk; investigation → pane; a shallow diff-only glance → tab. Worktree placement is the Worktrees section below; for a pane or tab in an existing workspace, the `create-pane` and `create-tab` skills are the mechanics, each returning the `pane_id` you then launch an agent in.
- **Agent kind** — which agent to run (codex, claude, gemini, …), and any model hint like opus. The `launch-agent-in-pane` skill maps the hint to the kind's flag (`--model`, or `-m` for gemini and codex), so pass it as `--model`. When the user names a persona instead — the reviewer, an investigator — pass it as `--persona <name>` (the skill maps it to `--agent` for claude, `--profile` for codex); model and persona can both be passed. Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — the mechanical typing and metadata fetch is the `resolve-task` skill: hand it the raw ref and it detects a Jira key (`ABC-123`) from a GitHub number by shape, settles issue-vs-PR with an API query, and returns `{kind, id, title, url, base_branch?}`. Two cases it does not cover stay judgment: a plan or todo item means reading that file and treating its tracker as part of the contract, and freeform text is itself the task. When `resolve-task` signals needs-judgment (unresolvable ref, access denied), fall back to asking rather than guessing. A queue intent — "review all PRs needing my or my team's review" — is not a single ref: its source is the `list-review-requests` skill, which returns the set to fan out over (see Batch dispatch).
- **Seed prompt** — give the launched agent context, not a method: state what it's working with (the branch, the task, its base) and what the outcome should be, in the user's own words where they gave them. Leave _how_ to the agent — its own skills and this repo's CLAUDE.md already know how to review, test, or explore, and a prescribed checklist or a specific diff command overrides that judgment with a worse one. "Review the PR's diff against main" is enough.
- **Report-back** — only when the user actually asked for it ("report back here", "let me know when done"). `launch-agent-in-pane` never sends `--report-to-pane` on its own; passing your own `$HERDR_PANE_ID` there, which threads it into the seed as the worker's self-report target, is a judgment call each time, not a default.

### Name what you create

Name for whoever consumes the name:

- A branch Jira will associate wants the lowercased key as its prefix: `nxc-162-household-editing`.
- A GitHub branch wants the number where it helps: `78-rate-limit-headers`.
- A pane or agent wants a readable label of its job: `explore-xyz`, not `codex-2`.

Name cheaply from what is already in context first — `resolve-task` already fetched the title, so use it. If the source is unreachable or slow, fall back to the best name you have — a key alone, a short descriptor — or ask; never fabricate a title.

### Worktrees

A worktree puts a branch on its own checkout without disturbing the current one. Two dispatch primitives do the mechanics; drive them and read their JSON rather than typing the CLI by hand.

- **Fresh branch** — the `create-worktree` skill makes and opens it. It assembles the worktree, suffixes on a name collision, converges on re-run, stamps a provenance marker, and returns the `path`, `workspace_id`, and the `pane_id` you then launch an agent in.
- **A PR's code on disk** — the `fetch-pr-head` skill first, which fetches the PR head into a local branch (same-repo and fork PRs alike), then `create-worktree` on that branch.
- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **Teardown, only when asked** — never proactively or automatically. When the user does ask, the `remove-worktree` skill is the mechanism: it is fail-closed, refusing (with a reason) a dirty tree, unpushed commits, a live agent, or the active workspace unless forced, and it leaves branches alone. The `list-stale-worktrees` skill is its read-only advisory counterpart — it surveys the repo's worktrees and flags stale ones but removes nothing, so use it to decide what to propose, never as a trigger to reap on your own.

### Batch dispatch

A queue intent dispatches many reviewers at once instead of one agent against one task. The source is the `list-review-requests` skill (the review queue): it returns `{items: [{number, title, url, base_branch}]}` for the open, non-draft PRs awaiting your or your team's review in the current repo.

- **Confirm the set first.** Show the discovered PRs and their count, and confirm before launching — N worktrees plus N agents is heavier than a single dispatch, so look before you leap even when the parse is clear. An empty queue is a valid answer: say so and stop.
- **One reviewer per PR, in its own worktree.** For each item, run the per-PR dispatch: `fetch-pr-head` for the PR's head, `create-worktree` on that branch, then `launch-agent-in-pane --persona reviewer` seeded "Review PR #N against its base", named from the PR number and title. A review wants the code on disk, so each PR gets a worktree, not a tab.
- **The batch launches reviewers; it does not finish reviews.** Each launched reviewer is interactive and waits for you to triage in its own pane, so don't thread report-back and don't poll them. Summarize what you launched — the PRs, worktree paths, and agent names — and stop; you work through the panes yourself.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent with `launch-agent-in-pane` (it derives a unique name and delivers the seed prompt; thread report-back only when that was actually asked for); then report exactly what you made (the branch, the worktree path, the agent name, and its tab or workspace) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, an uncertain source, or a batch fan-out (confirm the discovered set before launching many).
