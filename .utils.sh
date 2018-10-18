export PATH=${HOME}/bin:/usr/local/bin:/opt/bin:${PATH}
export PATH=${PATH}:/${HOME}/go/bin
alias dotfiles='$(which git) -c status.showUntrackedFiles=no --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

alias dotfiles-update-submodules-and-push='cd ~ && dotfiles submodule update --remote && dotfiles add .oh-my-zsh .bash_it .vim/bundle .vim/pack/ && dotfiles ci -m "Update submodules" && dotfiles push'

alias dotfiles-pull-submodules-and-merge='cd ~ && dotfiles pull && dotfiles submodule update --recursive --init --merge'


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


function ls_or_page() {
    TARGET=${1:-'.'}

    if [ -d "${TARGET}" ]; then
        ls -la "${TARGET}"
    elif [ -f "${TARGET}" ]; then
        ${PAGER:-"cat"} "${TARGET}"
    else
        echo "ERROR: could not ls or ${PAGER:-'cat'} ${TARGET}"
    fi
}

alias c=ls_or_page

function tcc() {
    SESSION="$(basename $(pwd))"
    tmux list-sessions | grep -q "^${SESSION}"; rc=$?
    echo $rc
    if [ ${rc} -eq 0 ]; then
        echo attach
        tmux -CC attach-session -d -t "${SESSION}"
    else
        echo new
        tmux -CC new-session -s "${SESSION}"
    fi
}

test -f "${HOME}/.travis/travis.sh" && source "${HOME}/.travis/travis.sh"

test -f "${HOME}/.local.sh" && source "${HOME}/.local.sh"
