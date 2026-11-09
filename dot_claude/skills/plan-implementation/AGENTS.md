# plan-implementation

`/plan-implementation <source>` writes a detailed implementation plan on a claude.ai artifact, the plan page, for work too large or too shared for plan mode. This file is for sessions working on the skill; chezmoi leaves it out of the deployed copy, so sessions running the skill never see it.

## Design

The plan page is the pattern for handing a plan over: the page is a generic viewer, the plan lives in the artifact's database, and a guide stored on the plan page as `meta/guide` lets an agent work it knowing only the URL. So the skill stays thin. Its `assets/` holds `plan-page.html` and `guide.md`, the guide owns the schema and the working rules, and `SKILL.md` covers only what is particular to planning: publishing the plan page, how detailed a task's plan must be, waiting, and a check by a fresh subagent before the plan is marked ready. `/drive-implementation` reads a plan page, which is why the guide already covers building.

Plan mode is not the container, because it ends in one yes in the session and then edits in that same session, while a plan page has to outlive its session and reach people who aren't in it. A `CLAUDE.md` rule pointing plan mode at a template would load in every session, fire on every small plan, and compete with plan mode's own instructions. The skill takes a name other than `/plan` so the built-in stays for small work.

It is Claude-only, because comment watches and artifact databases are Claude Code features. There is no state file, since the plan page's URL is all a resume needs.

When only people's answers can move the plan, the session ends its turn instead of asking through AskUserQuestion, an exception to the global rule, because a session sitting at that prompt can't be woken by an answer on the page. Herdr therefore shows such a session as idle, and an open question on the plan page is the signal.

People who can edit answer questions on the page itself, which is the one place the page writes: `comments: {}` lets it send Claude a comment so the watching session wakes, and `user` names who answered in the journal.

`fixtures/` holds twelve invented plans, one for each of four shapes at three stages, for judging the layout: `executable_view <shape>-<stage>` serves one against a stand-in for the artifact runtime, inside the wrapper the Artifact tool publishes pages in, and `executable_check` holds them to the guide. The wrapper matters because the page relies on its `[hidden]` rule; without it, hidden elements such as the progress bar show.

## Testing

This skill is instructions an agent follows plus a page a runtime serves, so it fails in two separate ways, and each needs its own test. Fixtures show whether the page handles a plan. Only a real run shows whether the skill produces one. Passing the first says nothing about the second.

The orchestrating session stays out of the work: it starts the fresh sessions, reads what they leave behind, and judges. An agent that planned the work can't test it, because it fills gaps from its own context.

### The page, against fixtures

Run this after any change to `assets/plan-page.html` or `assets/guide.md`. `fixtures/README.md` covers the tools.

1. Run `fixtures/executable_check`. Every fixture must pass.
2. Open each fixture at 375px, 1024px, and 1440px, as Driving the fixtures below describes. Choose fixtures that can show what changed: a fix needs one where the problem appeared, or passing proves nothing.
3. Measure with `fixtures/measure.js` rather than eyeballing, and add anything a change needs to it, so the next test gets it too. Read its `warnings` first. Report before and after numbers from the same script.
4. Look at the pages as well. Measurements only catch what you thought to measure, and a broken subtitle once passed all of them.
5. When a measurement is new or changed, break the page on purpose and confirm it fails. The width check passes on a blank page, for one, which is why `measure.js` reports whether the page rendered.

#### Driving the fixtures

A person runs `fixtures/executable_view`, which opens a browser at the list, and uses dev tools for widths. An agent does this instead:

1. Run `fixtures/executable_view --no-open --port <port>` as a background command, and stop it when finished. It picks another port if that one is taken, and prints the URL it's serving. `--no-open` matters because the sandbox blocks opening a browser.
2. Open `http://127.0.0.1:<port>/` in the built-in browser with `preview_start` and its `url`. That list is the twelve fixtures and any captures. Go through them with `navigate`, using `/?fixture=<name>` and any of `&role=`, `&theme=`, and `&session=` from the README.
3. Set each width with `resize_window`, using `width` and `height` or the `mobile` preset, and reload after changing it. Clear it with the `desktop` preset when finished.
4. Measure with `javascript_tool`, running `(await import("/measure.js")).measure()`. Wait for the page to settle first, since `errors` only holds what has happened so far. Take errors from its result rather than from `read_console_messages`, which carries across pages on one server, so an error can land on the wrong fixture.

For before numbers, or to break the page, leave the repository alone: copy the page outside it, change the copy or take it from an older commit, and serve it from a second server with `--page`, as the README shows.

A hidden Browser pane runs scripts but doesn't paint, so anything that depends on a paint, such as the page's measurement of its sticky header, can stay unset, and `measure.js` warns when it does. `tabs_context` says whether the pane is hidden. Take a screenshot before measuring, which forces a paint whether or not the pane is showing. `show_pane` can report success while `tabs_context` still says hidden, so don't rely on it.

The stand-in only approximates claude.ai. Before fixing a problem found here, check it isn't the viewer's own. `executable_view` serves the page inside the wrapper the Artifact tool publishes it in, because the page depends on that wrapper's `[hidden]` rule, and without it the page shows two problems that don't exist on claude.ai.

### The skill, in a real run

Run this after any change to `SKILL.md` or `assets/guide.md`, and after a change to how the page writes data.

1. Deploy first, and compare `~/.claude/skills/plan-implementation` with the source. A session loads the deployed copy, so a stale one tests the wrong version. Only the user can run `chezmoi apply` here.
2. Start a fresh session running `/plan-implementation` on a small, low-stakes brief. It creates a real private artifact, and a brief with one real decision in it exercises the questions.
3. Have the user answer a question on the page and send one comment to Claude. Only an editor can, so this step can't be automated.
4. Capture the result with `fixtures/executable_capture`, then run `executable_check` on the capture.
5. Give only the page's URL to a second fresh session, and ask it what it would build first and what it would need to ask.

Judge from what the run left, not from what its session reports:

| Check            | Passes when                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Publishing       | The page loads on claude.ai with the plan on it, and the capabilities it declares work for an editor and for someone with view access. |
| Data             | The capture passes `executable_check`, so what the skill wrote follows the guide.                                                      |
| Waking           | The answer woke the session, and the plan changed to match, with a journal entry and the comment's thread resolved.                    |
| Waiting          | At a stop, the session ended its turn rather than sitting at a question, and the page's status said what it needed.                    |
| Plan quality     | Tasks name real files, claims about the code hold up, and the done-check can be checked.                                               |
| Questions        | They are decisions that belong to people. A question the code could have answered counts against the run.                              |
| The fresh reader | The check ran before the plan was marked ready, and what it found changed the plan or was journaled.                                   |
| Handover         | The second session could say what to build first from the URL alone. Anything it had to ask is a gap in the plan or the guide.         |
| Boundaries       | `git status` in the planned repository shows nothing changed.                                                                          |

### After a test

Report what was exercised and what couldn't be, and say so plainly when a step was skipped. When something fails, fix the skill rather than the test, and when a page problem took a particular plan to show up, add a fixture for it, so the fixtures keep what each failure taught. A capture of a real plan can hold real names, so read one before committing it.
