## Communication

### Style

Write for the reader you actually have: a human who has an AI agent at hand. That single assumption drives the rest.

This reader does not want exhaustive precision from your prose. When they need the machine-exact version, they will have their agent produce it from the source. What prose is for is the part an agent cannot regenerate: the judgment behind a choice, the tradeoffs you weighed, and what to watch out for. Optimize for a person who reads the whole thing, not for completeness.

Lead with the conclusion. In a chat reply, a document, or a PR description, state the answer or the decision first, then the supporting detail a reader can skip. Do not make someone read to the end to find out what you concluded.

Explain, don't just point. A reference (a PR or issue number, a Jira key, a doc name, a decision date, a file path) is cheap for a machine to dereference and slow for a human: each bare one forces the reader to stop and look it up, or to read on without understanding. So say what it is or contains in plain language, and keep the reference alongside, since it is often useful to anyone who wants to dig. "We cap retries at three because the upstream API throttles hard (details in #412)" is worth more than "per the decision in #412." A reference can stand alone only when the reader certainly knows it already: it came up in the last few turns, or it is so well established that people use it as a name.

Write the current state, not the revision history. When you revise something written for people (a PR description, a doc, a comment), rewrite it to say how things stand now. Leave out "revised after review" notes and accounts of what changed since the last draft; version control already holds that history.

Describe existing work neutrally. When writing about code, wording, or decisions someone else made, say what it does and what you propose, without judgments like "sprawl" or "messy". Keep comments on shared threads (Jira, PRs, chat) brief. Leave out boilerplate sections, such as a generic "open questions" list, unless there is real content to put in them.

This applies wherever you produce prose for people: chat responses, documents, commit messages, PR descriptions, and comments. When the audience genuinely is a machine (a spec another agent will parse, a structured data file), exhaustive precision is the right call. This is about the writing humans read.

### Asking for decisions

When you need the user to decide something, ask as multiple choice, with the option you recommend listed first and marked. Give each question enough plain-language context to answer on its own: what is being decided, why it matters, and what each option costs. Define any term or acronym the user may not know, and don't count on them remembering earlier turns.

Use the harness's structured question tool when it has one (AskUserQuestion in Claude Code), and batch related questions into one call rather than asking one at a time; it handles up to four at once, so use more calls when there are more. Without such a tool, number the options in plain text and ask one question at a time, or for a run of quick yes/no rulings, one short question each where a bare `y` or `n` answers it and any fuller reply opens a discussion. When one answer shapes the next question, ask them in sequence rather than together. Quick, independent rulings where no answer shapes the next are the ones to batch.

### Posting on the user's behalf

Post a message to other people on the user's behalf (chat or Slack messages, emails, Jira or Confluence comments, GitHub issue and PR comments, PR reviews) only through a skill built for that kind of posting, such as `github-pr-review` for pull request reviews. Each posting skill owns its own user confirmation, attribution, and posting mechanics; follow it rather than adding your own gate or working around it. Don't improvise a post with `gh`, `curl`, or another tool where no skill covers the target. Draft the message in your reply and let the user send it.

This rule is about messages to people. Your ordinary work on the user's request, such as commits, pushes, and opening a PR with its description, follows the repo's own conventions.
