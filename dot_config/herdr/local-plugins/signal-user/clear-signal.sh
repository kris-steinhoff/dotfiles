#!/bin/sh
# Herdr event hook for the signal-user plugin.
#
# An agent raises a signal (✋, ✓, or `…`) with the signal-user skill, which
# records its own pane in the workspace's `signal_pane` token. This takes a ✋
# or ✓ down when that pane's agent goes back to `working`, because the user
# replying is what ends it. A `…` outlives the agent's turns (the user can chat
# with it while CI runs), so the skill clears it when the wait ends, and this
# leaves it alone. Any signal comes down when the raising pane closes.
# Activity in any other pane of the workspace leaves the signal alone, so a
# busy worker can't clear a coordinator's.
#
# Runs on every agent status change in every pane, so it exits as early as it
# can, and it always exits 0: a failed hook has nothing useful to report.

# Herdr runs hooks without a login shell; make Homebrew's jq findable.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
HERDR="${HERDR_BIN_PATH:-herdr}"

event="${HERDR_PLUGIN_EVENT_JSON:-}"
[ -n "$event" ] || exit 0

# A status change carries agent_status; act only on `working`. A closed pane
# carries none, and neither does an agent leaving its pane, and both mean the
# agent that raised the signal is gone.
status="$(printf '%s' "$event" | jq -r '.data.agent_status // empty' 2>/dev/null)"
[ -z "$status" ] || [ "$status" = "working" ] || exit 0

pane="$(printf '%s' "$event" | jq -r '.data.pane_id // empty' 2>/dev/null)"
ws="$(printf '%s' "$event" | jq -r '.data.workspace_id // empty' 2>/dev/null)"
[ -n "$pane" ] && [ -n "$ws" ] || exit 0

tokens="$("$HERDR" workspace get "$ws" 2>/dev/null | jq -c '.result.workspace.tokens // {}' 2>/dev/null)"
owner="$(printf '%s' "$tokens" | jq -r '.signal_pane // empty' 2>/dev/null)"
[ "$owner" = "$pane" ] || exit 0

# Resuming ends a ✋ or ✓, not a `…`. A resume caused by the agent's own
# wrapped wait finishing isn't the user replying: the skill leaves a
# `signal_skip` note naming the pane just before that wakeup, so let one resume
# pass and remove the note.
if [ "$status" = "working" ]; then
	signal="$(printf '%s' "$tokens" | jq -r '.signal // empty' 2>/dev/null)"
	case "$signal" in
	"✋"* | "✓"*) ;;
	*) exit 0 ;;
	esac
	if [ "$(printf '%s' "$tokens" | jq -r '.signal_skip // empty' 2>/dev/null)" = "$pane" ]; then
		"$HERDR" workspace report-metadata "$ws" --source signal-user:plugin \
			--clear-token signal_skip >/dev/null 2>&1
		exit 0
	fi
fi

"$HERDR" workspace report-metadata "$ws" --source signal-user:plugin \
	--clear-token signal --clear-token signal_pane --clear-token signal_skip >/dev/null 2>&1
exit 0
