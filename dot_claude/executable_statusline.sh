#!/bin/bash

# Claude Code status line.
# Receives session JSON on stdin and prints a single status line:
#   context % | cost | lines changed | elapsed | dir (branch) [model] style

input=$(cat)

# Pull every field we need in a single jq pass (tab-separated).
IFS=$'\t' read -r raw_dir model style cost pct added removed duration_ms rl5h rl7d <<EOF
$(printf '%s' "$input" | jq -r '
  [ (.workspace.current_dir // .cwd // ""),
    (.model.display_name // "?"),
    (.output_style.name // "default"),
    (.cost.total_cost_usd // 0),
    (.context_window.used_percentage // 0),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0),
    (.cost.total_duration_ms // 0),
    (.rate_limits.five_hour.used_percentage // ""),
    (.rate_limits.seven_day.used_percentage // "")
  ] | @tsv')
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

human_duration() {
    local s=$(( ${1:-0} / 1000 ))
    if   (( s < 60 ));   then printf '%ds' "$s"
    elif (( s < 3600 )); then printf '%dm%02ds' $(( s/60 )) $(( s%60 ))
    else                      printf '%dh%dm' $(( s/3600 )) $(( (s%3600)/60 ))
    fi
}

# Everything on one line: context %, cost, lines changed, elapsed time,
# then directory, git branch, model, output style.
rl_color() {
    local v=$(printf '%.0f' "${1:-0}")
    if   (( v >= 80 )); then printf '%s' "$RED"
    elif (( v >= 60 )); then printf '%s' "$YELLOW"
    else                     printf '%s' "$GREEN"
    fi
}

printf "${ctx_color}%.0f%%${RESET} ${DIM}|${RESET} \$%.2f ${DIM}|${RESET} ${GREEN}+%s${RESET}/${RED}-%s${RESET} ${DIM}|${RESET} ${DIM}%s${RESET}" \
    "${pct:-0}" "${cost:-0}" "$added" "$removed" "$(human_duration "$duration_ms")"

if [ -n "$rl5h" ] || [ -n "$rl7d" ]; then
    printf " ${DIM}|${RESET}"
    [ -n "$rl5h" ] && printf " $(rl_color "$rl5h")5h:%.0f%%${RESET}" "$rl5h"
    [ -n "$rl7d" ] && printf " $(rl_color "$rl7d")7d:%.0f%%${RESET}" "$rl7d"
fi

printf " ${DIM}|${RESET} ${DIM}%s${RESET}" "$dir"
[ -n "$branch" ] && printf " ${MAGENTA}(%s)${RESET}" "$branch"
printf " ${BLUE}[%s]${RESET} ${DIM}%s${RESET}\n" "$model" "$style"
