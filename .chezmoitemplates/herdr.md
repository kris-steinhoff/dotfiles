## Herdr delegation

When Herdr is available (`HERDR_ENV=1`) and the user asks in plain language to run an agent or command elsewhere — "review #254 with codex in a worktree", "new pane for codex to explore X and report back here", "open a worktree for NXC-162" — treat it as a Herdr request: recognize the intent and drive the mechanics through the `herdr` skill.

### Parse the request

- **Placement** — worktree, sibling pane, or tab. Take it from the words; when unstated, choose by task nature: code-writing → worktree, investigation → pane, a review that reads via API → tab.
- **Agent kind** — which agent to run (codex, claude, gemini, …), and any model hint like opus, passed as a native agent arg after `--` (`-- --model opus` for claude, `-- -m opus` for gemini and codex). Or none — create the placement empty, and don't start an agent unless one was asked for.
- **Task source** — detect by shape, then repo context; when genuinely ambiguous, ask rather than guess:
  - `ABC-123` → a Jira key.
  - `#78` or a bare `78` → a GitHub issue.
  - a plan or todo item → read that file, and treat its tracker as part of the contract.
  - freeform text → the description is itself the task.
- **Report-back** — "report back here" threads the caller's `$HERDR_PANE_ID` into the seed prompt as the worker's self-report target.

### Name what you create

Name for whoever consumes the name:

- A branch Jira will associate wants the lowercased key as its prefix: `nxc-162-household-editing`.
- A GitHub branch wants the number where it helps: `78-rate-limit-headers`.
- A pane or agent wants a readable label of its job: `explore-xyz`, not `codex-2`.

Name cheaply from what is already in context first. Do a small lookup (Jira REST, `gh`, reading the file) only when context is too thin and the source is resolvable. If the source is unreachable or slow, fall back to the best name you have — a key alone, a short descriptor — or ask; never fabricate a title.

### Worktrees

A worktree puts a branch on its own checkout without disturbing the current one.

- **Fresh branch** — `herdr worktree create --branch <name> [--base <ref>] --label <label>` makes and opens it, returning JSON with the `path`, `workspace_id`, and `pane_id` you then start an agent in.
- **A PR's code on disk** — fetch its head first, then create the worktree on that branch:

  ```bash
  git fetch origin pull/<n>/head:<branch>   # works for same-repo and fork PRs alike
  herdr worktree create --branch <branch>
  ```

- **One checkout per branch** — git won't check a branch out twice, so if it is already checked out in the main repo, use a distinct branch name or move that checkout off it first.
- **No auto-teardown** — removing a worktree or workspace is by hand, when the user asks.

### Act on clear, confirm on doubt

- **Clear** — when placement, source, and name are all unambiguous, create immediately and hand the worker its task; then report exactly what you made (the branch, the worktree path, the agent name, and its tab or workspace) and stop — don't poll it to completion.
- **Doubt** — pause and ask only on a degraded fallback (unreachable source, missing slug), an ambiguous parse, or an uncertain source.
