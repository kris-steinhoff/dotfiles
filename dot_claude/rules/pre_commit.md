# Pre-commit handles formatting

When a repo has `.pre-commit-config.yaml`, the formatters and linters
configured there run automatically on `git commit`. Don't shadow them by
invoking the underlying tools manually.

## Don't

- `terraform fmt` (or `-check`) before committing
- `prettier --write` on files you just edited
- `ruff format` on Python files you just edited
- `eslint --fix` on JS/TS files you just edited

Running these adds a step that pre-commit already does — and if your manual
invocation drifts from the pinned hook version, the commit can still fail.

## Do

- Edit the file. Let pre-commit format/lint at commit time.
- Run `pre-commit run --all-files` only when you want to apply all hooks to
  files you didn't touch (e.g., after a config change), or to debug a hook.
- Run a specific hook with `pre-commit run <hook-id> --files <path>` when you
  need to see what one hook would do without committing.

## Validation, not formatting

This rule is about *formatting* hooks. For validation tools that catch
errors pre-commit can't (`tsc --noEmit`, `terraform validate`,
`uv run pytest`), keep running them directly when you need feedback before
committing. They aren't formatters; they're checks pre-commit may also run
but whose failure you want to see immediately rather than at commit time.
