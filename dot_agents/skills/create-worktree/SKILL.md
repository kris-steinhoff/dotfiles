---
name: create-worktree
description: Deterministic dispatch primitive that creates a git + Herdr worktree on a branch. Reach for it as a step in a Herdr dispatch, or directly when a user wants only a worktree on a branch. It assembles the worktree, resolves name collisions by suffixing, and converges on re-run, so no caller runs a check-then-retry loop. Not for raw Herdr control (use the herdr skill for that). Requires HERDR_ENV=1.
---

# create-worktree

A Herdr dispatch primitive. Run the script; read its one-line JSON result. It is deterministic, idempotent, and self-contained, so a caller trusts those properties instead of re-checking them.

```bash
scripts/create-worktree --branch <name> [--base <ref>] [--label <text>] [--repo <path>] [--workspace <id>] [--path <path>]
```

Load once per session; takes no `args`. Run the script above directly via Bash for each branch you process — don't re-invoke this skill per item.

Requires `HERDR_ENV=1`; it drives the `herdr` CLI. `--repo` is the git repo the collision and re-run checks run against. It defaults to the `--workspace`'s repo root when that is given, else the current directory.

Two optional flags place a worktree somewhere other than Herdr's default location, such as flat inside a bare-backed container (a directory holding the bare repo in `.bare/` and a `.git` file pointing at it). Without them, behavior is unchanged.

- `--workspace <id>` has Herdr create from that workspace rather than from `--repo`'s directory. A bare-backed container's worktrees are created from the container's own workspace. Passing a `--repo` that is a different repo from the workspace's is refused as needs-judgment, since the script would otherwise check one repo and create in another.
- `--path <path>` is where the checkout goes, typically `<container>/<branch>`. A relative path resolves against the current directory.

## What it does

It creates the git worktree and the Herdr workspace on `--branch`, stamps a provenance marker (`<path>/.herdr-dispatch.json`) so teardown can later recognize it as dispatch-created, and returns the shell pane to launch an agent in.

Collisions and re-runs are handled without a caller loop:

- A worktree already on the exact branch **that carries our marker** is our own prior creation, so it is reused (`created: false`).
- A worktree already on that branch that is **not** ours is a real collision, so the branch is auto-suffixed (`-2`, `-3`, ...) to the next free name and created fresh.
- Otherwise it creates fresh on the requested branch, checking out an existing bare branch if one is there. This is what makes `fetch-pr-head` then `create-worktree` chain cleanly.

With `--path`, the path takes part in both rules:

- Convergence stays keyed on the branch. Our own worktree on the branch is reused wherever it sits, and `path` reports where that is, even if it differs from the `--path` asked for (git can't check the branch out twice anyway).
- A branch collision suffixes branch and path together, so `foo` at `<dir>/foo` becomes `foo-2` at `<dir>/foo-2`, taking the first suffix free for both.
- When only the path is occupied, only the path is suffixed: `pr-254` stays `pr-254`, at `<dir>/pr-254-2`. Renaming the branch would cut a new one from the base and drop an existing branch's commits, such as a PR head `fetch-pr-head` just fetched. A re-run then converges on that worktree by its branch.
- A path is occupied if anything is there, an empty directory included, or if git still has a worktree registered there after its directory was deleted.

## Output (stdout, JSON)

`{ workspace_id, path, pane_id, branch, created }`

- `branch` is the final name after any collision suffix, and `path` the final checkout path.
- `created` is `false` only when it converged onto our own existing worktree; `true` when a fresh worktree was created this run.

## Exit codes

- `0` — success, result on stdout.
- `2` — needs judgment: not running inside Herdr (`HERDR_ENV != 1`), or `--repo` and `--workspace` name different repos. stdout is `{"status": "needs_judgment", "reason": ...}`.
- `1` — real error (git or herdr failed, or malformed herdr JSON). Diagnostics on stderr.

A name collision is never an error; it is resolved by suffixing.
