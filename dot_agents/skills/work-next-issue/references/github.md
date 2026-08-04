# GitHub Issues

Driven through `gh`, which infers the repository from the remote. Run it inside the repository.

## Finding and reading work

```bash
gh issue list --state open
gh issue list --assignee @me
gh issue list --label ready --json number,title,labels
gh issue view <number>
gh issue view <number> --comments      # the comments usually carry the real state
```

GitHub has no dependency graph, so there is no true ready queue. Whatever stands in for one is a convention: a `ready` label, a milestone, a project board column, or position in a pinned tracking issue. Read the repository's instructions to find out which, and ask if they do not say.

## Claiming and closing

```bash
gh issue edit <number> --add-assignee @me
gh issue comment <number> --body "..."
gh issue close <number> --comment "..."
```

A commit body containing `Closes #<number>` closes the issue when it lands on the default branch. That is the usual path, but it only fires on merge, so an issue can look open for a while after the work is done. Say which mechanism you used when you report.

## Branches

```bash
gh issue develop <number> --checkout    # branch named from the issue, linked to it
```

Useful when the repo wants the GitHub link between branch and issue. Otherwise `bin/issue-branch` is fine and does not need network access.

## Reading JSON

`gh` takes `--json <fields>` and pairs with `jq`. Prefer that over piping into a one-off script:

```bash
gh issue list --state open --json number,title,labels \
  | jq -r '.[] | select(.labels[].name == "ready") | "\(.number)\t\(.title)"'
```

## Gotchas

- `gh issue view` on a pull request number succeeds and returns the PR. Confirm you have an issue.
- Issue numbers are shared with pull requests, so `#41` may be either.
- Check `gh auth status` before concluding an issue does not exist. An expired token reads as a missing issue.
