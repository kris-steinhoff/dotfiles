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

## Global instructions and personas

Claude, Gemini, and Codex each read a single always-loaded instruction file (`~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, and `~/.codex/AGENTS.md`). Shared global content lives in chezmoi template partials under `.chezmoitemplates/`, so one edit updates every surface that includes it:

- **`herdr.md`** — the entry layer for Herdr: recognize a plain-language "run `<agent>` on `<task>` in a worktree/pane/tab" without a slash command, parse placement/agent/source/report-back, name artifacts for their downstream consumer, and act-on-clear/confirm-on-doubt. It routes mechanics through the `herdr` skill and carries the worktree basics inline (fresh-branch create; PR-onto-disk via the `pull/<n>/head` fetch ref). This replaced the retired `herdr-pr-review`, `herdr-start-agent`, `herdr-work-task`, `herdr-ralph-loop`, and `herdr-worktree` recipe skills. It is gated on `HERDR_ENV=1`, so it stays inert where Herdr is not running.
- **`communication.md`** — how to write for a human who has an AI agent at hand: lead with the conclusion, explain references instead of pointing, favor judgment over exhaustive precision. Also carries the attribution rule: when posting a message on the user's behalf, name yourself so it is clear an agent wrote it.

Each harness file is a thin `.tmpl` that includes the section partials that apply to it, one `{{ template ... }}` line per section:

| Harness                     | Sections included         |
| --------------------------- | ------------------------- |
| `dot_claude/CLAUDE.md.tmpl` | `herdr` + `communication` |
| `dot_gemini/GEMINI.md.tmpl` | `herdr` + `communication` |
| `dot_codex/AGENTS.md.tmpl`  | `herdr` + `communication` |

Coordinator behavior is opt-in. The five persona prompts live under `.chezmoitemplates/agents/personas/`, with one canonical prompt each for `coordinator`, `implementor`, `investigator`, `reviewer`, and `pull-request-commenter`. Claude Code agent files under `dot_claude/agents/` add YAML frontmatter and include the shared prompt; the same definition works as a subagent and as a primary persona through `claude --agent <name>`.

The `coordinator` carries one piece of frontmatter the other personas don't: a `PostToolUse` hook (`dot_claude/hooks/executable_coordinator-delegation-nudge.sh`) that nudges it back toward delegating. It exists because the persona drifted into doing substantial multi-file work inline — one session ran ~20 edits across a bug fix and a full stack rebase without a single hand-off — and the prose rubric alone didn't hold. The hook reads the running transcript, counts the inline edits (`Edit`/`Write`/`NotebookEdit`) since the last delegation (`Agent`/`Task`), and the first time that run reaches three with no hand-off injects a one-time reminder to declare whether the next phase belongs with an implementor. A delegation resets the run, so a coordinator that hands off is never nagged; it fires once per run rather than on every edit past the threshold, so a legitimately-inline stretch costs at most one reminder; and it is non-blocking and fail-open (any error exits 0 with no output). Binding it through the agent's own frontmatter — rather than a global hook self-gating on the payload's `agent_type` — keeps it firing only while `coordinator` is the active agent, primary or subagent; it is a Claude Code mechanism, with no equivalent on the Codex profile. One caveat: it relies on the `PostToolUse` `additionalContext` field reaching the model, which is not guaranteed on every Claude version — if a firing never lands, switch the script's emit to the exit-code-2 path.

The `pull-request-commenter` is the mechanical downstream of `reviewer`: it takes a finished review and posts it to the PR as a single inline review, mapping the reviewer's recommendation to the `gh` review event (approve/request-changes/comment). It forms no opinions of its own, so `reviewer` and it share a finding contract — the reviewer emits each finding as severity, file and line, title, and body, plus an overall recommendation, and the commenter renders that without re-deriving anything.

Codex uses one profile for both entry points. `dot_codex/<name>.config.toml.tmpl` deploys a launch profile selected with `codex --profile <name>`, while `dot_codex/private_config.toml.tmpl` registers that same file under `[agents.<name>].config_file` so another Codex session can spawn it. Investigator and reviewer wrappers enforce read-only operation through each harness's supported permission controls. The `pull-request-commenter` is the exception, because posting to GitHub needs network: its Codex wrapper runs `sandbox_mode = "workspace-write"` with `network_access = true` rather than read-only, and its Claude wrapper blocks file edits (`disallowedTools: Write, Edit, NotebookEdit`) while leaving Bash open for the `gh` calls it posts through. No harness can enforce network-yes / source-no at once, so the persona's role boundary is what keeps it from touching source.

Persona model and concurrency choices come from the machine-local `agentBudget` datum. `.chezmoi.toml.tmpl` asks for `conservative` or `generous` during `chezmoi init` and defaults to `conservative`; consuming templates also fall back to conservative when the datum is absent or unrecognized. This keeps existing machines safe until their chezmoi config is regenerated or gains `agentBudget` under `[data]`.

| Persona                | Claude conservative / generous | Codex conservative / generous |
| ---------------------- | ------------------------------ | ----------------------------- |
| Coordinator            | Sonnet / Opus                  | Terra medium / Sol high       |
| Implementor            | Sonnet / Opus                  | Terra medium / Sol high       |
| Investigator           | Sonnet / Sonnet                | Terra medium / Terra high     |
| Reviewer               | Sonnet / Opus                  | Terra high / Sol xhigh        |
| Pull-request-commenter | Haiku / Haiku                  | Luna medium / Luna medium     |

The `pull-request-commenter` ignores `agentBudget` entirely: its work is mechanical, so it stays on a small model (Claude Haiku, Codex Luna at medium effort) on every machine regardless of budget.

Codex caps spawned-agent threads at two for conservative machines and four for generous machines. These choices apply only to persona profiles and the subagent cap; the ordinary top-level Codex model remains the independently configured default.

The global harnesses do not include a persona. They keep Herdr dispatch and communication conventions available in ordinary sessions without forcing every session to coordinate. Codex's skills need no wiring because it reads `~/.agents/skills/` natively (see the Agent skills table above). A harness that needs its own global content adds it before or after the includes.

The harness files are `.tmpl`, not `.md`, so the `prettier` pre-commit hook (which runs with `proseWrap: never`) leaves their one-include-per-line layout alone; that layout matters because the render joins the sections with the blank lines between them. The section partials themselves are prose `.md` and stay prettier-managed. This is why there is no `agent-behaviors.md` wrapper partial: a `.md` composition file would get its include lines collapsed onto one line by prettier.

## Key tools configured

- **Shell**: zsh with starship prompt, zsh-autosuggestions, zsh-syntax-highlighting, direnv
- **Terminal**: Ghostty (ligatures disabled)
- **Prompt**: Starship — configured without Nerd Font glyphs, kubernetes module enabled
- **Git**: pull.rebase=true, rebase.updateRefs=true, rebase.autoSquash=true
- **Scripts**:
  - `dot_local/bin/executable_aws-profile-login` — sets `AWS_PROFILE` and triggers SSO login if needed
  - `dot_local/bin/executable_claude-usage` — shows current Claude subscription usage (session and weekly limit windows). A `uv run --script` Python tool that reads the OAuth token Claude Code stores (`~/.claude/.credentials.json`, or the macOS Keychain) and queries the same usage endpoint the `/usage` view uses. Renders whichever windows the account reports, so it adapts to Pro, Max, Team, and Enterprise. On a terminal it refreshes live in place (re-polling every `--interval` seconds, default 300, and reloading the token each poll so it picks up refreshes) until Ctrl-C. `--once` prints a single snapshot and exits, `--json` dumps the raw payload.
