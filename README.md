
```
git clone git@github.com:ksofa2/dotfiles.git ~/.dotfiles
mkdir ~/.oh-my-zsh/custom/themes
cd ~/.dotfiles
for f in $(find * -type file -print | grep -v README); do cp -v $f $HOME/.$f; done
```
