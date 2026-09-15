#!/bin/sh
# Toggle an attention flag on the focused agent.
#
# herdr auto-clears the sidebar "attention" dot once you view a done/blocked
# agent, and offers no way to re-raise it. This prepends a "⚑ " marker to the
# agent's name instead, giving a persistent, manual "come back to this" flag
# that survives being viewed. Pressing the bound key again removes it.
#
# Bound from config.toml as a [[keys.command]] (type = "shell"). herdr injects
# HERDR_ACTIVE_PANE_ID and HERDR_BIN_PATH into the environment. Fails silently
# (exit 0) so a missing agent or a transient API hiccup never surfaces noise.
set -eu

HERDR="${HERDR_BIN_PATH:-herdr}"
FLAG='⚑ '

# `api snapshot` wraps the SessionSnapshot under .result.snapshot; unwrap it so
# the queries below can address .agents / .focused_pane_id directly.
snap="$("$HERDR" api snapshot 2>/dev/null | jq -c '.result.snapshot')" || exit 0
[ -n "$snap" ] && [ "$snap" != "null" ] || exit 0

pane="${HERDR_ACTIVE_PANE_ID:-}"
[ -n "$pane" ] || pane="$(printf '%s' "$snap" | jq -r '.focused_pane_id // empty')"
[ -n "$pane" ] || exit 0

# Do nothing unless this pane actually hosts an agent.
[ "$(printf '%s' "$snap" | jq -r --arg p "$pane" 'any(.agents[]?; .pane_id == $p)')" = "true" ] || exit 0

# Read the agent record for this pane. `name` is the manual override that
# rename/--clear control; display_agent/agent are the auto-detected label.
field() {
	printf '%s' "$snap" | jq -r --arg p "$pane" \
		".agents[]? | select(.pane_id == \$p) | ($1 // \"\")"
}
name="$(field .name)"
display="$(field .display_agent)"
agent="$(field .agent)"

case "$name" in
"$FLAG"*)
	# Already flagged: strip it. Clear back to the auto label when the
	# remainder is just that label, otherwise keep the manual name.
	base="${name#"$FLAG"}"
	if [ -z "$base" ] || [ "$base" = "$display" ] || [ "$base" = "$agent" ]; then
		"$HERDR" agent rename "$pane" --clear
	else
		"$HERDR" agent rename "$pane" "$base"
	fi
	;;
*)
	# Not flagged: prepend the marker to whatever label is showing.
	label="$name"
	[ -n "$label" ] || label="$display"
	[ -n "$label" ] || label="$agent"
	[ -n "$label" ] || label="agent"
	"$HERDR" agent rename "$pane" "$FLAG$label"
	;;
esac
