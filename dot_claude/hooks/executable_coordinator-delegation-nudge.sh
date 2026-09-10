#!/usr/bin/env bash
# PostToolUse hook for the `coordinator` persona (wired in via its agent
# frontmatter, so it fires only while coordinator is the active agent).
#
# It counts the run of inline file edits made since the last delegation
# (Agent/Task) in the current transcript. Once that run reaches a multiple of
# THRESHOLD, it injects a non-blocking reminder to declare whether the work
# should be handed to an implementor. It never blocks and never fails loudly:
# any problem exits 0 with no output.

THRESHOLD=3

input="$(cat)"

transcript="$(
  printf '%s' "$input" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null
)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

count="$(
  python3 - "$transcript" <<'PY' 2>/dev/null
import json, sys

EDIT = {"Edit", "Write", "NotebookEdit"}
DELEGATE = {"Agent", "Task"}

run = 0
try:
    with open(sys.argv[1]) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") != "assistant":
                continue
            content = d.get("message", {}).get("content")
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                name = b.get("name")
                if name in DELEGATE:
                    run = 0
                elif name in EDIT:
                    run += 1
except Exception:
    run = 0
print(run)
PY
)"
[ -n "$count" ] || exit 0

# Speak once per run — the first time the inline-edit run reaches THRESHOLD. A
# delegation resets the run to zero, so a coordinator that hands off is never
# nagged and a genuinely-inline stretch is nudged at most once, not repeatedly.
if [ "$count" -eq "$THRESHOLD" ]; then
  msg="[delegation check] ${count} inline file edits with no delegation since the last handoff. Per the coordinator persona, say in one sentence whether the next phase should go to an implementor (spin an isolated worktree with create-worktree if the only blocker is a shared working tree), or why inline is the right call here — then continue."
  python3 - "$msg" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": sys.argv[1],
    }
}))
PY
fi

exit 0
