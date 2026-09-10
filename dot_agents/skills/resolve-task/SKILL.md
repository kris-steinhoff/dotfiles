---
name: resolve-task
description: Deterministic dispatch primitive that types a task reference and fetches its title and URL. Reach for it as the detection step of a Herdr dispatch, or directly when a user hands over a bare ref (123, #123, ABC-123) that needs typing and metadata. Detection is mechanical, and issue-vs-PR is settled by an API query rather than a guess. Not for raw gh or Jira control. Part of the Herdr dispatch flow (HERDR_ENV=1).
---

# resolve-task

A Herdr dispatch primitive. Run the script; read its one-line JSON result.

```bash
scripts/resolve-task --ref <ref> [--repo <path>]
```

`--ref` is a reference like `123`, `#123`, or `ABC-123`. `--repo` (default: cwd) is the git repo path `gh` detects the GitHub repo from. It drives only `gh` and the Jira REST API and needs no Herdr socket, so it also runs standalone.

## What it does

Detection is mechanical:

- `ABC-123` (shape `^[A-Z][A-Z0-9]+-\d+$`) is a Jira key, fetched via the Jira REST API using `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` (Basic auth).
- A bare number is a GitHub ref, and issue-vs-PR is settled by querying: the PR endpoint first (`gh pr view`), then the issue endpoint (`gh issue view`). This is what fixes querying the wrong endpoint for a PR.

## Output (stdout, JSON)

`{ kind, id, title, url, base_branch? }`

- `kind` is one of `jira`, `pr`, `issue`.
- `base_branch` is present only for a PR.

(The Jira title comes from the issue summary; resolve-task's output carries no description body, so the ADF description is not fetched.)

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: the ref shape is unrecognized, the PR/issue is not found or access is denied, or the Jira env vars are missing. stdout is `{"status": "needs_judgment", "reason": ...}` with any known partial fields. Fall back to asking.
- `1` — real error (an unexpected subprocess or network failure). Diagnostics on stderr.
