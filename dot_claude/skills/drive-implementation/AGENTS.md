# drive-implementation

`/drive-implementation <plan page URL>` works the tasks on a plan page that `/plan-implementation` wrote, keeping the page current, and shepherds the plan's PRs through review until a person merges or closes them.

The skill is deliberately thin. The plan page's `meta/guide` already owns the schema, statuses, questions, delivery, and handover, so the skill holds only how the owner likes implementation to run:

- Each code-changing task gets its own worktree and its own Claude agent, labelled by task so what the owner sees reads as the plan does.
- Every task is reviewed by a fresh subagent and fixed by its implementer, up to three rounds before the driver asks the owner.
- A reviewed task is merged onto its PR's branch, and its worktree and branch are removed with plain git.
- A PR ready for review is shepherded until it merges or closes, by the `shepherd-pr` skill, with the plan page standing in for its session.

How the worktree and agent are made is left to whatever the harness offers, since Claude Code, Herdr, and Orca each handle worktrees differently, so the skill states what the result must look like and names no tool. It leaves a project's worktree conventions to the project's own instructions and the plan page's guide.

Shepherding is its own skill, `shepherd-pr`, because carrying a PR through review is just as useful for a PR no plan made. The driver runs it in place of its defaults, so its questions go on the page, a fix runs through the same worktree, agent, and fresh-review cycle as a task, and each PR's `replies` field on the page says whether replies need the owner's confirmation. The owner chose `auto` as the default: fixes and replies happen without asking, and only behavior, scope, and steps only a person can take come to the page. A plan is `done` only once every PR has merged or closed, rather than at handover, so the page's status says whether anything is still in review.

The page is updated as things happen, because it is the owner's main view of the work. The driver decides everything reversible itself and puts on the page only what is the owner's to decide, such as product behavior, scope, a PR split, or a step only a person can take. It stops only when nothing can move without an answer.

It is Claude-only, because comment watches and artifact databases are Claude Code features. It keeps no state of its own: the plan page is the record, and a resume reconciles the page with the worktrees, agents, and PRs. The driver has to be a main-loop session, because only one of those can watch an artifact for comments. A background subagent doesn't outlive its session, so a resumed run relaunches whatever was in flight.

What it relies on from the plan page: each task's `goal`, `approach`, and `verify` make the implementer's brief, with `touches` as a hint. The page shows `goal` on a task's collapsed card for people, so the brief reads it as the plain statement of what the task achieves and takes the detail from `approach` and `verify`. A task the driver marks `blocked` needs `blocked_on`, a sentence saying what it waits on, because that is what the collapsed card shows; the driver removes it when the task moves on. The guide defines both.
