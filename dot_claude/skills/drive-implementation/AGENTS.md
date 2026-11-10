# drive-implementation

`/drive-implementation <plan page URL>` works the tasks on a plan page that `/plan-implementation` wrote, keeping the page current until handover.

The skill is deliberately thin. The plan page's `meta/guide` already owns the schema, statuses, questions, delivery, and handover, so the skill holds only how the owner likes implementation to run:

- Each code-changing task gets its own worktree and its own Claude agent, labelled by task so what the owner sees reads as the plan does.
- Every task is reviewed by a fresh subagent and fixed by its implementer, up to three rounds before the driver asks the owner.
- A reviewed task is merged onto its PR's branch, and its worktree and branch are removed with plain git.

How the worktree and agent are made is left to whatever the harness offers, since Claude Code, Herdr, and Orca each handle worktrees differently, so the skill states what the result must look like and names no tool. It depends on no other skill, and leaves a project's worktree conventions and CI handling to the project's own instructions and the plan page's guide.

The page is updated as things happen, because it is the owner's main view of the work. The driver decides everything reversible itself and puts on the page only what is the owner's to decide, such as product behavior, scope, a PR split, or a step only a person can take. It stops only when nothing can move without an answer.

It is Claude-only, because comment watches and artifact databases are Claude Code features. It keeps no state of its own: the plan page is the record, and a resume reconciles the page with the worktrees, agents, and PRs. The driver has to be a main-loop session, because only one of those can watch an artifact for comments. A background subagent doesn't outlive its session, so a resumed run relaunches whatever was in flight.

What it relies on from the plan page: each task's `goal`, `approach`, and `verify` make the implementer's brief, with `touches` as a hint. The page shows `goal` on a task's collapsed card for people, so the brief reads it as the plain statement of what the task achieves and takes the detail from `approach` and `verify`. A task the driver marks `blocked` needs `blocked_on`, a sentence saying what it waits on, because that is what the collapsed card shows; the driver removes it when the task moves on. The guide defines both.
