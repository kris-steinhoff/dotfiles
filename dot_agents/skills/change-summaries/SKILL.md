---
name: change-summaries
description: Display a codeblock with a summary of changes in the style of a well-formed commit message after completing a task.
---

# Change summaries


After completing each task or step, display a codeblock with a summary of the change in the style of a well-formed commit message.

Most summaries should be subject-only. A bare subject line is the target, not a starting point you elaborate on.

## Subject

- One line, 50 characters or fewer, capitalized, no trailing period, imperative mood.
- Example: `Add unit tests for user authentication`

## Body

No body by default. Only add one when the diff alone leaves the *why* unanswered — a hidden constraint, a non-obvious decision with alternatives, or surprising context. If you can't name that reason in a few words, skip the body.

When a body is genuinely needed:

- Blank line after the subject; wrap at 72 characters.
- One short paragraph. Never two.
- Explain *why*, not what or how. If you find yourself describing what the code does, cut it.
- No plan context, deployment details, follow-up ideas, or future considerations — those belong in the PR description.

## Examples

Good (subject-only — the default):

```
Add unit tests for user authentication
```

Good (body earns its place — names a non-obvious constraint):

```
Pin urllib3 to <2.0

boto3 1.28 still imports the removed `urllib3.contrib.pyopenssl`
module; unpinning breaks the Lambda build until we upgrade boto3.
```

Bad (body restates the diff):

```
Add unit tests for user authentication

This commit adds unit tests covering the login and logout flows
in the auth module, including edge cases for invalid credentials.
```
