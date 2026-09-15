# review — poster schema and anchor rules

Reference for `scripts/post_review.py` and the anchoring rules a finding must satisfy to land inline. Loaded on demand; the report shape itself lives in `SKILL.md`.

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
  "footer": "_Posted by Claude on behalf of Kris Steinhoff._"
}
```

- `pr` — PR number. The repo is inferred from the working directory via `gh`.
- `event` — one of `APPROVE`, `REQUEST_CHANGES`, `COMMENT`. Map it from the recommendation: Approve → `APPROVE`, Request Changes → `REQUEST_CHANGES`, otherwise → `COMMENT`.
- `body` — the recommendation block, verbatim. Becomes the review's summary comment.
- `comments` — inline comments, each anchored to a RIGHT-side `line`. A `{path, line, side}` range uses `side: "RIGHT"` implicitly.
- `footer` — optional. Appended to the body and to every inline comment, so the on-behalf attribution shows wherever the review appears. `post_review.py` does not synthesize it; the caller passes the exact footer.

Run it two ways:

```bash
scripts/post_review.py --dry-run review.json   # validate every anchor against the PR diff; post nothing
scripts/post_review.py review.json             # post the review
```

`--dry-run` validates each inline comment's `(path, line)` against the PR's own diff and reports which anchors are valid, without posting. Always dry-run before posting a review built from findings — an anchor that isn't a real RIGHT-side position in the diff makes the whole reviews-API call fail, and one bad anchor should not sink the batch.

### Re-review posting (pending)

The unified flow (SKILL.md §Flow) replies to still-open prior findings on their existing threads instead of re-posting them. `post_review.py` does not do that yet — today it posts one review with fresh inline comments. The re-review path will add `thread_replies: [{in_reply_to, body}]` alongside `comments` (one reply per still-open prior thread), and `--dry-run` will grow to validate those reply targets against my own prior comment ids. Until it lands, a re-review posts new findings fresh and carries its prior-findings status in the summary body rather than as thread replies.

## Anchor rules

GitHub's reviews API only accepts an inline comment on a line that is part of the PR's diff — an added (`+`) or context (` `) line on the RIGHT (post-change) side of a hunk. A removed (`-`) line, or any line outside the changed hunks, is not anchorable.

So a finding is `anchorable` only when its RIGHT-side line falls inside a diff hunk. A finding about code the PR did not touch — a caller elsewhere, a latent bug the diff merely exposes — is real but not anchorable; it belongs in the summary body under the recommendation, not inline.

### Stacked PRs

When a PR targets another feature branch rather than the trunk, its diff is against that base, and the anchorable lines are the ones changed relative to that base — not relative to the trunk. Resolve anchors against the PR's actual base branch (what `gh pr view` reports as `baseRefName`), which is what `post_review.py --dry-run` checks against. A line that looks changed against the trunk but is unchanged against the immediate base is not in this PR's diff and won't anchor.
