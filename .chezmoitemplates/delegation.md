## Delegation

When the user asks in plain language to run an agent or command elsewhere ("open a worktree for NXC-162", "have codex explore X and report back"), use whatever the harness offers for sessions and subagents, and `git worktree` for checkouts. If it can start no agent, say so; the worktree alone still works. Start an agent only when asked; if the user names a persona (coordinator or chief-of-staff), launch it.

- **Sources** — GitHub PR reviews, including queues like "review every PR waiting on my team", go to the `github-pr` skill. Read a Jira key with the `jira` skill. Settle a GitHub number with `gh pr view <n>` before `gh issue view <n>`, as the issue endpoint also answers for PRs. If a ref can't be resolved, ask; don't guess.
- **Seed prompt** — give the agent context and the outcome wanted, in the user's words where given, not a method.
- **Names** — name for the consumer: a branch Jira will associate starts with the lowercased key (`nxc-162-household-editing`), a GitHub branch carries the number where it helps (`78-rate-limit-headers`), and an agent or session gets a readable label of its job (`explore-xyz`, not `codex-2`). Reuse a fetched title; if the source is unreachable or slow, use the best you have (a bare key, a short descriptor) or ask; never invent a title.
- **Worktrees** — follow the repo's instructions on where they go (some opt into the `worktree-layout` skill). To work on a PR's code, fetch its head to a branch named like GitHub's (`git fetch origin pull/<n>/head:<headRefName>`).
- **Report back** only when the user asked for it, telling the agent in its seed prompt where to report.
- **Tear down** only when asked: `git worktree remove` on clean worktrees no agent uses, then `git branch -d`, which keeps unmerged branches.
- **Act on clear, confirm on doubt** — when clear, act, report exactly what you made (branch, path, agent, where it runs) and stop; don't poll it. Ask only on an ambiguous parse or an unresolved source.
