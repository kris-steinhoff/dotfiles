# dotfiles

## Initialize

### Ubuntu

```shell
sudo apt update && sudo apt install -y yadm vim tmux curl zsh git
yadm clone https://github.com/kris-steinhoff/dotfiles
```

### macOS

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install yadm 
yadm clone https://github.com/kris-steinhoff/dotfiles
yadm boostrap
```
