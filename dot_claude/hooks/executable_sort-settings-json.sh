#!/bin/sh
# ConfigChange hook (matcher: user_settings). Claude Code rewrites
# ~/.claude/settings.json with its own key ordering on every internal
# change (e.g. saving a permission), which makes `chezmoi apply` treat the
# file as externally modified even when nothing meaningful changed. Keeping
# the live file's keys sorted the same way as the checked-in copy (also
# kept sorted, via the pretty-format-json pre-commit hook) means ordering
# never causes a spurious diff, only real content changes do.
#
# Both Claude Code and this hook do a read-modify-write on the same file with
# no lock between them, so the write here must not create a window where a
# reader sees a truncated file. A plain `> file` truncates before writing:
# if Claude reads settings.json in that window it sees `{}`, then persists its
# own change on top of that empty base, leaving a thin or empty file. So:
#   - snapshot the content once and sort that exact snapshot,
#   - re-read just before writing and bail if the file changed under us
#     (the next ConfigChange will re-sort), and
#   - write to a temp file and rename it into place (an atomic, same-dir mv),
#     so no reader ever observes a partial file.

set -eu

command -v jq >/dev/null 2>&1 || exit 0

hook_input="$(cat)"
config_path="$(printf '%s' "$hook_input" | jq -r '.config_path // empty' 2>/dev/null || true)"
[ -n "$config_path" ] || config_path="$HOME/.claude/settings.json"
[ -f "$config_path" ] || exit 0

# One read, sorted from that same snapshot (not a second, possibly-newer read).
current="$(cat "$config_path")" || exit 0
sorted="$(printf '%s' "$current" | jq -S . 2>/dev/null)" || exit 0
[ "$sorted" != "$current" ] || exit 0

# If a concurrent writer touched the file since we snapshotted it, do not
# clobber their write with our stale sort. Let the next ConfigChange handle it.
now="$(cat "$config_path")" || exit 0
[ "$now" = "$current" ] || exit 0

# Atomic write: rename over the target so no reader sees a truncated file.
tmp="$(mktemp "${config_path}.XXXXXX")" || exit 0
trap 'rm -f "$tmp"' EXIT
if printf '%s\n' "$sorted" >"$tmp"; then
  mv -f "$tmp" "$config_path"
fi
