---
name: herdr-pr-worktree
description: "Check out a GitHub pull request's branch into a Herdr worktree workspace, under the PR's own branch name. Use when the user asks to open a PR locally, get a PR's code on disk, check out a PR in a worktree, or look at a PR's branch without disturbing the current checkout. Requires HERDR_ENV=1."
---

# Herdr PR worktree

Puts one pull request's branch in its own worktree, opened as a Herdr workspace, without touching the current checkout.

The local branch keeps the PR's own branch name. No `pr-123` renaming, so the branch reads the same locally as it does on GitHub and in the PR page.

This skill assumes the `herdr` skill for CLI discovery, ID handling, and the safety rules. It does not repeat them.

It creates the worktree and stops. It does not start an agent. Compose it with `herdr-pr-review` or start an agent yourself if that is what you want.

## Run it

```bash
scripts/pr-worktree [<pr>] [--path <path>] [--no-focus] [--no-update] [--vacate]
```

With no argument it takes the current branch's pull request. It checks `HERDR_ENV`, resolves the PR, fetches the head, and creates the worktree, printing a JSON summary on stdout:

```json
{ "pr": 1, "branch": "dependabot/uv/python-e5a28babbf", "path": "...", "workspace_id": "w3J", "pane_id": "w3J:p1", "fork": false, "reused": false, "already_open": false, "update": null }
```

Report the path and the workspace to the user, plus `update.status` when it is not `up-to-date` or `fast-forwarded`. That is the whole job.

**Exit 2 means it needs you to decide which PR.** The PR was not named and the current branch has no pull request, or the one named does not exist. Open pull requests are listed on stderr. Ask which, then run it again with that number. Do not guess.

**Exit 3 means the checkout you are sitting in already has the branch.** git allows one checkout per branch, so the worktree cannot have it until that checkout gives it up. This is routine, not an error: it is what happens when someone asks to open the PR they are already on. stderr names the branch, the checkout, and the default branch it would go back to.

Ask the user whether to switch that checkout to the default branch, then re-run with `--vacate`, which switches it and creates the worktree in one pass. It refuses on uncommitted tracked changes rather than stashing them, so if that comes back, report it and let the user commit or stash. Untracked files are left alone and do not block the switch.

Ask first. Vacating moves the user's own working directory to another branch, which is theirs to approve, and the flag exists so that approval is a real choice rather than a default.

**Focus** is on by default, since the user asked to open the PR. Pass `--no-focus` when staging several worktrees at once, or when the user is mid-task and said not to move them.

## Arriving somewhere that already exists

Running it twice on the same PR is normal, so the script is written to converge rather than to fail. It never needs a manual pull or a manual focus afterwards.

| State on disk                             | What happens                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Nothing yet                               | Fetch, create the worktree, open the workspace                                                |
| Branch already checked out in a worktree  | Fast-forward it, then open or focus its workspace, `"reused": true`                           |
| Worktree exists but no Herdr workspace    | `worktree open` attaches one to that path                                                     |
| Workspace already open                    | Same call reports `"already_open": true`, and it is focused                                   |
| Worktree directory deleted, metadata left | `git worktree prune`, then create fresh                                                       |
| Local branch left over, nothing using it  | Fast-forward the branch and check it out rather than creating it again                        |
| Branch checked out in the main checkout   | Exit 3, so you can ask. `--vacate` switches that checkout to the default branch, then creates |

**`update` reports the refresh, and never resolves a conflict for you.** It is `null` on a fresh create and when `--no-update` is passed. Otherwise `status` is one of `up-to-date`, `fast-forwarded` (with `commits`), `ahead` (local commits not on the PR head), `diverged` (force-push or real divergence), `skipped-dirty`, `fetch-failed`, or `merge-failed`. The last four leave the worktree exactly as it was and are worth surfacing to the user, since each one means someone has to decide something. The refresh is a fetch plus `merge --ff-only`, never a reset, so nothing uncommitted is ever at risk.

Pass `--no-update` when the user wants to look at the worktree as they left it.

## Worth knowing

**The directory flattens slashes, the branch does not.** Herdr derives the checkout directory from the branch name with `/` replaced by `-`, so `dependabot/uv/python-e5a28babbf` lands at `~/.herdr/worktrees/<repo>/dependabot-uv-python-e5a28babbf`. The branch inside it, and the workspace label, keep the real name. This is what you want, since the alternative nests empty directories for every path segment.

**It creates a workspace, not a tab.** `worktree create` opens a new Herdr workspace, because a separate checkout is a separate context. This surprises people expecting a tab next to their current work.

**Same-repository PRs come out tracking, forks do not.** For a new branch on `origin`, the script fetches it by name and branches the worktree from `origin/<branch>`, which sets the upstream, so `git push` inside the worktree goes back to the PR. A fork's branch is not on `origin`, so it comes through the pull ref with no upstream, which is correct for someone else's branch. A leftover local branch is checked out as it stands, keeping whatever upstream it already had. If the user needs to push to a fork's PR, run `gh pr checkout <pr>` inside the worktree, which configures the remote for it.

**The refresh runs inside the worktree, not in the repository you called from.** Git refuses to fetch into a branch that some worktree has checked out, so the update fetches and fast-forwards from within that checkout instead. The refresh never depends on an upstream being configured either, since it merges `FETCH_HEAD`, which both the branch fetch and the pull-ref fetch leave behind.

## Cleaning up

Teardown is not in the script, on purpose. Removing a workspace by ID is one typo away from removing someone else's, and this Herdr instance is shared across repositories. Run it by hand:

```bash
herdr worktree remove --workspace <workspace-id>
git branch -D "<branch>"
```

Remove the workspace the script reported, then the local branch, which `worktree remove` leaves behind. For a same-repository PR, `git branch -dr "origin/<branch>"` drops the remote-tracking ref too, if you want it gone.

Remove only the workspace this skill created, by the ID it printed. Never clean up by sweeping `~/.herdr/worktrees/`.

## If the script fails

It prints herdr's or git's own error rather than interpreting it. Read that first.

The script is short and is the specification of the exact commands, so read it before improvising a replacement, and check the current CLI with `herdr worktree create --help`. Herdr's installed binary is always the authority over anything written down here.
