# Change summaries

After completing each task or step, display a codeblock with a summary of the change in the style of a well-formed commit message.

## Well-formed commit messages

### Subject
- The subject is the first line of the commit message
- Limit the subject line to 50 characters
- Capitalize the subject/description line
- Do not end the subject line with a period
- Use the imperative mood in the subject line, for example: "Add unit tests for user authentication"

### Body
- Prefer no body. Only add one when the "why" is non-obvious from the subject and diff — a hidden constraint, a decision with alternatives, or surprising context. If in doubt, leave it out.
- Keep the body short: usually one short paragraph, rarely more. Do not pad with a second paragraph of deployment notes, future considerations, follow-up ideas, or implementation tips — those belong in a PR description, issue, or docs, not the commit message.
- Separate the body from the subject with a blank line
- Do not re-state the subject line
- Use the body to explain the "why", not the "what" or "how" (the diff shows those). Restating what the code does in prose is a sign the body should be cut.
- Body lines should use the full width up to 72 characters before wrapping; do not wrap early at 50 or 60 characters
