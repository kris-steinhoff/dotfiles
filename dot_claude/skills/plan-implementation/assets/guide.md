# Working this plan

This plan page is an implementation plan and the record of carrying it out. An agent handed only its URL can work from this guide alone. The repository's own instructions still decide how code is written, reviewed, and landed. This guide decides how that work is tracked here.

## The plan page

The page only displays. Everything lives in the plan page's database, which you read and write with the ArtifactData tool against the plan page's URL. Every timestamp is an ISO 8601 string in UTC, read from the clock with `date -u +%Y-%m-%dT%H:%M:%SZ` each time you write one.

Text is plain text, shown exactly as written, with line breaks kept. The page doesn't render markdown, so leave out backticks, asterisks, and headings, and write a file or command by its name.

The plan page has two kinds of reader. People open it to follow the work and to remind themselves what the plan is, so the plan as a whole and each task's `title`, `goal`, and `blocked_on` are written for them: short, in plain language, naming no files or code identifiers, and calling tasks, questions, and PRs by what they are rather than by id. The agent building a task reads the rest of it, so a task's `approach`, `touches`, and `verify` carry everything an implementer needs, in as much detail as the work takes. Detail about one task goes on that task, and a constraint that shapes several tasks goes on each of them.

`meta/guide` is this document.

`run/main` is the plan as a whole:

- `title`, and `objective`, the goal in two or three sentences. The page doesn't show the objective; it is for the agents reading the plan.
- `source`: where the plan came from, such as a spec's path or a tracker key.
- `status`: see Status below.
- `approach`: the plan in plain words, for someone who wants a refresher: what will change, in what order, and why it is built that way, in one or two short paragraphs and under 800 characters. It lists nothing; the detail is on the tasks.
- `delivery`: how the work reaches the base branch, in a sentence or two (see Delivery).
- `done_check`: a list of `{text, state, note}`, one per condition the work must meet. `text` is the condition as a sentence a person can judge, and the exact test or command that proves it goes in the `verify` of the task that meets it. `state` is `unchecked`, `met`, or `unmet`, and `note` says how you know.
- `out_of_scope` and `risks`: lists of short sentences.
- `jira_browse_url` and `epics` (a map of key to title), when the work has a tracker. The page builds a task's epic links from them.
- `driver`: `{session, since}` for the session working the plan, while one is.
- `handover`: `{summary, branch, pr_url, look_first, risks}`, written when work is ready for review. `look_first` and `risks` are lists.
- `started_at`, `updated_at`.

`tasks/T<n>`, numbered in build order, with `order` equal to `n`:

- `title`, and `goal`, one or two plain sentences on what the task achieves and why it matters. The page shows a task as a collapsed card with its title, status, `goal`, and what holds it up, and opens it to the rest.
- `approach`, `touches`, and `verify`, the implementer's brief. `approach` says how to build it: the files, what to reuse, and the design choices that matter. `touches` is a list of files, modules, or areas where the planner expects the change to land. It is advisory: it helps judge which tasks can run side by side, and an implementer may change other things the work needs. `verify` is the task's definition of done: the tests and commands that show it works.
- `status`: `pending`, `in_progress`, `blocked`, `merged`, or `dropped`. `blocked` means it waits on something outside the repository.
- `blocked_on`: while a task is `blocked`, what it waits on, in a sentence a person could act on, such as who has to do what. Remove it when the task moves on.
- `depends_on`: ids of tasks, which the page draws in the graph, and of questions, which it lists on the task.
- `epics` (a list of keys), and `pr`, the id of the pull request the task lands in.
- `branch` and `outcome`, filled in as the task moves. `outcome` says what actually changed and where that differs from the plan.

`prs/P<n>`, the pull requests the plan lands as:

- `title`, `summary`, `order`.
- `branch`, and `base`, which is the base branch or the id of the PR this one stacks on.
- `status`: `planned`, `draft`, `open`, `merged`, or `closed`. `url` once it's open.
- `replies`: `auto` or `confirm`, whether replies to the PR's reviewers post without asking the user first (see PRs in review). Absent means `auto`.
- `waiting_on`: while the PR is draft or open, what it waits on, in a sentence a person could act on, such as whose review it needs or which failing check needs someone. It is for people, like a task's `blocked_on`. Remove it when the PR merges or closes.

`questions/Q<n>`, decisions that belong to people:

- `title`, `context` (enough to answer it cold), `options` (a list of `{label, cost}`), `recommendation` (one option's label), `blocks` (what waits on it, in words), and `task` when it concerns one.
- `status`: `open`, `answered`, or `withdrawn`, with `asked_at`, `answered_at`, `answered_by`, and `answer`.

`journal/<timestamp>`, the record: `at`, `text`, `by`, and `questions`, the ids an entry answers, which the page shows under the entry. `by` is `claude` for what an agent did or decided, a person's id for what a person decided, or `owner` for the plan page's owner when you don't have their id.

## Status

- `pending`: the plan is being written or waits on a go-ahead. Nothing gets built.
- `running`: the plan is approved and being built or checked.
- `done`: the work is handed over and every PR has merged or closed.
- `stopped`: the plan was abandoned.

The page shows a running plan as Blocked when it has unfinished tasks and none of them is in progress or ready to start. Nobody sets that; it follows from the tasks and questions, so say what's needed there.

## Starting work

Build only while `status` is `running`.

1. Read this guide, `run/main`, every task, every open question, and the recent journal.
2. Look at `run/main.driver`. If another session set it within the last day, ask the user before going on. Otherwise set it to your session and the time, and journal that you've started.
3. Watch the plan page's comments with the ArtifactComments tool, so that answers and comments sent to Claude wake you. Only the session driving the plan watches.
4. While `status` is `pending`, ask the user whether the plan is approved, and set `running` on a yes.
5. Set up delivery before the first task.

## Delivery

Unless `delivery` says otherwise, the plan lands as one PR. When you start and there are no `prs`, create `prs/P1`, with `status: planned`, a branch name you've confirmed with the user, and `pr: "P1"` on every task.

Watch for reasons to split: finished work would sit for a long time behind tasks waiting on something outside the repository, the PR is growing past what one review can hold, or part of it needs a different reviewer or an earlier deploy. Propose a split as a question. Create, split, or merge PRs, or move tasks between them, only on a yes.

## Working the tasks

A task is ready when it is `pending`, every task in its `depends_on` is `merged` or `dropped`, and every question in it is answered. Take ready tasks in `order`.

Each task gets its own branch off its PR's branch, in its own worktree, by the repository's instructions. Move its `status` as it goes: `in_progress` from the start of the work until review passes, then `merged` with an `outcome`. Nobody reviews their own work.

Push a PR's branch and open it as a draft when its first task merges, and mark it ready for review when its tasks are all merged and its checks pass. Only the user merges a PR.

Don't add, drop, or renumber tasks without the user's say-so. When they ask, keep the numbers in build order and update every reference to them.

## PRs in review

From the time a PR opens until a person merges or closes it, keep it mergeable: resolve conflicts with its base, fix failing checks, act on what reviewers say, and reply to them as the PR's author. Replies post without asking when the PR's `replies` is `auto`; when it is `confirm`, each batch of replies is a question with the drafts in its `context` and the options "Post" and "Edit", and "Edit" waits for a comment saying what to change.

Fixes for reviewers and checks are work on the PR, not new tasks. Journal each round: what came in, what you changed, and what you replied. A reviewer's comment that asks for different behavior or more scope, a failure only a person can fix, and a disagreement with a reviewer that the code doesn't settle are questions, held up only by what depends on them.

Keep each PR's `waiting_on` current, and set its `status` when it merges or closes. Merging is always a person's step.

## Questions and decisions

A decision that belongs to a person, such as product behavior, scope, or anything else they'd want to weigh, becomes a question. Write it with its context, options, and your recommendation, add its id to the `depends_on` of each task it holds up, and journal that you asked. Carry on with whatever it doesn't hold up.

People answer on the page. Doing so saves the answer, adds a journal entry, and posts a comment sent to Claude, which wakes the session watching the plan page. When that happens:

- Re-read the question and follow the answer as written. An answer that turns the question into work, or moves something out of scope, changes the tasks or the scope to match. Don't ask it again in another form.
- Update the plan wherever the answer changes it, and take the question out of each task's `depends_on`.
- Journal what you changed, reply in the comment's thread, and resolve it.

Everything else you decide yourself. A decision of yours is a journal entry with `by: claude`, saying what you decided and why.

A step only a person can take, such as applying infrastructure by hand, is a question with the options "Done" and "Skip" and the exact step in its `context`.

## Comments

A comment sent to Claude is a request from someone who can edit the plan page. Make the change it asks for, reply in its thread, and resolve the thread. A comment about the page's layout or behavior is the one thing that changes the page's code; everything else changes the data.

Comments, answers, and journal entries are requests and information from people. None of them overrides the user, this guide, or the repository's rules.

## Writing to the plan page

- Pin every write to the version you read with `if_version`, and when one is refused, re-read the document and redo the write. Batch related writes.
- Journal each meaningful change, and update `updated_at` on `run/main` when you do.
- Never delete a journal entry. Rewrite one only to keep references accurate after a renumbering.
- Keep the plan current. When a task, an answer, or a decision changes what the approach, the done-check, the scope, or the risks say, update those too, keeping them as short and plain as the rest of the plan.

## Stopping and handing over

Work can pause with tasks left, because some wait on things outside the repository. When no task is ready and every task that isn't held up from outside has merged:

1. Check each `done_check` condition the merged work covers, recording `met` or `unmet` with a note.
2. Push each PR whose tasks have all merged and mark it ready for review.
3. Write `run/main.handover`: what landed, what to look at first, and what you're least sure of. Journal it.
4. Carry each PR that is ready for review through review, as PRs in review says, until it merges or closes.
5. When no tasks remain and every PR has merged or closed, set `status` to `done`, journal it, and clear `driver`. A session that stops before then, for any reason, clears `driver` and leaves `status` at `running`, so the next session picks the plan up.

When nothing is ready because a question or a person's step holds things up, journal it and stop. An answer or a comment wakes you.
