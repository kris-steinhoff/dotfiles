test -f "${HOME}/.utils.sh" && source "${HOME}/.utils.sh"

# initialize pyenv
if [ $(command -v pyenv) ]; then
    eval "$(pyenv init --path)"
fi

if [ -d "${HOME}/.oh-my-zsh" ]; then
    # Path to your oh-my-zsh installation.
    export ZSH=${HOME}/.oh-my-zsh

    ZSH_THEME="kris"
    ZSH_CUSTOM=${HOME}/.oh-my-zsh-custom

    COMPLETION_WAITING_DOTS="true"
    # DISABLE_AUTO_UPDATE="true"

    plugins=(vi-mode virtualenv git git-prompt django python tmux kubectl vagrant docker docker-compose poetry)

    # export ZSH_TMUX_ITERM2=true
    if [ $(command -v brew) ]; then
        # https://docs.brew.sh/Shell-Completion#configuring-completions-in-zsh
        FPATH=$(brew --prefix)/share/zsh/site-functions:$FPATH
    fi
    source $ZSH/oh-my-zsh.sh
else
    echo "${HOME}/.oh-my-zsh not found (https://github.com/robbyrussell/oh-my-zsh)"
fi

unsetopt share_history

alias glg="git log --graph --pretty=format:'%C(dim)%h %cr -%Creset %s %C(dim)-%Creset %C(cyan)%an%Creset%C(yellow)%d%Creset' --abbrev-commit --abbrev=7"

test -f "${HOME}/.local.sh" && source "${HOME}/.local.sh" || true
