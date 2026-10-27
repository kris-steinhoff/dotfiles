## Delegation

When the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162", "review every PR waiting on my team" — recognize the intent and carry it out with the `dispatch` skill, which places work and launches agents in whichever workspace tool the session runs in, rather than typing a tool's CLI by hand. Today that is Herdr (`HERDR_ENV=1`), where the `herdr` skill covers raw control beyond what `dispatch` does. Under Orca (`ORCA_PANE_KEY` set), `dispatch` defers: use Orca's own `orca-cli` skill for worktrees, terminals, and handoffs, and its `orchestration` skill for supervised work that reports back, and say which options below it couldn't honor, such as a persona or a chosen name. With neither, there is nowhere to launch an agent, so say so; a plain `git worktree` still works.

GitHub PR review discovery, exact-head checkout, interactive triage, and posting belong to the `github-pr` skill's review mode instead.

### Parse the request

- **Placement** — a worktree, or a terminal (a split pane or a tab) in an existing checkout. Take it from the words; when unstated, choose by task nature: code-writing → worktree; a GitHub PR review → the `github-pr` review workflow, which places it in an exact-head-branch worktree; investigation → a split pane; a shallow diff-only glance → a tab. `dispatch terminal create` makes either.
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
- **A GitHub PR's code on disk** — use `github-pr review`; its internal helper fetches same-repo and fork PR heads and preserves the exact GitHub branch name. Do not reproduce that flow with a generic or suffixed branch.
- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **Teardown, only when asked** — never proactively or automatically, except that `github-pr review ready` removes its own finished review worktrees. When the user does ask, the `cleanup-worktrees` skill is the mechanism: it removes the worktrees that are clean and idle (asking any live agent whether it is done), closes their workspaces, and deletes their branches with `git branch -d`, leaving unmerged ones. Its `--dry-run` shows what it would remove, which is how to survey before proposing anything.

### GitHub PR review queues

A queue intent such as "review every PR waiting on my team" invokes `github-pr review ready`, which runs under Herdr. That workflow discovers the open non-draft requests, gives each PR an exact-head-branch worktree and interactive Claude reviewer, and converges when called repeatedly. `review ready` is itself the confirmation to launch the queue, so do not add a second batch confirmation. The skill leaves every reviewer in its own pane for the user and never polls it. Its one teardown is its own: a later `review ready` pass removes a review worktree once its pass is complete, whatever the outcome, and a new review request brings the PR back in a fresh worktree.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent, threading report-back only when that was actually asked for; then report exactly what you made (the branch, the worktree path, the agent name, and where it runs) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source. `github-pr review ready` has its own idempotent batch semantics and needs no extra confirmation.
