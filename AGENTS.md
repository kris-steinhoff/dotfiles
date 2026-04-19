# Agent Instructions

## Environment & Shell
- **Shell**: `zsh` with Emacs keybindings (`bindkey -e`) and Vi mode via `ESC` (`bindkey '\e' vi-cmd-mode`).
- **Editor**: `vim` (set via `export EDITOR`). Use `Ctrl+X Ctrl+E` to edit the current command line in `zsh`.
- **Python**: Use `activate` function to quickly enter `.venv` or `venv` environments.
- **AWS**: Use `aws-profile-login <profile>` to switch profiles and trigger `aws sso login` if needed. Use `aws-profile-logout` to reset.
- **Tooling**: `direnv` is used for per-project environment variables.

## Git Shortcuts
Examples of common aliases:
- `gst`: `git status`
- `gc`: `git commit --verbose`

## Workflow
- **Pre-commit**: Use `pcra` to run `pre-commit run --all-files`.
- **Docker**: Use `dc` or `dco` for `docker compose`.
