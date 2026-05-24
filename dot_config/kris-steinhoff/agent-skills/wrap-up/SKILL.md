---
name: wrap-up
description: End-of-session wrap-up. Scans the current conversation for anything worth persisting — project status, feedback, decisions, conventions — and saves it to the right place. Use when the user says "wrap up", "let's save context", "end of session", "capture progress", or similar. Also invoke when the user says they're done for the day or switching tasks.
---

# Wrap-Up Skill

At the end of a session, review the conversation and persist anything valuable for future sessions. Be selective — only capture what isn't already obvious from reading the code or git history.

## Two persistence targets

Choose the right target for each piece of information:

### 1. MEMORY (`~/.claude/projects/{project-slug}/memory/`)
Personal notes to your future self. Private, not in the repo. Use for:
- **Project status**: what phase/milestone was reached, what's next
- **Why decisions were made**: constraints, tradeoffs, external factors not visible in the code
- **Feedback patterns**: corrections or confirmed approaches from the user
- **Reference pointers**: where to find things in external systems

MEMORY has four types: `user`, `feedback`, `project`, `reference`. Each file has YAML frontmatter (`name`, `description`, `type`) and the memory body. An index lives at `MEMORY.md` — keep entries under ~150 chars.

### 2. Project rules (`.claude/rules/` in the project root)
Shared instructions checked into the repo. Use for:
- Conventions and patterns that should apply to **all future work** on the project, including by other contributors
- Architectural decisions or constraints that Claude should follow when editing code
- Anything that belongs in a CLAUDE.md-adjacent file rather than personal notes

Only write to `.claude/rules/` when the convention is genuinely repo-wide (not just personal preference or session-specific status).

## Process

1. **Scan the conversation** for:
   - Milestones reached or work completed (→ update `project` memory for status/next-steps)
   - Corrections or confirmed approaches from the user (→ `feedback` memory)
   - New patterns or conventions established in this session (→ `project` memory or `.claude/rules/` if repo-wide)
   - Things learned about the user's role or preferences (→ `user` memory)
   - Pointers to external resources discovered (→ `reference` memory)

2. **Check existing memories first** — update rather than duplicate. Read `MEMORY.md` to see what already exists.

3. **Apply the "would this help future-me?" test**: if the information is already recoverable by reading the code, running `git log`, or checking CLAUDE.md, skip it. Only persist what's genuinely hard to re-derive.

4. **Write memories** using the standard format:
   ```markdown
   ---
   name: Descriptive name
   description: One-line hook for the MEMORY.md index
   type: user | feedback | project | reference
   ---
   [Memory body. For feedback/project: lead with the fact/rule, then **Why:** and **How to apply:** lines.]
   ```

5. **Update MEMORY.md index** — one line per memory file, under ~150 chars: `- [Title](file.md) — one-line hook`

6. **Write to `.claude/rules/`** only if a genuine repo-wide convention was established this session that isn't already captured in CLAUDE.md or existing rules files. Check those first.

7. **Report what you saved** — a brief summary so the user knows what was captured and can correct anything. Don't summarize things you *didn't* save.

## What NOT to save

- Code, file paths, or architecture already visible in the repo
- Git history, recent commits, or who changed what
- In-progress work or temporary state from this session
- Anything already in CLAUDE.md or existing rules files
- Verbose summaries of everything that happened — distill to what's *surprising* or *non-obvious*
