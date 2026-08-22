#!/bin/sh
# ConfigChange hook (matcher: user_settings). Claude Code rewrites
# ~/.claude/settings.json with its own key ordering on every internal
# change (e.g. saving a permission), which makes `chezmoi apply` treat the
# file as externally modified even when nothing meaningful changed. Keeping
# the live file's keys sorted the same way as the checked-in copy (also
# kept sorted, via the pretty-format-json pre-commit hook) means ordering
# never causes a spurious diff, only real content changes do.

set -eu

command -v jq >/dev/null 2>&1 || exit 0

hook_input="$(cat)"
config_path="$(printf '%s' "$hook_input" | jq -r '.config_path // empty' 2>/dev/null || true)"
[ -n "$config_path" ] || config_path="$HOME/.claude/settings.json"
[ -f "$config_path" ] || exit 0

sorted="$(jq -S . "$config_path" 2>/dev/null)" || exit 0
current="$(cat "$config_path")"

if [ "$sorted" != "$current" ]; then
  printf '%s\n' "$sorted" >"$config_path"
fi
