#!/bin/bash

DOTFILES_INSTALL_DIR=$(pwd)

git clone --depth=1 https://github.com/robbyrussell/oh-my-zsh.git "${DOTFILES_INSTALL_DIR}/.oh-my-zsh"
git clone --depth=1 https://github.com/Bash-it/bash-it.git "${DOTFILES_INSTALL_DIR}/.bash_it"

mv -v .zshrc .zshrc.bak
mv -v .bashrc .bashrc.bak
mv -v .bash_profile .bash_profile.bak

git init --bare "${DOTFILES_INSTALL_DIR}/.dotfiles"
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$DOTFILES_INSTALL_DIR/.dotfiles/ --work-tree=$DOTFILES_INSTALL_DIR'

dotfiles remote add origin https://github.com/ksofa2/dotfiles.git
dotfiles fetch
dotfiles pull origin master
dotfiles branch --set-upstream-to=origin/master master
