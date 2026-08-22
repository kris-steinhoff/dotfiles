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

## Claude Code settings.json key ordering

Claude Code rewrites `~/.claude/settings.json` with its own key ordering whenever it changes something internally (e.g. saving a permission), even when the values are unchanged. Because `chezmoi apply` refuses to overwrite a target that has changed since it last wrote it, this reordering alone trips that guard and produces a warning that's usually just noise.

Both sides are kept sorted the same way so ordering never causes a spurious diff:

- `dot_claude/private_settings.json` (the checked-in source) is sorted by the local `sort-claude-settings-json` pre-commit hook (`jq -S`).
- `~/.claude/settings.json` (the live file) is kept sorted by a `ConfigChange` hook, `dot_claude/hooks/executable_sort-settings-json.sh`, which re-sorts it with the same `jq -S` after every change.

A `chezmoi apply` warning on this file should now only mean a real value changed, not just key order.

## Config architecture

Shared configs live under `dot_config/kris-steinhoff/` (deployed to `~/.config/kris-steinhoff/`) and are _included_ by the machine-local config files (not replaced). This lets local overrides coexist with the shared baseline:

| Shared file                          | Included by            |
| ------------------------------------ | ---------------------- |
| `~/.config/kris-steinhoff/zshrc`     | `~/.zshrc`             |
| `~/.config/kris-steinhoff/gitconfig` | `~/.config/git/config` |
| `~/.config/kris-steinhoff/vimrc`     | `~/.vimrc`             |

The `run_once_bootstrap.sh` script uses `ensure_config` to add the include line automatically, prompting the user when a file already exists but doesn't include the shared config.

## Agent skills

A skill is authored once and shared across every agent surface, so it is edited in exactly one place. The canonical copy is a real directory under `dot_agents/skills/`, which deploys to `~/.agents/skills/`.

Each skill directory follows the [agentskills.io](https://agentskills.io/specification) format: a required `SKILL.md` with `name`/`description` frontmatter, plus optional `scripts/` (executable code), `references/` (documentation loaded on demand), and `assets/` (templates, static resources) subdirectories.

That location is the cross-agent convention, not an arbitrary pick. Codex and OpenCode both read `~/.agents/skills/` natively, so they need nothing beyond the canonical copy. Claude Code and Gemini look elsewhere, so each gets a chezmoi symlink pointing back at it.

| Surface         | Source path                                                           |
| --------------- | --------------------------------------------------------------------- |
| Canonical       | `dot_agents/skills/<name>/`                                           |
| Codex, OpenCode | none, they read `~/.agents/skills/` natively                          |
| Claude Code     | `dot_claude/skills/symlink_<name>.tmpl`                               |
| Gemini          | `dot_gemini/config/plugins/kris-steinhoff/skills/symlink_<name>.tmpl` |

A `symlink_` template's entire body is the link target:

```
{{ .chezmoi.homeDir }}/.agents/skills/<name>
```

The Gemini surface is a plugin, not a plain skills directory. `dot_gemini/config/plugins/kris-steinhoff/plugin.json` declares it, and the symlinks live in that plugin's `skills/` subdirectory.

To add a skill:

1. `chezmoi add ~/.agents/skills/<name>` (chezmoi applies the `executable_` prefix to nested scripts such as `scripts/` helpers, which a manual copy would miss). This alone is enough for Codex and OpenCode.
2. Create the two `symlink_<name>.tmpl` files above, for Claude Code and Gemini.

To remove a skill, delete it from all three source locations _and_ add the deployed paths to `.chezmoiremove`. chezmoi does not delete a target just because its source entry disappeared, so without the `.chezmoiremove` entries the skill lingers in `$HOME` on every machine that already applied it.

## Key tools configured

- **Shell**: zsh with starship prompt, zsh-autosuggestions, zsh-syntax-highlighting, direnv
- **Terminal**: Ghostty (ligatures disabled)
- **Prompt**: Starship — configured without Nerd Font glyphs, kubernetes module enabled
- **Git**: pull.rebase=true, rebase.updateRefs=true, rebase.autoSquash=true
- **Scripts**: `dot_local/bin/executable_aws-profile-login` — sets `AWS_PROFILE` and triggers SSO login if needed
