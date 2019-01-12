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
