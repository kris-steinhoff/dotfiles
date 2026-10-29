# dispatch under Orca

Under Orca, `dispatch` runs the scripts in `scripts/orca/`, or the `orca` CLI directly, and passes their results through with `place` added. A place is an Orca terminal handle (`term_…`). Handles belong to one run of Orca: after Orca restarts, a stored place reads as closed, and `worktree create` run again returns a fresh one.

All of it requires `ORCA_PANE_KEY`, which Orca sets in its own terminals, and uses the executable in `ORCA_CLI_COMMAND` when Orca sets one, else `orca`. The CLI reaches Orca through a socket in `~/Library/Application Support/orca`, which Claude Code's sandbox allows. Codex's blocks it, so a Codex session requests escalated sandbox permissions for `dispatch` from the first call.

## `worktree create`

Runs `scripts/orca/create-worktree`. git creates the worktree, not `orca worktree create`, because Orca's command takes neither a path nor an exact branch: asked for an existing branch's name, it cuts a new suffixed branch instead. Orca then adopts the checkout as one of the repo's non-Orca worktrees. The script labels it with `--label`, records the caller's worktree (`ORCA_WORKTREE_ID`) as its parent, which is how Orca nests its sidebar, and opens a terminal tab in it, which is the place.

Two things must hold first, or it stops with needs-judgment before touching git:

- **Orca knows the repo.** Orca shows a worktree only under its repo, matched by the repo's primary checkout. The fix is `orca repo add --path <checkout>`, for the user to run.
- **The repo doesn't hide non-Orca worktrees.** Orca's per-repo `externalWorktreeVisibility` set to `hide` keeps the worktree, and everything launched in it, out of the sidebar. The reason names the `orca repo set … --external-worktree-visibility show` command; it is the user's setting, so ask them rather than run it. A repo set to `inherit` follows Orca's global default, which the CLI can't read, so the script goes ahead; if Orca then doesn't pick the worktree up within 15 seconds, the default hides it, and the result is the same needs-judgment, naming both settings. The worktree stays, and a re-run converges on it once Orca shows it.

Collisions and re-runs follow the Herdr rules exactly: a worktree on the branch carrying the dispatch marker (`<path>/.herdr-dispatch.json`, named for Herdr because existing worktrees carry it) is reused (`created: false`); one on the branch without it suffixes the branch, and the path with it; an occupied path alone suffixes only the path. A reused worktree returns a terminal already open there, preferring one with no agent, so a relaunch converges on the agent already running in it; with none open, it opens one (`reopened: true`).

Without `--path`, the worktree goes in Orca's default folder, `~/orca/workspaces/<repo>/<branch>`, with `/` in the branch turned into `-`. A new branch starts from `--base`, or from the caller's checkout's `HEAD`, since git runs in the caller's checkout rather than in a parent workspace as under Herdr.

git runs inside the caller's sandbox, unlike under Herdr, where Herdr's own process does the git work. So the sandbox must let the session write both the worktree's folder and the repo's `.git`. A session whose working directory is the repo can write `.git` and a path inside the repo, such as the `worktree-layout` skill's `<clone>/.worktrees/`; Orca's default folder needs a sandbox grant, which these dotfiles' Claude Code settings give.

Result: `{ worktree_id, path, terminal, branch, created, reopened, place }`. `reopened` is present only when `created` is `false`.

## `worktree remove`

Runs `scripts/orca/remove-worktree`, with the same gate as under Herdr: without `--force` it refuses a dirty tree, a branch with no upstream or commits ahead of it, a live agent in any of the worktree's terminals, and the caller's own worktree. Past the gate it closes every terminal in the worktree (`orca terminal close --all`) and removes the checkout with `git worktree remove --force`. It doesn't use `orca worktree rm`, because that deletes the branch too, and dispatch leaves branches alone. Orca forgets the worktree once git has. `--worktree` takes a path or an Orca worktree id. A checkout deleted with git's record left behind is needs-judgment with `checkout_removed: true`, as under Herdr.

## `terminal create`

Finds the Orca worktree whose checkout holds `--cwd`, or the caller's own when none does. Orca opens terminals at a worktree's root, so a deeper `--cwd` is typed in as a `cd`.

- Without `--tab`, it splits a terminal already open in that worktree, preferring one with no agent, side by side. With none open, it opens a tab instead.
- With `--tab`, it opens a tab titled `--label`.

Result: `{ terminal, worktree_id, place }`.

## `terminal close`

`orca terminal close --terminal <place>`, which ends whatever runs there. A stale handle counts as closed (`already_gone: true`).

## `agent launch`

Runs `scripts/orca/launch-agent`, which types the agent's command line into the place's shell rather than calling `orca agent launch`. Orca's launcher opens a tab of its own and takes no persona, no session name, and no extra arguments; typed, the agent gets exactly the flags it gets under Herdr (from `scripts/agent_cli.py`), so `--name` still names a claude session and makes it a SendMessage address. Orca recognizes the agent in the terminal either way, from its hooks.

- If the terminal already runs an agent of the requested kind, it returns that agent (`converged: true`) without starting another or re-sending the seed. A different kind there is needs-judgment. Orca knows nothing of dispatch's names, so the result carries the name this launch would have used.
- Names aren't suffixed, because there is no registry of them to check. The name must still fit `[a-z][a-z0-9_-]{0,31}`.
- After typing the command it waits up to a minute for Orca to see the agent and for its prompt to settle, then sends the seed. It waits even with no seed, because a caller's next `agent send` would otherwise reach an agent still starting up, where it could be lost or answer a startup dialog for the user. If the agent never gets there, or Orca refuses the seed because a permission or trust prompt is showing, the result is needs-judgment `agent_not_ready`. A Claude started in a subdirectory of a repo whose `CLAUDE.md` imports a file above it stops at such a prompt. Tell the user, and once they've answered it, deliver the seed with `agent send`.
- `--report-back` without a claude `--report-to-session` gives the agent the caller's orchestration Run, creating and binding one to the caller's terminal if it has none, and tells it to report with `orca orchestration send --to run:<id> --type status|question --subject "[<name>] …"`. The result carries `run_id`. A Run is only a namespace with an inbox here: no Orca Task or Dispatch is created, so the agent has no worker lifecycle to follow, and the caller owes Orca no settlement or release.

Kinds and their flags are the Herdr list: `claude`, `codex`, `gemini`, `copilot`, `opencode`, `pi`.

## `agent send` and `agent status`

`--agent` must be the agent's place. `agent send` is `orca terminal send --text <message> --enter`. With `--wait`, it waits for Orca to confirm the turn started, then for the agent's prompt to go idle again (`terminal wait --for tui-idle`), and reports `settled`. A prompt showing a permission or trust dialog refuses the message, which comes back as needs-judgment `agent_blocked`.

`agent status` reads the terminal: `{ place, alive, kind, terminal_open, agent_wait }`. `alive` means the terminal is open and Orca sees an agent in it. An agent still starting up, or stopped at a startup dialog, isn't recognized yet, so it reads as not alive with `terminal_open: true`.
