# Signal design

Signals are workspace metadata rather than agent renames, so they do not change the names used by dispatch tooling or `agent prompt`. The visible `signal` token and the undisplayed `signal_pane` owner token are written together. The space sidebar renders the signal on its own line because a reason beside the workspace name obscures that name when the row truncates.

## Glyphs

The glyph's visual weight follows urgency. ✋ is an emoji, which the terminal draws in full color and double width regardless of the sidebar's token color, so the one signal that blocks on the user is the one that stands out. ✓ and `…` are plain text glyphs, so they take the token's dim default color and recede like the branch line beneath them. Both text glyphs are ordinary Unicode rather than Nerd Font icons, so they render in any terminal font.

## Lifetimes

A ✋ or ✓ remains until the raising pane starts working again, the user dismisses it, the pane closes, or its 24-hour TTL expires. The Herdr plugin keys clearing to `signal_pane`, so activity from another pane in the workspace cannot clear the signal.

A `…` can outlive several agent turns. The plugin therefore ignores it. A wrapped command clears its own `…` on exit only when that exact signal still owns the workspace; an unwrapped wait must be cleared explicitly.

When a wrapped wait finishes after the same agent has replaced its `…` with ✋ or ✓, it leaves a one-minute `signal_skip` token while the agent is idle. The plugin consumes that token instead of mistaking the wait-driven wakeup for a user reply. The token is not written while the agent is already working, because there will be no wakeup and it could swallow the next real reply.

## Ownership and precedence

The signaling script asks Herdr to canonicalize the inherited pane ID before recording ownership.

Under Codex the inherited ID cannot be taken at its word. An interactive Codex runs tool commands in a shared app-server daemon by default, and that daemon carries the `HERDR_*` environment of whichever pane first started it, so every session on it inherits that pane, which may be a live shell in another workspace or a pane since closed. `launch-agent-in-pane` starts Codex with `--no-daemon` so the variables stay true, but a hand-launched Codex still shares the daemon. So the script trusts an inherited pane under Codex only when Herdr says it hosts a Codex agent. Otherwise it picks the Codex agent whose working directory most closely contains the command's own, and fails if two share it. It matches by directory rather than by Codex session ID because Herdr's own Codex integration records the session through the same inherited variables and so attaches it to the wrong pane.

One signal is visible per workspace. An agent can always replace its own signal with its current state. Another pane can replace a signal only with one of equal or greater urgency: ✋, then ✓, then `…`. The manual ⚑ flag is a separate workspace token, so neither mechanism erases the other.

## Failures

A Herdr query can fail before it reaches Herdr, so the script never treats a failed query as an answer. Only Herdr's own `pane_not_found` counts as one, meaning the inherited pane is gone; every other failure stops with `herdr_denied` or `herdr_unavailable` and Herdr's message, and `unresolved` is kept for a query that succeeded without naming one pane. The split exists because a sandboxed Codex had its socket refused, and the script, which discarded Herdr's stderr, reported that as an unresolvable pane. The agent then spent its turn inspecting pane state, where every query was refused for the same reason, before retrying with permission. A refused socket is recognized by its `PermissionDenied` text, the raw I/O error the CLI prints when the connection itself is denied, and is reported apart from other failures because its fix belongs to the caller rather than to Herdr or the panes.

## Integration

The canonical skill lives under `~/.agents/skills`, which Codex and OpenCode read directly. Claude Code and Gemini render their `SKILL.md` from that canonical template and symlink its supporting directories. The plugin listens to Herdr lifecycle events rather than harness-specific hooks, so its clearing behavior is shared across agent kinds.
