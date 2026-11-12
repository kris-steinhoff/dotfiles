# Claude Code settings

This file covers how `~/.claude/settings.json` is managed alongside the tools that also write it; load it before editing `modify_private_settings.json.tmpl`, the partial `.chezmoitemplates/claude-settings.json.tmpl`, or `hooks/executable_sort-settings-json.sh`. `CLAUDE.md.tmpl`, the persona wrappers in `agents/`, and the coordinator's nudge hook are covered in `.chezmoitemplates/AGENTS.md`.

## The modify script

Other tools write into `~/.claude/settings.json`. Orca and the terminal Herdr each install their agent-state hooks there, and Claude Code adds keys of its own, such as a flag recording an accepted prompt. A plain template would wipe all of that on every apply, so the source is a `modify_` script, `modify_private_settings.json.tmpl`, like the one for Codex's `config.toml` (see `dot_codex/README.md`). The settings we manage live in the partial `.chezmoitemplates/claude-settings.json.tmpl`, which the script embeds. The script reads the live file and writes the partial merged over it. A top-level key in the partial replaces the live value wholesale, and a live key the partial lacks is kept. Hooks merge per hook group: a group that runs any managed command is replaced by the managed groups, and every other group belongs to another tool and stays, after ours. The script tells a group apart only by its commands, so a hook taken out of the partial goes into its `RETIRED_COMMANDS`; otherwise it would linger as another tool's. It is plain Python with no dependencies, because macOS's own `python3` is enough and uv adds nothing here.

The terminal Herdr's own `SessionStart` entry, when its Claude integration is installed, is one of those kept groups, and Herdr owns it outright. Don't manage a copy of it here: Herdr's install doesn't recognize a copy written with a `~` path as its own, so the live file ends up with two.

## Key order

Claude Code rewrites the file in its own key order whenever it changes something internally (e.g. saving a permission), so both sides are kept in `jq -S` order:

- The partial must render in `jq -S` order, which the local `sort-claude-settings-json` pre-commit hook checks by rendering it with `chezmoi execute-template`. It checks rather than fixes, because a template isn't JSON that `jq` can rewrite. The script's output is in the same order.
- `~/.claude/settings.json` (the live file) is kept sorted by a `ConfigChange` hook, `hooks/executable_sort-settings-json.sh`, which re-sorts it with the same `jq -S` after every change.

A `chezmoi apply` diff on this file should therefore only mean a real value changed.

## Machine-local sandbox paths

The partial is a template for one reason: a machine can add its own sandbox write paths. A list named `claudeSandboxAllowWrite` under `[data]` in the machine's chezmoi config is appended to `sandbox.filesystem.allowWrite`. This is how a work project's paths reach the sandbox without being written into these dotfiles, for example a beads database in a project folder that sessions in every clone and worktree need to lock. User settings are the right level for that rather than a project's `.claude/settings.local.json`, because a worktree session loads its own checkout's settings, not its clone's. `.chezmoi.toml.tmpl` carries the list forward, so a later `chezmoi init` doesn't drop it.

## Herdr's agent-state hook

The Herdr app needs no hook here: agents report their status to herdr-core through the terminal itself (OSC 7501, per the app's own `~/.config/herdr-app/AGENTS.md`), so this machine has neither the hook file nor its `settings.json` entry. The rest of this section is about the terminal Herdr.

The terminal Herdr's agent-state hooks are Herdr's, and these dotfiles don't manage them. `herdr integration install <agent>` writes each one (Claude's is `~/.claude/hooks/herdr-agent-state.sh`), and Herdr rewrites it on upgrade, flagging an outdated or missing one in its settings' Integrations tab; a managed copy would need copying back after every upgrade, and `chezmoi apply` would stop to ask about the changed file until then. The `settings.json` entry that runs the hook is Herdr's as well, and the `modify_` script keeps it, so a new machine gets the hook when the Claude integration is installed from Herdr. Don't add a `.chezmoiremove` entry for the hook, since that would delete the live file Herdr needs.

## Worktree hooks

Claude Code makes its own worktrees in `<repo>/.claude/worktrees` on `worktree-<name>` branches, for `claude --worktree`, the `EnterWorktree` tool, and subagents with worktree isolation. The `WorktreeCreate` and `WorktreeRemove` hooks (`hooks/executable_wt-worktree-create.sh` and `hooks/executable_wt-worktree-remove.sh`) replace that with `wt`, so those worktrees land in `.worktrees/<name>` on a plain `<name>` branch like every other worktree (the reasons are in `dot_local/bin/AGENTS.md`). Claude reads the created path from the last line of the create hook's stdout, which is exactly what `wt add` prints. With the hook in place Claude no longer copies `.worktreeinclude` files; `wt.setup` covers per-repo setup instead.

Removal goes through `wt remove`, which refuses a dirty worktree and keeps an unmerged branch, so Claude reports the removal as failed and nothing is lost. Claude never deletes branches itself, so the hook is also what keeps merged branches from piling up. A worktree made before the hooks existed, outside `.worktrees`, gets a plain `git worktree remove` and keeps its branch.

Hooks don't inherit the interactive shell's `PATH`, so both scripts put `~/.local/bin` and Homebrew's `bin` (for `uv` and `jq`) first. The desktop app's Code tab creates session worktrees by its own setting (Settings, Claude Code, worktree location); the docs don't say whether it runs these hooks.
