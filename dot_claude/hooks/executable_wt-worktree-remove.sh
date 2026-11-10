#!/bin/sh
# WorktreeRemove hook, the pair of wt-worktree-create.sh. Claude passes the
# path its create hook returned. A worktree in .worktrees goes through
# wt remove, which deletes the branch only when it is merged and otherwise
# exits non-zero with the force command on stderr, so Claude reports the
# removal as failed and the work stays. Claude never deletes branches itself,
# so without this the branches would pile up.
#
# A worktree outside .worktrees (made before this hook existed) gets a plain
# git worktree remove, which also refuses uncommitted work, and keeps its branch.

set -eu

PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

input="$(cat)"
path="$(printf '%s' "$input" | jq -r '.worktree_path // empty')"
[ -n "$path" ] || {
  echo "wt-worktree-remove: no worktree_path in the hook input" >&2
  exit 1
}
[ -d "$path" ] || exit 0

case "$path" in
*/.worktrees/*)
  cd "$path"
  exec wt remove "$(basename "$path")"
  ;;
*)
  common="$(git -C "$path" rev-parse --path-format=absolute --git-common-dir)"
  exec git --git-dir="$common" worktree remove "$path"
  ;;
esac
