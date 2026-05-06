# Parsing JSON output from CLI tools

When a CLI returns JSON (e.g. `databricks`, `gh`, `aws`, `kubectl`, `jj`, `terraform`, `helm -o json`), filter and shape it with `jq`. Avoid piping to `python -c` / `python3 -c`, `node -e`, or one-shot scripts in another language, unless necessary.

## Why

- `jq` filters compose and are easy to copy into runbooks, docs, and shell history.
- Shelling out to a heavyweight runtime to extract a couple of fields is overkill and slower.

## How to apply

- Default to `jq` for any JSON-output CLI, even for quick one-liners.
- Reach for tabular output when iterating: `jq -r '.things[] | [.id, .status, .name] | @tsv'`.
- For CSV: `@csv` with `-r`. For raw strings: `-r`.
- If a project has a docs file of CLI recipes (often under `docs/`), check it first before re-deriving a filter.
- Only fall back to another language for transforms `jq` genuinely can't express cleanly (e.g. complex stateful aggregation). State the reason briefly when you do.
