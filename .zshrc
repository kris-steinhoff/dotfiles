test -f "${HOME}/.utils.sh" && source "${HOME}/.utils.sh"

# Path to your oh-my-zsh installation.
export ZSH=${HOME}/.oh-my-zsh

ZSH_THEME="kris"
ZSH_CUSTOM=${HOME}/.oh-my-zsh-custom

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_UPDATE="true"

plugins=(git git-prompt virtualenv django python tmux vagrant kubectl minikube docker)

export ZSH_TMUX_ITERM2=true
source $ZSH/oh-my-zsh.sh

unsetopt share_history

test -f "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"

