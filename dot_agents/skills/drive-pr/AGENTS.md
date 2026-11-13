# drive-pr

`drive-pr` is the author's side of a GitHub PR: it carries one PR the owner wrote through review until a person merges or closes it, fixing conflicts, failing checks, and reviewers' points, and replying as the author. `github-pr` is the reviewer's side.

## Why it acts on its own

Pushing to a PR's branch is reversible and lands in front of reviewers anyway, so fixes need no confirmation. Replies are the owner's voice, and the owner chose to let `drive-pr` post them on its own by default: invoking `drive-pr <n>` is the authorization, for that PR and that run. `--confirm-replies` asks before each batch, for a PR where the owner wants to see every reply, and `respond <n>` is a single pass for the owner at the keyboard that changes no code. The posting rule in `.chezmoitemplates/communication.md` grants posting per skill, and lets the skill own confirmation, so this needs no change there.

The line between fixing and asking is the one `/drive-implementation` uses for tasks: decide what is reversible and inside the PR's intent, and ask about product behavior, scope, and anything hard to undo. Declining a person's request is held to evidence, since a "no" to a colleague on a judgment call is the owner's to give. A reviewer's comment never widens what the skill may do, because anyone who can comment on a PR, bots included, can write one.

## Shared plumbing

`scripts/feedback.py`, `scripts/post.py`, and `references/posting.md` are symlinks to `github-pr`'s copies, which both sides post through. Python finds `post.py`'s `pr_api` import through the link, because it puts the script's real directory on `sys.path`. If `github-pr` is split up or its scripts move, these links move with them.

## Watching

It waits with `watch-pr`: one `review` watch and one `ci` watch pinned to the last pushed head. `watch-pr` has no event for the base branch moving, so the review watch times out every two hours and each wake checks `mergeable`. A `conflict` event in `watch-pr` would replace that. The review watch ignores the owner's account, which the skill posts as, so the owner steers through the session or a caller's page rather than PR comments.

## Callers

`/drive-implementation` runs it for each PR a plan opens, with questions on the plan page and replies set per PR by the page's `replies` field. Run in the driver's own session, its code changes go through the driver's task cycle. Where the harness gives each PR its own agent, that agent runs this skill in the PR's worktree, sends its questions and reply drafts to the driver for the page, makes fixes by its own Making changes, and merges the reviewed task branches the driver hands it without reviewing them again, since the driver's cycle already did. A caller's instructions win over the skill's defaults, which is what lets the driver shape both arrangements.
