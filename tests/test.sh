#!/bin/bash

oneTimeSetUp() {
    INIT_SCRIPT="$(dirname "$(pwd)")/init.sh"
}

setUp() {
    TEST_DIR=$(mktemp -d "${SHUNIT_TMPDIR}/dotfiles_test.XXXXXXX")
    cd "${TEST_DIR}" || exit 1
}

testBackups() {
    touch .bashrc
    touch .bash_profile
    touch .zshrc

    sh "${INIT_SCRIPT}"

    assertTrue 'test -e .bashrc.bak'
    assertTrue 'test -e .bash_profile.bak'
    assertTrue 'test -e .zshrc.bak'
}

testFrameworkInstalls() {
    sh "${INIT_SCRIPT}"

    assertTrue 'oh-my-zsh missing' 'test -d .oh-my-zsh'
    assertTrue '.bash_it missing' 'test -d .bash_it'
}

testDotfileInstalls() {
    sh "${INIT_SCRIPT}"

    files=(.zshrc .tmux.conf .vimrc .gitconfig .gitexcludes)
    for f in "${files[@]}"; do
        assertTrue "${f} missing" "test -f ${f}"
    done

}

. ./shunit2
