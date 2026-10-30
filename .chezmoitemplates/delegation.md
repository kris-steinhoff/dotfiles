## Delegation

When the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162", "review every PR waiting on my team" — recognize the intent and carry it out with the `dispatch` skill, which places work and launches agents in whichever workspace tool the session runs in, rather than typing a tool's CLI by hand. It works under Herdr (`HERDR_ENV=1`), where the `herdr` skill covers raw control beyond what `dispatch` does, and under Orca (`ORCA_PANE_KEY` set), where Orca's own `orca-cli` skill does. Under Orca, `dispatch` creates a worktree only in a repo Orca knows and doesn't set to hide non-Orca worktrees; when it says so, pass the setting it names to the user rather than working around it. With neither tool, there is nowhere to launch an agent, so say so; a plain `git worktree` still works.

GitHub PR review discovery, grouping, review, triage with the user, and posting belong to the `github-pr` skill's review mode instead.

### Parse the request

- **Placement** — a worktree, or a terminal (a split pane or a tab) in an existing checkout. Take it from the words; when unstated, choose by task nature: code-writing → worktree; a GitHub PR review → the `github-pr` review workflow, which reviews it from the PR's diff with no checkout; investigation → a split pane; a shallow diff-only glance → a tab. `dispatch terminal create` makes either.
- **Agent kind** — which agent to run (codex, claude, gemini, …), and any model hint like opus. When the user names a persona (the coordinator or chief-of-staff), launch that persona; reviewing, investigating, and implementing are skills, not personas, so seed them in the prompt. `dispatch agent launch` takes these as `--model`, `--persona`, and `--name`, and for claude the name is also its ListAgents/SendMessage address. When the user asks for an agent without naming a kind, the `choose-agent` skill picks one from the machine's available agents and their remaining usage. Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — a Jira key (`ABC-123`) is read with the `jira` skill, whose summary and browse URL give the title and link. A GitHub number may be a PR or an issue, so settle it by asking GitHub rather than guessing: `gh pr view <n>` first, then `gh issue view <n>`, since the issue endpoint also answers for a PR. Two cases neither covers stay judgment: a plan or todo item means reading that file and treating its tracker as part of the contract, and freeform text is itself the task. When a ref can't be resolved (not found, access denied), fall back to asking rather than guessing. Route a GitHub PR number or review-queue intent to `github-pr`, which owns that target's richer metadata and state.
- **Seed prompt** — give the launched agent context, not a method: state what it's working with (the branch, the task, its base) and what the outcome should be, in the user's own words where they gave them. Leave _how_ to the agent — its own skills and this repo's CLAUDE.md already know how to review, test, or explore, and a prescribed checklist or a specific diff command overrides that judgment with a worse one. "Review the PR's diff against main" is enough.
- **Report-back** — only when the user actually asked for it ("report back here", "let me know when done"), and a judgment call each time, not a default. Pass `dispatch agent launch --report-back`, and for a claude agent also `--report-to-session <your session name>` so it reports by SendMessage.

### Name what you create

Name for whoever consumes the name:

- A branch Jira will associate wants the lowercased key as its prefix: `nxc-162-household-editing`.
- A GitHub branch wants the number where it helps: `78-rate-limit-headers`.
- A pane or agent wants a readable label of its job: `explore-xyz`, not `codex-2`.

Name cheaply from what is already in context first — resolving the task already fetched its title, so use it. If the source is unreachable or slow, fall back to the best name you have — a key alone, a short descriptor — or ask; never fabricate a title.

### Worktrees

A worktree puts a branch on its own checkout without disturbing the current one. A repository's own instructions may set where worktrees go, as the `worktree-layout` skill does; follow them.

- **Fresh branch** — `dispatch worktree create` makes and opens it: it suffixes on a name collision, converges on re-run, and returns the `path` and the `place` you then launch an agent at.
- **A GitHub PR's code on disk** — a review doesn't need it, since `github-pr` reads the PR from git without a checkout. To work on a PR's code, fetch its head to a local branch named exactly as GitHub's head branch (`git fetch origin pull/<n>/head:<headRefName>`, which works for forks too) and give that branch to `dispatch worktree create`, so the checkout links to its PR. Don't use a generic or suffixed branch.
- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **Teardown, only when asked** — never proactively or automatically. When the user does ask, the `cleanup-worktrees` skill is the mechanism: it removes the worktrees that are clean and idle (asking any live agent whether it is done), closes their workspaces, and deletes their branches with `git branch -d`, leaving unmerged ones. Its `--dry-run` shows what it would remove, which is how to survey before proposing anything.

### GitHub PR review queues

A queue intent such as "review every PR waiting on my team" invokes `github-pr review ready`. That workflow discovers the open non-draft requests, groups related PRs such as a stack so one reviewer takes them in order, and converges when called repeatedly. Where the harness has background subagents, they review the PRs while the session that ran `review ready` triages each with the user, hands the confirmed review to a posting subagent, and shows progress on a board. Without them, it runs under Herdr or Orca and gives each group an interactive Claude reviewer in a tab, which triages and posts itself. `review ready` is itself the confirmation to review the queue, so do not add a second batch confirmation.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent, threading report-back only when that was actually asked for; then report exactly what you made (the branch, the worktree path, the agent name, and where it runs) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source. `github-pr review ready` has its own idempotent batch semantics and needs no extra confirmation.
