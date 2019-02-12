#!/bin/bash

DOTFILES_INSTALL_DIR=$(pwd)

set -x

# Install oh-my-zsh
git clone --depth=1 https://github.com/robbyrussell/oh-my-zsh.git "${DOTFILES_INSTALL_DIR}/.oh-my-zsh"

# Install bash-it
git clone --depth=1 https://github.com/Bash-it/bash-it.git "${DOTFILES_INSTALL_DIR}/.bash_it"

# Install vim-plug
curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

declare -a files=(
    '.oh-my-zsh-custom/themes/kris.zsh-theme'
    '.ssh/rc'
    '.bash_profile'
    '.bashrc'
    '.gitconfig'
    '.gitexcludes'
    '.tmux.conf'
    '.uitls.conf'
    '.vimrc'
    '.zshrc'
    )

for f in "${files[@]}"; do
    # backup original files
    mv "${f}" "${f}.dotfiles-grab.bak" 2> /dev/null || true

    curl -s -O "https://raw.githubusercontent.com/ksofa2/dotfiles/master/${f}"

    # create directory if needed
    mkdir -p "$(dirname ${f})" 2> /dev/null || true
    
    # move file to correct directory
    mv "$(basename ${f})" "${f}" 2> /dev/null || true
done
