---
name: markdown-links
description: Check that every `[[wiki-link]]` and shortcut reference link in a markdown tree resolves, and fix the ones that don't. Use after deleting or renaming a file in a linked bundle, when a link may have broken, or when asked to verify a tree's links. It models the editor's own resolution rules, so it agrees with marksman instead of reporting correct links as broken.
---

# Markdown links

`scripts/check-links [ROOT]` reports every link in a markdown tree that goes nowhere. It exits 0 when clean, 1 with one finding per line on stderr, and 2 if the root isn't a directory. `ROOT` defaults to the working directory.

```
index.md:8: unresolved [[Under Score]] — did you mean [[under_score]]?
index.md:12: ambiguous [[dup]] — qualify as [[commitments/dup]], [[decisions/dup]]
index.md:10: [NXC-999] used but never defined in this file
```

Run it whenever the link graph may have moved under you: after deleting a file, after renaming one, after a bulk edit, or when someone asks whether a bundle's links are sound. An editor with a markdown language server already shows this live, so the value here is for an agent working through a shell, which sees no diagnostics at all.

## Why not a general link checker

Because the resolver has two rules, and a checker that applies one of them to both cases is worse than no checker — it reports correct links as broken, and you learn to ignore it.

| Link form                   | How it resolves                                                    |
| --------------------------- | ------------------------------------------------------------------ |
| `[[rate limits]]`           | Normalized: lowercased, spaces and dashes interchangeable          |
| `[[decisions/rate-limits]]` | Literal: exact case, real separators, matched against a path's end |

So `[[rate limits]]` finds `decisions/rate-limits.md` while `[[decisions/rate limits]]` finds nothing, and that asymmetry is the whole reason this script exists. Underscores are never normalized either, which is why `[[under score]]` misses `under_score.md`. Strict checkers such as lychee, and Obsidian's default resolution, bind to exact basenames and will fail every spaced link in a tree like this.

## Fixing what it finds

The script detects and stops; deciding what a broken link meant is yours.

- **Unresolved.** The target doesn't exist under any spelling. Usually the file was deleted, renamed, or the link has a typo — the suggested near matches are ranked guesses, not answers. If the target is genuinely gone, the fix is often to rewrite the sentence rather than repoint the link: a reference to something deleted is usually prose that expired with it. Check whether the link's premise still holds before preserving it.
- **Ambiguous.** Two files share a basename, so a bare link can't say which. The printed qualification is the shortest path suffix that is unique, so it can be applied as-is. Prefer renaming one file when the collision is itself the mistake — a tree whose basenames are unique needs no qualified links at all.
- **Used but never defined.** A shortcut reference like `[NXC-156]` with no `[NXC-156]: <url>` definition in the same file renders as literal bracketed text. Add the definition at the foot of the file, or drop the brackets if it was never meant to be a link.

## What it doesn't check

`#anchors` (a separate resolution rule), frontmatter validity, inline URLs, and whether a link _should_ exist. It reads every `.md` file under the root except inside `.git`, and blanks out fenced code, inline code spans, and YAML frontmatter first — prose that quotes link syntax in backticks is documenting a link, not making one, so this file's own examples are not findings.
