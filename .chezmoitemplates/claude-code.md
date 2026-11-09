## Claude Code

### Asking questions

Use AskUserQuestion for every multiple-choice question, even a small one mid-task; this overrides the tool description's advice to save it for blocking decisions. Also use it for every stop that waits on the user, even a lone yes/no or a manual step only they can take (offer `Done` and a way out such as `Skip it`), because a workspace tool such as Herdr marks a session at that prompt as blocked, while a prose question looks finished. Never end a turn with a question in prose.

- A call holds up to four questions of two to four options each; put independent ones together, and a question whose options depend on another answer in a later call.
- Recommended option first, its label ending "(Recommended)". Don't add "Other"; the tool adds it. For input with no natural options, such as a value to paste, offer the likely choices and let the free text carry the rest.
- Put context in the question text and option descriptions, not in prose before the call, so each reads on its own. Use `preview` to compare concrete artifacts such as layouts or code.

For a command the user runs with `!`, the open question would hold the input line they need, so ask only what they'll do (`I'll run it` first, then `Skip it`), describing what the command does without the command itself. On `I'll run it`, end the turn with a message that is only the command, on a line starting with `! `: the last message is the one text certain to be shown, while text before a tool call is easily skipped and reasoning is not a message. The command's output comes back to you: check the result yourself rather than asking whether it worked.

### Sandbox-excluded commands

Commands in `sandbox.excludedCommands` (`xcodebuild`, `xcrun xcresulttool`, `xcrun simctl`) leave the sandbox only when run bare (optionally after `cd <dir> &&`, with `2>&1`). A pipe, a redirect to a file, or a second command after `;` puts the line back in the sandbox, where they fail misleadingly (xcodebuild with a bare `permissionDenied`). Let long output spill to the tool-result file, or have the tool write a result file. For tests, pass `-resultBundlePath "$TMPDIR/<fresh name>.xcresult"` (a reused path fails) and read it only with `xcrun xcresulttool get test-results summary --path`, since inside an excluded command `$TMPDIR` is the system temp folder, not the sandbox's; don't list or clean it from a sandboxed command (macOS does). Write `simctl io booted screenshot` into the project directory, where sandboxed commands can read it.

### JSON from command-line tools

Filter or reshape a CLI's JSON (`gh`, `aws`, `kubectl`) with `jq`, not an inline `python -c` or `node -e`.

### Report-back

A claude agent started with a name can report back by SendMessage to your session's name.
