# herdr-agents

`herdr-agents` says how an agent inside the Herdr desktop app starts, names, and talks to other agents through herdr-core's `hc`, and holds the rules a plan's driver and its task and PR agents share. This file is for sessions working on the skill; chezmoi leaves it out of the deployed copy.

## Design

It works like `plan-store-claude-page`: the core skills stay neutral about where they run, and say only when to follow it. `/drive-implementation` starts agents "with whatever the harness offers" and lets "the harness's instructions" give each PR its own agent; in Herdr this skill is both. Its description reaches past plans, to any skill or request that starts agents, because nothing in starting a sub-agent is particular to plans. It is a canonical skill, not a Claude-only one, since Herdr runs other agent CLIs too; only the start command names Claude Code.

The rules are a skill rather than a prompt file appended when a driver is launched, because the driver is started by hand in any tab, where only a skill reaches it. A sub-agent gets them by its brief naming the skill.

Sub-agents rather than tabs, for three reasons: they nest under the driver in Herdr's Agents list, herdr-core's parent and child reporting (a note to the parent when a child blocks or exits, `hc wait --children`) comes free, and the tab bar doesn't grow. The price is that they end with their parent, since children that outlive it are left naming a dead one; a resumed driver relaunches the ones in flight into their existing worktrees.

Agents are addressed by the address `hc run` prints, so an hc name only has to be unique among live terminals, and a collision takes a `-2` rather than every name carrying a per-plan prefix. The driver can see `hc run` refuse a name and pick another, and the Agents list already nests each agent under its driver, which says which plan it belongs to.

Agents start with `hc run --rm`, so ending one is a single `hc kill`. With `hc kill` and `hc rm` as two steps, a test-run driver did only the first, and every ended task agent and reviewer stayed listed in `hc ls --all`.

The driver's one label, `plan.driver`, is for the plan mod's Plan tab (`dot_config/herdr-app/AGENTS.md`), whose Go to driver button finds the driver by it. There are no status labels (phase, what the owner must do, each PR's status): the plan shows those, and Herdr already marks a driver waiting on a question as blocked. The label is the folder `plan-store path` prints because that path is resolved, as the Plan tab's is.

Reviews are hc sub-agents of the agent whose work they review, rather than the harness's own subagents inside the driver, so the Agents list shows each review nested under the task or PR it checks; a review running inside the driver's session was invisible there. The reviewer still starts with a fresh context, which is all the review needs. For a task, the driver writes the reviewer's brief and receives its report, and the task agent only starts it, because the cycle in `/drive-implementation` gives the review's findings to the driver, which decides what goes back to the implementer, and an implementer that wrote its own reviewer's brief could steer the review.

A sub-agent the user talks to directly answers them in its own terminal and then tells its parent what was settled. In a test run the user steered a PR agent from its terminal, and sending the user's questions round through the driver, as the contract otherwise says, would have answered the user somewhere they weren't looking.

The PR agent contract is in the skill rather than in `drive-pr` or `/drive-implementation`, because how two agents hand work back and forth depends on how the harness lets them talk; `dot_agents/skills/drive-implementation/AGENTS.md` has why a PR gets its own agent at all.

## Testing

Only a real run in Herdr shows the skill works: run `/drive-implementation` on a small local plan in a scratch repository, from a Herdr tab, after `chezmoi apply`. Check that task agents appear under the driver in the Agents list, that their reports wake the driver, that the Plan tab's Go to driver reaches it, and, with a PR open, that its agent and the driver follow the contract. Report what was exercised and what wasn't.
