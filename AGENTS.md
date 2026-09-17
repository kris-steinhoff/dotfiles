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

## Codex config.toml machine-local state

Codex rewrites `~/.codex/config.toml` at runtime and injects machine-local state that must not be version-controlled: `[projects.*]` trust levels (per-machine checkout paths), `[tui.*]` UI counters, and `[hooks.*]` trusted hook hashes. A plain template would clobber that state on every apply and force re-trusting projects and hooks.

So the source is a chezmoi `modify_` script, `dot_codex/modify_private_config.toml.tmpl`, rather than a static template. A `modify_` script receives the current target on stdin and its stdout becomes the new file. The script is a `uv`-run Python program that parses the live file with `tomlkit`, sets only the settings we manage (`model`, `[features]`, `[agents]` — the last templated on `agentBudget`), and dumps the document back. Because `tomlkit` preserves the layout of everything it does not touch, Codex's machine-local tables round-trip verbatim, applies are idempotent (a clean machine shows no diff), and nothing is silently dropped whatever new keys Codex may add. This needs `uv` present at apply time (it is in the Brewfile); the earlier `awk`-based version avoided that dependency but classified sections by regex and could drop unknown top-level bare keys.

The shebang pulls `tomlkit` via `uv run --with tomlkit`, not PEP 723 inline metadata (`--script`). This matters because `uv run --script` keys its ephemeral venv on the script's file path, and chezmoi runs a `modify_` script from a fresh temp path on every apply — so that env never hit the cache and uv reinstalled the dep (printing `Installed 1 package`) on every `chezmoi apply`. A `--with` env is keyed on its requirements instead, so it survives the changing paths and uv only rebuilds (and reports) it on a cold cache or a dep bump. The tradeoff is that this script alone differs from the PEP 723 pattern `ai-usage` uses.

The filename attribute order is `modify_private_` (type prefix before the `private_` permission attribute); `private_modify_` is not recognized and chezmoi treats the leftover `modify_` as a literal filename.

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

- **`herdr.md`** — the entry layer for Herdr: recognize a plain-language "run `<agent>` on `<task>` in a worktree/pane/tab" without a slash command, parse placement/agent/source/report-back, name artifacts for their downstream consumer, and act-on-clear/confirm-on-doubt. It routes mechanics through the `herdr` skill and carries the worktree basics inline (fresh-branch create; PR-onto-disk via the `pull/<n>/head` fetch ref). It also covers launching a named persona into a pane (`launch-agent-in-pane --persona`) and a batch dispatch: a queue intent ("review every PR waiting on my team") sources the set from `list-review-requests` and fans out one reviewer-in-a-worktree per PR, confirming the set first and leaving each launched reviewer for the user to triage. This replaced the retired `herdr-pr-review`, `herdr-start-agent`, `herdr-work-task`, `herdr-ralph-loop`, and `herdr-worktree` recipe skills. It is gated on `HERDR_ENV=1`, so it stays inert where Herdr is not running.
- **`communication.md`** — how to write for a human who has an AI agent at hand: lead with the conclusion, explain references instead of pointing, favor judgment over exhaustive precision. Also carries the attribution rule: when posting a message on the user's behalf, name yourself so it is clear an agent wrote it.

Each harness file is a thin `.tmpl` that includes the section partials that apply to it, one `{{ template ... }}` line per section:

| Harness                     | Sections included         |
| --------------------------- | ------------------------- |
| `dot_claude/CLAUDE.md.tmpl` | `herdr` + `communication` |
| `dot_gemini/GEMINI.md.tmpl` | `herdr` + `communication` |
| `dot_codex/AGENTS.md.tmpl`  | `herdr` + `communication` |

Coordinator behavior is opt-in. The six persona prompts live under `.chezmoitemplates/agents/personas/`, with one canonical prompt each for `coordinator`, `implementor`, `investigator`, `reviewer`, `pull-request-commenter`, and `chief-of-staff`. Claude Code agent files under `dot_claude/agents/` add YAML frontmatter and include the shared prompt; the same definition works as a subagent and as a primary persona through `claude --agent <name>`.

The `coordinator` carries one piece of frontmatter the other personas don't: a `PostToolUse` hook (`dot_claude/hooks/executable_coordinator-delegation-nudge.sh`) that nudges it back toward delegating. It exists because the persona drifted into doing substantial multi-file work inline — one session ran ~20 edits across a bug fix and a full stack rebase without a single hand-off — and the prose rubric alone didn't hold. The hook reads the running transcript, counts the inline edits (`Edit`/`Write`/`NotebookEdit`) since the last delegation (`Agent`/`Task`), and the first time that run reaches three with no hand-off injects a one-time reminder to declare whether the next phase belongs with an implementor. A delegation resets the run, so a coordinator that hands off is never nagged; it fires once per run rather than on every edit past the threshold, so a legitimately-inline stretch costs at most one reminder; and it is non-blocking and fail-open (any error exits 0 with no output). Binding it through the agent's own frontmatter — rather than a global hook self-gating on the payload's `agent_type` — keeps it firing only while `coordinator` is the active agent, primary or subagent; it is a Claude Code mechanism, with no equivalent on the Codex profile. One caveat: it relies on the `PostToolUse` `additionalContext` field reaching the model, which is not guaranteed on every Claude version — if a firing never lands, switch the script's emit to the exit-code-2 path.

The review workflow spans a skill and two personas, split so the reusable logic lives once and only the harness-specific interaction diverges. The `review` skill (`dot_agents/skills/review/`, `/review` when deployed) is the engine: it resolves the PR, finds the defects, and shapes them into a fixed report — a recommendation block plus severity-tagged findings, each carrying a file, a RIGHT-side line range, and an `anchorable` flag. It carries the poster, `scripts/post_review.py`, and `reference.md` (the poster's JSON schema and the diff-anchor rules, stacked PRs included). Being a skill, it is shared with zero divergence: Codex and OpenCode read it natively, Claude and Gemini symlink it.

The `reviewer` persona is a thin orchestrator over that skill. It leads with the engine's summary header (PR number, title, author, what-it-does, recommendation) so the user re-orients before deciding, walks the findings past them in batched Include/Exclude/Discuss multiple-choice questions phrased in plain language (no file/line, no full technical body — that is available on the Discuss path), gates on an explicit confirmation, then delegates posting. The one genuinely harness-specific step — how it asks — is resolved at runtime rather than by forking the prompt: if the session has a structured question tool (AskUserQuestion in Claude Code) it batches findings into menus (up to four per call), otherwise it falls back to one-at-a-time yes/no in plain text (Codex). The model can see its own toolset, so this is a reliable branch, not a guess — which is why the reviewer stays a single shared prompt like every other persona rather than splitting per harness. The interaction and the confirm gate need the user, so the reviewer runs as the primary session; invoked as a subagent it cannot reach the user, so it returns the shaped report to its caller and lets the caller drive triage and posting.

The `pull-request-commenter` is the mechanical downstream: it takes the finalized, triaged review and posts it as one review through the `review` skill's `post_review.py` — the recommendation as the summary and each finding its own inline comment — mapping the recommendation to the review event (approve/request-changes/comment) and routing every non-anchorable finding into the summary body. It forms no opinions of its own, so it and `reviewer` share the skill's finding contract and it renders that without re-deriving anything. It always `--dry-run`s first, because the poster validates each inline anchor against the PR's own diff and the reviews API rejects the whole call on one bad anchor.

Codex uses one profile for both entry points. `dot_codex/<name>.config.toml.tmpl` deploys a launch profile selected with `codex --profile <name>`, while `dot_codex/private_config.toml.tmpl` registers that same file under `[agents.<name>].config_file` so another Codex session can spawn it. The `investigator` wrapper enforces read-only operation through each harness's supported permission controls (`permissionMode: plan` on Claude, `sandbox_mode = "read-only"` on Codex). The `reviewer` blocks edits the same way — it never touches source — but is not plan-mode on Claude: as a primary-session orchestrator it must act (ask the user, delegate posting), so its Claude wrapper drops `permissionMode: plan` and keeps only `disallowedTools: Write, Edit, NotebookEdit`, while its Codex wrapper stays `read-only` and reaches the network only through the commenter it spawns. The `pull-request-commenter` is the exception, because posting to GitHub needs network: its Codex wrapper runs `sandbox_mode = "workspace-write"` with `network_access = true` rather than read-only, and its Claude wrapper blocks file edits (`disallowedTools: Write, Edit, NotebookEdit`) while leaving Bash open for the `gh` calls it posts through. No harness can enforce network-yes / source-no at once, so the persona's role boundary is what keeps it from touching source.

The `chief-of-staff` is a different kind of persona from the other five: its unit of work is a **commitment** tracked over weeks, not a session of code work, so it holds persistent state rather than delegating a bounded task. It keeps a ledger — what the user owes people, what people owe the user, what work is in flight, decisions worth not relitigating, and who the people are — at `~/.claude/cos/ledger.md`, with closed entries archived to `~/.claude/cos/archive.md`. Its rule is **dispatch and record, never relay**: it can launch a coordinator (into its own pane or worktree, where that coordinator talks to the user directly) and it writes down that it dispatched, but it never channels a worker's output back through itself, because it is the tier with the least direct evidence. It does not supervise or override the coordinator. Authority is earned on a trust ramp enforced in the prompt (stage 1: read and draft only, sends nothing, contacts no one), gated on ledger accuracy rather than elapsed time — so its tools are left open (it needs `Write`/`Edit` for the ledger and Bash for dispatch) and the boundary is prose, not a tool lock. It is Claude-only for now: the design names only the Claude agent file, and the scheduled brief and connector-derived ledger are deferred, so no Codex profile or Gemini wiring is built yet — the canonical partial makes adding them later trivial if wanted.

The ledger is live state the persona rewrites constantly, so it must not be clobbered on every `chezmoi apply` the way a plain template would. The seeds `dot_claude/cos/create_ledger.md` and `dot_claude/cos/create_archive.md` use chezmoi's `create_` attribute: the target is written once on a fresh machine and left untouched on every apply after, so a populated ledger survives. The seed carries only the five section headings (and a format comment) — real entries are hand-seeded, since example lines would become stale live data. This is the same machine-local-mutable-state problem the Codex `config.toml` and Claude `settings.json` handling solves, reached here through `create_` rather than a `modify_` script because a seed-once-then-hands-off file needs no round-trip merge.

Persona model and concurrency choices come from the machine-local `agentBudget` datum. `.chezmoi.toml.tmpl` asks for `conservative` or `generous` during `chezmoi init` and defaults to `conservative`; consuming templates also fall back to conservative when the datum is absent or unrecognized. This keeps existing machines safe until their chezmoi config is regenerated or gains `agentBudget` under `[data]`.

| Persona                | Claude conservative / generous | Codex conservative / generous |
| ---------------------- | ------------------------------ | ----------------------------- |
| Coordinator            | Sonnet / Opus                  | Terra medium / Sol high       |
| Implementor            | Sonnet / Opus                  | Terra medium / Sol high       |
| Investigator           | Sonnet / Sonnet                | Terra medium / Terra high     |
| Reviewer               | Sonnet / Opus                  | Terra high / Sol xhigh        |
| Pull-request-commenter | Haiku / Haiku                  | Luna medium / Luna medium     |
| Chief of staff         | Sonnet / Opus                  | (Claude-only)                 |

The `pull-request-commenter` ignores `agentBudget` entirely: its work is mechanical, so it stays on a small model (Claude Haiku, Codex Luna at medium effort) on every machine regardless of budget.

Codex caps spawned-agent threads at two for conservative machines and four for generous machines. These choices apply only to persona profiles and the subagent cap; the ordinary top-level Codex model remains the independently configured default.

The global harnesses do not include a persona. They keep Herdr dispatch and communication conventions available in ordinary sessions without forcing every session to coordinate. Codex's skills need no wiring because it reads `~/.agents/skills/` natively (see the Agent skills table above). A harness that needs its own global content adds it before or after the includes.

The harness files are `.tmpl`, not `.md`, so the `prettier` pre-commit hook (which runs with `proseWrap: never`) leaves their one-include-per-line layout alone; that layout matters because the render joins the sections with the blank lines between them. The section partials themselves are prose `.md` and stay prettier-managed. This is why there is no `agent-behaviors.md` wrapper partial: a `.md` composition file would get its include lines collapsed onto one line by prettier.

## Key tools configured

- **Shell**: zsh with starship prompt, zsh-autosuggestions, zsh-syntax-highlighting, direnv
- **Terminal**: Ghostty (ligatures disabled)
- **Prompt**: Starship — configured without Nerd Font glyphs, kubernetes module enabled
- **Git**: pull.rebase=true, rebase.updateRefs=true, rebase.autoSquash=true
- **AWS profile switching**: `aws-profile-login` / `aws-profile-logout` are zsh functions in `dot_config/kris-steinhoff/zshrc`, not scripts. They must be functions because they set `AWS_PROFILE` in the interactive shell — a standalone script would only mutate its own subprocess. `aws-profile-login` triggers SSO or static login if the current credentials are invalid, adding `--use-device-code` when `$SSH_CONNECTION` is set (a remote session with no local browser).
- **Scripts**:
  - `dot_local/bin/executable_ai-usage` — shows subscription usage for Claude and ChatGPT. A `uv run --script` Python tool that reads Claude Code's OAuth credential (`~/.claude/.credentials.json`, or the macOS Keychain) and Codex's ChatGPT credential (`~/.codex/auth.json`) and queries their respective usage endpoints. It adapts to the windows each account reports; `--service claude` or `--service chatgpt` limits the view to one provider. On a terminal it refreshes live in place (re-polling every `--interval` seconds, default 300, and reloading credentials each poll) until Ctrl-C. `--once` prints a single snapshot and exits, and `--json` emits raw payloads keyed by provider.
