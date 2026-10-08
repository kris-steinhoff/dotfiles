#!/bin/sh
# Dismiss an agent's ✋🏻 or ✓ on the focused workspace.
#
# Both signals (see the signal-user skill) are addressed to the user, and both
# clear when the user replies to that agent. This key is for dealing with one
# some other way: a ✓ result handled elsewhere, such as a PR approved on
# GitHub, or a ✋🏻 answered elsewhere or gone stale. It leaves a `…` alone, since
# that asks nothing of the user and ends with the thing it waits on.
#
# Bound from config.toml as a [[keys.command]] (type = "shell"). herdr injects
# HERDR_ACTIVE_WORKSPACE_ID, HERDR_ACTIVE_PANE_ID, and HERDR_BIN_PATH. Fails
# silently (exit 0) so a transient API hiccup never surfaces noise.

HERDR="${HERDR_BIN_PATH:-herdr}"

ws="${HERDR_ACTIVE_WORKSPACE_ID:-}"
if [ -z "$ws" ] && [ -n "${HERDR_ACTIVE_PANE_ID:-}" ]; then
	ws="$("$HERDR" pane get "$HERDR_ACTIVE_PANE_ID" 2>/dev/null | jq -r '.result.pane.workspace_id // empty')"
fi
[ -n "$ws" ] || exit 0

signal="$("$HERDR" workspace get "$ws" 2>/dev/null | jq -r '.result.workspace.tokens.signal // empty')" || exit 0
case "$signal" in
"✋"* | "✓"*)
	"$HERDR" workspace report-metadata "$ws" --source signal-user:key \
		--clear-token signal --clear-token signal_pane --clear-token signal_skip >/dev/null 2>&1
	;;
esac
exit 0
