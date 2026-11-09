# jira

`jira` is the one way agents read and change Jira, and the posting skill for Jira comments.

It is instructions only, with no scripts, and works through the Atlassian MCP server, which Claude reaches through the claude.ai Atlassian connector. Atlassian's `acli` is not a substitute: it fails inside the Claude Code sandbox, whatever hosts are allowed, because the sandbox can't read its OAuth credential, and it can't list transitions, look up an account for a mention, or edit custom fields. The MCP server covers all of that, takes and returns Markdown (so the shared attribution partial goes in as it is), and reports the user's own account ID in every response.

With no script, nothing enforces the checks `github-pr`'s poster does, so the stale check (re-read the issue's `updated` before applying) and the attribution line are instructions the agent follows. The skill names tools by their base names (`getJiraIssue`, `addCommentToJiraIssue`) because the prefix differs by harness and connector.

It confirms two kinds of change differently. A message to people (a comment, or a created issue's summary and description) always needs the user's confirmation. A change to the issue itself (a transition, a field edit, a link, a new issue) needs it unless the project's instructions, or a workflow following them, authorize that specific move, which is how `drive-implementation` can make the tracker moves a project's flow calls for without stopping each time.

Nothing about a particular site is in the skill. The project's own `AGENTS.md` gives its site, project keys, workflow and pre-authorized moves, and custom-field IDs, and the skill discovers and confirms anything it needs that the instructions don't give. The delegation partial sends a delegated task's Jira key here too.

Codex has no Atlassian MCP server configured yet; there the skill stops and says so. Wiring it is adding Atlassian's remote MCP server to Codex's config plus a one-time OAuth login per machine.

The rule against reaching Jira any way but the MCP server is about changing Jira, which is what the confirmation and attribution protect. `summarize-jira-ticket` reads Jira's REST API directly with a read-only token, and that is consistent with it.
