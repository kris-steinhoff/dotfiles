#!/bin/sh

if [ "x${1}" = "x-h" -o "x${1}" = "x" ]; then
    echo "usage: `basename ${0}` host [ file1 [ file2 ]]"
    exit 1
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
    echo Copying ${dotfile} to ${dest}.${dotfile}
    ${cmd} ${dotfile} ${dest}.${dotfile}
done
