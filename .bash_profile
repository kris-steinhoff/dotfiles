#!/usr/bin/env bash

source "${HOME}/.common-post.sh"

# https://docs.brew.sh/Shell-Completion#configuring-completions-in-bash
if type brew &>/dev/null
then
  HOMEBREW_PREFIX="$(brew --prefix)"
  if [[ -r "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh" ]]
  then
    source "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh"
  else
    for COMPLETION in "${HOMEBREW_PREFIX}/etc/bash_completion.d/"*
    do
      [[ -r "${COMPLETION}" ]] && source "${COMPLETION}"
    done
  fi
fi


if [ -d "${HOME}/.bash_it" ]; then
    # Path to the bash it configuration
    export BASH_IT="${HOME}/.bash_it"

    # Lock and Load a custom theme file
    # location /.bash_it/themes/
    export BASH_IT_THEME='simple'

    # Set this to false to turn off version control status checking within the prompt for all themes
    export SCM_CHECK=true

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

    PROMPT_HOST=${PROMPT_HOST_OVERRIDE-$(hostname -s)}

    function prompt_command() {
        rc=${?}

        PS1="${TITLEBAR}${yellow}${PROMPT_HOST} ${reset_color}${cyan}\w${bold_blue}\[$(scm_prompt_info)\]${normal} "
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

    alias gst="git status"
else
    echo "${HOME}/.bash_it not found (https://github.com/Bash-it/bash-it)"
fi

source "${HOME}/.common-post.sh"
