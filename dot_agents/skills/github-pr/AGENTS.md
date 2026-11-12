# github-pr

`github-pr` owns every GitHub PR review posted on the owner's behalf, in one mode, `review <n>`. The author's side, replying to reviews of the owner's own PRs, is `drive-pr`.

## Reviewer's side only

The author's side is its own skill, `drive-pr`, even though both sides share the scripts and the posting schema. Replying as the author is part of carrying a PR to merge, which acts on its own rather than confirming every reply, and the posting rule grants permission per posting skill, so the skill that may post without confirming is the one whose description says so. A bare number means `review <n>` unless the owner wrote the PR, in which case the skill points at `drive-pr`. The skill runs inline because triage and posting confirmation must reach the user.

The scripts and `references/posting.md` stay here, and `drive-pr` links to `feedback.py`, `post.py`, and `posting.md`. Moving or splitting them means moving those links too.

## `review <n>`

A review reads the PR from git without a checkout: `fetch.py` brings the head into a private ref (`refs/github-pr-review/<n>/head`) and the base into `origin/<base>`, and the reviewer reads `git diff <merge-base> <head>`, which is GitHub's diff, and the code around it with `git show` and `git grep` at the head. A checkout gives a reviewer little, since it can't run a PR's tests any more than it can without one, and costs a lot: branch claims, moving a checked-out branch when the author pushes, and forced worktree removal. Without one, moving to a new head is just another fetch.

The queue of PRs awaiting review, and the rule for when one is done, live in `github-review-queue` (notes in `dot_local/bin/AGENTS.md`), and the Herdr Reviews tab runs one review session per PR, so the skill reviews one PR per run and keeps no queue of its own.

`review <n>` runs inline wherever it is invoked. It reads the PR and the owner's prior review threads, invokes the generic `review` skill without Nits, asks the user to rule on each Blocker and Follow-up as Include/Exclude/Other (or a yes/no fallback), derives `REQUEST_CHANGES` only when an included Blocker remains, and asks for a final posting confirmation. Triage asks about the findings together, one question each in as few prompts as the question tool allows, and holds a finding back only when its question depends on another's ruling; one prompt per finding is the failure to avoid. On a re-review it resolves the threads of prior findings it verified as fixed, and only threads the owner started.

It also weighs in on other reviewers' open comments, bots' included. The agent judges each against the code itself, since the generic `review` skill reports only problems the change introduces. An Agree reply gives the comment the owner's severity, and a Dispute says with evidence why it doesn't hold. That tells the author which of several reviewers' comments matter and how much, and an Agree at Blocker requests changes like a finding of the owner's own, which is how a bot's mild suggestion is escalated when it would break something. A finding another reviewer already raised becomes an Agree on their thread rather than a second comment. Each reply is triaged like a finding.

Stacks are found per review, by `fetch.py`, rather than across a queue. With one session per PR there is no queue to group PRs in, so each review reads its neighbours from GitHub itself: the lower PR as context, with its code's findings left to its own review, and up to five PRs built on this one, so a Follow-up doesn't ask for what an upper PR already does. Related PRs that aren't a stack, such as two that share a Jira key or files, aren't grouped: telling which are really one piece of work takes a view across the queue that a single review doesn't have. Neighbours are read with `gh`, not `fetch.py`, because `fetch.py`'s private ref is per-PR state that the PR's own session, often in the same checkout, relies on to notice a push.

## Shared scripts

Both sides, this skill and `drive-pr`, share two scripts and one reference.

- `scripts/feedback.py` prints the PR's review conversation as JSON: threads from GraphQL, which alone knows resolution state and thread ids, plus review bodies and conversation comments flagged `after_my_latest` by `watch-pr`'s rule. `drive-pr respond` still lists the older ones as possibly answered, because one later reply of the owner's anywhere on the PR would otherwise hide every earlier summary.
- `scripts/post.py` posts one confirmed batch (an optional review, thread replies, one conversation comment, and resolutions) after checks that refuse the whole batch when the PR's head has moved past the batch's `head_sha`, an inline anchor is not a RIGHT-side diff line, a reply targets anything but a thread's first comment, a thread to resolve is someone else's, or a cited commit is not on the PR. `--dry-run` runs only the checks.
- `references/posting.md` holds the batch schema and the anchoring rules.

The poster requires an attribution header but does not choose its text. The text lives in `.chezmoitemplates/posting-attribution.md`, which the skill renders with `includeTemplate ".chezmoitemplates/posting-attribution.md" . | trim` (the `trim` drops the file's trailing newline inside a code fence). Any other posting skill includes the same partial, so the line stays in one place.

The Herdr `reviews` mod (`dot_config/herdr-app/mods/reviews/`, notes in `dot_config/herdr-app/AGENTS.md`) starts `/github-pr review <n>` in the repo's main checkout, and that invocation is its only tie to the skill. Its queue comes from `github-review-queue`.
