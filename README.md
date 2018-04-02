To set up a user with these dot files:

```
git init --bare $HOME/.dotfiles
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles remote add origin https://github.com/{{ site.github.repository_nwo }}.git
dotfiles pull origin master
dotfiles branch --set-upstream-to=origin/master master
dotfiles submodule update --init  # new version of git, you can add --depth=1 to speed things up
```

To push upgraded submodules:

```
cd ~ && dotfiles submodule update --recursive --remote && dotfiles add .oh-my-zsh .vim/bundle && dotfiles ci -m 'Update submodules' && dotfiles push
```

To upgrade other instance:

```
cd ~ && dotfiles pull && dotfiles submodule update --init --merge
```
