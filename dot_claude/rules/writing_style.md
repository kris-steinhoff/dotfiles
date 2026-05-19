# Writing style

## No em dashes or semicolons unless absolutely necessary

When writing prose (responses, commit messages, PRs, docs, comments), avoid em dashes (`—`) and semicolons (`;`). Rewrite the sentence instead.

### Why

Both are overused by LLMs and have become a tell for AI-generated writing. They also tend to paper over weak sentence structure: an em dash often hides a thought that should be its own sentence, and a semicolon often joins two clauses that read more clearly as two sentences.

### How to apply

- Prefer a period and a new sentence. Two short sentences almost always beat one spliced sentence.
- For parenthetical asides, use parentheses or commas.
- For lists inside a sentence, use commas. If commas collide with internal commas, restructure as a bulleted list rather than reaching for semicolons.
- En dashes (`–`) for number ranges (e.g. `pages 10–14`) are fine and not covered by this rule.

### Genuinely necessary cases

- Code, including punctuation inside string literals, regex, or syntax (e.g. JavaScript statement separators, CSS rules).
- Direct quotations from external sources, where the original punctuation must be preserved.
- File contents the user explicitly asked to write with that punctuation.

If you find yourself reaching for one outside those cases, rewrite instead.
