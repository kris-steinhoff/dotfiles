# dotfiles

I use this technique to manage my dotfiles accross all of my \*nix environments. It makes my home directory a git repository, and creates a `dotfiles` alias that is a git command with some flags to sets the repo directory and uses a flag to ignore untracked files.

### Requirements
- git 1.8


## Initialize

To set up a user with these dot files:

```
wget https://raw.githubusercontent.com/ksofa2/dotfiles/gh-pages/init.sh && sh init.sh && rm init.sh
```

## Upgrade submodule

To upgrade and push submodules:

```
cd ~ && dotfiles submodule update --recursive --remote && dotfiles add .oh-my-zsh .vim/bundle && dotfiles ci -m 'Update submodules' && dotfiles push
```

## Pull upgraded submodules

To upgrade other instances:

```
cd ~ && dotfiles pull && dotfiles submodule update --init --merge
```
