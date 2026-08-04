# Linear

There is no official Linear CLI. Access is through an MCP server or the GraphQL API, so what is available depends on how the session is configured.

**Check what you have before planning around it.** If a Linear MCP server is connected, its tools appear as `mcp__*linear*` and are the right path. If nothing is connected, say so rather than reaching for the API with a token you were not given.

## Through MCP

Typical shape, though the exact tool names vary by server:

- list issues, filtered by team, state, assignee, or cycle
- read one issue with its description and comments
- update state and assignee
- add a comment

Read the issue fully before claiming it, same as any tracker. Linear descriptions are often the only place the acceptance criteria live.

## Through the API

`https://api.linear.app/graphql`, with `Authorization: <personal-api-key>`. No `Bearer` prefix for personal keys.

Only reach for this when the repository or the user has pointed you at a key. Do not go looking for one in the environment.

## Mapping to this workflow

- **Ready queue**: Linear's own workflow states. "Todo" or "Backlog" depending on the team's setup, filtered to the current cycle. Which one counts as ready is a team convention, so ask if the repo does not say.
- **Claim**: assign to self and move to "In Progress".
- **Close**: move to "Done". Linear closes issues by state transition, not by a close verb.
- **Issue ids** look like `ENG-1234` and are stable. They work fine as branch names, so `bin/issue-branch --issue ENG-1234` needs no translation.

## Gotchas

- `bin/issue-branch` cannot verify a Linear issue against a repository, so it falls through to "no tracker detected" and skips the check. The repo-to-issue correspondence is yours to confirm.
- Linear's git integration can move an issue's state from branch names and PR events. If the team has that on, closing by hand may be redundant or may fight the automation. Check before doing both.
