FROM node:24-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
        curl \
        openssh-server \
        sudo \
        zsh \
        direnv \
        ripgrep \
        fd-find \
        bat \
        fzf \
        less \
        unzip \
        xz-utils \
        build-essential \
        python3 \
        locales \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
    && ln -sf /usr/bin/batcat /usr/local/bin/bat

ENV LANG=en_US.UTF-8

# Debian's apt doesn't carry gh; pull from GitHub's own apt repo per its
# official install docs (https://github.com/cli/cli/blob/trunk/docs/install_linux.md).
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Neovim's Debian/apt build lags releases by a lot; the dotfiles' lazy-lock.json
# and treesitter setup expect a current release, so pull the GitHub binary.
# uname -m (not TARGETARCH) since that ARG only gets auto-populated by
# BuildKit — silently empty otherwise, defaulting to the wrong arch.
RUN arch=$(case "$(uname -m)" in aarch64) echo arm64 ;; *) echo x86_64 ;; esac) \
    && curl -fsSLo /tmp/nvim.tar.gz "https://github.com/neovim/neovim/releases/latest/download/nvim-linux-${arch}.tar.gz" \
    && tar -C /opt -xzf /tmp/nvim.tar.gz \
    && mv /opt/nvim-linux-${arch} /opt/nvim \
    && ln -s /opt/nvim/bin/nvim /usr/local/bin/nvim \
    && rm /tmp/nvim.tar.gz

RUN BINDIR=/usr/local/bin sh -c "$(curl -fsLS get.chezmoi.io)"

RUN curl -fsSL https://starship.rs/install.sh | sh -s -- --yes

RUN npm install -g @anthropic-ai/claude-code opencode-ai tree-sitter-cli \
    && npm cache clean --force

RUN useradd -m -s /usr/bin/zsh agent \
    && echo 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/agent \
    && mkdir -p /home/agent/.ssh \
    && chmod 700 /home/agent/.ssh \
    && chown -R agent:agent /home/agent/.ssh

COPY sshd_config /etc/ssh/sshd_config.d/agent-container.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

# herdr installs into the invoking user's home dir, and chezmoi apply runs
# run_once_bootstrap.sh (which skips the brew step here since brew isn't
# installed) to lay down dotfiles and pre-fetch the pinned nvim plugins.
USER agent
WORKDIR /home/agent
RUN curl -fsSL https://herdr.dev/install.sh | sh
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/agent/.local/bin:${PATH}"
RUN chezmoi init --apply kris-steinhoff/dotfiles

USER root
EXPOSE 22
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
