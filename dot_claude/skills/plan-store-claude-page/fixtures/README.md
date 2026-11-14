# Plan page fixtures

Plans for trying out `assets/plan-page.html` across plan shapes and stages. The twelve named `<shape>-<stage>.json` are each a made-up project: all names, people, repositories, and tracker sites in them are fictional, and every URL is under the reserved `.example` domain. `hostile-text.json` is made up too, and tests how the page treats what's written in a plan. Anything else here was captured from a live plan page.

## Viewing one

From the repository root:

```bash
dot_claude/skills/plan-store-claude-page/fixtures/executable_view big-running
```

That serves the fixtures on localhost and opens that one in a browser. `/` lists them in a grid of shape by stage, and `/?fixture=<name>` renders one, so run it with no name to start from the list. For responsiveness, use the browser's dev tools. The page is `assets/plan-page.html` as it stands, inside the wrapper the Artifact tool publishes pages in, with `stand-in.js` loaded ahead of it to play the artifact runtime, so a change to the page shows on reload. Pass `--no-open` to only print the URL, and `--port` to choose the port.

Add these to a plan page's URL to see it another way:

- `&role=viewer` shows it to someone who can't edit, so questions list their options instead of answer forms. `&role=editor` can answer but isn't the owner. The default is the owner, whose `by: "owner"` journal entries take their name, as they do on claude.ai.
- `&theme=dark` shows the dark theme.
- `&session=none` answers with no Claude session watching.

Answers save in memory only, so a reload puts the fixture back. The clock is frozen at the fixture's `now`, so relative times read the same however old the file gets.

## Measuring

On the viewer's server, `measure.js` gives every test the same numbers. Run it in a fixture's page:

```js
(await import("/measure.js")).measure();
```

It returns `warnings`, then the status the page shows, its scroll and client widths, the subtitle, the task cards (how many, how many are open, and the list's height closed and with every card open), the graph's edges and how many pass behind a task, each in-page link's clearance from the sticky header, the page's code spans, and this page load's `errors`. Read `warnings` first: they say when the page didn't render, a check couldn't run, or a plan's text became markup. The width comes from the page with its graph and collapsed sections open, where it's widest. `links` reports `notApplicable` on narrow windows, where the header doesn't stick, and only covers links followed after the page has loaded, not a URL opened with a task's link already in it.

`code` has four parts. `count` is how many code elements the page made, and `texts` is what they hold, without repeats. `inPlainFields` counts those inside a title, a summary, a link, or the graph, which stay plain and should give 0. `injected` counts elements that only parsed text could have put in the page, plus 1 if `window.__pwned` is set, and it should be 0 on every fixture.

`--page <path>` serves another copy of the page. Use it for before numbers and to break the page on purpose without touching the repository:

```bash
git show <commit>:dot_claude/skills/plan-store-claude-page/assets/plan-page.html > "$TMPDIR/before.html"
dot_claude/skills/plan-store-claude-page/fixtures/executable_view --page "$TMPDIR/before.html" --no-open --port 8738
```

Before plans got a local store, the page lived in the `plan-implementation` skill, at `dot_claude/skills/plan-implementation/assets/plan-page.html`, and before that at `assets/board.html` there, so an older commit needs that path instead.

## The shapes and stages

| Shape     | What it exercises                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `small`   | At most 8 tasks, 3 questions, and 14 journal entries, with sparse fields. `small-planning` has no tasks at all, so it shows the page's empty states. |
| `big`     | Dozens of tasks, many questions, a long journal. `big-done` runs past the 80 entries the page loads.                                                 |
| `simple`  | Close to a straight line onto one PR, with no tracker.                                                                                               |
| `complex` | Wide and deep dependencies, stacked PRs, tracker epics, and tasks held up by questions and outside work.                                             |

| Stage      | What it exercises                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planning` | A plan still taking shape: all tasks pending, parts missing, questions open. `simple-planning` is written and awaiting a go-ahead.                   |
| `running`  | Every task status, draft or open PRs, some questions answered. `complex-running` is the blocked run, so nothing in it is being implemented or fixed. |
| `done`     | Handed over: tasks merged or dropped, the done-check met, a full journal.                                                                            |

## Backticks

The guide once told writers to leave backticks out, and plans written then have none, so eleven of the twelve fixtures stand in for those plans and stay unmarked. `complex-running` is the one written the way the guide says now, with its files, commands, and identifiers marked in body text.

`hostile-text` is for the page's handling of text, and it isn't a `<shape>-<stage>`, so it appears in the `/` list below the grid and has none of those rules. Every field the page shows holds HTML that would act if parsed, backticks that don't pair, a 200-character unbroken path, paths for the page to find, near misses for it to leave alone, and two known wrong matches, `before/after/during` and `Node.js`, which pin the rule's limits. Its titles and option labels hold the same text, so it's the one fixture allowed backticks there.

## The format

A fixture is one JSON file. `docs` maps each database path to its document, exactly as the plan guide (`dot_agents/skills/plan-implementation/assets/guide.md`) defines them, and the rest is what the stand-in needs to know about the viewer:

```json
{
  "about": "One sentence on what this fixture is for.",
  "now": "2026-03-14T16:20:00Z",
  "viewer": "u_rosalind",
  "people": { "u_rosalind": "Rosalind Achterberg", "u_former": null },
  "docs": {
    "run/main": { "title": "…", "status": "running" },
    "tasks/T1": { "title": "…", "order": 1, "status": "merged" },
    "prs/P1": { "title": "…", "order": 1, "status": "draft" },
    "questions/Q1": { "title": "…", "status": "open" },
    "journal/2026-03-14T09:30:00Z": { "at": "2026-03-14T09:30:00Z", "text": "…", "by": "claude" }
  }
}
```

`people` holds every id that `by` or `answered_by` uses, and a `null` name shows as "someone", which is how the page treats an id with no profile. `viewer` is one of them.

`executable_check` reads every fixture, or those it's given, and reports anything that breaks the guide, contradicts itself, or falls short of its shape and stage. The guide's own rules are `plan-store check`'s, which it loads from `dot_local/bin/executable_plan-store` in this source tree, or from `plan-store` on `PATH`; this adds the rules only a fixture has. Run it after changing one, and when adding a fixture, name it `<shape>-<stage>` or add its rules there.

## Capturing a live plan page

`docs` is the database's own layout, so a fixture can be taken from a live plan page. A session with the ArtifactData tool does this:

1. For each of `run`, `tasks`, `prs`, `questions`, and `journal`, run `list` with the page's `url`, `query: {"limit": 1000}`, and `out_dir` set to one folder outside this repository. Each document lands at `<collection>/<doc_id>.json`, holding only its fields. That folder is laid out the way a local plan is, so `plan-store check <folder>` checks the page's data as it stands.
2. Run `executable_capture <folder> --out <file.json>`. It freezes `now` at the plan's last activity and prints the person ids it has no name for.
3. For real names, call `profiles` with those ids, 64 at a time, write the result to a file mapping id to name, and run the capture again with `--people <file>`. Without names, those people show as "someone".
4. View it: `executable_view <name>` for a capture written to this folder, or `executable_view <file.json>` for one anywhere else.

A capture in this folder appears in the `/` list below the grid. Give it any name other than `<shape>-<stage>`, and `executable_check` holds it to the guide and to itself, without the shape, stage, and invented-names rules.
