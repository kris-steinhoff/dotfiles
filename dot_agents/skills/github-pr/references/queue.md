# Review queue

The queue is designed for repeated invocation, by hand or by `/loop`, and keeps no state of its own: whether a PR is done is read from GitHub.

That has three costs: two sessions running the queue at once can review the same PR; a PR whose author answers my review without pushing stays done until review is requested again at a new head; and a PR finished without posting comes back as new in another session.

## Read the queue

```bash
scripts/queue.py ready [--repo <path>] [--limit <n>]
```

Run it by its full path from the skill directory; it reaches `api.github.com`. It returns the repository's open, non-draft PRs matching `review-requested:@me -author:@me` as `items`. Each has `number`, `title`, `url`, `author`, `base_branch`, `head_branch`, `head_sha`, `size`, `stacked_on` (the open PR whose head branch is this one's base), `jira_keys` from its title and branch, and its `state`:

- `new` — no review of mine that counts (as defined under `reviewed`) is at its current head.
- `reviewed` — one of my recent reviews is at its current head and is an approval, a change request, or a comment with a body (a lone thread reply doesn't count); skip it, even though a request is still open.

`relations` lists the pairs of queued PRs that look related: `stacked` (`lower` and `upper`), shared `jira_keys`, and `shared_files` with up to five of the `files`. When nothing is `new` and nothing is on your board, report that nothing is waiting and stop.

## Group the new PRs

Decide how the `new` PRs are reviewed: alone, or together by one reviewer that takes them in order, carrying what it learned from the earlier ones.

- **Stacks** always group, the lower PR first.
- **One piece of work split across PRs**, such as a shared Jira key or two PRs by one author touching the same module, group when they are halves of one change, the one the others build on first.
- **Shared files alone** aren't a relationship when incidental, such as lockfiles, changelogs, or generated files.
- A new PR related to one already on the board joins that PR's reviewer.

Keep a group to what one person would review in one sitting.

## Start reviewers

Start one background subagent per group, with a fresh context rather than a fork of this conversation. Its prompt:

> Review PR #<n> (<url>) against `<base_branch>`, in the checkout at `<repo root>`, for a github-pr review queue. Load the `github-pr` skill and follow its "Review the PR" section, running the shared `review` skill yourself rather than in another subagent, then return its results as your final message. Don't triage, ask anyone anything, or post; the session that started you does that with the user.

For a group, add which PRs it reviews, in what order, and why. When it returns a PR's results, send it the group's next PR as a message to the same subagent (SendMessage in Claude Code, `send_input` in Codex), so it keeps what it read, and add that findings it raised on the earlier PR needn't be raised again. If the harness can't, start a new one and name the earlier PRs as context.

Keep at most three subagents reviewing at once, fewer when the harness caps subagents, so one is always free for posting.

## Show the board

The board is a table with one row per PR this session is working, in the order they'll be triaged:

```markdown
| PR                                           | Title                  | Author       | Stage                     |
| -------------------------------------------- | ---------------------- | ------------ | ------------------------- |
| [#254](https://github.com/acme/api/pull/254) | Add rate limit headers | Ada Lovelace | posted: changes requested |
| [#261](https://github.com/acme/api/pull/261) | Fix flaky login test   | Alan Turing  | reviewing                 |
```

The stages are `reviewing`, `ready` (results in, waiting for triage), `triage`, `posting`, `posted` with the event, `skipped`, and `needs you` with a few words on why. Link each PR number to its `url`, and cut titles to about 40 characters. Show the board when reviews start, at the start of each PR's triage, when a review lands or a post finishes outside triage, and at the end.

## Triage each PR

Triage the board's PRs one at a time, in its order, as their reviews land. When none is ready, say in a line which reviews are running and stop there: a subagent finishing wakes this session. Don't poll.

For each PR:

1. Check the head with `fetch` (the skill's "Keep up with the head"). If it moved, send the PR back to its reviewer with the new commits, set it to `reviewing`, and go on to the next ready PR.
2. Send the board as a message of its own, with the PR in triage marked, so the user knows which PR the questions are about. Don't print the PR's summary here, since script output partway through a turn gets narrated past; run `summarize-github-pr` for the confirmation instead.
3. Triage with the user from the review's results, and check the head again before the final confirmation, as the skill describes.
4. Once the user confirms, start the posting subagent below, set the PR to `posting`, and go on to the next ready PR. If the user finishes without posting, mark it `skipped`.

## Post in the background

Start a background subagent with a fresh context and this prompt, followed by the confirmed content:

> Post a review the user has confirmed on PR #<n>, in the checkout at `<repo root>`, for a github-pr review queue. Load the `github-pr` skill and follow its "Post" section with exactly the content below. Change none of the content. If a check fails, post nothing and return what it reported. Return the URLs of what was posted.

The content is the `head_sha` it was formed against, the event and body, each inline comment with its path and line, each thread reply with its root comment ID, the threads to resolve, and the commits the text cites, each exactly as the user confirmed it.

When it returns, mark the PR `posted` with its event. When a check failed, mark it `needs you` and bring it back once the PR in triage is settled: a moved head sends it back to its reviewer, and any other fix changes what the user confirmed, so confirm again.

## Finish

When every PR on the board is posted or skipped, summarize what was posted, with each event, what was skipped, how PRs were grouped and why, and anything still needing the user.

A later run in this session starts a new board with the PRs still being worked, then the new ones. A PR already on this session's board keeps its stage when `ready` reports it `new` again, which it does until its review posts; it never gets a second reviewer in the same session. A posted PR drops off once `ready` reports it `reviewed`. A PR skipped without posting stays `skipped` here unless the user asks, since the skip was their call.
