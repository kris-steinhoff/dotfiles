"""How each agent kind's own CLI is started, shared by every dispatch backend.

Herdr starts the kind's command itself and takes these as extra arguments;
Orca types the whole command line into a terminal. Either way the flags are
the agent CLI's, not the workspace tool's, so they live here once.

Adding an agent kind is a KINDS entry, plus a MODEL_FLAGS entry when it does
not take `--model <hint>` (gemini and codex take `-m <hint>`).
"""

import json
from pathlib import Path
import re

KINDS = ["claude", "codex", "gemini", "copilot", "opencode", "pi"]

# Turn a short model hint (e.g. "opus") into the agent CLI's flag. Most kinds
# accept --model; gemini and codex use -m. Extend the table to add a kind.
MODEL_FLAGS = {
    "gemini": "-m",
    "codex": "-m",
}

# Turn a persona name into the agent CLI's persona-select flag. Only these two
# kinds support personas in this repo; any other kind with --persona is a
# needs-judgment case, not a silent drop.
PERSONA_FLAGS = {
    "claude": "--agent",
    "codex": "--profile",
}

# Turn the resolved agent name into the agent CLI's own session-name flag, so the
# one name also names the session inside the agent. Only applied with --name;
# kinds absent here just get the workspace tool's name.
NAME_FLAGS = {
    "claude": "-n",
}

# Arguments a kind always gets. An interactive Codex otherwise runs its tool
# commands and hooks in a shared app-server daemon, which carries the
# environment of whichever terminal first started it, so every Codex session
# would report that terminal's workspace-tool ids instead of its own.
# --no-daemon keeps the app server inside this terminal's process. Approval
# behavior stays in managed config; a launcher flag would override future
# config choices.
KIND_ARGS = {
    "codex": ["--no-daemon"],
}

# The agent-name rule. It is Herdr's, and every tool accepts it.
AGENT_NAME = re.compile(r"[a-z][a-z0-9_-]{0,31}")


class Refusal(Exception):
    """An agent can't be started as asked. The launcher reports it as needs-judgment."""

    def __init__(self, reason, **partial):
        super().__init__(reason)
        self.reason = reason
        self.partial = partial


def check_request(kind, persona, name, developer_instructions_file):
    """Refuse a launch whose options don't fit together, before anything starts."""
    if persona and kind not in PERSONA_FLAGS:
        raise Refusal(
            f"kind {kind} does not support personas; only {', '.join(sorted(PERSONA_FLAGS))} do",
            kind=kind, persona=persona,
        )
    # A Codex persona profile carries its whole prompt in developer_instructions,
    # which the file's -c override would replace without a word.
    if persona and developer_instructions_file:
        raise Refusal(
            f"--developer-instructions-file would replace persona {persona}'s "
            "developer_instructions; pass one or the other",
            kind=kind, persona=persona,
        )
    if name and not AGENT_NAME.fullmatch(name):
        raise Refusal(
            f"name {name!r} does not match the agent-name rule [a-z][a-z0-9_-]{{0,31}}",
            name=name,
        )


def model_args(kind, hint):
    if not hint:
        return []
    return [MODEL_FLAGS.get(kind, "--model"), hint]


def persona_args(kind, name):
    if not name:
        return []
    return [PERSONA_FLAGS[kind], name]


def name_args(kind, name):
    if not name or kind not in NAME_FLAGS:
        return []
    return [NAME_FLAGS[kind], name]


def developer_instructions_args(kind, path):
    """A caller-supplied Codex developer-instructions file.

    Each override is returned as separate argv elements. The instruction text
    is encoded as a TOML basic string; it is never interpolated into a shell.
    """
    if not path:
        return []
    if kind != "codex":
        raise Refusal(
            f"kind {kind} does not support --developer-instructions-file; only codex does",
            kind=kind,
        )
    instructions_path = Path(path).expanduser()
    try:
        instructions = instructions_path.read_text()
    except (OSError, UnicodeError) as error:
        raise Refusal(
            f"cannot read developer instructions at {instructions_path}: {error}", kind="codex"
        ) from error
    # JSON's escapes are a subset of TOML's, except that JSON leaves DEL bare.
    value = json.dumps(instructions, ensure_ascii=False).replace("\x7f", "\\u007f")
    return ["-c", f"developer_instructions={value}"]


def extra_args(kind, model, persona, name, developer_instructions_file):
    """Everything after the kind's own command, in the order Herdr has always passed it."""
    return (
        KIND_ARGS.get(kind, [])
        + developer_instructions_args(kind, developer_instructions_file)
        + model_args(kind, model)
        + persona_args(kind, persona)
        + name_args(kind, name)
    )


def compose_prompt(seed_prompt, report):
    return "\n\n".join(part for part in (seed_prompt, report) if part)
