# Path to your oh-my-zsh installation.
export ZSH=${HOME}/.oh-my-zsh

ZSH_THEME="kris"
ZSH_CUSTOM=${HOME}/.dotfiles/oh-my-zsh/custom

COMPLETION_WAITING_DOTS="true"

# DISABLE_UNTRACKED_FILES_DIRTY="true"


plugins=(git git-prompt django python tmux)

source $ZSH/oh-my-zsh.sh

export EDITOR='vim'
