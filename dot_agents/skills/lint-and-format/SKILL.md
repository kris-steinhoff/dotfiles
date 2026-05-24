---
name: lint-and-format
description: Use when you want to format, lint, or run code style checks on files. Rely on pre-commit hooks when available for that file type, or invoke standard linters and formatters directly if not.
---

# Linting and formatting

Maintaining consistent code style and formatting is essential. To determine the correct workflow, check if the repository has a `.pre-commit-config.yaml` file:

1. **No pre-commit**: If the repo has no pre-commit configuration, run standard linters/formatters directly.
2. **Has pre-commit**: If the repo has `.pre-commit-config.yaml`, inspect the config to see which hooks are active.
   - **For file types covered by hooks** (e.g., if the config includes `prettier`, `ruff`, `eslint`, or `terraform fmt` hooks), do not run the underlying tools directly; rely on `pre-commit` (or run `pre-commit run --files <path>`).
   - **For file types NOT covered by hooks**, run the standard formatting/linting tools directly.

---

## When to rely on pre-commit (for covered file types)

### Don't

Do not invoke individual tools manually for file types covered by the pre-commit configuration:
- `terraform fmt` (or `-check`)
- `prettier --write`
- `ruff format` or `ruff check`
- `eslint --fix`

Running these manually adds a redundant step that pre-commit already handles — and if your manual invocation drifts from the pinned hook version, the commit or CI checks can still fail.

### Do

- Edit files normally. Let pre-commit format and lint automatically at commit time.
- Run `pre-commit run --all-files` when you want to run all hooks across the codebase before committing.
- Run a specific hook with `pre-commit run <hook-id> --files <path>` when you need to see what one hook would do without committing.

---

## When to run tools directly

For any file types that are **not** covered by hooks in `.pre-commit-config.yaml` (or if the repository has no pre-commit configuration at all), run the appropriate formatters and linters directly before committing:
- **Python**: `ruff format` and `ruff check --fix`
- **JavaScript/TypeScript**: `prettier --write` and `eslint --fix`
- **Terraform**: `terraform fmt`
- **Markdown**: Follow the guidelines in the [markdown-formatting](file:///Users/kris/code/github.com/kris-steinhoff/dotfiles/dot_agents/skills/markdown-formatting/SKILL.md) skill (never hard-wrap prose).

---

## Validation vs. formatting

This rule is about *formatting* and style-linting hooks.

For validation tools that catch logic/build errors that pre-commit can't easily handle (e.g., `tsc --noEmit`, `terraform validate`, `pytest`), keep running them directly when you need feedback before committing. These are compiler/test validations, not formatters; you should run them directly to get immediate feedback.
