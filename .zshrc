#!/usr/bin/env zsh

# === Local Pre-Config ===
[[ -f "${HOME}/.local-pre.sh" ]] && source "${HOME}/.local-pre.sh"

# === Environment ===
export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:${HOME}/go/bin"
export EDITOR="${OVERRIDE_EDITOR:-vim}"
export PIP_DISABLE_PIP_VERSION_CHECK=1

# === Homebrew ===

if [[ -f /opt/homebrew/bin/brew ]]; then
	eval "$(/opt/homebrew/bin/brew shellenv)"

	# Completions from brew packages
	FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"
	autoload -Uz compinit
	compinit
fi

# === Zsh Configuration ===

# Edit command in $EDITOR with Ctrl+X Ctrl+E
autoload -U edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line

# === Zsh Plugins (via Homebrew) ===
if type brew &>/dev/null; then
	source "$(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh" 2>/dev/null
	source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" 2>/dev/null
fi

# === Starship Prompt ===
if type starship &>/dev/null; then
	eval "$(starship init zsh)"
fi

# === Options ===
unsetopt share_history

# === Functions ===
activate() {
	pwd_name="$(basename "$(pwd)")"
	venvs_dir="${HOME}/.virtualenvs"

	if [ -d "${venvs_dir}/${pwd_name}" ]; then
		source "${venvs_dir}/${pwd_name}/bin/activate"
	elif [ -d ".venv" ]; then
		source ".venv/bin/activate"
	else
		echo "No virtualenv found. Looked for ${venvs_dir}/${pwd_name} and .venv"
	fi
}

# === Aliases ===

# General
alias l='ls -lah --color=auto'
alias ll='ls -lh --color=auto'

# Docker
alias dc='docker compose'
alias dco='docker compose'

# Git
alias g='git'

# Git - status & info
alias gst='git status'
alias gsh='git show'
alias gd='git diff'
alias gds='git diff --staged'
alias glg='git --no-pager l -20'

# Git - staging & commits
alias ga='git add'
alias grs='git restore'
alias gc='git commit --verbose'
alias gca='git commit --verbose --all'

# Git - branches
alias gbd='git branch --delete'
alias gco='git checkout'
alias gsw='git switch'
alias gswc='git switch --create'
alias gswm='git switch main'
alias gm='git merge'

# Git - remote
alias gf='git fetch'
alias gl='git pull'
alias gp='git push'
alias gpsup='git push --set-upstream origin $(git branch --show-current)'
alias gcl='git clone'

# Git - rebase & stash
alias grb='git rebase'
alias grbi='git rebase --interactive'
alias grbc='git rebase --continue'
alias grba='git rebase --abort'
alias gsta='git stash'

# === Local Post-Config ===
[[ -f "${HOME}/.local-post.sh" ]] && source "${HOME}/.local-post.sh"
