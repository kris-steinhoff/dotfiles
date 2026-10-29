"""The pieces every Orca dispatch script shares: calling the `orca` CLI and
reading what it says about worktrees and terminals.

Orca prints one JSON envelope per command, {"ok": true, "result": ...} or
{"ok": false, "error": {"code", "message"}}, on stdout. The macOS build also
writes a code-signing complaint to stderr on every run, which means nothing.
"""

import json
import os
import subprocess
import time

# Orca exports ORCA_CLI_COMMAND for sessions that need another executable,
# such as managed WSL; everywhere else it is `orca` on PATH.
ORCA = os.environ.get("ORCA_CLI_COMMAND") or "orca"

# A worktree git just created takes Orca a moment to notice. Tests shorten it.
CATALOG_WAIT_SECONDS = float(os.environ.get("DISPATCH_ORCA_CATALOG_WAIT") or 15)

# Handle errors that mean the terminal is gone, not that Orca failed.
GONE_CODES = {"terminal_handle_stale", "terminal_not_found", "selector_not_found"}


class OrcaError(Exception):
    """An orca command failed. `code` is Orca's own error code when it gave one."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def run(argv, cwd=None):
    return subprocess.run(argv, capture_output=True, text=True, cwd=cwd)


def orca(*args):
    """The `result` of one orca command, or OrcaError."""
    proc = run([ORCA, *args, "--json"])
    try:
        envelope = json.loads(proc.stdout)
    except ValueError:
        detail = proc.stdout.strip() or proc.stderr.strip()
        raise OrcaError(f"orca {' '.join(args)} failed ({proc.returncode}): {detail[:300]}")
    if not envelope.get("ok"):
        error = envelope.get("error") or {}
        steps = (error.get("data") or {}).get("nextSteps") or []
        detail = " ".join([error.get("message") or "", *steps]).strip()
        raise OrcaError(f"orca {' '.join(args)} failed: {detail}", code=error.get("code"))
    return envelope.get("result") or {}


def worktree(selector):
    """Orca's record of one worktree, or None when Orca doesn't know it."""
    try:
        return orca("worktree", "show", "--worktree", selector).get("worktree")
    except OrcaError as error:
        if error.code == "selector_not_found":
            return None
        raise


def wait_for_worktree(path):
    """Orca's record of a worktree git just created, once Orca has noticed it."""
    selector = f"path:{os.path.realpath(path)}"
    deadline = time.monotonic() + CATALOG_WAIT_SECONDS
    while True:
        record = worktree(selector)
        if record or time.monotonic() > deadline:
            return record
        time.sleep(1)


def terminals(worktree_id):
    """The live terminals in one worktree."""
    result = orca("terminal", "list", "--worktree", f"id:{worktree_id}")
    return [t for t in result.get("terminals") or [] if isinstance(t, dict)]


def terminal(handle):
    """Orca's record of one terminal, or None when its handle is gone."""
    try:
        return orca("terminal", "show", "--terminal", handle).get("terminal")
    except OrcaError as error:
        if error.code in GONE_CODES:
            return None
        raise


def agent_in(record):
    """The agent kind running in a terminal record, or None for a plain shell."""
    if record and record.get("connected") and record.get("agentIdentity"):
        return record["agentIdentity"]
    return None


def create_terminal(worktree_id, title=None, command=None):
    """A new terminal tab in a worktree, returning its handle."""
    args = ["terminal", "create", "--worktree", f"id:{worktree_id}"]
    if title:
        args += ["--title", title]
    if command:
        args += ["--command", command]
    handle = (orca(*args).get("terminal") or {}).get("handle")
    if not handle:
        raise OrcaError(f"terminal create in {worktree_id} returned no handle")
    return handle
