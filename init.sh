mv .zshrc .zshrc.bak
mv .bashrc .bashrc.bak
mv .bash_profile .bash_profile.bak

git init --bare $HOME/.dotfiles
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

dotfiles remote add origin https://github.com/ksofa2/dotfiles.git
dotfiles fetch
dotfiles pull origin master
dotfiles branch --set-upstream-to=origin/master master
