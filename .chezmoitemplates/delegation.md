## Delegation

When the user asks in plain language to run an agent or command elsewhere ("open a worktree for NXC-162", "have codex explore X and report back"), use whatever the harness offers for sessions and subagents, and `wt` for checkouts. If it can start no agent, say so; the worktree alone still works. Start an agent only when asked; if the user names a persona (coordinator or chief-of-staff), launch it.

- **Sources** — Review a PR with the `github-pr` skill. For a queue ("review every PR waiting on my team"), show the new PRs from `github-review-queue --ready` in the repo, then review each in this session, one at a time. Read a Jira key with the `jira` skill. Settle a GitHub number with `gh pr view <n>` before `gh issue view <n>`, as the issue endpoint also answers for PRs. If a ref can't be resolved, ask; don't guess.
- **Seed prompt** — give the agent context and the outcome wanted, in the user's words where given, not a method.
- **Names** — name for the consumer: a branch Jira will associate starts with the lowercased key (`nxc-162-household-editing`), a GitHub branch carries the number where it helps (`78-rate-limit-headers`), and an agent or session gets a readable label of its job (`explore-xyz`, not `codex-2`). Reuse a fetched title; if the source is unreachable or slow, use a bare key or short descriptor, or ask; never invent one.
- **Worktrees** — use `wt add <branch>` unless the repo says otherwise; it puts them in the repo's `.worktrees/`, branches from the remote default, and prints the path. For a PR's code, fetch its head (`git fetch origin pull/<n>/head:<headRefName>`), then `wt add` it.
- **Report back** only when asked, telling the agent in its seed prompt where to report.
- **Tear down** only when asked: `wt remove <name>` on worktrees no agent uses. It keeps dirty or unmerged work and prints a force command, to run only if the user said to discard it.
- **Act on clear, confirm on doubt** — when clear, act, report exactly what you made (branch, path, agent, where it runs) and stop; don't poll it. Ask only on an ambiguous parse or an unresolved source.
