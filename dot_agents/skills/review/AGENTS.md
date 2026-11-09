# review

`review` is a portable review router: it gives one suitable reviewer already available in the harness the implementation intent, change scope, and a shared finding model, and normalizes what comes back.

It is a router, not a review engine or a PR workflow. The reviewer is a caller-named one first, then a native or installed reviewer, then the current agent as fallback. It returns only findings introduced or meaningfully exposed by the change, normalized as `Blocker`, `Follow-up`, or (when requested) `Nit`, plus the verification performed. It makes no edits, asks the user no questions, produces no verdict or recommendation, and does not triage or post; callers such as `github-pr` own those.

Its description tells the caller to use an available subagent when a particular review is substantial enough to benefit from isolation; otherwise it runs inline, so the caller decides per review.

A delegated reviewer starts from a fresh context with the intent in the user's words and the change scope, never as a fork of the implementer's conversation. A forked reviewer inherits the implementer's reasoning and tends to pass what a fresh reader would catch. An inline review says so in its verification, since it isn't independent.
