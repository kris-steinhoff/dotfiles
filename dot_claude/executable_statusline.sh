#!/bin/bash

# Claude Code status line.
# Receives session JSON on stdin and prints a single status line, `|`
# separating four sections:
#   context % cost lines changed elapsed | dir (branch) | model style effort | quotas

input=$(cat)

# Pull every field we need in a single jq pass, joined with a unit
# separator (not @tsv/tab): `read` treats tab as IFS whitespace and
# collapses consecutive delimiters, which silently shifts every field
# after an empty one (e.g. an absent effort level or rate limit).
IFS=$'\x1f' read -r raw_dir model style effort cost pct added removed duration_ms rl5h rl5h_secs rl7d rl7d_secs <<EOF
$(printf '%s' "$input" | jq -r '
  [ (.workspace.current_dir // .cwd // ""),
    (.model.display_name // "?"),
    (.output_style.name // "default"),
    (.effort.level // ""),
    (.cost.total_cost_usd // 0),
    (.context_window.used_percentage // 0),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0),
    (.cost.total_duration_ms // 0),
    (.rate_limits.five_hour.used_percentage // ""),
    (if .rate_limits.five_hour.resets_at then (.rate_limits.five_hour.resets_at - now) else "" end),
    (.rate_limits.seven_day.used_percentage // ""),
    (if .rate_limits.seven_day.resets_at then (.rate_limits.seven_day.resets_at - now) else "" end)
  ] | join("\u001f")')
EOF

# Show just the final path component, and grab the git branch (if any).
dir="${raw_dir##*/}"
[ -z "$dir" ] && dir="/"
branch=$(git -C "$raw_dir" branch --show-current 2>/dev/null)

# Color codes.
RESET="\033[0m"
DIM="\033[2m"
BLUE="\033[34m"
MAGENTA="\033[35m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

# Color the context figure by how full the window is.
pct_round=$(printf '%.0f' "${pct:-0}")
if (( pct_round >= 80 )); then
    ctx_color="$RED"
elif (( pct_round >= 60 )); then
    ctx_color="$YELLOW"
else
    ctx_color="$GREEN"
fi

# Single-unit duration, e.g. "34m", "3h", "2d". Used for both elapsed
# session time and time remaining until a rate-limit window resets.
human_duration() {
    local s
    s=$(printf '%.0f' "${1:-0}")
    (( s < 0 )) && s=0
    if   (( s < 60 ));    then printf '%ds' "$s"
    elif (( s < 3600 ));  then printf '%dm' $(( s/60 ))
    elif (( s < 86400 )); then printf '%dh' $(( s/3600 ))
    else                       printf '%dd' $(( s/86400 ))
    fi
}

rl_color() {
    local v=$(printf '%.0f' "${1:-0}")
    if   (( v >= 90 )); then printf '%s' "$RED"
    elif (( v >= 75 )); then printf '%s' "$YELLOW"
    elif (( v >= 50 )); then printf '%s' "$GREEN"
    else                     printf '%s' "$DIM"
    fi
}

# Print one rate-limit window: colored percent, then a dim "(time left)"
# once we know when it resets.
print_rl() {
    local pct="$1" secs="$2"
    [ -z "$pct" ] && return
    printf " $(rl_color "$pct")%.0f%%${RESET}" "$pct"
    [ -n "$secs" ] && printf " ${DIM}(-%s)${RESET}" "$(human_duration "$secs")"
}

# Section 1: session stats (context %, cost, lines changed, elapsed time).
printf "${ctx_color}%.0f%%${RESET} \$%.2f ${GREEN}+%s${RESET}/${RED}-%s${RESET}" \
    "${pct:-0}" "${cost:-0}" "$added" "$removed"

# Omit elapsed time until it rounds to at least a full second
# (sub-second durations before the first API response read as a glitch).
if [ -n "$duration_ms" ] && [ "${duration_ms:-0}" -ge 1000 ]; then
    printf " ${DIM}%s${RESET}" "$(human_duration $(( duration_ms / 1000 )))"
fi

# Section 2: directory and git branch.
printf " ${DIM}|${RESET} ${DIM}%s${RESET}" "$dir"
[ -n "$branch" ] && printf " ${MAGENTA}%s${RESET}" "$branch"

# Section 3: model, reasoning effort (if supported), output style
# (only when it's not the default).
printf " ${DIM}|${RESET} ${BLUE}%s${RESET}" "$model"
[ -n "$effort" ] && printf " ${DIM}%s${RESET}" "$effort"
[ "$style" != "default" ] && printf " ${DIM}%s${RESET}" "$style"

# Section 4: rate-limit quotas, only when present.
if [ -n "$rl5h" ] || [ -n "$rl7d" ]; then
    printf " ${DIM}|${RESET}"
    print_rl "$rl5h" "$rl5h_secs"
    print_rl "$rl7d" "$rl7d_secs"
fi

printf "\n"
