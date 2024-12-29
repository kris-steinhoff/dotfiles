#!/bin/sh

test -f "${HOME}/.local-pre.sh" && . "${HOME}/.local-pre.sh"

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:/opt/bin:${HOME}/go/bin"

export PIP_DISABLE_PIP_VERSION_CHECK=1

# initialize pyenv, if it's installed
if [ -d "$HOME/.pyenv" ]; then
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path)"
fi

t() {
    DEFAULT_SESSION=$(basename "$(pwd)" | tr '.' '_')
    SESSION="${*:-${DEFAULT_SESSION}}"
    tmux list-sessions | grep -q "^${SESSION}" > /dev/null; rc=$?
    if [ ${rc} -eq 0 ]; then
        tmux ${TMUX_OPTIONS} attach-session -d -t "${SESSION}"
    else
        tmux ${TMUX_OPTIONS} new-session -s "${SESSION}"
    fi
}

tcc() {
    TMUX_OPTIONS='-CC'
    t "${*}"
}

activate() {

    pwd_name="$(basename "$(pwd)")"
    venvs_dir="${HOME}/.virtualenvs"

    if [ -d "${venvs_dir}/${pwd_name}" ]; then
        # shellcheck disable=SC1090
        . "${venvs_dir}/${pwd_name}/bin/activate"
    elif [ -d ".venv" ]; then
        # shellcheck disable=SC1091
        . ".venv/bin/activate"
    else
        echo "No virtualenv found. Looked for ${venvs_dir}/${pwd_name} and .venv"
    fi
}

test -d "${HOME}/.vim/pack/" && echo "${HOME}/.vim/pack/ exists"
test -d "${HOME}/.vim/bundle/" && echo "${HOME}/.vim/bundle/ exists"
