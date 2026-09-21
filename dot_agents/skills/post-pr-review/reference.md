# post-pr-review — poster schema and anchor rules

Reference for `scripts/post_review.py` and the anchoring rules a finding must satisfy to land inline. Loaded on demand; the posting flow lives in `SKILL.md`, and the finding format this consumes is the `review` skill's report shape.

## Poster schema

`post_review.py` takes one review as JSON — a file argument, or stdin — and posts it as a single pull-request review so the summary body and its inline comments land together:

```json
{
  "pr": 328,
  "event": "REQUEST_CHANGES",
  "body": "**Recommendation: Request Changes**\n\n...",
  "comments": [
    { "path": "src/auth.py", "line": 42, "body": "[high] Token never expires. ..." },
    { "path": "src/auth.py", "line": 88, "body": "[med] ..." }
  ],
  "thread_replies": [{ "in_reply_to": 987654, "body": "[med] Still open — the guard added at L88 doesn't cover ..." }],
  "footer": "_Posted by Claude on behalf of Kris Steinhoff._"
}
```

- `pr` — PR number. The repo is inferred from the working directory via `gh`.
- `event` — one of `APPROVE`, `REQUEST_CHANGES`, `COMMENT`. Map it from the recommendation: Approve → `APPROVE`, Request Changes → `REQUEST_CHANGES`, otherwise → `COMMENT`.
- `body` — the recommendation block, verbatim. Becomes the review's summary comment.
- `comments` — inline comments, each anchored to a RIGHT-side `line`. A `{path, line, side}` range uses `side: "RIGHT"` implicitly.
- `thread_replies` — replies on the threads of still-open prior findings (re-review only). Each `in_reply_to` is the id of one of my earlier review comments; the reply lands in that thread instead of a duplicate inline comment. Omit or `[]` on a first review.
- `footer` — optional. Appended to the body, every inline comment, and every reply, so the on-behalf attribution shows wherever the review appears. `post_review.py` does not synthesize it; the caller passes the exact footer.

Run it two ways:

```bash
scripts/post_review.py --dry-run review.json   # validate every anchor against the PR diff; post nothing
scripts/post_review.py review.json             # post the review
```

`--dry-run` validates each inline comment's `(path, line)` against the PR's own diff, and each `thread_replies` target against the PR's existing review comment ids, reporting which are valid without posting. Always dry-run before posting a review built from findings — an anchor that isn't a real RIGHT-side position in the diff makes the whole reviews-API call fail, so one bad anchor should not sink the batch, and a reply to a stale comment id just errors.

### Re-review posting

On a re-review, still-open prior findings that were posted inline are answered on their existing threads rather than re-posted as duplicate inline comments — that is what `thread_replies` is for. A prior finding that lived in the summary body under a name has no thread to reply to (GitHub does not thread body or PR-conversation comments), so its update is stated in the new review's body by referring to that name — "Finding A (missing migration): resolved in …" — never as a standalone conversation comment, which is the dead-end #329 hit. The mechanics differ from the batch: the fresh review (event, body, new inline `comments`) is one reviews-API call, and each reply is a separate `POST .../pulls/{pr}/comments/{in_reply_to}/replies`. The review lands first, so a reply that fails afterward is reported but does not undo it (dry-run validation makes that rare). Resolved prior findings need no reply; a resolved status lives in the summary body. Marking threads resolved (as opposed to replying) is a stronger, GraphQL-only action and is deliberately not done here — reply-only keeps the poster all-REST and leaves resolution to the author or to explicit triage.

## Anchoring — prefer inline, fall back to a named body finding

GitHub's reviews API only accepts an inline comment on a line that is part of the PR's diff — an added (`+`) or context (` `) line on the RIGHT (post-change) side of a hunk. A removed (`-`) line, or any line outside the changed hunks, cannot carry an inline comment.

**Anchor inline whenever there is any reasonable line to hang the finding on — which is almost always.** A finding whose exact subject is code the PR did not touch (a caller elsewhere, a latent bug the diff merely exposes) can still anchor to the nearest changed line that motivates it — the diff line that calls the buggy code, exposes the latent bug, or sits closest in the file — with the comment opening on that gap, e.g. "Not directly related to this code, but the change here surfaces …". An inline comment on a related line is worth far more than the same text buried in the summary body: the author reads it in context, can reply to it, and a later re-review can answer in its thread. Inline comments are the only threadable surface GitHub gives a review — the summary body and PR-conversation comments are not threadable — so keeping findings inline is what makes resolution on re-review work at all.

**Only when a finding has no reasonable inline home at all** — nothing in the diff relates to it closely enough to anchor without misleading — does it go in the summary body instead. Give each such finding a short, clear **name** (a label the author and a future review can refer to, e.g. "Finding A — missing migration"), because a body finding is not a threadable anchor: on re-review its resolution is stated by referring to that name in the new review's body, not by a thread reply. Expect this to be rare.

So a finding's `anchorable` flag is true in the common case — it anchors to some reasonable RIGHT-side line, exact or qualified — and false only for the genuinely homeless finding that falls back to a named entry in the body.

### Stacked PRs

When a PR targets another feature branch rather than the trunk, its diff is against that base, and the anchorable lines are the ones changed relative to that base — not relative to the trunk. Resolve anchors against the PR's actual base branch (what `gh pr view` reports as `baseRefName`), which is what `post_review.py --dry-run` checks against. A line that looks changed against the trunk but is unchanged against the immediate base is not in this PR's diff and won't anchor.
