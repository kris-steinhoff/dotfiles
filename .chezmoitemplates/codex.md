## Codex

### Sandbox failures

When a command fails in the sandbox for a reason a retry won't change, such as no network, a write outside the writable roots, or a refused local socket, rerun it with escalated permissions, and from then on request escalation for that command on its first call for the rest of the session. Don't try it sandboxed again first. When a skill or these instructions already say a command needs something the sandbox withholds, escalate from the first call.
