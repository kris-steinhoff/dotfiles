# plan-implementation

`/plan-implementation <source>` writes a detailed implementation plan, for work too large or too shared for plan mode, into a store that outlives the session: a local directory by default, or a claude.ai plan page. This file is for sessions working on the skill; chezmoi leaves it out of the deployed copy, so sessions running the skill never see it.

## Design

A plan is a set of JSON documents (`run/main`, `tasks/T<n>`, `prs/P<n>`, `questions/Q<n>`, `journal/<timestamp>`, `meta/guide`), and a guide stored with it as `meta/guide` lets an agent work it knowing only where it is. So the skill stays thin. `assets/guide.md` owns the schema and the working rules, and `SKILL.md` covers only what is particular to planning: making the plan, how detailed a task's plan must be, waiting, and a check by a fresh subagent before the plan is marked ready. `/drive-implementation` reads a plan, which is why the guide already covers building.

Plan mode is not the container, because it ends in one yes in the session and then edits in that same session, while a plan has to outlive its session and reach people who aren't in it. A `CLAUDE.md` rule pointing plan mode at a template would load in every session, fire on every small plan, and compete with plan mode's own instructions. The skill takes a name other than `/plan` so the built-in stays for small work.

### Stores

The plan's documents are the same whatever holds them, and only the store differs: where the documents live, how an agent reads and writes them, how people answer questions, and what wakes the session. The guide is written once, store-neutral, with a `<!-- store -->` line where each store's own section goes, under Where the plan is kept. `plan-store new` and `plan-store guide` splice it in when a plan is made, so each plan's `meta/guide` describes its own store, and an agent picking the plan up needs nothing else.

- **Local** is the default and the core of the skill, so it runs on any harness. Plans live in `<main checkout>/.plans/<slug>/`, one JSON file per document, by the owner's choice, kept out of git through the common dir's `info/exclude` the way `wt` keeps `.worktrees/` out. One file per document, rather than one file for the plan, means a write touches only its own document, so the driver and a person answering through a view don't overwrite each other, and a watcher can tell which document changed. It is also the layout ArtifactData's `list` writes with `out_dir`, so a saved plan page's database is already a local plan's files. `plan-store` (in `dot_local/bin`, reasons in `dot_local/bin/AGENTS.md`) is the only writer agents use, and `assets/store-local.md` is the guide's section for it.
- **A claude.ai plan page** is the `plan-store-claude-page` skill, Claude-only because artifact databases and comment watches are Claude Code features. It holds the page, its fixtures, and its section of the guide.
- **Another store** is another `plan-store-<kind>` skill with its own guide section. The core skills say to follow such a skill when the user names one, so adding a store needs no change here. A view that only reads and writes a local plan's files, such as a Herdr panel or a local web page, isn't a store and needs no skill: it writes through `plan-store --as <name>`, or edits the files, and `plan-store wait` wakes the session either way. The Herdr plan mod's Plan tab is one, read-only, and repeats the plan page's derived views, so a schema change reaches it too (`dot_config/herdr-app/AGENTS.md`).

On a local plan, people answer in the session through the structured question tool. On a plan page they answer on the page, and the session ends its turn instead, an exception to the global rule, because a session sitting at that prompt can't be woken by an answer on the page. Which applies is the store section's call, which is why the skill points there rather than choosing.

Journal entries by an agent take `by: agent`. Plans written before stores existed say `claude`, which the checker and the page still accept.

### The plan's two readers

The guide assigns each field to one of two readers. People read the plan as a whole, and each task's title, `goal`, and `blocked_on`, so those are short and plain, naming no files, identifiers, or ids. An implementer reads a task's `approach`, `touches`, and `verify`, which carry all the detail. This came from a real plan driven to done, whose approach read like an agent's reference dump and whose task cards, every field shown at once, were hard to scan. The person-facing line reuses `goal` rather than adding a summary field, since goals were already written as one plain sentence and a second field would mostly repeat it. `blocked_on` is its own field because a view showing a task collapsed has to say why it is blocked, which used to sit inside the approach. `plan-store check` holds the person-facing fields to a few patterns (no backticks, file names, snake_case identifiers, or T/Q/P ids) and caps the approach at 800 characters and a goal at 240.

### Branches

The guide fixes branch names and PR bases rather than leaving them to the driver. One plan was split into three PRs, all based on main, and its later work needed all three, so there was no single branch to build it on and choosing one fell to the owner. Several PRs therefore form one stack in build order, and every branch starts with the plan's `slug`, so one pattern lists a plan's branches and worktrees. A PR branch always carries the PR's slug, even when the plan has one PR, so a later split never renames a branch that has already been pushed. Branches carry no round or sequence numbers, by the owner's choice; a round of fixes is named for what it fixes. The slug is set while planning, from the tracker key and title, so it is in the plan before anything is pushed. That replaced asking for P1's branch name when building starts.

## Testing

This skill is instructions an agent follows, so only a real run shows whether it produces a plan. `tests/test-plan-store` covers the command, and the plan page has its own tests in `plan-store-claude-page`'s notes; passing those says nothing about the skill.

The orchestrating session stays out of the work: it starts the fresh sessions, reads what they leave behind, and judges. An agent that planned the work can't test it, because it fills gaps from its own context.

### In a real run

Run this after any change to `SKILL.md.tmpl`, `assets/guide.md`, or `assets/store-local.md`.

1. Deploy first, and compare `~/.agents/skills/plan-implementation` and `~/.claude/skills/plan-implementation` with the source. A session loads the deployed copy, so a stale one tests the wrong version. Only the user can run `chezmoi apply` here.
2. Start a fresh session running `/plan-implementation` on a small, low-stakes brief in a scratch repository. A brief with one real decision in it exercises the questions.
3. Answer one question in the session, and change one document by hand while the session waits on something else, to exercise `plan-store wait`.
4. Run `plan-store check` on the plan.
5. Give only the plan's path to a second fresh session, and ask it what it would build first and what it would need to ask.

Judge from what the run left, not from what its session reports:

| Check            | Passes when                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Making           | The plan is under the main checkout's `.plans/`, `git status` doesn't show it, and its `meta/guide` has the store's section. |
| Data             | `plan-store check` passes, so what the skill wrote follows the guide.                                                        |
| Answers          | The answer was recorded on its question and journaled, and the plan changed to match.                                        |
| Waking           | The hand edit woke the session and was handled as a request.                                                                 |
| Plan quality     | Tasks name real files, claims about the code hold up, and the done-check can be checked.                                     |
| Questions        | They are decisions that belong to people. A question the code could have answered counts against the run.                    |
| The fresh reader | The check ran before the plan was marked ready, and what it found changed the plan or was journaled.                         |
| Handover         | The second session could say what to build first from the path alone. Anything it had to ask is a gap in the plan or guide.  |
| Boundaries       | `git status` in the planned repository shows nothing changed.                                                                |

Repeat it on Codex after a change that could depend on the harness, since the skill is meant to run there too.

### After a test

Report what was exercised and what couldn't be, and say so plainly when a step was skipped. When something fails, fix the skill rather than the test.
