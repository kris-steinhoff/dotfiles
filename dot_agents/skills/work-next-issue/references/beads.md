# Beads

If the repository ships its own beads skill or instructions, those win. This is the portable subset.

## Finding and reading work

```bash
bd ready                  # issues with no unmet blockers
bd list --status=open     # everything open
bd show <id>              # read it fully before claiming it
bd blocked                # what is stuck and on what
```

`bd ready --json` and `bd show <id> --json` give parseable output. `bd show` returns a JSON array, not an object.

Read `notes` before starting. Beads carries notes forward across attempts, so an issue that was worked before and left open usually explains itself there.

## Claiming and closing

```bash
bd update <id> --claim
bd close <id>
bd close <id> --reason="..."
bd close <id1> <id2>              # several at once
bd close <id> --suggest-next      # shows what this unblocks
```

## Recording as you go

```bash
bd update <id> --notes="..."      # what you learned, for the next session
bd update <id> --design="..."     # decisions made
bd create --title="..." --description="..." --type=task --priority=2
bd create ... --parent=<id>       # child of an epic or task
bd dep add <issue> <depends-on>
```

Priority is `0`-`4` or `P0`-`P4`, not `high`/`medium`/`low`.

Follow-up work found mid-issue belongs in a new issue, not in the current one's scope. File it and keep going.

## Memory

```bash
bd remember "..."                 # persists across sessions
bd memories <keyword>
bd remember --key <key> "..."     # update in place
```

Where a repo uses beads, prefer `bd remember` over writing memory files.

## Gotchas

- **Never run `bd edit`.** It opens `$EDITOR` and blocks until a human intervenes. Use `bd update --notes` / `--description` / `--title` instead.
- `bd` resolves its workspace from the current directory. Run it inside the repository. Outside one, `bd show <id>` exits 1 in a way that looks identical to a bad issue id.
- A mismatch between the repo you are in and the issue you are working produces "no issue found" on every command. `bin/issue-branch` checks this up front for exactly that reason.
- `bd dolt push` publishes issue data to the shared remote. Whether that is yours to run is the repository's call, not this skill's.
