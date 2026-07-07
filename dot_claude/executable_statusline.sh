#!/bin/bash

# Claude Code status line.
# Receives session JSON on stdin and prints a single status line, `|`
# separating four sections:
#   dir (branch) | model style effort | context % lines changed elapsed cost | usage

input=$(cat)

# Pull every field we need in a single jq pass, joined with a unit
# separator (not @tsv/tab): `read` treats tab as IFS whitespace and
# collapses consecutive delimiters, which silently shifts every field
# after an empty one (e.g. an absent effort level or rate limit).
IFS=$'\x1f' read -r raw_dir model style effort cost pct added removed duration_ms <<EOF
$(printf '%s' "$input" | jq -r '
  [ (.workspace.current_dir // .cwd // ""),
    (.model.display_name // "?"),
    (.output_style.name // "default"),
    (.effort.level // ""),
    (.cost.total_cost_usd // 0),
    (.context_window.used_percentage // 0),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0),
    (.cost.total_duration_ms // 0)
  ] | join("\u001f")')
EOF

# Show just the final path component, and grab the git branch (if any).
dir="${raw_dir##*/}"
[ -z "$dir" ] && dir="/"
branch=$(git -C "$raw_dir" branch --show-current 2>/dev/null)

# Color codes.
RESET="\033[0m"
DIM="\033[2m"
BOLD="\033[1m"
BLUE="\033[34m"
MAGENTA="\033[35m"
GREEN="\033[32m"
CYAN="\033[36m"
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

# Print one rate-limit window: an optional dim label (for per-model weekly
# windows), the colored percent, then a dim "(time left)" once we know when
# it resets.
print_rl() {
    local label="$1" pct="$2" secs="$3"
    [ -z "$pct" ] && return
    [ -n "$label" ] && printf " ${DIM}%s${RESET}" "$label"
    printf " $(rl_color "$pct")%.0f%%${RESET}" "$pct"
    [ -n "$secs" ] && printf " ${DIM}(-%s)${RESET}" "$(human_duration "$secs")"
}

# Monthly spend limit (Team/Enterprise seats) or usage credits (Pro/Max
# "extra usage"). Neither is in the statusline stdin — both come from the
# account usage API the claude.ai settings page uses:
#   GET https://api.anthropic.com/api/oauth/usage
#     .spend       { used, limit, percent }            (Team/Enterprise)
#     .extra_usage { used_credits, monthly_limit,      (Pro/Max, in cents —
#                    utilization, is_enabled }          per Claude Code's own
#                                                       usedCents/spendLimitCents)
# The statusline renders on every keystroke, so we never fetch inline. Instead
# a detached background job refreshes a cache file at most once per TTL, and the
# render only reads that cache. The endpoint is undocumented and may change.
USAGE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-usage.json"
USAGE_TTL=300  # seconds; spend against a monthly cap moves slowly

# True when the cache is missing or older than the TTL.
usage_stale() {
    local now mtime
    now=$(date +%s)
    mtime=$(stat -f %m "$USAGE_CACHE" 2>/dev/null || echo 0)
    (( now - mtime >= USAGE_TTL ))
}

# Fetch usage with the OAuth token from the login keychain and atomically
# replace the cache. Runs detached; failures leave the previous cache in place.
# --fail keeps HTTP error bodies (429 rate limits, auth errors) from clobbering
# the last good snapshot.
refresh_usage() {
    local token
    token=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null \
            | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
    [ -z "$token" ] && return
    curl -sS --fail --max-time 5 https://api.anthropic.com/api/oauth/usage \
        -H "Authorization: Bearer $token" \
        -H "anthropic-beta: oauth-2025-04-20" \
        -o "$USAGE_CACHE.tmp" 2>/dev/null \
      && mv "$USAGE_CACHE.tmp" "$USAGE_CACHE"
}

# Section 1: directory and git branch.
printf "${BOLD}%s${RESET}" "$dir"
[ -n "$branch" ] && printf " ${MAGENTA}%s${RESET}" "$branch"

# Section 2: model, reasoning effort (if supported), output style
# (only when it's not the default).
printf " ${DIM}|${RESET} ${BLUE}%s${RESET}" "$model"
[ -n "$effort" ] && printf " ${DIM}%s${RESET}" "$effort"
[ "$style" != "default" ] && printf " ${CYAN}%s${RESET}" "$style"

# Section 3: session stats (context %, lines changed, elapsed time, cost).
printf " ${DIM}|${RESET} ${ctx_color}%.0f%%${RESET} ${DIM}${GREEN}+%s${RESET}/${DIM}${RED}-%s${RESET}" \
    "${pct:-0}" "$added" "$removed"

# Omit elapsed time until it rounds to at least a full second
# (sub-second durations before the first API response read as a glitch).
if [ -n "$duration_ms" ] && [ "${duration_ms:-0}" -ge 1000 ]; then
    printf " ${DIM}%s${RESET}" "$(human_duration $(( duration_ms / 1000 )))"
fi

printf " ${DIM}\$%.2f${RESET}" "${cost:-0}"

# Section 4: rate-limit quotas, only when present. Render every window the
# account sends, in a second jq pass. Pro/Max send five_hour + seven_day.
# Team/Enterprise seats can also send per-model weekly windows. There is no
# monthly window in Claude Code's model. Each record is "label|pct|secs".
# `|` is a safe separator since labels/percents/times never contain it.
rl_stream=$(printf '%s' "$input" | jq -r '
  (.rate_limits // {}) as $r
  | [ {k:"five_hour",         l:""},
      {k:"seven_day",         l:""},
      {k:"seven_day_opus",    l:"opus"},
      {k:"seven_day_sonnet",  l:"sonnet"}
    ]
  | map( . as $w | ($r[$w.k]) as $v
         | select($v.used_percentage != null)
         | [ $w.l,
             ($v.used_percentage | tostring),
             (if $v.resets_at then (($v.resets_at - now) | tostring) else "" end)
           ] | join("|") )
  | .[]')

# Kick a background refresh when the cache is stale, then read the current
# spend line from whatever the cache holds. `touch` before spawning both backs
# off repeated launches and preserves the prior value while the fetch is in
# flight. The fetch is fully detached so it never delays this render.
if command -v security >/dev/null 2>&1 && usage_stale; then
    mkdir -p "$(dirname "$USAGE_CACHE")"
    touch "$USAGE_CACHE"
    ( refresh_usage & ) </dev/null >/dev/null 2>&1
fi

# Emit "pct|display" for dollar usage (e.g. "0|$4.36/$5k"): the monthly spend
# cap when the account has one enabled, otherwise Pro/Max usage credits when
# extra usage is enabled. Both normalize to used/limit/percent so the render
# below is shared. spend uses amount_minor scaled by 10^exponent, extra_usage
# is plain cents. A null credit limit shows the used amount alone.
sp_pct=""; sp_disp=""
if [ -f "$USAGE_CACHE" ]; then
    IFS='|' read -r sp_pct sp_disp <<< "$(jq -r '
      ( if ((.spend.enabled // false) and (.spend.limit.amount_minor != null)) then
          .spend
          | { u: (.used.amount_minor  / pow(10; .used.exponent  // 2)),
              l: (.limit.amount_minor / pow(10; .limit.exponent // 2)),
              p: .percent }
        elif ((.extra_usage.is_enabled // false) and (.extra_usage.used_credits != null)) then
          .extra_usage
          | { u: (.used_credits / 100),
              l: (if .monthly_limit != null then .monthly_limit / 100 else null end),
              p: .utilization }
        else empty end )
      | .u as $u | .l as $l
      | (if .p != null then .p elif ($l // 0) > 0 then ($u / $l * 100) else 0 end) as $p
      | (if $l == null then ""
         elif $l >= 1000 then "/$\(($l / 1000) | floor)k"
         else "/$\($l)" end) as $ltxt
      | "\($p)|$\((($u * 100) | round) / 100)\($ltxt)"
    ' "$USAGE_CACHE" 2>/dev/null)"
fi

if [ -n "$rl_stream" ] || [ -n "$sp_disp" ]; then
    printf " ${DIM}|${RESET}"
    while IFS='|' read -r rl_label rl_pct rl_secs; do
        print_rl "$rl_label" "$rl_pct" "$rl_secs"
    done <<< "$rl_stream"
    [ -n "$sp_disp" ] && printf " $(rl_color "$sp_pct")%s${RESET}" "$sp_disp"
fi

printf "\n"
