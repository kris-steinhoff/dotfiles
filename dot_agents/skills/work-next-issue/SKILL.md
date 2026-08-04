---
name: work-next-issue
description: Work one tracker issue end to end on its own branch, optionally in a worktree, one issue per session. Invoke when asked to work the next ready issue, take the top of the queue, pick up available work, start the next piece of work, or resume an issue left unfinished. Covers beads, GitHub Issues, Linear, and flat-file trackers.
---

# Work next issue

A personal workflow for working a tracker's queue one issue at a time. One issue, one branch, one session.

There is no supervisor process and no outer loop. A human starts each session, which is what gives every issue a fresh agent with clean context. That is the entire reason this is a skill and not an application.

## The rule that outranks everything below

**This skill owns the workflow. The repository owns the specifics.**

Before doing anything else, read the repository's own instructions and let them override this file wherever they disagree: `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, and any `.agents/skills/` or `.claude/skills/` the project ships.

If the repo states how to run tests, how to name a branch, which tracker it uses, or how to write a commit message, that is the answer. Nothing here is a default worth defending against a repo that has decided.

Never carry an assumption from another repository into this one. This skill lives in a home directory and applies everywhere, so its only safe content is workflow shape.

## When you do not know, ask

A guess that is wrong gets discovered late, usually after work has been committed against it. Ask about: which issue to take when the queue is ambiguous, which tracker to use when detection finds none or finds two, whether to branch or work in place, and anything the repository's instructions leave open.

Asking is a small interruption. Guessing is a quiet one.

## Workflow

### 1. Orient

Confirm which repository you are in and read its instructions, as above.

Detect the tracker and load the matching reference:

| Signal                                          | Tracker | Reference                                        |
| ----------------------------------------------- | ------- | ------------------------------------------------ |
| `.beads/` directory, or `bd` works here         | beads   | [references/beads.md](references/beads.md)       |
| GitHub remote with Issues enabled               | GitHub  | [references/github.md](references/github.md)     |
| Linear config, or the repo's docs say so        | Linear  | [references/linear.md](references/linear.md)     |
| `TODO.md`, `BACKLOG.md`, `issues/`, `docs/todo` | flat    | [references/flatfile.md](references/flatfile.md) |

If more than one matches, the repository's instructions decide. If they are silent, ask.

### 2. Pick

Get the ready queue from the tracker and propose one issue. Read it in full before claiming it, including its acceptance criteria and any notes from earlier attempts.

An issue that was worked before and left open usually has a reason recorded on it. Read that before repeating the attempt.

Claim it, so a parallel session does not take the same one.

### 3. Branch

For anything beyond a trivial fix, work on a branch. `bin/issue-branch` creates one, and confirms first that the issue actually lives in the repository you named:

```bash
~/.agents/skills/work-next-issue/bin/issue-branch --repo /path/to/repo --issue <issue-id>
```

It prints the worktree path on stdout. `--check` verifies the repo and issue match without creating anything, and `--no-worktree` makes the branch in place.

This check exists because of a specific failure: an agent working issues from one repository inside a worktree of a different one. Every tracker command fails with "no issue found", which reads like the tracker is broken rather than like you are in the wrong directory. The script makes that impossible to start.

Open the worktree however you normally work. With herdr:

```bash
herdr worktree open --path <printed-path>
```

### 4. Work

Follow the repository's conventions, not your habits.

Keep the issue updated as you go if the tracker supports it, especially when you learn something that changes the shape of the work. A future session with no memory of this one will read those notes.

### 5. Verify

Run the repository's own gates before claiming anything is done. Tests, linter, formatter, type checker, whatever its instructions name. If you cannot run them, say so plainly rather than reporting success you did not observe.

If the issue has acceptance criteria, check them one at a time and say which ones you confirmed and how.

### 6. Close

Commit in the repository's style. Close the issue in the tracker, referencing the commit.

**Closing the issue is the step most often skipped.** Work gets done, gets committed, and the issue stays open. Check it explicitly before you report.

### 7. Stop

Stop after one issue. Report what happened and let the human start the next session.

Do not pick up the next issue. The value of this workflow is that every issue starts with an agent that has not spent its context on the last one, and continuing throws that away for a short-term convenience.

## What this deliberately does not do

No retry ladders, no outcome classification, no unattended runs, no concurrency, no progress dashboard. Those are all machinery for working without a person watching, and here a person is watching.

The one they replace worth naming: if a session ends without closing its issue, the issue is still in the ready queue next time. The queue is the check. A later session reads the commit and closes it in one turn, which costs less than any mechanism for preventing it.

If you find yourself wanting the machinery back, the trigger is wanting the work to run **unattended**. Not faster, not concurrent. Unattended. That is a different tool and it should be built as one.
