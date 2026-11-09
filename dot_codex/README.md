# Codex

This file covers how Codex's `config.toml`, its global instructions, and its persona profiles are managed; load it before editing anything in `dot_codex/` or `.chezmoitemplates/codex.md`. chezmoi doesn't deploy it, and it is named `README.md` because a source `AGENTS.md` here would collide with `AGENTS.md.tmpl`, which renders `~/.codex/AGENTS.md`.

## config.toml machine-local state

Codex rewrites `~/.codex/config.toml` at runtime and injects machine-local state that must not be version-controlled: `[projects.*]` trust levels (per-machine checkout paths), `[tui.*]` UI counters, and `[hooks.*]` trusted hook hashes. A plain template would clobber that state on every apply and force re-trusting projects and hooks.

So the source is a chezmoi `modify_` script, `modify_private_config.toml.tmpl`, rather than a static template. A `modify_` script receives the current target on stdin and its stdout becomes the new file. The script is a `uv`-run Python program that parses the live file with `tomlkit`, sets only the settings we manage (`model`, `model_reasoning_effort`, `project_doc_fallback_filenames`, `approval_policy`, `approvals_reviewer`, `[features]`, `[sandbox_workspace_write].writable_roots`, `[agents]` — the last templated on `agentBudget`), and dumps the document back. Because `tomlkit` preserves the layout of everything it does not touch, Codex's machine-local tables round-trip verbatim, applies are idempotent (a clean machine shows no diff), and nothing is silently dropped whatever new keys Codex may add. This needs `uv` present at apply time (it is in the Brewfile); a real parser is worth that dependency, because rewriting the file by regex can drop top-level keys it doesn't recognize.

The shebang pulls `tomlkit` via `uv run --with tomlkit`, not PEP 723 inline metadata (`--script`). `uv run --script` keys its ephemeral venv on the script's file path, and chezmoi runs a `modify_` script from a fresh temp path on every apply, so that env would never hit the cache and uv would reinstall the dependency on every `chezmoi apply`. A `--with` env is keyed on its requirements instead, so it survives the changing paths and uv only rebuilds it on a cold cache or a dependency bump. The tradeoff is that this script alone differs from the PEP 723 pattern `ai-usage` uses and `dot_agents/skills/AGENTS.md` prescribes for skill scripts needing Python 3.11+.

The filename attribute order is `modify_private_` (type prefix before the `private_` permission attribute); `private_modify_` is not recognized and chezmoi treats the leftover `modify_` as a literal filename.

The script also grants Codex's sandbox the uv and npm caches Claude's sandbox may already write. Without them Codex points each tool at a cold cache under `$TMPDIR`, which needs the network to fill.

## Global instructions

`AGENTS.md.tmpl` renders `~/.codex/AGENTS.md` from the shared partials plus `codex.md` (see `.chezmoitemplates/AGENTS.md`). `codex.md` so far holds one rule: a command that failed in the sandbox for a reason a retry won't change runs escalated from then on, on its first call. Without it, Codex reruns repository gates sandboxed on every round of changes, watching each fail on the network before rerunning it escalated.

## Persona profiles and agentBudget

Codex uses one profile for both entry points. `<name>.config.toml.tmpl` deploys a launch profile selected with `codex --profile <name>`, while the `modify_` script for `config.toml` registers that same file under `[agents.<name>].config_file` so another Codex session can spawn it. Rewriting the whole `[agents]` table on each apply also drops registrations for personas that no longer exist.

Model and concurrency choices come from the machine-local `agentBudget` datum. `.chezmoi.toml.tmpl` asks for `conservative` or `generous` during `chezmoi init` and defaults to `conservative`; consuming templates also fall back to conservative when the datum is absent or unrecognized. This keeps existing machines safe until their chezmoi config is regenerated or gains `agentBudget` under `[data]`. It sets the personas' models, and the model of the forked `implement` skill on Claude.

| Persona or skill  | Claude conservative / generous | Codex conservative / generous |
| ----------------- | ------------------------------ | ----------------------------- |
| Coordinator       | Sonnet / Opus                  | Terra medium / Sol high       |
| Chief of staff    | Sonnet / Opus                  | Terra medium / Sol high       |
| `implement` skill | Sonnet / Opus                  | the session's own model       |

Codex skills run on whatever model the current session uses; only the two personas have Codex profiles.

Codex caps spawned-agent threads at two for conservative machines and four for generous machines. These choices apply only to persona profiles and the subagent cap; the ordinary top-level Codex model remains the independently configured default.
