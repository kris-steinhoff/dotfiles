#!/usr/bin/env zsh


test -f "${HOME}/.local-pre.sh" && source "${HOME}/.local-pre.sh"

if [ -d "${HOME}/.oh-my-zsh" ]; then
    # Path to your oh-my-zsh installation.
    export ZSH=${HOME}/.oh-my-zsh

    ZSH_THEME="kris"
    ZSH_CUSTOM=${HOME}/.oh-my-zsh-custom

    COMPLETION_WAITING_DOTS="true"
    # DISABLE_AUTO_UPDATE="true"

    plugins=(vi-mode virtualenv git git-prompt python tmux kubectl vagrant docker docker-compose poetry pyenv terraform minikube zsh-autosuggestions zsh-syntax-highlighting conda-zsh-completion)

    # https://docs.brew.sh/Shell-Completion#configuring-completions-in-zsh
    if type brew &>/dev/null
    then
        FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"

        autoload -Uz compinit
        compinit
    fi

    source $ZSH/oh-my-zsh.sh
else
    echo "${HOME}/.oh-my-zsh not found (https://github.com/robbyrussell/oh-my-zsh)"
fi

unsetopt share_history

test -f "${HOME}/.utils.sh" && source "${HOME}/.utils.sh"
test -f "${HOME}/.local.sh" && echo "WARNING: ${HOME}/.local.sh is deprecated, move it to ${HOME}/.local-post.sh"
test -f "${HOME}/.local-post.sh" && source "${HOME}/.local-post.sh"
