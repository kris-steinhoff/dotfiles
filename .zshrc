source "${HOME}/.config/kris-steinhoff/zshrc"

export MAY_SOFTWARE=$HOME/code/gitlab.com/maymobility/may/may/software

export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
export TESTCONTAINERS_RYUK_DISABLED=true


alias almc="aws-profile-login maymobility-CertifiedUser"
alias alpc="aws-profile-login production-CertifiedUser"
alias alpp="aws-profile-login production-PowerUserAccess"
alias alsc="aws-profile-login sandbox-CertifiedUser"
alias alsp="aws-profile-login sandbox-PowerUserAccess"

