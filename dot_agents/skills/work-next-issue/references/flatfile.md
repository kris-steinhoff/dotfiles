# Flat-file trackers

A markdown list, or a directory of one file per issue, committed to the repository. Common in small or new projects, and the right amount of tracker for many of them.

## Find the file first

Look for `TODO.md`, `BACKLOG.md`, `ROADMAP.md`, `PLAN.md`, `docs/todo.md`, or an `issues/` directory. Read enough of it to learn the conventions in use before editing, because these are always local inventions and never quite match each other.

What to work out:

- How is an item marked done? `- [x]`, a `~~strikethrough~~`, moving it to a "Done" section, deleting it, or renaming the file.
- Is there an order? Top of the list, a priority marker, a "Next up" heading.
- Does an item have an id worth putting in a branch name or commit?

If the conventions are not obvious from the file, ask rather than inventing one. A tracker like this has no schema to correct you.

## Working it

Take the first item that is unblocked and not already marked in progress. Since there is no claim mechanism, marking it in progress in the file and committing that is the only signal to a parallel session. Whether that is worth a commit depends on whether anyone else is working the repo. If it is just you, skip it.

Close by editing the file in the same commit as the work, so the record and the change land together. That is the one real advantage of this format over a hosted tracker, and it disappears if you split them.

## Branch names

Flat-file items rarely have ids. Use a short slug instead:

```bash
bin/issue-branch --repo . --issue add-retry-backoff --no-check
```

`--no-check` because there is no tracker to resolve against. This is the one place where skipping the check is the correct call rather than a shortcut.

## When to suggest something more

A flat file stops paying for itself when items start depending on each other, when more than one person or session works the list, or when items accumulate history worth keeping. Dependencies are the clearest signal, because a flat list cannot express them and people start encoding them in prose that nothing reads.

Mention it once if you notice. Do not migrate anything unasked.
