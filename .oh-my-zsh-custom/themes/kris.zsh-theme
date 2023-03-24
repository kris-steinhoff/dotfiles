ZSH_THEME_VIRTUALENV_PREFIX="("
ZSH_THEME_VIRTUALENV_SUFFIX=") "

local ret_status="%(?::%{$fg_bold[red]%}%? )"

PROMPT_HOST=${PROMPT_HOST_OVERRIDE-$(hostname)}

# Prompt with host name:
PROMPT="%{$fg[yellow]%}${PROMPT_HOST}%{$reset_color%} %{$fg[cyan]%}%c%{$reset_color%} %{$fg[blue]%}$(virtualenv_prompt_info)%{$reset_color%}${ret_status}%#%{$reset_color%} "
