# summarize-jira-ticket

`summarize-jira-ticket` shows one Jira issue's metadata in a fixed shape, so a person getting oriented can tell at a glance which issue it is and where it stands. It is the Jira counterpart of `summarize-github-pr`, whose `AGENTS.md` explains why a summary is printed as a turn of its own.

## The shape

It uses the PR summary's table, with the issue's type before its key and the assignee in place of the author. An epic follows with its status, a bar of its children by status category (█ done, ▒ in progress, ░ to do) with their counts, and its unfinished children. Any other issue follows with its status, parent, linked PRs (found with `gh` by key as well, since a PR is often linked only through its branch name), blockers, and subtask count. It doesn't describe the work.

## Reading Jira

`scripts/summary.py` reads Jira's REST API directly rather than through the MCP server, because speed is the point: a forked agent driving the MCP tools takes 40 seconds to two minutes per epic, nearly all of it model turns, while the script runs every read in parallel and returns in a couple of seconds. The caller passes the site with `--site` from the project's instructions, since a work site can't be hardcoded here.

The token is scoped to reading (`read:jira-work` and `read:jira-user`), so a leak can't change anything. Atlassian accepts scoped tokens only through its gateway at `api.atlassian.com`, addressed by the site's cloud ID, which the script looks up from the site's public `/_edge/tenant_info`. The email and token come from `JIRA_EMAIL` and `JIRA_API_TOKEN` in the environment, set machine-locally rather than in these dotfiles.

Neither of the obvious alternatives works from the Claude Code sandbox. A sandboxed `op` can't reach the 1Password desktop app to read the token at run time, even with its folders readable and its socket allowed. `acli` reports itself unauthenticated inside the sandbox with no reason given, and excluding it from the sandbox works only for bare commands, which a script can't run. It would also be slower: an agent running bare `acli` reads takes about 15 seconds, against a couple of seconds for the parallel script.

The `jira` skill's rule against reaching Jira any way but the MCP server is about changing Jira, so this read-only script is consistent with it.
