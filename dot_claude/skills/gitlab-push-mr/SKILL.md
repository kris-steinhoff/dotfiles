---
name: gitlab-push-mr
description: Push the current branch to GitLab and open a merge request in one step using `git push` push options (`-o`). Invoke when the user wants to push a branch to GitLab and create an MR, or asks to "push and open an MR".
---

# Push a branch to GitLab and create an MR

GitLab accepts [push options](https://docs.gitlab.com/ee/user/project/push_options.html) that create and configure a merge request as part of `git push`. Use them instead of pushing first and creating the MR through the web UI or a separate API call.

## Steps

1. Confirm the remote is GitLab. Check `git remote get-url <remote>` (usually `origin`). If it doesn't point at a GitLab host, this skill doesn't apply.
2. Find the default branch: `git remote show origin | sed -n 's/.*HEAD branch: //p'`. This is the MR target.
3. Determine the MR title and description. Derive them from the branch's commits, or use what the user supplied.
   - Title: one concise line.
   - Description: more detail if it's warranted. Explain *why* the change is being made when that isn't obvious.
   - Neither should recap the diff. Don't explain what changed — the diff already shows that.
4. Push with the options below.

## Command

```bash
git push -u origin HEAD \
  -o merge_request.create \
  -o merge_request.target=<default-branch> \
  -o merge_request.remove_source_branch \
  -o merge_request.title="<title>" \
  -o merge_request.description="<description>"
```

- `merge_request.create` — opens the MR.
- `merge_request.target=<default-branch>` — targets the repo's default branch.
- `merge_request.remove_source_branch` — deletes the source branch when the MR merges.
- `merge_request.title="..."` — the title from step 3. Quote it.
- `merge_request.description="..."` — the description from step 3. Quote it.

If the branch already has an open MR, GitLab updates it instead of creating a duplicate, so re-running is safe.

## Optional push options

Add these only when the user asks:

- `-o merge_request.draft` — open as a draft.
- `-o merge_request.merge_when_pipeline_succeeds` — auto-merge once the pipeline passes.
- `-o merge_request.label="..."` — add a label (repeat for multiple).
- `-o merge_request.assign="<username>"` / `-o merge_request.reviewer="<username>"` — assign or request review.

After the push, report the MR URL that GitLab prints in the push output.
