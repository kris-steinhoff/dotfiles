---
name: where-to-remember
description: Decide which layer to persist a note, rule, convention, or memory — project `.claude/`, `CLAUDE.md`, `AGENTS.md`, per-project memory, chezmoi-versioned `~/.claude/`, or local-only `~/.claude/`. Invoke when about to save context, write a rule, add a memory, or whenever unsure where a piece of guidance belongs.
---

# Where to remember things

Different layers exist for different purposes. When saving context, pick the most local layer that makes sense, and don't shadow an existing layer with a more local one.

## Layers

1. **Project's `.claude/`** (if present) — project-specific config, hooks, prompts. Versioned with the project, shared with the team.
2. **Project's `CLAUDE.md`** (if present) — project rules and conventions. Versioned with the project.
3. **Project's `AGENTS.md`** (if present) — multi-agent spec shared across Claude, Cursor, Aider, opencode, etc. If a project looks multi-agent (e.g. has `.cursor/`, `.aider*`, `.opencode/`, etc.) treat `AGENTS.md` as the authoritative shared surface and prefer it over Claude-only files.
4. **Per-project memory** — quirks that are mine and specific to this project on this machine. Use when no project agent setup exists, or when the note is personal and not for the team.
5. **`~/.claude/`** — me, across all projects. Two sub-layers:
   - **Chezmoi-versioned (`dot_claude/` in the dotfiles repo)** — syncs across machines (work and home). Personal preferences and cross-cutting rules only. Never project-specific, never machine-specific (no hardcoded paths, no tools that may not exist elsewhere).
   - **Local-only (files in `~/.claude/` not tracked by chezmoi)** — machine-local overlay. OK to be machine- or context-specific (e.g. notes about a specific employer's infra on a work machine). Stays out of the synced dotfiles. To check: `chezmoi managed | grep .claude` — anything not in that list is local-only.

## Rules of thumb

- Project-specific things go in the project. Personal things go in `~/.claude/` or memory. The axis "is this about me or about the project?" matters as much as "how local."
- Before adding to chezmoi-versioned `dot_claude/`, ask: "would this also be true on my home machine / a fresh laptop?" If no, it belongs in the local-only `~/.claude/` overlay instead.
- Don't duplicate: if something is already in `CLAUDE.md`/`AGENTS.md`, don't also write it as memory or a rule.
- When unsure which layer fits, ask before saving — wrong-layer saves create drift that's hard to clean up later.
