---
name: markdown-formatting
description: Use when writing, editing, creating, or formatting markdown (.md) follow these formatting rules.
---

# Markdown Formatting

When editing existing Markdown content, **always prioritize matching and preserving the existing formatting style** (such as indentation, bullet style, heading syntax, and line wrapping) over applying these rules strictly, unless explicitly requested to reformat or when creating new files.

## Don't hard-wrap

When writing or editing markdown (`.md`) files, write each paragraph as a single long line. Don't insert hard line breaks to wrap prose at 80, 100, or any other column width.

### Why

- Soft-wrapping is the editor's job. Hard wraps freeze the wrap width into the file, so anyone with a different viewport sees ragged or over-wide lines.
- Hard wraps make diffs noisy: editing one word in the middle of a paragraph reflows every following line, hiding the real change.
- Tools like prose linters, grep, and LLM context windows treat a paragraph as one logical unit. Hard wraps split it across lines and complicate that.

### How to apply

- One line per paragraph. Use a blank line to start a new paragraph.
- List items: one line per item, even if long. Don't wrap a bullet across multiple lines.
- Preserve existing wrapping when editing a file that's already hard-wrapped throughout; don't reflow the whole file as a side effect of an unrelated edit. (If the user wants it reflowed, they'll ask.)

### Exceptions

- **Tables**: pad cells with whitespace to align columns. The frozen column widths trade one kind of readability (diff cleanliness) for another (scannable raw markdown), and for tables the trade is worth it. If cells are growing long enough that alignment dominates the diff — or you're reaching for `<br>` inside a cell — that's a signal the content isn't really tabular; prefer a definition list or prose with subheadings instead.
- **Code blocks and front matter**: follow their own rules — don't reflow them.
