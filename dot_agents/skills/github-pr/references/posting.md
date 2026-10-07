# GitHub PR posting schema and anchor rules

Reference for `scripts/post.py` and `scripts/feedback.py`, and for the anchoring rules a review finding must satisfy to land inline. Load it before reading a PR's threads or posting; the workflows that decide what to post live in `SKILL.md`.

## Reading the conversation

`scripts/feedback.py <pr>` prints the PR's whole review conversation as JSON: identity (`author`, `viewer`, `head_sha`, `base_branch`), the inline `threads`, the summary bodies of `reviews`, and the conversation `comments`. Each thread carries its `thread_id`, its `root_comment_id` (the only id a reply or a resolution can target), `resolved`, `outdated`, `started_by_me`, and `unanswered` (unresolved, and the latest comment is someone else's). Reviews and conversation comments cannot be threaded, so whether one still needs an answer is a judgment rather than a recorded fact. Their `after_my_latest` marks those someone else wrote after `my_latest`, the newest thing I posted anywhere on the PR (the rule `watch-pr` wakes on); an older one may or may not have been answered. Bots are included and flagged `bot`.

A reviewer reads its own `started_by_me` threads to find prior findings. An author reads every `unanswered` thread, whoever started it, and every review body and conversation comment that is not its own.

## Poster schema

`post.py` takes one batch as JSON, from a file argument or stdin:

```json
{
  "pr": 328,
  "head_sha": "4f1c2e9…",
  "header": "<the attribution line SKILL.md gives>",
  "event": "REQUEST_CHANGES",
  "body": "**Review: Changes requested**\n\n...",
  "comments": [{ "path": "src/auth.py", "line": 42, "body": "[Blocker] Token never expires. ..." }],
  "thread_replies": [{ "in_reply_to": 987654, "body": "Fixed in 4f1c2e9: the token now expires after ..." }],
  "issue_comment": { "body": "Replying to the summary points: ..." },
  "resolve": [987600],
  "commits": ["4f1c2e9"]
}
```

- `pr`: the PR number. The repo is inferred from the working directory via `gh`, or from `GH_REPO`.
- `head_sha`: the PR head the batch was written against. The poster refuses the whole batch if the PR has moved since, because a review or a "fixed in" claim formed against older code may no longer hold. Reviews are also pinned to this commit.
- `header`: required. Prepended verbatim to every message posted. The poster does not choose the text; `SKILL.md` does.
- `event`, `body`, `comments`: a review, posted as one reviews-API call so the summary and its inline comments land together. `event` is `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`; use `COMMENT` only when GitHub accepts neither decision, such as on the authenticated user's own PR. Each inline comment anchors to a RIGHT-side `line`. Omit all three when the batch posts no review; a `body` or `comments` without an `event` is refused.
- `thread_replies`: replies on existing inline threads, each with a non-empty `body`. Each `in_reply_to` must be a thread's `root_comment_id`, since GitHub accepts no reply to a reply.
- `issue_comment`: one conversation comment on the PR, an object with a non-empty `body`, for answering what has no thread: review summary bodies and earlier conversation comments.
- `resolve`: root comment ids of threads to mark resolved. Only threads I started can be resolved here; a thread someone else started is refused.
- `commits`: every commit the batch's text cites, at least seven characters each. Each must be one of the PR's commits.

Run it two ways:

```bash
scripts/post.py --dry-run batch.json   # run every check, post nothing
scripts/post.py batch.json             # check again, then post
```

Always dry-run first and fix everything it reports. The checks run again before posting, and nothing is posted while any fails. The batch posts in order: the review, the thread replies, the conversation comment, then the resolutions. Each is a separate call, so one that fails afterward is reported without undoing what already landed, and the poster prints a remainder batch of the steps still owed. Retry with that remainder, never the original batch, which would post the review a second time.

### Re-review posting

On a re-review, a still-open prior finding that was posted inline is answered on its existing thread through `thread_replies` rather than re-posted. A prior finding verified as fixed has its thread resolved through `resolve`, with a reply only when the fix needs a note. A prior finding that lived in the summary body under a name has no thread, so its status goes in the new review's body by that name ("Finding A (missing migration): resolved in …"), never in a standalone conversation comment.

### Response posting

An author's replies post without a review: `thread_replies` for inline threads, and at most one `issue_comment` that answers review summary bodies and conversation comments by quoting or naming each point it addresses. The response never resolves a thread; resolving is the reviewer's confirmation that a fix holds. Every commit a reply cites as a fix goes in `commits`.

## Anchoring: prefer inline, fall back to a named body finding

GitHub's reviews API only accepts an inline comment on a line that is part of the PR's diff: an added (`+`) or context (` `) line on the RIGHT (post-change) side of a hunk. A removed (`-`) line, or any line outside the changed hunks, cannot carry an inline comment.

**Anchor inline whenever there is any reasonable line to hang the finding on, which is almost always.** A finding whose exact subject is code the PR did not touch (a caller elsewhere, a latent bug the diff merely exposes) can still anchor to the nearest changed line that motivates it (the diff line that calls the buggy code, exposes the latent bug, or sits closest in the file), with the comment opening on that gap, e.g. "Not directly related to this code, but the change here surfaces …". An inline comment on a related line is worth far more than the same text buried in the summary body: the author reads it in context, can reply to it, and a later re-review can answer or resolve it in its thread. Inline comments are the only threadable surface GitHub gives a review, so keeping findings inline is what makes resolution on re-review work at all.

**Only when a finding has no reasonable inline home at all** does it go in the summary body instead. Give each such finding a short, clear **name** (a label the author and a future review can refer to, e.g. "Finding A — missing migration"), because on re-review its resolution is stated by that name in the new review's body. Expect this to be rare.

So a finding's `anchorable` flag is true in the common case, anchored to some reasonable RIGHT-side line, exact or qualified, and false only for the genuinely homeless finding that falls back to a named entry in the body.

### Stacked PRs

When a PR targets another feature branch rather than the trunk, its diff is against that base, and the anchorable lines are the ones changed relative to that base, not relative to the trunk. `post.py` checks anchors against the PR's actual base branch (what `gh pr view` reports as `baseRefName`). A line that looks changed against the trunk but is unchanged against the immediate base is not in this PR's diff and won't anchor.
