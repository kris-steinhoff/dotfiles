#!/usr/bin/env bash

set -o vi

test -f "${HOME}/.utils.sh" && source "${HOME}/.utils.sh"

if [ -d "${HOME}/.bash_it" ]; then
    # Path to the bash it configuration
    export BASH_IT="${HOME}/.bash_it"

    # Lock and Load a custom theme file
    # location /.bash_it/themes/
    export BASH_IT_THEME='simple'

    # (Advanced): Change this to the name of your remote repo if you
    # cloned bash-it with a remote other than origin such as `bash-it`.
    # export BASH_IT_REMOTE='bash-it'

    # Your place for hosting Git repos. I use this for private repos.
    export GIT_HOSTING='git@git.domain.com'

    # Don't check mail when opening terminal.
    unset MAILCHECK

    # Change this to your console based IRC client of choice.
    export IRC_CLIENT='irssi'

    # Set this to the command you use for todo.txt-cli
    export TODO="t"

    # Set this to false to turn off version control status checking within the prompt for all themes
    export SCM_CHECK=true

    # Set Xterm/screen/Tmux title with only a short hostname.
    # Uncomment this (or set SHORT_HOSTNAME to something else),
    # Will otherwise fall back on $HOSTNAME.
    #export SHORT_HOSTNAME=$(hostname -s)

    # Set Xterm/screen/Tmux title with only a short username.
    # Uncomment this (or set SHORT_USER to something else),
    # Will otherwise fall back on $USER.
    #export SHORT_USER=${USER:0:8}

    # Set Xterm/screen/Tmux title with shortened command and directory.
    # Uncomment this to set.
    #export SHORT_TERM_LINE=true

    # Set vcprompt executable path for scm advance info in prompt (demula theme)
    # https://github.com/djl/vcprompt
    #export VCPROMPT_EXECUTABLE=~/.vcprompt/bin/vcprompt

    # (Advanced): Uncomment this to make Bash-it reload itself automatically
    # after enabling or disabling aliases, plugins, and completions.
    # export BASH_IT_AUTOMATIC_RELOAD_AFTER_CONFIG_CHANGE=1

    # Load Bash It
    source "$BASH_IT"/bash_it.sh

    #added TITLEBAR for updating the tab and window titles with the pwd
    case $TERM in
        xterm*)
        TITLEBAR="\[\033]0;\w\007\]"
        ;;
        *)
        TITLEBAR=""
        ;;
    esac

    function prompt_command() {
        rc=${?}
        PS1="${TITLEBAR}${yellow}\H ${reset_color}${cyan}\w${bold_blue}\[$(scm_prompt_info)\]${normal} "
        if [ $rc -eq 0 ]; then
            PS1="${PS1}$ "
        else
            PS1="${PS1}${red}${rc} $ ${normal}"
        fi

    }

    # scm themeing
    SCM_THEME_PROMPT_DIRTY=" ✗"
    SCM_THEME_PROMPT_CLEAN=" ✓"
    SCM_THEME_PROMPT_PREFIX=" ("
    SCM_THEME_PROMPT_SUFFIX=")"

    safe_append_prompt_command prompt_command
else
    echo "${HOME}/.bash_it not found (https://github.com/Bash-it/bash-it)"
fi

# tmux aliases
alias ts='tmux new-session -s'
alias ta='tmux attach -t'
alias tl='tmux list-sessions'
