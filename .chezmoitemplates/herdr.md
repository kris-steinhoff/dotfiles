## Herdr delegation

When Herdr is available (`HERDR_ENV=1`) and the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162", "review every PR waiting on my team" — treat it as a Herdr request: recognize the intent, then drive the mechanics through skills rather than typing the CLI by hand. Use the `herdr` skill for raw control and the dispatch primitives (`create-worktree`, `launch-agent-in-pane`) for ordinary placements. GitHub PR review discovery, exact-head checkout, interactive triage, and posting belong to the `github-pr` skill's review mode instead.

### Parse the request

- **Placement** — worktree, sibling pane, or tab. Take it from the words; when unstated, choose by task nature: code-writing → worktree; a GitHub PR review → the `github-pr` review workflow, which places it in an exact-head-branch worktree; investigation → pane; a shallow diff-only glance → tab. Worktree placement is the Worktrees section below; for a pane or tab in an existing workspace, the `create-pane` and `create-tab` skills are the mechanics, each returning the `pane_id` you then launch an agent in.
- **Agent kind** — which agent to run (codex, claude, gemini, …), and any model hint like opus. The `launch-agent-in-pane` skill maps the hint to the kind's flag (`--model`, or `-m` for gemini and codex), so pass it as `--model`. When the user names a persona (the coordinator or chief-of-staff) pass it as `--persona <name>` (the skill maps it to `--agent` for claude, `--profile` for codex); model and persona can both be passed. Reviewing, investigating, and implementing are skills, not personas, so seed them in the prompt. To give the agent a specific name, pass `--name <name>`; for claude that name is also its ListAgents/SendMessage address. When the user asks for an agent without naming a kind, the `choose-agent` skill picks one from the machine's available agents and their remaining usage. Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — a Jira key (`ABC-123`) is read with the `jira` skill, whose summary and browse URL give the title and link. A GitHub number may be a PR or an issue, so settle it by asking GitHub rather than guessing: `gh pr view <n>` first, then `gh issue view <n>`, since the issue endpoint also answers for a PR. Two cases neither covers stay judgment: a plan or todo item means reading that file and treating its tracker as part of the contract, and freeform text is itself the task. When a ref can't be resolved (not found, access denied), fall back to asking rather than guessing. Route a GitHub PR number or review-queue intent to `github-pr`, which owns that target's richer metadata and state.
- **Seed prompt** — give the launched agent context, not a method: state what it's working with (the branch, the task, its base) and what the outcome should be, in the user's own words where they gave them. Leave _how_ to the agent — its own skills and this repo's CLAUDE.md already know how to review, test, or explore, and a prescribed checklist or a specific diff command overrides that judgment with a worse one. "Review the PR's diff against main" is enough.
- **Report-back** — only when the user actually asked for it ("report back here", "let me know when done"). `launch-agent-in-pane` never sends `--report-to-pane` on its own; passing your own `$HERDR_PANE_ID` there, which threads it into the seed as the worker's self-report target, is a judgment call each time, not a default.

### Name what you create

Name for whoever consumes the name:

- A branch Jira will associate wants the lowercased key as its prefix: `nxc-162-household-editing`.
- A GitHub branch wants the number where it helps: `78-rate-limit-headers`.
- A pane or agent wants a readable label of its job: `explore-xyz`, not `codex-2`.

Name cheaply from what is already in context first — resolving the task already fetched its title, so use it. If the source is unreachable or slow, fall back to the best name you have — a key alone, a short descriptor — or ask; never fabricate a title.

### Worktrees

A worktree puts a branch on its own checkout without disturbing the current one. Two dispatch primitives do the mechanics; drive them and read their JSON rather than typing the CLI by hand.

- **Fresh branch** — the `create-worktree` skill makes and opens it. It assembles the worktree, suffixes on a name collision, converges on re-run, stamps a provenance marker, and returns the `path`, `workspace_id`, and the `pane_id` you then launch an agent in.
- **A GitHub PR's code on disk** — use `github-pr review`; its internal helper fetches same-repo and fork PR heads and preserves the exact GitHub branch name. Do not reproduce that flow with a generic or suffixed branch.
- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **Teardown, only when asked** — never proactively or automatically, except that `github-pr review ready` removes its own finished review worktrees. When the user does ask, the `cleanup-worktrees` skill is the mechanism: it removes the worktrees that are clean and idle (asking any live agent whether it is done), closes their workspaces, and deletes their branches with `git branch -d`, leaving unmerged ones. `remove-worktree` is the lower-level primitive for one worktree, fail-closed on a dirty tree, unpushed commits, a live agent, or the active workspace unless forced, and leaving branches alone. The `list-stale-worktrees` skill is its read-only advisory counterpart — it surveys the repo's worktrees and flags stale ones but removes nothing, so use it to decide what to propose, never as a trigger to reap on your own.

### GitHub PR review queues

A queue intent such as "review every PR waiting on my team" invokes `github-pr review ready`. That workflow discovers the open non-draft requests, gives each PR an exact-head-branch worktree and interactive Claude reviewer, and converges when called repeatedly. `review ready` is itself the confirmation to launch the queue, so do not add a second batch confirmation. The skill leaves every reviewer in its own pane for the user and never polls it. Its one teardown is its own: a later `review ready` pass removes a review worktree once its pass is complete, whatever the outcome, and a new review request brings the PR back in a fresh worktree.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent with `launch-agent-in-pane` (it derives a unique name and delivers the seed prompt; thread report-back only when that was actually asked for); then report exactly what you made (the branch, the worktree path, the agent name, and its tab or workspace) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source. `github-pr review ready` has its own idempotent batch semantics and needs no extra confirmation.
