
test -f "${HOME}/.utils.sh" && source "${HOME}/.utils.sh"

# Path to your oh-my-zsh installation.
export ZSH=${HOME}/.oh-my-zsh

ZSH_THEME="kris"
ZSH_CUSTOM=${HOME}/.oh-my-zsh-custom

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_UPDATE="true"

plugins=(vi-mode git git-prompt virtualenv django python tmux vagrant kubectl minikube docker)

export ZSH_TMUX_ITERM2=true
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


unsetopt share_history

test -f "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"

