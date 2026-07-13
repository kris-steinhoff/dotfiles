#!/bin/sh
set -eu

# No systemd/tmpfiles in the container to create sshd's privilege-separation
# dir, and no init script to generate host keys on first boot, so do both.
mkdir -p -m 0755 /run/sshd
ssh-keygen -A >/dev/null

# The authorized_keys source is a read-only mount owned by whatever UID it
# has on the host, which fails sshd's StrictModes check. Copy it in and fix
# ownership/perms on every start instead of mounting straight into ~/.ssh.
if [ -f /run/agent-container/authorized_keys ]; then
    cp /run/agent-container/authorized_keys /home/agent/.ssh/authorized_keys
    chown agent:agent /home/agent/.ssh/authorized_keys
    chmod 600 /home/agent/.ssh/authorized_keys
fi

exec /usr/sbin/sshd -D -e
