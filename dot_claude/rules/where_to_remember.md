# Where to remember things

Different layers exist for different purposes. When saving context, pick the most
local layer that makes sense, and don't shadow an existing layer with a more
local one.

## Layers

1. **Project's `.claude/`** (if present) — project-specific config, hooks,
   prompts. Versioned with the project, shared with the team.
2. **Project's `CLAUDE.md`** (if present) — project rules and conventions.
   Versioned with the project.
3. **Project's `AGENTS.md`** (if present) — multi-agent spec shared across
   Claude, Cursor, Aider, opencode, etc. If a project looks multi-agent (e.g.
   has `.cursor/`, `.aider*`, `.opencode/`, etc.) treat AGENTS.md as the
   authoritative shared surface and prefer it over Claude-only files.
4. **Per-project memory** — quirks that are mine and specific to this project on
   this machine. Use when no project agent setup exists, or when the note is
   personal and not for the team.
5. **`~/.claude/`** — me, across all projects, across machines (work and home).
   Personal preferences and cross-cutting rules only. Never project-specific,
   never machine-specific (no hardcoded paths, no tools that may not exist
   elsewhere).

## Rules of thumb

- Project-specific things go in the project. Personal things go in `~/.claude/`
  or memory. The axis "is this about me or about the project?" matters as much
  as "how local."
- Don't duplicate: if something is already in `CLAUDE.md`/`AGENTS.md`, don't
  also write it as memory or a rule.
- When unsure which layer fits, ask before saving — wrong-layer saves create
  drift that's hard to clean up later.
