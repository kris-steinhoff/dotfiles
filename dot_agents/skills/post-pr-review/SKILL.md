---
name: post-pr-review
description: Land a finalized, already-triaged review on a GitHub pull request as one review — the recommendation as the summary and each finding as its own inline comment. Mechanical: it renders the review into the reviews-API schema, decides where each finding anchors, dry-runs, and posts. It forms no opinions and never edits source. Invoke to post a completed PR review, from the `commenter` persona or directly.
---

# post-pr-review

The GitHub-PR posting target. It takes a review that is already found and already triaged and lands it cleanly: render it into the poster's schema, decide where each finding hangs, validate against the PR's own diff, and post as a single review. It does not judge the code, form opinions, re-derive severity, or overturn the recommendation or the triage — that is all done before it runs. Its whole job is to place the finished review on the PR without losing anything.

The finding format it consumes is the `/review` skill's report shape: a recommendation block (Approve or Request Changes, with a short justification) and a set of findings, each carrying a severity `[high]/[med]/[low]`, a file, a RIGHT-side line range, a title, and a body. If it arrives as loose prose, read that shape out of it. `reference.md` has the poster's JSON schema and the anchoring rules in full; load it before building the review JSON.

## Posting

Post through `scripts/post_review.py`, which lands the summary body and its inline comments as a single reviews-API call:

```bash
scripts/post_review.py --dry-run review.json
scripts/post_review.py review.json
```

Build one review JSON: `{pr, event, body, comments: [{path, line, body}], thread_replies: [{in_reply_to, body}], footer}`.

- **event** — from the recommendation: Approve → `APPROVE`, Request Changes → `REQUEST_CHANGES`, otherwise → `COMMENT`.
- **comments** — one per finding that anchors inline, on its RIGHT-side line, body prefixed with the severity marker. This is where nearly every finding goes: a finding whose exact subject isn't in the diff still anchors to the nearest related changed line, its body opening on the gap ("not directly related to this code, but …"). Inline is the only threadable surface, so it is what lets a re-review answer a finding.
- **body** — the recommendation block verbatim. Append only the genuinely non-anchorable findings here — the rare ones with no reasonable inline home — each under a short clear **name** (e.g. "Finding A — …") and ordered by severity. The name is not decoration: a body finding cannot be threaded, so its name is the handle a later review uses to mark it resolved.
- **thread_replies** — re-review only: one entry per still-open prior finding **that was posted inline**, `in_reply_to` set to the id of that finding's earlier review comment, so the reply lands in the existing thread instead of a duplicate. A still-open prior finding that lived in the body (a named one) has no thread — state its status in the body by name instead. Resolved prior findings need no reply either; note their status in the body if useful. Omit on a first review.
- **footer** — the attribution line, passed verbatim; the poster appends it to the body, every comment, and every reply. The caller (the `commenter` persona) owns what the footer says.

## Anchoring is decided here

Whether a finding lands inline or falls back to the summary body is this skill's call, not the review's — the review supplies a best-effort file and line, and the anchor is settled against the PR's actual diff at post time. `reference.md` has the rule in full; the shape of it:

- **Anchor inline whenever there is any reasonable line to hang the finding on** — which is almost always. A finding about code the PR didn't touch still anchors to the nearest changed line that motivates it, the body opening on the gap.
- **Only a finding with no reasonable inline home at all** goes in the summary body, under a short clear name.

Always `--dry-run` first and read the result: it validates every anchor against the PR's own diff and every reply target against the PR's existing review comments. If an anchor comes back bad, first re-anchor that finding to a nearby changed line and qualify its body ("not directly related to this code, but …") — that keeps it inline and threadable. Only if there is no reasonable line at all, move it to the summary body under a name rather than dropping it. Then post. Never let one bad anchor sink the batch.

Dedup against what is already on the PR: on a second pass, read the existing review comments and post only findings that are not already there. Never repost a comment that still stands.

## Role boundary

Post and report. Do not edit source, form new opinions, add findings the review did not contain, or change its recommendation. If a finding lacks what you need to place it (no file, no line, no severity), post what you can and report the gap to the caller rather than guessing.
