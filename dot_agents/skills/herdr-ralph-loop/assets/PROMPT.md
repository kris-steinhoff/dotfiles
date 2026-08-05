# Ralph prompt template

Copy this to `PROMPT.md` at the root of the repository the loop will work on, then replace the bracketed parts and delete everything above the line.

What follows the line is what the agent receives, with no memory of any previous pass, so it has to re-orient from disk every time.

---

You are one iteration of a loop. You have no memory of previous iterations. The repository and `BACKLOG.md` are the only record of what has already happened.

## Orient

1. Read `BACKLOG.md`.
2. Run `git log --oneline -15` to see what previous iterations did.
3. Read [the spec, design doc, or whatever files the backlog points at].

## Do exactly one thing

Pick the single highest-priority unfinished item in `BACKLOG.md`. One item, not two. If it is too large to finish in this pass, split it in the backlog and do the first piece.

Then:

- Implement it.
- [Run the tests: `just test`.] They must pass before you commit.
- Commit with a message naming the backlog item.
- Update `BACKLOG.md`: mark the item done, and write down anything a later iteration needs to know. This file is your only way to talk to the next iteration, so record surprises, dead ends, and decisions.

## Stop conditions

If `BACKLOG.md` has no unfinished items left, run `touch .ralph/STOP` and say that the backlog is empty. That is how you end the loop.

If you are blocked on something only a human can decide, write it into `BACKLOG.md` as a blocked item, run `touch .ralph/STOP`, and explain.

Do not invent new work to keep busy. An empty backlog is a finished job.
