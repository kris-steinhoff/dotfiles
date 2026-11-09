# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a personal dotfiles repository managed with [chezmoi](https://chezmoi.io/). This repo is the chezmoi source directory — files use chezmoi naming conventions (`dot_` prefix for dotfiles, `executable_` prefix for scripts) and are applied to `$HOME` by chezmoi.

## Bootstrap

To set up a new machine:

```bash
chezmoi init kris-steinhoff/dotfiles
chezmoi apply
```

`chezmoi init` clones this repo to `~/.local/share/chezmoi`. `chezmoi apply` copies managed files to `$HOME` and runs `run_once_bootstrap.sh`, which:

1. Ensures `~/.zshrc`, `~/.config/git/config`, and `~/.vimrc` each source/include the shared config files under `~/.config/kris-steinhoff/`
2. Runs `brew bundle install` from `~/.config/homebrew/Brewfile` if Homebrew is available
3. Runs `nvim --headless "+Lazy! restore" +qa` to install Neovim plugins at the commits pinned in `lazy-lock.json`

## Neovim plugin pinning

`dot_config/nvim/lazy-lock.json` is checked in. lazy.nvim installs plugins at the commits recorded there, which guards against supply-chain compromise of upstream repos. The bootstrap step above installs from the lockfile rather than letting plugins float to HEAD.

When updating plugins:

1. Run `:Lazy update` inside nvim.
2. Review the diff in `~/.config/nvim/lazy-lock.json`.
3. `chezmoi re-add ~/.config/nvim/lazy-lock.json` to pull the new commits into the source dir, then commit.

Without step 3, the next `chezmoi apply` will revert the lockfile to whatever's checked in.

## Claude Code settings.json

Load `dot_claude/AGENTS.md` before editing how `~/.claude/settings.json` is managed (`dot_claude/modify_private_settings.json.tmpl`, `.chezmoitemplates/claude-settings.json.tmpl`, or `dot_claude/hooks/executable_sort-settings-json.sh`).

## Codex

Load `dot_codex/README.md` before editing anything in `dot_codex/` or `.chezmoitemplates/codex.md`; it covers the `config.toml` modify script, the persona profiles, and `agentBudget`.

## Herdr app settings

Load `dot_config/herdr-app/AGENTS.md` before changing anything in `dot_config/herdr-app/`.

## Config architecture

Shared configs live under `dot_config/kris-steinhoff/` (deployed to `~/.config/kris-steinhoff/`) and are _included_ by the machine-local config files (not replaced). This lets local overrides coexist with the shared baseline:

| Shared file                          | Included by            |
| ------------------------------------ | ---------------------- |
| `~/.config/kris-steinhoff/zshrc`     | `~/.zshrc`             |
| `~/.config/kris-steinhoff/gitconfig` | `~/.config/git/config` |
| `~/.config/kris-steinhoff/vimrc`     | `~/.vimrc`             |

The `run_once_bootstrap.sh` script uses `ensure_config` to add the include line automatically, prompting the user when a file already exists but doesn't include the shared config.

## Agent skills

Load `dot_agents/skills/AGENTS.md` before adding, editing, or removing any skill; it covers how a skill is authored once and deployed to every agent surface. Before changing a skill, also read the `AGENTS.md` in that skill's own directory (`dot_agents/skills/<name>/`, or `dot_claude/skills/<name>/` for a Claude-only skill) if it has one; it holds the reasons the skill is built as it is. chezmoi deploys none of these files.

## Global instructions and personas

Load `.chezmoitemplates/AGENTS.md` before editing a global instruction partial in `.chezmoitemplates/`, a harness file that includes them (`dot_claude/CLAUDE.md.tmpl`, `dot_codex/AGENTS.md.tmpl`), or a persona (`.chezmoitemplates/agents/personas/`, `dot_claude/agents/`, and the coordinator's nudge hook `dot_claude/hooks/executable_coordinator-delegation-nudge.sh`).

## Key tools configured

- **Shell**: zsh with starship prompt, zsh-autosuggestions, zsh-syntax-highlighting, direnv
- **Terminal**: Ghostty (ligatures disabled)
- **Prompt**: Starship — configured without Nerd Font glyphs, kubernetes module enabled
- **Git**: pull.rebase=true, rebase.updateRefs=true, rebase.autoSquash=true
- **AWS profile switching**: `aws-profile-login` / `aws-profile-logout` are zsh functions in `dot_config/kris-steinhoff/zshrc`, not scripts. They must be functions because they set `AWS_PROFILE` in the interactive shell — a standalone script would only mutate its own subprocess. `aws-profile-login` triggers SSO or static login if the current credentials are invalid, adding `--use-device-code` when `$SSH_CONNECTION` is set (a remote session with no local browser).
- **Scripts**: load `dot_local/bin/AGENTS.md` before changing `dot_local/bin/executable_ai-usage`.
