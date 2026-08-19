---
name: markdown-formatting
description: Use when writing, editing, or creating markdown (.md) content. Prose is soft-wrapped one line per paragraph, with `-` bullets, ATX headings, `_emphasis_`, and aligned tables. To find out whether an existing file is hard-wrapped, use the markdown-wrapping skill instead.
---

# Markdown Formatting

These are the conventions to write markdown in. They match what `prettier --prose-wrap never` produces, so a project that formats with prettier will already agree, and nothing here has to be undone later.

## Wrapping

Write each paragraph as a single long line. Don't insert hard line breaks to wrap prose at 80, 100, or any other column width. One line per paragraph, blank line between paragraphs. List items are one line each, however long.

This matters more than the rest of this file, and it is the one convention an agent tends to break by reflex, so it is worth checking your own output against.

- Soft-wrapping is the editor's job. Hard wraps freeze the wrap width into the file, so anyone with a different viewport sees ragged or over-wide lines.
- Hard wraps make diffs noisy: editing one word in the middle of a paragraph reflows every following line, hiding the real change.
- Tools like prose linters, grep, and LLM context windows treat a paragraph as one logical unit. Hard wraps split it across lines and complicate that.

Editing a file that is already hard-wrapped throughout is the exception: preserve its wrapping rather than reflowing a whole file as a side effect of an unrelated edit. Use the **markdown-wrapping** skill to find out which case you are in, rather than guessing from a glance.

## The rest

| Element        | Convention                                                         |
| -------------- | ------------------------------------------------------------------ |
| Headings       | ATX (`#`, `##`), never setext underlines                           |
| Bullets        | `-`, nested by two spaces                                          |
| Ordered lists  | `1.` `2.` `3.`, or all `1.` if you prefer, consistently either way |
| Emphasis       | `_emphasis_` and `**strong**`                                      |
| Task lists     | `- [ ]` and `- [x]`, lowercase x                                   |
| Thematic break | `---`                                                              |
| Code blocks    | Backtick fences with a language tag, not `~~~` and not indented    |
| Blank lines    | One between blocks, never two                                      |
| End of file    | Exactly one trailing newline                                       |

Tables get their cells padded so the columns line up. This is the one place where a frozen width is worth it: the raw markdown stays scannable, and that beats diff cleanliness here. If cells grow long enough that alignment dominates the diff, or you reach for `<br>` inside a cell, the content probably isn't tabular. Prefer a definition list or prose with subheadings.

Front matter and code blocks follow their own rules. Don't reflow either.

## Making it stick

Don't reformat by running a formatter yourself as part of an edit, and never join lines by hand. Reflowing a paragraph means re-emitting its text, and re-emitted prose drifts a word at a time.

Write it correctly the first time. Where that isn't enough, the fix belongs in the project rather than in an agent's habits: a `PostToolUse` hook formats every markdown write automatically, and a prettier pre-commit hook catches whatever arrives another way. [README.md](README.md) has both, and it is worth suggesting to the user when a project has neither.
