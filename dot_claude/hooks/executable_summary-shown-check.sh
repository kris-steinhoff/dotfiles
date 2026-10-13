#!/usr/bin/env bash
# PreToolUse hook: make an agent show a summarize-* skill's output before it
# moves on.
#
# The summarize-github-pr and summarize-jira-ticket scripts print markdown that
# reaches only the agent, so the user sees it only when the agent copies it into
# a message. Agents kept skipping that and going straight to their next tool
# call, however the skills worded it. So once a summary script has returned,
# this denies the next tool call until an assistant message after it contains
# the summary's first line, and hands the summary back in the denial so copying
# it is the obvious next step.
#
# It denies at most once per summary run, so a copy it fails to recognize costs
# one retry rather than a stuck session, and it fails open: any problem exits 0
# with no output.

input="$(cat)"

transcript="$(
  printf '%s' "$input" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null
)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Cheap exit for the common case: a session that never ran a summary script.
grep -qE 'summarize-(github-pr|jira-ticket)/scripts/summary\.py' "$transcript" || exit 0

python3 - "$transcript" <<'PY' 2>/dev/null
import json, re, sys

SCRIPT = re.compile(r"summarize-(github-pr|jira-ticket)/scripts/summary\.py")
MARKER = "[summary check]"


def norm(s):
    return " ".join(s.split())


def result_text(block):
    c = block.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(b.get("text", "") for b in c if isinstance(b, dict))
    return ""


entries = []
with open(sys.argv[1]) as f:
    for line in f:
        try:
            entries.append(json.loads(line))
        except Exception:
            pass

# The latest summary run, and everything after its result.
run_id = None
for e in entries:
    if e.get("type") != "assistant":
        continue
    for b in (e.get("message") or {}).get("content") or []:
        if (
            isinstance(b, dict)
            and b.get("type") == "tool_use"
            and b.get("name") == "Bash"
            and SCRIPT.search(str((b.get("input") or {}).get("command", "")))
        ):
            run_id = b.get("id")
if not run_id:
    sys.exit(0)

summary = None
shown = denied = False
for e in entries:
    content = (e.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for b in content:
        if not isinstance(b, dict):
            continue
        if summary is None:
            if b.get("type") == "tool_result" and b.get("tool_use_id") == run_id:
                if b.get("is_error"):
                    sys.exit(0)
                summary = result_text(b).strip()
                if not summary.startswith("|"):
                    sys.exit(0)
            continue
        if e.get("type") == "assistant" and b.get("type") == "text":
            if norm(summary.splitlines()[0]) in norm(b.get("text", "")):
                shown = True
        elif b.get("type") == "tool_result" and MARKER in result_text(b):
            denied = True

if summary is None or shown or denied:
    sys.exit(0)

reason = (
    f"{MARKER} The summary script's output reaches only you. Before any other "
    "tool call, send it to the user as a message of its own, every line copied "
    "as markdown with nothing added or reworded, then retry this call:\n\n"
    + summary
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}))
PY

exit 0
