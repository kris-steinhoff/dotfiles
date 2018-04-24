# dotfiles

I use this technique to manage my dotfiles accross all of my \*nix environments. It makes my home directory a git repository, and creates a `dotfiles` alias that is a git command with some flags to sets the repo directory and uses a flag to ignore untracked files.

### Requirements
- git 1.8


## Initialize

To set up a user with these dot files:

with wget:
```
wget https://raw.githubusercontent.com/ksofa2/dotfiles/gh-pages/init.sh && sh init.sh && rm init.sh
```

or with curl:
```
curl -O https://raw.githubusercontent.com/ksofa2/dotfiles/gh-pages/init.sh && sh init.sh && rm init.sh
```

If you want to use zsh, change your shell with `chsh`.

Create a new shell to see the changes. (Or: `source ~/.zshrc` for ZSH; `source ~/.bash_profile` for Bash)

## Upgrade submodules

To upgrade and push submodules, use the `dotfiles-update-submodules-and-push` alias.

## Pull upgraded submodules

To pull and upgrade on other instances, use the `dotfiles-pull-submodules-and-merge` alias.
