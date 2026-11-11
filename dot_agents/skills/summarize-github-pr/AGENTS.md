# summarize-github-pr

`summarize-github-pr` shows one PR's metadata in a fixed shape, so a person getting oriented can tell PRs apart at a glance. Any agent can reach for it, and `github-pr` opens every review and respond session with it. It stays general rather than shaped for a caller, to be tuned when a real use needs more. `summarize-jira-ticket` is its Jira counterpart and shares its table.

## Getting it printed

An agent reliably shows the last message of a turn, while mid-turn it narrates and tends to paraphrase a script's output instead of printing it. Rewording the instruction and a `PreToolUse` hook that refused the next tool call until the summary was shown did not change that; run as its own turn, the summary prints without extra guidance. So the summary is a session's whole first message, where the owner wants it anyway, rather than one step among several. A `review ready` queue triages in its own session and has no such turn to give each PR, so it opens each PR's triage with its board instead, a table it composes itself, which agents do print mid-turn, and shows the summary's table in the posting confirmation. A `github-pr review <n>` or `shepherd-pr` session, which runs inline, relies on the skill's instruction.

## The shape

The PR summary is metadata only: a table of number and title (cut at 60 characters), author and URL, and when it was marked ready (or opened, if never a draft) with the PR it is stacked on (another open PR whose head is its base); then one bullet per review with its type and the number of comments it started; then the size and the base ← head branches. What the PR changes is deliberately left out, because the point is a consistent way to tell PRs apart, not a description.

`scripts/summary.py` prints the markdown itself, so the skill runs inline and needs no model of its own. It skips the empty reviews GitHub records for each thread reply, for the same reason `watch-pr` does.
