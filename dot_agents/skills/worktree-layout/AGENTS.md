# worktree-layout

`worktree-layout` is a directory shape and the script that builds it: a plain project folder holding a primary clone, `repo/`, and optional work streams (another clone per body of work spanning several branches, such as an epic, so Herdr clusters its worktrees under their own row), with every worktree nested in its clone's `.worktrees/`.

## Why ordinary clones

Every clone is an ordinary clone, not a bare repo, for two reasons that hold in the Claude Code sandbox. Claude Code's automatic grant for a linked worktree's main `.git` covers an ordinary clone but not a bare repo in a directory such as `.bare`, so worktrees of a bare repo can't commit without a per-worktree `settings.local.json` allowance. And a session sitting in a clone has a real checkout, so it loads the repo's own skills, which a session in a bare repo directory never does.

## The unsandboxed step

The sandbox still protects `.git/config` and `.git/hooks` in every clone. So `scripts/create-clone` sets the config a session would otherwise need to write (no upstream recorded on branch creation, `push.default=current`) once at clone time, and the user runs it with `!`, along with the project's hook install through its `--setup`. It must not leave the sandbox through an `excludedCommands` entry or a Herdr pane: either would let any agent run it unsandboxed with any arguments, and a new clone is rare enough that a human step costs little.

The script converges on re-run. It lives inside the skill rather than as a primitive of its own because nothing else uses it, and the rules and the steps that apply them read best side by side.

## How a project opts in

A project opts in with one line in its own `AGENTS.md`, alongside its own facts (clone source and remote, naming convention, clone and worktree setup commands). There is no template or initializer, since that one line is all the skill needs. The line says "load X before Y" rather than "see X", because a skill loads only when an agent decides to use it.

Claude reads that parent file while walking directories above a session, but Codex starts `AGENTS.md` discovery at the Git/project root, so a caller launching Codex passes the plain parent file through the supported `developer_instructions` override. How agents divide the work in such a project, and its delivery policy, stay in that project's `AGENTS.md`, not in the skill.

## Beads

The skill's beads section applies only to a project that keeps its plan in beads (`bd`). The database sits in the plain project folder rather than any clone, so it outlives clones and can hold dependencies across work streams. Each clone reaches it through a `.beads/redirect` that `create-clone --beads` writes along with the exclude and the `beads.role` config; that config write is why linking belongs in the unsandboxed step. The skill spells out the safe `bd init` because a plain one in the non-repo project folder runs `git init` there and overwrites the project's `AGENTS.md`.

## Codex

Codex's `workspace-write` sandbox protects a checkout's `.git` and a linked worktree's resolved Git directory, so Git metadata writes use scoped escalation. The managed `on-request` approval policy and automatic reviewer handle eligible requests without an approval override or `danger-full-access`.
