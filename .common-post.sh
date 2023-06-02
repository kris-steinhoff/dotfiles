#!/bin/sh

alias glg="git l"
alias dco="docker-compose"


test -f "${HOME}/.local.sh" && echo "WARNING: ${HOME}/.local.sh is deprecated, move it to ${HOME}/.local-post.sh"
test -f "${HOME}/.local-post.sh" && . "${HOME}/.local-post.sh"
