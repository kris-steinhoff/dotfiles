---
name: markdown-wrapping
description: Use before editing an existing markdown (.md) file or tree, to find out whether it is hard-wrapped or soft-wrapped so the edit matches. Answers from the project's prettier config, or by counting how its paragraphs are laid out. Read-only, it changes nothing.
---

# Markdown wrapping style

Soft wrapping (one line per paragraph) is the default preference, and the **markdown-formatting** skill covers writing that way. Hard wrapping is right only where it is already the established style of the files around the one being edited, because reflowing a hard-wrapped file as a side effect of an unrelated edit buries the real change in a whole-file diff.

That is a question about what is on disk, so answer it by looking:

```bash
scripts/check-wrapping path/to/docs
```

Files or directories, defaulting to the current directory. It only reads.

## Acting on the verdict

| Verdict                                | What to do                                    |
| -------------------------------------- | --------------------------------------------- |
| `hard-wrapped throughout, so match it` | Match the surrounding wrap width in your edit |
| `hard-wrapped by declaration`          | Same, and the project has said so explicitly  |
| `soft-wrapped` anything                | One line per paragraph                        |
| `mixed`                                | No style to match, so soft wrap               |
| `no evidence either way`               | Soft wrap                                     |

Hard wrapping needs a positive verdict. Absence of evidence is not it.

## What it looks at

Two signals, strongest first.

A prettier config setting `proseWrap` settles it outright, since a project declaring a wrap style is the most definite statement of local style there is. `never` means soft, `always` means hard, and `preserve` decides nothing so the files get counted instead.

Otherwise the files themselves: a paragraph spread over several lines that all stop short of a plausible margin was wrapped on purpose, and a single line well past that margin was not. Front matter, fenced and indented code, tables, headings, and blockquotes wrap by their own rules and are skipped, so a code block full of short lines doesn't read as hard-wrapped prose.

The per-file counts are printed alongside each verdict, so a surprising answer can be checked rather than taken on faith.
