# Enforcing soft wrapping automatically

Hard wrapping is the habit that survives being told not to, so the reliable fix is not to rely on an agent at all. A `PostToolUse` hook puts every `.md` file Claude Code writes or edits through prettier before the turn continues, whatever the agent typed.

`scripts/format-markdown` exists for this and nothing else. The skill never runs it.

This is deliberately not in the global config. Add it per project.

## Why per project and not globally

A global hook reformats markdown in every repository you touch, including other people's. A repository that hard-wraps by convention gets silently reflowed, and the reformat lands in your diff as churn that has nothing to do with your change.

The formatter has no opinion about whether that is the right thing, on purpose. It always forces soft wrapping, and the separate **markdown-wrapping** skill answers whether a project wants it. Reading that answer and deciding is a person's call, and a global hook makes the decision once, everywhere, in advance. Turning it on per project means you have already looked.

## Adding it

Put this in the project's `.claude/settings.json` to share it with everyone working in the repository, or in `.claude/settings.local.json` to keep it to yourself.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME/.agents/skills/markdown-formatting/scripts/format-markdown\" --hook",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

The path in the hook has to be absolute. SKILL.md refers to these scripts as `scripts/format-markdown`, relative to the skill directory, because an agent is told where that directory is. A hook command gets no such context and runs from the project directory, so it needs the full path.

Put the `.claude` directory at the repository root, which is where Claude Code resolves project settings to. A `.claude/settings.json` in some parent directory above the repository is not picked up, so a settings file at `~/Scratch/.claude/settings.json` does nothing for a session started in `~/Scratch/some-repo/`.

The hook fires on every `Write` and `Edit`, not only on markdown. That is fine: `--hook` reads the tool payload from stdin and does nothing unless the path it finds is a markdown file. Non-markdown writes cost one process start.

The 60 second timeout is for the first run in a repository with no node tooling, where prettier arrives by `npx` download. After that it is a few milliseconds.

## Checking that it works

Ask Claude to write a hard-wrapped paragraph into a scratch `.md` file, then look at the file. It should be one line per paragraph. Or drive the hook by hand with the payload shape it expects:

```bash
printf 'A paragraph split\nacross two lines.\n' > /tmp/hook-check.md
printf '{"tool_input":{"file_path":"/tmp/hook-check.md"}}' \
  | "$HOME/.agents/skills/markdown-formatting/scripts/format-markdown" --hook
cat /tmp/hook-check.md
```

`--hook` is silent on success and silent on failure, including a missing prettier. A formatter that interrupts the turn to report itself is worse than one that quietly does nothing. To diagnose, run the script on the file directly, without `--hook`, where it reports errors and returns a real exit code.

## The other two layers

The hook covers Claude Code only, and it is the only layer that acts while a file is being written. The other agent surfaces (Codex, OpenCode, Gemini) have no equivalent, so there the conventions in SKILL.md are all there is.

Neither catches a file that arrives some other way. For that, format on commit. This repository does, in `.pre-commit-config.yaml`:

```yaml
- repo: local
  hooks:
    - id: prettier
      name: prettier
      entry: prettier --write
      language: node
      additional_dependencies: ["prettier@3.3.3"]
      types: [markdown]
```

with `proseWrap: never` in `.prettierrc.yaml`. That is the same enforcement arriving later. A project with this hook already has the guarantee, and the `PostToolUse` hook is then only about not writing the hard wraps in the first place, so the pre-commit pass has nothing left to fix.

There is also `mdfmt` in the shared zshrc, for doing it by hand. It is the same pinned prettier invocation without the extension guard.
