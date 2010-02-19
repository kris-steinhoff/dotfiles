#!/bin/sh

if [ "x${1}" = "x-h" ]; then
    echo "usage: `basename ${0}` [ host ] [ file ]"
    exit 1
elif [ "x${1}" = "x" ]; then
    cmd=cp
    dest="${HOME}/"
elif [ "x${1}" = "x-" ]; then
    shift;
    cmd=cp
    dest="${HOME}/"
else
    cmd=scp
    dest="${1}:"
    shift
fi

if [ "x${*}" != "x" ]; then
    files="${*}"
else
    files="bashrc_common inputrc screenrc vimrc gitconfig gitexcludes"
fi

for dotfile in ${files}; do
    ${cmd} ${dotfile} ${dest}.${dotfile}
done
