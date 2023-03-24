#!/bin/sh

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:/opt/bin:${HOME}/go/bin"

export EDITOR="${OVERRIDE_EDITOR-'vim'}"
export PIP_DISABLE_PIP_VERSION_CHECK=1

alias glg="git l"
alias dco="docker-compose"


# initialize pyenv, if it's installed
if [ -d "$HOME/.pyenv" ]; then
    export PYENV_ROOT="$HOME/.pyenv"
    command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init -)"
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

test -d "${HOME}/.vim/pack/" && echo "${HOME}/.vim/pack/ exists"
test -d "${HOME}/.vim/bundle/" && echo "${HOME}/.vim/bundle/ exists"
