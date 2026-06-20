#!/bin/bash

# Claude Code status line.
# Receives session JSON on stdin and prints a single status line:
#   context % | cost | lines changed | elapsed | dir (branch) [model] style

input=$(cat)

# Pull every field we need in a single jq pass (tab-separated).
IFS=$'\t' read -r raw_dir model style cost pct added removed duration_ms <<EOF
$(printf '%s' "$input" | jq -r '
  [ (.workspace.current_dir // .cwd // ""),
    (.model.display_name // "?"),
    (.output_style.name // "default"),
    (.cost.total_cost_usd // 0),
    (.context_window.used_percentage // 0),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0),
    (.cost.total_duration_ms // 0)
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
printf "${ctx_color}%.0f%%${RESET} ${DIM}|${RESET} \$%.2f ${DIM}|${RESET} ${GREEN}+%s${RESET}/${RED}-%s${RESET} ${DIM}|${RESET} ${DIM}%s${RESET}" \
    "${pct:-0}" "${cost:-0}" "$added" "$removed" "$(human_duration "$duration_ms")"
printf " ${DIM}|${RESET} ${DIM}%s${RESET}" "$dir"
[ -n "$branch" ] && printf " ${MAGENTA}(%s)${RESET}" "$branch"
printf " ${BLUE}[%s]${RESET} ${DIM}%s${RESET}\n" "$model" "$style"
