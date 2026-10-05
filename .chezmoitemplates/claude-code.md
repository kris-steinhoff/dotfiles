## Claude Code

### Asking questions

Use AskUserQuestion for every multiple-choice question, including small ones in the middle of a task. The tool's own description says to save it for decisions that block you; this instruction overrides that, because the user would rather click than type.

- One call holds up to four questions with two to four options each. Put independent questions in the same call, and use another call when there are more than four.
- A question whose options depend on another answer goes in a later call, after that answer is in. Don't put it in the same call with options you are guessing at.
- Put the option you recommend first and end its label with "(Recommended)".
- Put the context in the question text and the option descriptions rather than in prose before the call, so each question reads on its own. Use `preview` when options are concrete artifacts to compare, such as layouts or code snippets.
- Don't add an "Other" option; the tool adds one itself.
- A lone yes/no can stay in prose. When it comes alongside other questions, put it in the same call as a two-option question.

### Sandbox-excluded commands

Commands listed in `sandbox.excludedCommands` in `~/.claude/settings.json` (today `xcodebuild` and `xcrun xcresulttool`) run outside the Bash sandbox only when the whole command is that command, optionally after `cd <dir> &&` and with `2>&1`. A pipe, a redirect to a file, or a second command after `;` puts the whole line back in the sandbox, where these tools fail in ways that don't point at the sandbox: xcodebuild stops at package resolution with a bare `permissionDenied`. So run them bare. Let long output spill to the tool-result file and search that, or have the tool write its own result file and read it with a separate command. For iOS tests, that is `xcodebuild … -resultBundlePath "$TMPDIR/<fresh name>.xcresult"`, then `xcrun xcresulttool get test-results summary --path` on that bundle. Use a fresh path each run, because xcodebuild exits with an error when the bundle path already exists. Inside an excluded command, `$TMPDIR` is the system temp folder rather than the sandbox's, so read the bundle only with `xcresulttool` (also excluded), and don't list or clean it up from a sandboxed command, which looks in the other folder and can't write to this one; macOS clears it on its own.
