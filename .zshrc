export PATH=${HOME}/bin:/usr/local/bin:/opt/bin:${PATH}
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

alias tacc='tmux -CC attach -t'
alias tadcc='tmux -CC attach -d -t'
alias tscc='tmux -CC new-session -s'

# who and where am i:
alias wwami='echo "$(whoami)@$(hostname):$(pwd)"'

# Path to your oh-my-zsh installation.
export ZSH=${HOME}/.oh-my-zsh

ZSH_THEME="kris"
ZSH_CUSTOM=${HOME}/.oh-my-zsh-custom

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_UPDATE="true"

# DISABLE_UNTRACKED_FILES_DIRTY="true"


plugins=(git git-prompt virtualenv django python tmux vagrant)

export ZSH_TMUX_ITERM2=true
source $ZSH/oh-my-zsh.sh

export EDITOR='vim'
# ZSH_THEME_GIT_PROMPT_PREFIX="("
# ZSH_THEME_GIT_PROMPT_SUFFIX=")"
# ZSH_THEME_GIT_PROMPT_SEPARATOR="|"
# ZSH_THEME_GIT_PROMPT_BRANCH="%{$fg_bold[magenta]%}"
# ZSH_THEME_GIT_PROMPT_STAGED="%{$fg[red]%}%{●%G%}"
# ZSH_THEME_GIT_PROMPT_CONFLICTS="%{$fg[red]%}%{✖%G%}"
# ZSH_THEME_GIT_PROMPT_CHANGED="%{$fg[cyan]%}%{✚%G%}"
# ZSH_THEME_GIT_PROMPT_BEHIND="%{↓%G%}"
# ZSH_THEME_GIT_PROMPT_AHEAD="%{↑%G%}"
# ZSH_THEME_GIT_PROMPT_UNTRACKED="%{…%G%}"
# ZSH_THEME_GIT_PROMPT_CLEAN="%{$fg_bold[green]%}%{✔%G%}"


test -e "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"
