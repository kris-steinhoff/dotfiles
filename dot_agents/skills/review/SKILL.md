---
name: review
description: Engine for a pull-request review that ends in a consistent, postable report. Resolve the PR, find the defects, and shape them into a fixed report format (a recommendation block plus severity-tagged findings each carrying a file and line range). Harness-agnostic — the reviewer persona wraps this with interactive triage, and the `post-pr-review` skill lands the finalized review on the PR, but `/review` also runs directly. Invoke when reviewing a PR or diff, or when asked to review changes and post the result.
---

# review

The reusable engine behind a PR review. It does the parts that never change between harnesses: resolve the target, account for any prior review of mine, find the real problems, and shape them into one report format that a poster can land on the PR without re-deriving anything. The interactive triage (walking the user through findings) and the confirm-to-post gate live in the `reviewer` persona, and the mechanics of landing the review on the PR live in the `post-pr-review` skill — not here. This skill holds the finding and the shape, so `/review` is useful on its own and the persona is a thin orchestrator over it.

## The review queue: `/review ready`

`ready` is not a ref. It means the whole review queue, which the Herdr delegation instructions already handle as a batch dispatch, so hand it to them instead of reviewing it here. Without Herdr there is no fan-out: list the queue with `list-review-requests` and ask which PR to review in this session.

## Flow

1. **Resolve the target.** Default to the current branch's PR against its base. When given a PR number, branch, or path, review that instead. Establish the base to diff against so the review sees only the proposed change, not the whole file. Capture the PR's number, title, author, and base branch — the summary header (§Report shape) needs them.
2. **Load my prior review.** Pull my own earlier findings on this PR and the commit I last reviewed at (`gh` for my prior reviews and review comments). Usually there are none — that is a first review, and the rest of the flow simply has nothing prior to account for. This step is why first review is not a separate mode: you always look, you just usually find nothing.
3. **Scope.** What to examine: the change under review — plus, only when I have prior findings, the incremental diff since my last-reviewed commit and the locations of those findings (a finding can be addressed by a change elsewhere, so it is not diff-bounded). No prior findings → just the change.
4. **Find and verify.** Find new problems in scope, reading enough surrounding code and tests to judge each in context. Fan out to read-only helpers (`Explore` for locating, `investigator` for tracing a call path) when breadth needs it; compose a review checklist skill (e.g. `agent-skills:review`) when one fits. One finding pass by default — don't spin up parallel security/correctness/perf specialists unless the diff's risk clearly warrants it. Then, for each prior finding, judge against the current code whether it is resolved, still open, or partially addressed — a judgment from re-reading, not a lookup. No prior findings → nothing to verify, so this is just "find."
5. **Shape.** Turn what you found into the report format in §Report shape. When prior findings exist, lead with their status; otherwise the report is exactly the first-review shape. Every new finding gets a severity, a file, a line range on the RIGHT side of the diff, a title, and a body. This is the contract the poster consumes — where each finding physically anchors on the PR (inline vs. the summary body) is the `post-pr-review` skill's call at post time, not something to pre-classify here.
6. **Hand off.** The finalized review — after any triage the caller runs — goes to the `post-pr-review` skill, which renders it into the reviews-API schema and posts it. Still-open prior findings become replies on their existing threads; new findings post fresh. On a first review there are no replies, so it lands as a single review whose findings each post as their own inline comment, with the recommendation as the summary — one review, one comment per finding, never everything lumped into a single comment. That skill owns the poster's schema, the anchoring rules, and the stacked-PR handling.

**First review is just the case where the prior-findings set is empty — not a separate mode.** Every step above collapses to a plain first review when there is nothing prior: you look and find no earlier review (2), so there is no incremental scope (3), nothing to verify (4), no status section (5), and no replies (6).

## What to look for

Correctness failures, behavior regressions, security or privacy problems, data loss, unsafe concurrency, compatibility breaks, and missing tests for changed behavior. Check that the change satisfies its stated intent and follows the repo's conventions. Ignore cosmetic preferences unless they obscure behavior or create a concrete maintenance hazard. Do not invent findings to fill the report — no material issue is a valid, useful result.

Run only read-only checks. Never edit source, generated files, caches, services, or external state; the reviewer forms and reports judgment, it does not fix.

## Report shape

Open with a **summary header** so a reader deciding on findings can re-orient without scrolling back — then the recommendation block. The header is presentation context for the person triaging; it is _not_ posted to the PR. The recommendation block below it is what becomes the review comment body verbatim.

```markdown
## PR #<n> — <title>

**Author:** <login> · **Base:** <baseRefName> · **<N> findings, <M> blocking**

<one or two plain sentences on what the PR changes — the context needed to judge the findings, not a file-by-file recap>

**Recommendation: Approve** _(or **Request Changes**)_

<one or two sentences: the verdict and why>
```

Everything above **Recommendation:** is the header and stays in the presentation; everything from **Recommendation:** down is the posted content. Keep them as distinct blocks so "the recommendation block, verbatim" never sweeps the header into the posted body. On a re-review the recommendation reasons over the delta: prior blockers all cleared plus no new blockers moves Request Changes toward Approve.

Then, when this is a re-review, a **Prior findings** section that accounts for each finding from my last review — grouped Resolved / Still open / Partial, each carrying the thread it came from (or, for a finding that lived in the body, its name) — so the author sees what my earlier review asked for and what is left. Omit the whole section on a first review (the prior set is empty).

Then, only when requesting changes, a **Blocking** list. Then an **Actionable (non-blocking)** list. Omit an empty list rather than printing a header with nothing under it.

Each finding carries:

- **severity** — `[high]`, `[med]`, or `[low]`
- **path** — repo-relative file
- **lines** — a best-effort line range on the RIGHT side of the diff (the post-change file); the exact anchor, and whether the finding lands inline at all, is settled by the `post-pr-review` skill against the PR's own diff
- **title** — a short claim
- **body** — impact, reasoning, and the smallest useful direction for a fix (never the fix itself)

Blocking findings are the ones that justify Request Changes. Everything else is actionable non-blocking. Order each list by severity, highest first.
