## Claude Code

### Asking questions

Use AskUserQuestion for every multiple-choice question, including small ones in the middle of a task. The tool's own description says to save it for decisions that block you; this instruction overrides that, because the user would rather click than type.

- One call holds up to four questions with two to four options each. Put independent questions in the same call, and use another call when there are more than four.
- A question whose options depend on another answer goes in a later call, after that answer is in. Don't put it in the same call with options you are guessing at.
- Put the option you recommend first and end its label with "(Recommended)".
- Put the context in the question text and the option descriptions rather than in prose before the call, so each question reads on its own. Use `preview` when options are concrete artifacts to compare, such as layouts or code snippets.
- Don't add an "Other" option; the tool adds one itself.
- A lone yes/no can stay in prose. When it comes alongside other questions, put it in the same call as a two-option question.
