#!/bin/sh
# Toggle a "⚑" flag on the focused workspace.
#
# herdr auto-clears the sidebar "attention" dot once you view a done/blocked
# agent, and offers no way to re-raise it. The ⚑ is a persistent, manual "come
# back to this" marker that survives being viewed. It is a workspace metadata
# token (`flag`) shown on the same sidebar line as an agent's `signal`, kept
# separate so an agent's signal can't wipe it out and it can't hide one. It has
# no TTL and the signal-user plugin never clears it; only this key does.
#
# It leaves agents' signals alone; dismiss-signal.sh, on its own key, is the
# one that dismisses a ✋ or 🏁.
#
# Bound from config.toml as a [[keys.command]] (type = "shell"). herdr injects
# HERDR_ACTIVE_WORKSPACE_ID, HERDR_ACTIVE_PANE_ID, and HERDR_BIN_PATH. Fails
# silently (exit 0) so a transient API hiccup never surfaces noise.

HERDR="${HERDR_BIN_PATH:-herdr}"
FLAG='⚑'

ws="${HERDR_ACTIVE_WORKSPACE_ID:-}"
if [ -z "$ws" ] && [ -n "${HERDR_ACTIVE_PANE_ID:-}" ]; then
	ws="$("$HERDR" pane get "$HERDR_ACTIVE_PANE_ID" 2>/dev/null | jq -r '.result.pane.workspace_id // empty')"
fi
[ -n "$ws" ] || exit 0

tokens="$("$HERDR" workspace get "$ws" 2>/dev/null | jq -c '.result.workspace.tokens // {}')" || exit 0
field() { printf '%s' "$tokens" | jq -r --arg k "$1" '.[$k] // empty'; }

if [ -n "$(field flag)" ]; then
	"$HERDR" workspace report-metadata "$ws" --source flag:key \
		--clear-token flag >/dev/null 2>&1
else
	"$HERDR" workspace report-metadata "$ws" --source flag:key \
		--token "flag=$FLAG" >/dev/null 2>&1
fi
exit 0
