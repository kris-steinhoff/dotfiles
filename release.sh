#!/bin/sh

files="bashrc_common.sh inputrc screenrc vimrc gitconfig gitexcludes"

if [ "x${1}" == "x-h" ]; then
    echo "usage: `basename ${0}` [ host ]"
    exit 1
elif [ "x${1}" == "x" ]; then
    cmd=cp
    dest="${HOME}/"
else
    cmd=scp
    dest="${1}:"
fi

for dotfile in ${files}; do
    ${cmd} ${dotfile} ${dest}.${dotfile}
done
