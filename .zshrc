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

    plugins=(vi-mode virtualenv git git-prompt django python tmux kubectl vagrant docker docker-compose)

    export ZSH_TMUX_ITERM2=true
    if [ $(command -v brew) ]; then
        # https://docs.brew.sh/Shell-Completion#configuring-completions-in-zsh
        FPATH=$(brew --prefix)/share/zsh/site-functions:$FPATH
    fi
    source $ZSH/oh-my-zsh.sh

    # https://github.com/robbyrussell/oh-my-zsh/issues/1720#issuecomment-286366959
    # start typing + [Up-Arrow] - fuzzy find history forward
    if [[ "${terminfo[kcuu1]}" != "" ]]; then
      autoload -U up-line-or-beginning-search
      zle -N up-line-or-beginning-search
      bindkey "${terminfo[kcuu1]}" up-line-or-beginning-search
    fi
    # start typing + [Down-Arrow] - fuzzy find history backward
    if [[ "${terminfo[kcud1]}" != "" ]]; then
      autoload -U down-line-or-beginning-search
      zle -N down-line-or-beginning-search
      bindkey "${terminfo[kcud1]}" down-line-or-beginning-search
    fi
else
    echo "${HOME}/.oh-my-zsh not found (https://github.com/robbyrussell/oh-my-zsh)"
fi

unsetopt share_history

test -f "${HOME}/.local.sh" && source "${HOME}/.local.sh" || true
