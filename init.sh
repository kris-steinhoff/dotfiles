git init --bare $HOME/.dotfiles
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles remote add origin https://github.com/{{ site.github.repository_nwo }}.git
dotfiles pull origin master
dotfiles branch --set-upstream-to=origin/master master
dotfiles submodule update --init  # new version of git, you can add --depth=100 to speed things up
