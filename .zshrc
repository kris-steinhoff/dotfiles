#!/usr/bin/env zsh

# === Local Pre-Config ===
[[ -f "${HOME}/.local-pre.sh" ]] && source "${HOME}/.local-pre.sh"

# === Environment ===
export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:/opt/bin:${HOME}/go/bin"
export EDITOR="${OVERRIDE_EDITOR:-vim}"
export PIP_DISABLE_PIP_VERSION_CHECK=1

# === Pyenv ===
if [[ -d "$HOME/.pyenv" ]]; then
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path)"
fi

# === Homebrew Completions ===
if type brew &>/dev/null; then
    FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"
    autoload -Uz compinit
    compinit
fi

# === Zsh Plugins (via Homebrew) ===
if type brew &>/dev/null; then
    source "$(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh" 2>/dev/null
    source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" 2>/dev/null
fi

# === Starship Prompt ===
if type starship &>/dev/null; then
    eval "$(starship init zsh)"
fi

# === Options ===
unsetopt share_history

# === Functions ===
activate() {
    pwd_name="$(basename "$(pwd)")"
    venvs_dir="${HOME}/.virtualenvs"

    if [ -d "${venvs_dir}/${pwd_name}" ]; then
        source "${venvs_dir}/${pwd_name}/bin/activate"
    elif [ -d ".venv" ]; then
        source ".venv/bin/activate"
    else
        echo "No virtualenv found. Looked for ${venvs_dir}/${pwd_name} and .venv"
    fi
}

# === Aliases ===
alias glg="git --no-pager l -20"
alias dco="docker compose"
alias dc="docker compose"

# === Local Post-Config ===
[[ -f "${HOME}/.local-post.sh" ]] && source "${HOME}/.local-post.sh"
