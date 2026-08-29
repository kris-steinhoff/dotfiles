# Herdr Coordinator Extension

Natural language handler for launching Herdr worktrees + agents.

## Naming rules

- `task_id` extracted by model from natural language
- Slug synthesized by model from task metadata
- git branch: `<task_id>-<slug>` if task_id present, else `<slug>`
- git worktree dir: same as branch
- herdr worktree label: `<slug with spaces>`
- pane title: `<agent name>: <slug with spaces>`

## Logic vs Judgement

Logic in code: fetch task metadata, collision check, Herdr CLI calls. Judgement via model: extract task_id, kind, model hint, synthesize slug, decide initial prompt injection.

## Usage

Natural language: "use claude opus to work on #123" Slash: `/herdr-launch "use claude opus to work on #123"`
