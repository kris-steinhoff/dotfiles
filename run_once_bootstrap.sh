#!/bin/bash

set -e

# Ensure a config file includes/sources the shared config.
# Usage: ensure_config <file> <include_line> <grep_pattern>
ensure_config() {
	local file="$1" include_line="$2" grep_pattern="$3"
	local display_path="~${file#"$HOME"}"

	if [ ! -f "$file" ]; then
		mkdir -p "$(dirname "$file")"
		echo "$include_line" > "$file"
		echo "Created $display_path"
	elif ! grep -qF "$grep_pattern" "$file"; then
		echo -n "$display_path exists but doesn't include the shared config. Add it to the top? [y/N] "
		read -r answer
		if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
			tmp=$(mktemp)
			{ echo "$include_line"; echo; cat "$file"; } > "$tmp"
			mv "$tmp" "$file"
			echo "Added include to top of $display_path"
		fi
	fi
}

# shellcheck disable=SC2016
ensure_config "${HOME}/.zshrc" \
	'source "${HOME}/.config/kris-steinhoff/zshrc"' \
	'kris-steinhoff/zshrc'

ensure_config "${HOME}/.config/git/config" \
	'[include]
	path = ~/.config/kris-steinhoff/gitconfig' \
	'kris-steinhoff/gitconfig'

# shellcheck disable=SC2016
ensure_config "${HOME}/.vimrc" \
	'source $HOME/.config/kris-steinhoff/vimrc' \
	'kris-steinhoff/vimrc'

if type brew &>/dev/null; then
	brew bundle install --file="${HOME}/.config/homebrew/Brewfile"
fi
