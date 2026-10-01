# Signal design

Signals are workspace metadata rather than agent renames, so they do not change the names used by dispatch tooling or `agent prompt`. The visible `signal` token and the undisplayed `signal_pane` owner token are written together. The space sidebar renders the signal on its own line because a reason beside the workspace name obscures that name when the row truncates.

## Lifetimes

A ✋ or 🏁 remains until the raising pane starts working again, the user dismisses it, the pane closes, or its 24-hour TTL expires. The Herdr plugin keys clearing to `signal_pane`, so activity from another pane in the workspace cannot clear the signal.

A ⏳ can outlive several agent turns. The plugin therefore ignores it. A wrapped command clears its own ⏳ on exit only when that exact signal still owns the workspace; an unwrapped wait must be cleared explicitly.

When a wrapped wait finishes after the same agent has replaced its ⏳ with ✋ or 🏁, it leaves a one-minute `signal_skip` token while the agent is idle. The plugin consumes that token instead of mistaking the wait-driven wakeup for a user reply. The token is not written while the agent is already working, because there will be no wakeup and it could swallow the next real reply.

## Ownership and precedence

The signaling script asks Herdr to canonicalize the inherited pane ID before recording ownership. Codex app-server tool commands can inherit a pane ID that no longer resolves; when that happens, the script uses the only live Codex pane in the inherited workspace and fails on ambiguity.

One signal is visible per workspace. An agent can always replace its own signal with its current state. Another pane can replace a signal only with one of equal or greater urgency: ✋, then 🏁, then ⏳. The manual ⚑ flag is a separate workspace token, so neither mechanism erases the other.

## Integration

The canonical skill lives under `~/.agents/skills`, which Codex and OpenCode read directly. Claude Code and Gemini render their `SKILL.md` from that canonical template and symlink its supporting directories. The plugin listens to Herdr lifecycle events rather than harness-specific hooks, so its clearing behavior is shared across agent kinds.
