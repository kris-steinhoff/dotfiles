#!/bin/sh

alias glg="git --no-pager l -20"
alias dco="docker compose"
alias dc="docker compose"

export EDITOR="${OVERRIDE_EDITOR-'vim'}"

test -f "${HOME}/.local.sh" && echo "WARNING: ${HOME}/.local.sh is deprecated, move it to ${HOME}/.local-post.sh" && . "${HOME}/.local.sh"
test -f "${HOME}/.local-post.sh" && . "${HOME}/.local-post.sh" || true
