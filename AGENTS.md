# kris-steinhoff/dotfiles

Personal dotfiles managed with [chezmoi](https://chezmoi.io/). This repo is the chezmoi source directory, which chezmoi applies to `$HOME`. It has no `CLAUDE.md`. Claude Code's built-in `agents-md` plugin loads this file when no `CLAUDE.md` exists, and the managed settings (`.chezmoitemplates/claude-settings.json.tmpl`) set its `instructionFiles` option to `claude-md-and-agents-md`, so this file still loads if a `CLAUDE.md` is ever added.

## Working in the source directory

- **Naming.** A source name encodes its target: `dot_` becomes a leading `.`, `executable_` sets the executable bit, `private_` drops group and other permissions, `symlink_` makes a link whose target is the file's body, and a `.tmpl` suffix renders the file as a template. A `modify_` file receives the live target on stdin and prints the new one, for files that other programs also write; the order is `modify_private_`, never `private_modify_`. `run_once_` scripts run once per machine per content.
- **Removals.** chezmoi doesn't delete a target just because its source disappeared, so removing a managed file also needs its target path in `.chezmoiremove`, or it lingers on every machine that applied it.
- **`.chezmoitemplates/`.** chezmoi parses every file there as a template on every render, markdown notes included, so one stray template delimiter breaks every template. The `chezmoi-templates-parse` pre-commit hook checks this with `chezmoi --source . execute-template ''`.
- **Notes for agents.** This file, `README.md`, and the per-area notes below are listed in `.chezmoiignore` so they never deploy (`.chezmoitemplates/` never deploys anyway). A new notes file elsewhere needs a line there. `CLAUDE.md` stays listed too, as a guard.
- **Markdown** is soft-wrapped (prettier with `proseWrap: never`, run by pre-commit).

## Bootstrap

```bash
chezmoi init kris-steinhoff/dotfiles
chezmoi apply
```

`chezmoi init` clones this repo to `~/.local/share/chezmoi`. `chezmoi apply` copies managed files to `$HOME` and runs `run_once_bootstrap.sh`, which:

1. Ensures `~/.zshrc`, `~/.config/git/config`, and `~/.vimrc` each include the shared config files under `~/.config/kris-steinhoff/`
2. Runs `brew bundle install` from `~/.config/homebrew/Brewfile` if Homebrew is available
3. Runs `nvim --headless "+Lazy! restore" +qa` to install Neovim plugins at the commits pinned in `lazy-lock.json`

## Config architecture

Shared configs live under `dot_config/kris-steinhoff/` (deployed to `~/.config/kris-steinhoff/`) and are _included_ by the machine-local config files rather than replacing them, so local overrides coexist with the shared baseline:

| Shared file                          | Included by            |
| ------------------------------------ | ---------------------- |
| `~/.config/kris-steinhoff/zshrc`     | `~/.zshrc`             |
| `~/.config/kris-steinhoff/gitconfig` | `~/.config/git/config` |
| `~/.config/kris-steinhoff/vimrc`     | `~/.vimrc`             |

`run_once_bootstrap.sh` adds each include line with `ensure_config`, prompting when a file exists but doesn't include the shared config.

## Neovim plugin pinning

`dot_config/nvim/lazy-lock.json` is checked in, and lazy.nvim installs plugins at the commits it records, which guards against a compromised upstream. To update: run `:Lazy update` in nvim, review the diff in `~/.config/nvim/lazy-lock.json`, then `chezmoi re-add ~/.config/nvim/lazy-lock.json` and commit. Without the `re-add`, the next `chezmoi apply` reverts the lockfile.

## Key tools

- **Shell**: zsh with starship, zsh-autosuggestions, zsh-syntax-highlighting, direnv
- **Terminal**: Ghostty (ligatures disabled)
- **Prompt**: Starship without Nerd Font glyphs, kubernetes module enabled
- **Git**: push.default=current, pull.rebase, rebase.updateRefs, rebase.autoSquash
- **AWS**: `aws-profile-login` / `aws-profile-logout` are zsh functions in `dot_config/kris-steinhoff/zshrc`, not scripts, because they set `AWS_PROFILE` in the interactive shell

## Area notes

Each area keeps its reasons in a notes file beside it. Load the notes before editing the area:

- Load `dot_claude/AGENTS.md` before editing how `~/.claude/settings.json` is managed (`dot_claude/modify_private_settings.json.tmpl`, `.chezmoitemplates/claude-settings.json.tmpl`, `dot_claude/hooks/executable_sort-settings-json.sh`).
- Load `dot_codex/README.md` before editing anything in `dot_codex/` or `.chezmoitemplates/codex.md`: the `config.toml` modify script, the persona profiles, and `agentBudget`.
- Load `dot_config/herdr-app/AGENTS.md` before editing anything in `dot_config/herdr-app/`.
- Load `dot_agents/skills/AGENTS.md` before adding, editing, or removing any skill; it covers how a skill is authored once and deployed to every agent surface. Also load the `AGENTS.md` in the skill's own directory (`dot_agents/skills/<name>/`, or `dot_claude/skills/<name>/` for a Claude-only skill) before editing that skill, if it has one.
- Load `.chezmoitemplates/AGENTS.md` before editing a global instruction partial in `.chezmoitemplates/`, a harness file that includes them (`dot_claude/CLAUDE.md.tmpl`, `dot_codex/AGENTS.md.tmpl`), or a persona (`.chezmoitemplates/agents/personas/`, `dot_claude/agents/`, and the coordinator's nudge hook `dot_claude/hooks/executable_coordinator-delegation-nudge.sh`).
- Before editing `.chezmoi.toml.tmpl`, load the notes for the datum you touch: `agentBudget` in `dot_codex/README.md`, `claudeSandboxAllowWrite` in `dot_claude/AGENTS.md`.
- Load `dot_local/bin/AGENTS.md` before editing `dot_local/bin/executable_ai-usage`.
