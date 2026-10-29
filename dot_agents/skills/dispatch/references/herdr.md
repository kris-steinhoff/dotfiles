# dispatch under Herdr

Under Herdr, `dispatch` runs one script per command from `scripts/herdr/`, or the `herdr` CLI directly, and passes their results through with `place` added. A place is a Herdr pane id. This page holds what each command does there.

All of it requires `HERDR_ENV=1`, and every script reaches Herdr through its local socket, `~/.config/herdr/herdr.sock`. Claude Code's sandbox allows that socket. Codex's blocks it, so a Codex session requests escalated sandbox permissions for `dispatch` from the first call.

## `worktree create`

Runs `scripts/herdr/create-worktree`. It creates the git worktree and the Herdr workspace on the branch, stamps a provenance marker (`<path>/.herdr-dispatch.json`, excluded through the repo's `.git/info/exclude`) so teardown can later recognize it as dispatch-created, and returns the workspace's shell pane as the place. `--repo` is the git repo the collision and re-run checks run against, defaulting to the current directory. Without `--path`, Herdr chooses the location.

Collisions and re-runs are handled without a caller loop:

- A worktree already on the exact branch **that carries our marker** is our own prior creation, so it is reused (`created: false`). If its Herdr workspace was closed, a new one is opened on it with `herdr worktree open` (`reopened: true`), from the repo's parent workspace when needed, as for a fresh create.
- A worktree already on that branch that is **not** ours is a real collision, so the branch is auto-suffixed (`-2`, `-3`, ...) to the next free name and created fresh.
- Otherwise it creates fresh on the requested branch, checking out an existing local branch if one is there. This lets a source-preparation workflow create the branch before handing placement here.

With `--path`, the path takes part in both rules:

- Convergence stays keyed on the branch. Our own worktree on the branch is reused wherever it sits, and `path` reports where that is, even if it differs from the `--path` asked for (git can't check the branch out twice anyway).
- A branch collision suffixes branch and path together, so `foo` at `<dir>/foo` becomes `foo-2` at `<dir>/foo-2`, taking the first suffix free for both.
- When only the path is occupied, only the path is suffixed: `pr-254` stays `pr-254`, at `<dir>/pr-254-2`. Renaming the branch would cut a new one from the base and drop an existing branch's prepared commits. A re-run then converges on that worktree by its branch.
- A path is occupied if anything is there, an empty directory included, or if git still has a worktree registered there after its directory was deleted.

### Linked-worktree sources

Herdr creates worktrees only from a **parent workspace**, the one on a repo's primary checkout. It refuses a linked-worktree workspace, and also a `--repo` or current directory that is a linked checkout. On that refusal the script finds the repo's open parent workspace and creates from it instead. It never guesses where a new branch starts:

- A branch that doesn't exist yet needs an explicit `--base`. Without one, the branch would start from the parent checkout's HEAD rather than the caller's branch, so the script stops with needs-judgment and names the parent workspace. A checkout-relative base (`HEAD`, `@`, `HEAD~1`, `@{u}`) is refused the same way, since it would resolve in the parent checkout.
- A branch that already exists, such as one a source workflow prepared, starts from nothing, so it needs no `--base`.
- With no parent workspace open for the repo, it stops with needs-judgment.

Result: `{ workspace_id, path, pane_id, branch, created, reopened, place }`. `reopened` is present only when `created` is `false`.

## `worktree remove`

Runs `scripts/herdr/remove-worktree`. With an open Herdr workspace, `herdr worktree remove` removes the worktree and closes the workspace in one call; with none, `git worktree remove` removes it. Either way, success means git no longer lists the worktree afterward. Branches, local and PR-head refs alike, are left untouched.

Unless `--force` is given, it refuses (exit 2, with a specific reason) when any of these hold:

1. The tree is dirty.
2. The branch's work isn't verifiably pushed: no upstream at all, even with zero commits, or commits ahead of its upstream.
3. A live agent still occupies a pane in the worktree's workspace.
4. It is the caller's own active workspace (`$HERDR_WORKSPACE_ID`).

Past the gate it always passes `--force` to the underlying removal, since its own checks are the real safety validation. A path git doesn't list and that is gone from disk counts as already removed. A path git doesn't list that still exists is refused, as is the repository's main checkout. A removal that deleted the checkout but couldn't delete git's record of it, as happens in a sandbox that can't write the repo's `.git/worktrees/`, is needs-judgment with `checkout_removed: true`; `git worktree prune` then has to run somewhere that can write there.

## `terminal create`

Finds the open workspace whose checkout holds `--cwd`, the innermost when checkouts nest (a clone's `.worktrees/` sit inside it), or the caller's own workspace when none does. Then:

- Without `--tab`, `scripts/herdr/create-pane` splits a pane in that workspace to the right, preferring a pane with no agent running, with `--no-focus`. Result: `{ pane_id, workspace_id, place }`.
- With `--tab`, `scripts/herdr/create-tab` adds a tab with `--no-focus`. Result: `{ tab_id, pane_id, workspace_id, place }`.

## `terminal close`

`herdr pane close <place>`. A pane Herdr reports as not found counts as closed (`already_gone: true`).

## `agent launch`

Runs `scripts/herdr/launch-agent-in-pane` on the place's pane.

- If the pane already hosts a live agent, which is our own prior launch since a pane holds one occupant, it returns that agent's name without restarting it or re-delivering the seed. A pane occupied by a different kind than requested is needs-judgment.
- It derives a unique name from `--name`, else the persona, else the kind, suffixing past any live agent holding it. The name must fit Herdr's `[a-z][a-z0-9_-]{0,31}`. With `--name` on claude the final name is also passed as `-n`, the session's ListAgents/SendMessage address.
- The model hint goes to the kind's flag: `--model` for most kinds, `-m` for gemini and codex. `--persona` maps to `--agent` for claude and `--profile` for codex; other kinds refuse it. An explicit `--model` overrides a persona's own.
- `codex` always starts with `--no-daemon`. Codex otherwise runs its tool commands in a shared background daemon that carries the Herdr environment of whichever pane started it first, so the agent would report another pane's `HERDR_PANE_ID` as its own. It gets no `--approve-for-me`; the managed Codex config already sets the approval policy.
- `--developer-instructions-file` (codex only) passes the file through Codex's `developer_instructions` config override, for project instructions above the Git root that Codex's `AGENTS.md` discovery can't see. It can't be combined with `--persona`, whose profile carries its prompt in the same setting.
- `--report-back` passes the caller's `$HERDR_PANE_ID` as the report target. A non-claude agent is told to report with `herdr agent prompt <pane> "[<agent name>] <message>"`, and a codex agent also to request escalation for `herdr`. `--report-to-session` makes a claude agent report by SendMessage instead.

Kinds: `claude`, `codex`, `gemini`, `copilot`, `opencode`, `pi`. Adding a kind is an entry in `KINDS` in `scripts/agent_cli.py`, plus one in its model-flag table when the kind doesn't take `--model`; the Orca backend reads the same tables.

If the launch returns `agent_not_ready`, the pane is probably at a trust prompt. Tell the user, and once they've accepted it, deliver the seed with `agent send`.

## `agent send` and `agent status`

`agent send` is `herdr agent prompt <agent> <message> [--wait --timeout <ms>]`, passed through as Herdr prints it. `agent status` runs `herdr agent get <agent>` and returns `{ place, alive, agent }` in the shape Orca's status has, with Herdr's own record of the agent under `agent`; an agent Herdr reports as not found is `alive: false`, not an error. `<agent>` is the agent's place (its pane id) or its name, since Herdr accepts either. `agent get` sees agents of every kind. A wait that times out doesn't prove the message wasn't delivered, so check `agent status` before sending it again.
