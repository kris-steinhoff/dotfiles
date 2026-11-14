# plan-store-claude-page

`plan-store-claude-page` is the claude.ai plan page store for `/plan-implementation` and `/drive-implementation`: it publishes a plan as a shared artifact and maps the plan's reads, writes, and waits onto ArtifactData and ArtifactComments. This file is for sessions working on the skill; chezmoi leaves it out of the deployed copy.

## Design

The core skills are store-neutral and default to a local directory (their reasons are in `dot_agents/skills/plan-implementation/AGENTS.md`). This skill holds everything about the plan page, so the core skills mention claude.ai only to say when to follow it. It is Claude-only because artifact databases and comment watches are Claude Code features, and it has no canonical copy under `dot_agents/skills/`. Its description says it serves the other two, because on its own it does nothing. The name starts a convention: another store is `plan-store-<kind>`.

The plan page is the pattern for handing a plan over to people outside the session: the page is a generic viewer, the plan lives in the artifact's database, and `meta/guide` is the core guide with `assets/store.md` as its Where the plan is kept section, built by `plan-store guide`. The page's database holds the same documents a local plan holds, and ArtifactData's `list` with `out_dir` saves them in a local plan's layout, so `plan-store check` checks a page's data and `fixtures/executable_capture` turns it into a fixture.

People who can edit answer questions on the page itself, which is the one place the page writes: `comments: {}` lets it send Claude a comment so the watching session wakes, and `user` names who answered in the journal. When only people's answers can move the plan, the session ends its turn instead of asking through AskUserQuestion, an exception to the global rule, because a session sitting at that prompt can't be woken by an answer on the page. Herdr therefore shows such a session as idle, and an open question on the plan page is the signal.

The Herdr Drive mod's Plan tab shows a local plan the way this page shows one, and its `plan.js` repeats the page's derived views (when a running plan counts as blocked, the PR chain, answered questions folded into the journal, the dependency graph's layout), so a change to those here needs the same change there.

The page shows journal entries by `agent`, and by `claude` from plans written before stores existed, as by Claude, since only Claude works a plan page.

### The page

A task card starts collapsed to its title, status, goal, and what holds it up (an outside wait from `blocked_on`, and its open questions), and opens to the brief, because the guide gives those fields to two different readers. Cards are `details` elements, so find in page opens a card it matches in, and the page remembers which ones a reader opened across re-renders. The page shows each PR's branch and what it stacks on, and with more than one PR, the chain from the base branch up, since that chain is what the owner needs when deciding what to review or merge next.

`fixtures/` holds twelve invented plans, one for each of four shapes at three stages, for judging the layout: `executable_view <shape>-<stage>` serves one against a stand-in for the artifact runtime, inside the wrapper the Artifact tool publishes pages in, and `executable_check` holds them to the guide, using `plan-store check`'s rules plus the fixtures' own. The wrapper matters because the page relies on its `[hidden]` rule; without it, hidden elements such as the progress bar show.

## Testing

The page and the skill fail in separate ways, and each needs its own test. Fixtures show whether the page handles a plan. Only a real run shows whether a session publishes and works one. Passing the first says nothing about the second.

The orchestrating session stays out of the work: it starts the fresh sessions, reads what they leave behind, and judges.

### The page, against fixtures

Run this after any change to `assets/plan-page.html`, or to the guide's schema. `fixtures/README.md` covers the tools.

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

### The store, in a real run

Run this after any change to `SKILL.md` or `assets/store.md`, and after a change to how the page writes data.

1. Deploy first, and compare `~/.claude/skills/plan-store-claude-page` and `~/.claude/skills/plan-implementation` with the source. Only the user can run `chezmoi apply` here.
2. Start a fresh session running `/plan-implementation` on a small, low-stakes brief, asking for a plan page. It creates a real private artifact.
3. Have the user answer a question on the page and send one comment to Claude. Only an editor can, so this step can't be automated.
4. Capture the result as `fixtures/README.md` says, then run `executable_check` on the capture.
5. Give only the page's URL to a second fresh session, and ask it what it would build first and what it would need to ask.

| Check      | Passes when                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Publishing | The page loads on claude.ai with the plan on it, and the capabilities it declares work for an editor and for someone with view access. |
| Guide      | `meta/guide` is the core guide with this skill's store section in place of its `<!-- store -->` line.                                  |
| Data       | The capture passes `executable_check`, so what the session wrote follows the guide.                                                    |
| Waking     | The answer woke the session, and the plan changed to match, with a journal entry and the comment's thread resolved.                    |
| Waiting    | At a stop, the session ended its turn rather than sitting at a question, and the page's status said what it needed.                    |
| Handover   | The second session could say what to build first from the URL alone. Anything it had to ask is a gap in the plan or the guide.         |

The core skill's own checks (plan quality, questions, the fresh reader, boundaries) apply to this run too.

### After a test

Report what was exercised and what couldn't be, and say so plainly when a step was skipped. When something fails, fix the skill rather than the test, and when a page problem took a particular plan to show up, add a fixture for it, so the fixtures keep what each failure taught. A capture of a real plan can hold real names, so read one before committing it.
