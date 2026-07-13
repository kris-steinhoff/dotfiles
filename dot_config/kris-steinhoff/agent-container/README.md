# agent-container

A Debian-based container for running Claude Code / opencode isolated from
the host, attached to with [herdr](https://herdr.dev) over SSH. Runs locally
for now; moving it to a remote host later is a matter of changing the SSH
target, not the image.

Ships: `claude`, `opencode`, `neovim` (latest release), `chezmoi` (applies
this dotfiles repo on build), and `sshd` so herdr can attach to a persistent
session inside the container.

## First-time setup

Authorize an existing key to log in as `agent`. If your keys live in an SSH
agent (1Password's SSH agent, `ssh-agent`, etc.) rather than as files under
`~/.ssh`, get the public key from the agent instead of `cat`-ing a file that
may not exist:

```sh
ssh-add -L
```

Pick the line for the key you want to use and write it to `authorized_keys`
(a dedicated key is best, if you have one — this never needs your general
personal key):

```sh
echo 'ssh-ed25519 AAAA... key-comment' > authorized_keys
```

(gitignored via the repo's root `.gitignore` and kept out of the image via
`.dockerignore` regardless.)

The `Host agent-container` entry that herdr (and plain `ssh`) needs lives in
`ssh_config` next to this README — this is the file to edit when you move to
a remote host later (just change `HostName`). Pull it into your real SSH
config with an `Include`, added near the top of `~/.ssh/config` since `Include`
is processed in place and `ssh_config` uses first-match-wins:

```
# ~/.ssh/config
Include ~/.config/kris-steinhoff/agent-container/ssh_config
```

`ForwardAgent yes` in that entry lets git inside the container use your
host's ssh-agent for clone/push over SSH, without ever putting a private key
in the image.

## Build and run

```sh
docker compose build
docker compose up -d
herdr --remote agent-container
```

`herdr --remote` installs herdr on the container the first time it connects
and gives you a persistent session — detach and reattach freely, and it
survives your local terminal closing.

## Credentials

Not baked into the image. Either:

- Run `claude` / `opencode` inside the container once and complete the
  normal interactive login, which persists in the `agent_home` volume, or
- Set `ANTHROPIC_API_KEY` / `OPENCODE_API_KEY` in the shell before
  `docker compose up` (compose reads them from the environment; see
  `docker-compose.yml`).

## Persistence

`agent_home` is a named volume mounted at `/home/agent` — it's seeded from
the image on first start (dotfiles, herdr, nvim plugins already installed)
and then persists auth tokens, shell history, and anything else you don't
mount separately across `docker compose restart`/`down`+`up`. `docker
compose down -v` deletes it.

`ssh_host_keys` persists the sshd host keys across rebuilds so your local
`known_hosts` doesn't need updating every time you rebuild the image.

To work on a project, bind-mount it in — see the commented example in
`docker-compose.yml`. Anything not mounted only exists in `agent_home`.

## Using a local model (LM Studio, etc.)

In LM Studio, Developer tab → Server Settings → enable "Serve on Local
Network" (it binds `127.0.0.1` by default, which the container can't reach
at all — note LM Studio's server has no auth by default, so this exposes it
to your whole LAN, not just the container). Note the port (default `1234`).

`docker-compose.yml` already maps `host.docker.internal` to the Mac through
Colima's VM (`extra_hosts: host-gateway`).

LM Studio 0.4.1+ serves a native Anthropic-compatible `/v1/messages`
endpoint, so `claude` can point straight at it — no proxy, no opencode
detour:

```sh
export ANTHROPIC_BASE_URL=http://host.docker.internal:1234
export ANTHROPIC_AUTH_TOKEN=lmstudio
```

`opencode` works the same way via its OpenAI-compatible endpoint if you'd
rather use that instead; see its provider config docs.

## Moving to a remote host later

Rebuild the image on (or push it to) the remote host, run the compose stack
there, then just point the `Host agent-container` block in `~/.ssh/config`
at the remote address instead of `localhost`. Nothing about the container
or the herdr invocation changes.

## Known gaps

- `zsh-autosuggestions` / `zsh-syntax-highlighting` in the shared zshrc are
  only sourced when Homebrew is present, which this container doesn't have
  (by choice, to keep the image apt-only). The shell works, just without
  those two plugins.
