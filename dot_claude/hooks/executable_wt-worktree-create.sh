#!/bin/sh
# WorktreeCreate hook. Claude Code would otherwise make its worktrees in
# <repo>/.claude/worktrees on a worktree-<name> branch; this hands creation to
# wt, so Claude's worktrees land in <repo>/.worktrees/<name> on a plain <name>
# branch, cut from freshly fetched origin/<default> with no upstream, like
# every other worktree. Claude takes the last line of stdout as the path, and
# wt add prints only that path there, with its messages on stderr. A non-zero
# exit fails the creation, which is the right outcome when wt refuses.
#
# The hook replaces Claude's own git worktree add entirely, so Claude no longer
# copies .worktreeinclude files; wt's per-repo wt.setup is the place for that.

set -eu

# Hooks don't get the interactive shell's PATH, and wt runs through uv.
PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

input="$(cat)"
name="$(printf '%s' "$input" | jq -r '.name // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
[ -n "$name" ] || {
  echo "wt-worktree-create: no name in the hook input" >&2
  exit 1
}
[ -z "$cwd" ] || cd "$cwd"

exec wt add "$name"
