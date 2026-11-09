# Authoring skills

This file covers how a skill is authored once and deployed to every agent surface; load it before adding, editing, or removing any skill. Before changing a skill, also read the `AGENTS.md` in that skill's own directory if it has one; it holds the reasons the skill is built as it is.

A skill is authored once and shared across every agent surface, so its content is edited in exactly one place. The canonical copy is a real directory under `dot_agents/skills/`, which deploys to `~/.agents/skills/`. Each skill directory follows the [agentskills.io](https://agentskills.io/specification) format: a required `SKILL.md` with `name`/`description` frontmatter, plus optional `scripts/` (executable code), `references/` (documentation loaded on demand), and `assets/` (templates, static resources) subdirectories.

That location is the cross-agent convention, not an arbitrary pick. Codex and OpenCode both read `~/.agents/skills/` natively, so they use the canonical copy as it is. Claude Code looks elsewhere, so it gets its own entry for the skill that is rendered from the canonical one. A skill only Claude Code can run, such as `plan-implementation` and `drive-implementation`, has no canonical copy and lives only under `dot_claude/skills/`.

## Templated frontmatter

The canonical file is `SKILL.md.tmpl`, a template, because the harnesses do not agree on frontmatter. Claude Code understands fields such as `context: fork`, `model`, and `disallowed-tools` that other harnesses ignore or choke on, and the right values (the model, for one) depend on the machine's `agentBudget`. So the canonical frontmatter holds only `name` and `description`, and ends with a hook that splices in whatever extra lines the including template supplies:

```
{{- with get . "custom" }}
{{ . }}
{{- end }}
```

Each surface then sees only the fields it should:

| Surface         | Source path                                  | Frontmatter                          |
| --------------- | -------------------------------------------- | ------------------------------------ |
| Canonical       | `dot_agents/skills/<name>/SKILL.md.tmpl`     | `name`, `description`, and no extras |
| Codex, OpenCode | none, they read `~/.agents/skills/` natively | same as canonical                    |
| Claude Code     | `dot_claude/skills/<name>/SKILL.md.tmpl`     | canonical plus Claude-only fields    |

A Claude entry with nothing extra is one line that renders the canonical template:

```
{{- includeTemplate "dot_agents/skills/<name>/SKILL.md.tmpl" . -}}
```

A Claude entry with extras builds the lines first and merges them into the context, which is how the model follows `agentBudget`:

```
{{- $model := ternary "opus" "sonnet" (eq (get . "agentBudget") "generous") -}}
{{- $custom := printf `context: fork
agent: general-purpose
background: false
model: %s` $model -}}
{{- includeTemplate "dot_agents/skills/<name>/SKILL.md.tmpl" (merge (dict "custom" $custom) .) -}}
```

`includeTemplate` takes its path from the source directory root, like `include`. Claude-only fields never go into the canonical frontmatter; they live in the Claude entry.

## Other files in a skill

Everything in a skill directory other than `SKILL.md` and `AGENTS.md` (`scripts/`, `references/`, `assets/`, or other loose files) is not templated. Each Claude entry directory gets a `symlink_<entry>.tmpl` per such file or directory, whose entire body is the link target:

```
{{ .chezmoi.homeDir }}/.agents/skills/<name>/<entry>
```

The executable bit lives only on the canonical copy (the `executable_` prefix is dropped from the link name), so a script is never duplicated. A `symlink_` entry sitting where chezmoi used to apply a whole-skill symlink converts to a real directory on the next apply, so no `.chezmoiremove` entry is needed for that move.

A skill's `AGENTS.md`, and this file, are guidance for sessions working on the skills, not for sessions running them. `.chezmoiignore` keeps every `AGENTS.md` under `.agents/skills/` and `.claude/skills/` out of the home directory, and no Claude entry links one, so neither Codex reading `~/.agents/skills/` natively nor Claude Code sees them.

A skill's Python scripts must run on the `python3` that agents actually get, which inside the Claude Code sandbox is macOS's own `/usr/bin/python3`, 3.9. A script that runs on 3.9 keeps the plain `#!/usr/bin/env python3` shebang; `X | None` in an annotation needs `from __future__ import annotations` for that. A script that needs anything newer, such as `tomllib` (3.11), runs through uv instead: `#!/usr/bin/env -S uv run --script` with a PEP 723 block declaring `requires-python = ">=3.11"`, so uv supplies an interpreter it already has. Its path is stable, so uv's cached environment is reused across runs, unlike the Codex `modify_` script `dot_codex/README.md` describes.

## Adding and removing a skill

To add a skill:

1. Write `dot_agents/skills/<name>/SKILL.md.tmpl` with the hook above, using `chezmoi add` for any scripts (it applies the `executable_` prefix to nested scripts such as `scripts/` helpers, which a manual copy would miss). This alone is enough for Codex and OpenCode.
2. Create `dot_claude/skills/<name>/SKILL.md.tmpl` with the `includeTemplate` line, plus a `symlink_<entry>.tmpl` for every other file or directory in the skill except `AGENTS.md`.
3. For Claude-only behavior (forking, a model, tool limits), build `$custom` in the Claude entry as above.

To remove a skill, delete it from both source locations _and_ add the deployed paths to `.chezmoiremove`. chezmoi does not delete a target just because its source entry disappeared, so without the `.chezmoiremove` entries the skill lingers in `$HOME` on every machine that already applied it.

## Inline or forked

Whether a skill runs inline or forked is a deliberate choice, made in the Claude entry. A forked skill (`context: fork`) runs in a fresh context that starts with no conversation history, so it suits work that a cheaper model can do from a self-contained brief and keeps its working noise out of the main conversation; the skill description tells the caller to pass such a brief. An inline skill reads the whole conversation so far, which costs more on every turn but is required when the skill has to talk to the user. The `implement` skill forks with a model that follows `agentBudget`. A forked run does not honor `disallowed-tools`, so read-only boundaries stay in prose rather than relying on a tool lock. The `review` skill stays inline by default so the caller can choose whether a particular review merits a subagent. `github-pr` also stays inline because triage and posting confirmation must reach the user. On Codex and the other harnesses these skills are plain instructions the current agent follows; their descriptions tell a caller to use an available subagent when isolation is useful.
