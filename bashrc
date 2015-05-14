COLOR_PROMPT_RED="\[\e[31m\]"
COLOR_PROMPT_GREEN="\[\e[32m\]"
COLOR_PROMPT_YELLOW="\[\e[33m\]"
COLOR_PROMPT_BLUE="\[\e[34m\]"
COLOR_PROMPT_MAGENTA="\[\e[35m\]"
COLOR_PROMPT_CYAN="\[\e[36m\]"

COLOR_PROMPT_RED_BOLD="\[\e[31;0m\]"
COLOR_PROMPT_GREEN_BOLD="\[\e[32;0m\]"
COLOR_PROMPT_YELLOW_BOLD="\[\e[33;0m\]"
COLOR_PROMPT_BLUE_BOLD="\[\e[34;0m\]"
COLOR_PROMPT_MAGENTA_BOLD="\[\e[35;0m\]"
COLOR_PROMPT_CYAN_BOLD="\[\e[36;0m\]"

COLOR_PROMPT_NONE="\[\e[0m\]"

if [ $UID -eq 0 ]; then
    export PROMPT_CHAR="#"
else
    export PROMPT_CHAR="$"
fi

prompt_context()
{
    echo "${COLOR_PROMPT_YELLOW}\u${COLOR_PROMPT_NONE}@${COLOR_PROMPT_RED}\h${COLOR_PROMPT_NONE}:${COLOR_PROMPT_YELLOW}\w${COLOR_PROMPT_NONE}"
}

prompt_time()
{
    echo "${COLOR_PROMPT_CYAN}\t${COLOR_PROMPT_NONE}"
}

prompt_rc()
{
    if test $PREV_RET_VAL -ne 0; then
        echo "${COLOR_PROMPT_RED}[${PREV_RET_VAL}]${COLOR_PROMPT_NONE} "
    fi
}

prompt_window_title()
{
    if [ "x" != "x${WINDOW_TITLE}" ]; then
        echo -ne "\033]0;${WINDOW_TITLE}\007"
    fi
}

fancy_prompt()
{
    PREV_RET_VAL=$?;
    PS1="`prompt_context`\n`prompt_rc`${COLOR_PROMPT_YELLOW}${PROMPT_CHAR}${COLOR_PROMPT_NONE} "
    prompt_window_title
}

export PROMPT_COMMAND=fancy_prompt
