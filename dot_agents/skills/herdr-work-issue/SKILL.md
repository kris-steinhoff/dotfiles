---
name: herdr-work-issue
description: "Turn a request like 'use claude opus to work on #123' into a fresh-branch Herdr worktree with an agent already working the task. Resolves the issue (GitHub or Jira), names a branch, creates the worktree, and starts the agent. Use when the user names a task and an agent and wants work started on it. Requires HERDR_ENV=1."
---

# Herdr work issue

Turns a natural-language request into a running agent on its own branch. From something like _"use claude opus to work on #123"_ it works out the task, the agent, and the model, gives the branch a readable name, creates the worktree, and hands the agent the task to start on.

This skill is the judgement wrapper. The deterministic pieces are two other skills it composes:

- `herdr-worktree` (`scripts/worktree create`) makes the branch's worktree and returns a `pane_id`.
- `herdr-start-agent` (`scripts/start-agent`) starts the agent in that pane and hands it the first prompt.

It also assumes the `herdr` skill for CLI discovery, ID handling, and the safety rules. Those live at `~/.agents/skills/<name>/`, which is where the commands below call them from.

## Step 1 — read the request (your judgement)

Pull four things out of what the user said:

- **task_id**: a tracked-task id with any leading `#` stripped. A bare number (`123`) is a GitHub issue. `ABC-123` is a Jira key. `null` if the user only described the work.
- **agent_kind**: which agent to run (`claude`, `codex`, `gemini`, ...). Run `herdr agent` for the installed list if unsure.
- **model_hint**: an optional model or variant, such as `opus`. `null` if none.
- **description**: any freeform description of the work, for when there is no task_id or to add to the prompt.

## Step 2 — fetch the task

When there is a task_id, get its title and body:

```bash
~/.agents/skills/herdr-work-issue/scripts/fetch-task <task_id>
```

```json
{ "source": "github", "task_id": "123", "title": "Return rate-limit headers on 429", "summary": "..." }
```

GitHub issues resolve through `gh` in the current repo. Jira keys need `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` in the environment. If the fetch fails, do not invent a title. Report the failure and ask the user.

With no task_id, skip this step and work from the description.

## Step 3 — name the branch (your judgement)

Synthesize a short slug from the title or description:

- lowercase, dash-separated
- `<= ~20` characters, front-loading the distinctive words
- do **not** repeat the task_id inside the slug

Then apply the naming rules:

- **branch**: `<task_id>-<slug>` when there is a task_id, else just `<slug>`
- **label**: the slug with dashes turned back into spaces

For `#123` titled "Return rate-limit headers on 429", a good branch is `123-rate-limit-headers` with label `rate limit headers`.

## Step 4 — create the worktree

```bash
~/.agents/skills/herdr-worktree/scripts/worktree create --branch <branch> --label "<label>"
```

Read the `pane_id` from its JSON output. If it comes back `"reused": true`, a worktree for that branch already existed and you are now in it. That is usually fine for re-running the same task. If the user wanted a distinct branch, pick a different slug and run again. Exit 3 means the main checkout holds that branch name. Report it and pick another name.

## Step 5 — start the agent on the task

Write a first prompt that points the agent at the work, then start it in the pane from step 4:

```bash
~/.agents/skills/herdr-start-agent/scripts/start-agent <name> \
  --pane <pane_id> --kind <agent_kind> [--model <model_hint>] --prompt-file <seed-file>
```

Use the slug as the agent `name`. Build the seed file from the task: the issue or Jira reference, the title, the body, and the description the user added, framed as "work on this." A short prompt file reads better than a long `--prompt` string for a multi-line body. Pass `--model` only when there was a model_hint.

`start-agent` maps the model hint to the agent's own flag and submits the prompt fire-and-forget, so it returns once the agent has the task in hand, not when the work is done. Do not then poll the agent.

## Report back

Tell the user the branch, the worktree path, the agent name, and its tab or workspace. The agent is already working the task. This skill does not watch it finish, and neither should you.

## What this deliberately does not do

It does not clean up. Teardown of a worktree workspace is by hand, and only when the user asks, because removing a workspace by ID is one typo from removing someone else's. `herdr-worktree` has the two commands.

It does not review the result or wait for a PR. It gets the agent started and stops.

## If a step fails

Each script prints its own error, or herdr's, rather than interpreting it. Read that first. The scripts are the specification of the exact commands, so read them before improvising, and check the current CLI with the `--help` for whichever command is involved. Herdr's installed binary is always the authority over anything written down here.
