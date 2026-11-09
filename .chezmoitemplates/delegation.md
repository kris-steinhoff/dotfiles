## Delegation

When the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new session for codex to explore X and report back here", "open a worktree for NXC-162", "review every PR waiting on my team" — recognize the intent and carry it out with whatever the harness offers for worktrees, sessions, or subagents, and plain `git worktree` for checkouts. When the harness can start no agent there, say so; the worktree alone still works.

GitHub PR review discovery, grouping, review, triage with the user, and posting belong to the `github-pr` skill's review mode instead.

### Parse the request

- **Placement** — a worktree, or a session or subagent in an existing checkout. Take it from the words; when unstated, choose by task nature: code-writing → worktree; a GitHub PR review → the `github-pr` review workflow, which reviews it from the PR's diff with no checkout; investigation or a shallow diff-only glance → the existing checkout.
- **Agent kind** — which agent to run (codex, claude, …), and any model hint like opus. When the user names a persona (the coordinator or chief-of-staff), launch that persona; reviewing and implementing are skills, not personas, so seed them in the prompt. For claude, the agent's name is also its ListAgents/SendMessage address. Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — a Jira key (`ABC-123`) is read with the `jira` skill, whose summary and browse URL give the title and link. A GitHub number may be a PR or an issue, so settle it by asking GitHub rather than guessing: `gh pr view <n>` first, then `gh issue view <n>`, since the issue endpoint also answers for a PR. Two cases neither covers stay judgment: a plan or todo item means reading that file and treating its tracker as part of the contract, and freeform text is itself the task. When a ref can't be resolved (not found, access denied), fall back to asking rather than guessing. Route a GitHub PR number or review-queue intent to `github-pr`, which owns that target's richer metadata and state.
- **Seed prompt** — give the launched agent context, not a method: state what it's working with (the branch, the task, its base) and what the outcome should be, in the user's own words where they gave them. Leave _how_ to the agent — its own skills and this repo's CLAUDE.md already know how to review, test, or explore, and a prescribed checklist or a specific diff command overrides that judgment with a worse one. "Review the PR's diff against main" is enough.
- **Report-back** — only when the user actually asked for it ("report back here", "let me know when done"), and a judgment call each time, not a default. Tell the agent in its prompt where to report, and a claude agent to report by SendMessage to your session's name.

### Name what you create

Name for whoever consumes the name:

- A branch Jira will associate wants the lowercased key as its prefix: `nxc-162-household-editing`.
- A GitHub branch wants the number where it helps: `78-rate-limit-headers`.
- A session or agent wants a readable label of its job: `explore-xyz`, not `codex-2`.

Name cheaply from what is already in context first — resolving the task already fetched its title, so use it. If the source is unreachable or slow, fall back to the best name you have — a key alone, a short descriptor — or ask; never fabricate a title.

### Worktrees

A worktree puts a branch on its own checkout without disturbing the current one. A repository's own instructions may set where worktrees go, as the `worktree-layout` skill does; follow them.

- **Fresh branch** — create the worktree on a new branch, with the harness's own worktree support or `git worktree add`, then launch the agent there.
- **A GitHub PR's code on disk** — a review doesn't need it, since `github-pr` reads the PR from git without a checkout. To work on a PR's code, fetch its head to a local branch named exactly as GitHub's head branch (`git fetch origin pull/<n>/head:<headRefName>`, which works for forks too) and create the worktree on that branch, so the checkout links to its PR. Don't use a generic or suffixed branch.
- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **Teardown, only when asked** — never proactively or automatically. When the user does ask, remove only worktrees that are clean and that no live agent is still using, and delete their branches with `git branch -d`, which leaves unmerged ones.

### GitHub PR review queues

A queue intent such as "review every PR waiting on my team" invokes `github-pr review ready`. That workflow discovers the open non-draft requests, groups related PRs such as a stack so one reviewer takes them in order, and converges when called repeatedly. Where the harness has background subagents, they review the PRs while the session that ran `review ready` triages each with the user, hands the confirmed review to a posting subagent, and shows progress on a board. `review ready` is itself the confirmation to review the queue, so do not add a second batch confirmation.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent, threading report-back only when that was actually asked for; then report exactly what you made (the branch, the worktree path, the agent name, and where it runs) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source. `github-pr review ready` has its own idempotent batch semantics and needs no extra confirmation.
