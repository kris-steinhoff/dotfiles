## Herdr delegation

When Herdr is available (`HERDR_ENV=1`) and the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162" — treat it as a Herdr request: recognize the intent, then drive the mechanics through skills rather than typing the CLI by hand — the `herdr` skill for raw control, and the dispatch-primitive skills below (`create-worktree`, `fetch-pr-head`, `launch-agent-in-pane`, `resolve-task`) for the mechanical steps of getting a task onto a branch and an agent running against it.

### Parse the request

- **Placement** — worktree, sibling pane, or tab. Take it from the words; when unstated, choose by task nature: code-writing → worktree, investigation → pane, a review that reads via API → tab.
- **Agent kind** — which agent to run (codex, claude, gemini, …), and any model hint like opus. The `launch-agent-in-pane` skill maps the hint to the kind's flag (`--model`, or `-m` for gemini and codex), so pass it as `--model`. Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — the mechanical typing and metadata fetch is the `resolve-task` skill: hand it the raw ref and it detects a Jira key (`ABC-123`) from a GitHub number by shape, settles issue-vs-PR with an API query, and returns `{kind, id, title, url, base_branch?}`. Two cases it does not cover stay judgment: a plan or todo item means reading that file and treating its tracker as part of the contract, and freeform text is itself the task. When `resolve-task` signals needs-judgment (unresolvable ref, access denied), fall back to asking rather than guessing.
- **Report-back** — "report back here" means passing your own `$HERDR_PANE_ID` as `launch-agent-in-pane`'s `--report-to-pane`, which threads it into the seed as the worker's self-report target.

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
- **No auto-teardown** — removing a worktree or workspace is by hand, when the user asks.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create the placement and launch the agent with `launch-agent-in-pane` (it derives a unique name, delivers the seed prompt, and threads report-back to your `$HERDR_PANE_ID`); then report exactly what you made (the branch, the worktree path, the agent name, and its tab or workspace) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source.
