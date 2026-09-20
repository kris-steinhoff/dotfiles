---
name: add-to-inbox
description: Drop a note, task, reminder, or piece of context into the chief-of-staff persona's inbox for later triage. Invoke only when the user explicitly asks to add or drop something to the inbox (or to the chief of staff) — not on your own judgment that something is worth tracking. This only adds new items to the inbox, never reads or triages.
---

# add-to-inbox

Drop a note into the chief of staff's inbox. Run the script; it writes one markdown file and prints its path. You are not triaging it; you are handing it over. The chief of staff decides what it becomes.

Do not use it as a general log or to mirror your own progress. One drop per distinct thing worth tracking.

```bash
scripts/add-to-inbox --title "<summary>" [--from "<who>"] [--resource <url> ...] [--tag <tag> ...] <<'EOF'
<body — free-form markdown, as many lines as you need>
EOF
```

The body comes from stdin, so a heredoc keeps markdown, quotes, and multiple lines intact without shell-escaping. Set `--from` (or `$CHIEF_OF_STAFF_INBOX_FROM`) so the chief of staff knows who dropped it. Run with `--help` for the rest.

If the script exits non-zero it prints why.
