## Initialize

To set up a user with these dot files:

```
git init --bare $HOME/.dotfiles
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles remote add origin https://github.com/{{ site.github.repository_nwo }}.git
dotfiles pull origin master
dotfiles branch --set-upstream-to=origin/master master
dotfiles submodule update --init  # new version of git, you can add --depth=100 to speed things up
```

or

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
