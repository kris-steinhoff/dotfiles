# Herdr Coordinator Extension

A pi extension that launches a Herdr worktree and an agent from a natural-language request like "use claude opus to work on #123".

## How it works

The deterministic steps are pi tools. The judgement steps are left to the coordinator model, which is steered by a system prompt injected only while coordinator mode is on.

| Step                                                 | Where it runs                | Detail                                                                             |
| ---------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Extract task_id, agent_kind, model_hint, description | model                        | Guided by the coordinator system prompt                                            |
| Fetch task metadata                                  | tool `herdr_fetch_task`      | GitHub issue via `gh`, Jira key via the REST API                                   |
| Synthesize the slug                                  | model                        | Short, dashed, `<= ~20` chars, no task_id inside                                   |
| Check name collision                                 | tool `herdr_check_collision` | Exact git branch/worktree match                                                    |
| Create the worktree                                  | tool `herdr_create_worktree` | Returns `workspace_id`, `path`, and the shell `pane_id`                            |
| Start the agent                                      | tool `herdr_start_agent`     | `herdr agent start` in the returned pane; maps `model_hint` to the kind's CLI flag |

## Naming rules

- git branch: `<task_id>-<slug>` when a task_id is present, else `<slug>`
- worktree dir name: same as the branch
- herdr label: the slug with dashes turned back into spaces

## Usage

- `/herdr-coordinator` toggles coordinator mode on or off.
- `/herdr-launch "use claude opus to work on #123"` turns coordinator mode on and hands the request to the agent.

While coordinator mode is on, the instructions are appended to the system prompt on every turn (via the `before_agent_start` event), so natural-language requests in the normal input also work.

## Task sources

- **GitHub** issues resolve through `gh` in the current repo. A bare number (`123`) is treated as a GitHub issue.
- **Jira** keys (`ABC-123`) resolve through the REST API and need `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` in the environment. Without them the fetch reports a clear error rather than guessing. Rich-text (ADF) descriptions are flattened to plain text.

## Model hints

`herdr_start_agent` maps a short `model_hint` to the agent's own CLI flag. The default is `--model <hint>`. Per-kind exceptions live in the `MODEL_FLAGS` table in `index.ts` (for example, `gemini` and `codex` use `-m`). Add an entry there when a kind needs a different flag or value.
