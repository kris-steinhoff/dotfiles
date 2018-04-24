export PATH=${HOME}/bin:/usr/local/bin:/opt/bin:${PATH}
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

alias dotfiles-update-submodules-and-push='cd ~ && dotfiles submodule update --recursive --remote && dotfiles add .oh-my-zsh .vim/bundle && dotfiles ci -m "Update submodules" && dotfiles push'

alias dotfiles-pull-submodules-and-merge='cd ~ && dotfiles pull && dotfiles submodule update --init --merge'


alias tacc='tmux -CC attach -t'
alias tadcc='tmux -CC attach -d -t'
alias tscc='tmux -CC new-session -s'

# who and where am i:
alias wwami='echo "$(whoami)@$(hostname):$(pwd)"'
export EDITOR='vim'


# activate a python virtualenv
function activate() {
    if [ ! -z "${VIRTUAL_ENV}" ]; then
      echo "Already active ${VIRTUAL_ENV}"
      return 0
    fi

    dir="$(pwd)"
    name="$(basename ${dir})"
    external_venv="${HOME}/.virtualenvs/${name}"
    internal_venv="venv"
    if [ -d "${internal_venv}" ]; then
        venv="${internal_venv}"
    elif [ -d "${external_venv}" ]; then
        venv="${external_venv}"
    else
        echo "Could not find a virtualenv in ./${internal_venv} or ${external_venv}"
        return 1
    fi

    activate="${venv}/bin/activate"
    if [ -f "${activate}" ]; then
        source "${activate}" &&
            echo "Activated ${venv}"
    else
        echo "${activate} does not exist"
        return 1
    fi
}


# set docker-machine env variables
function docker-env() {
   VARS=`docker-machine env`;
   if [ $? -ne 0 ]; then
       echo -e '\nCould not set Docker variables.'
       return 1
   else
       eval ${VARS}
       print ${VARS}
       echo -e '\nDocker variables set.'
       return 0
   fi
}

test -f "${HOME}/.travis/travis.sh" && source "${HOME}/.travis/travis.sh"
