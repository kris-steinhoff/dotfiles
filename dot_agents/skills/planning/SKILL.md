---
name: stepwise-planning
description: Create a "Stepwise Plan" with discrete, logical steps and an interactive pause-and-confirm protocol when the user requests a stepwise or step-by-step plan.
---

# Stepwise Planning

Use this skill when the user explicitly requests a "stepwise plan", "step-by-step planning", or "interactive step-by-step implementation".

A **Stepwise Plan** structures implementation into discrete, logical steps that tell a cohesive story. This makes it easier for a human reviewer to understand the larger change.

Rather than having a separate step to update tests and documentation at the end, each step (if appropriate) should create or update related tests, and update related documentation and versioned agent context (e.g. `.claude/rules/`).

Always add this implementation protocol to the plan you create:

```
## Implementation Protocol

- Pause after implementing each step (even if you have permission to edit automatically)
- Display the updated todo list
- Display a codeblock with a summary of the change in the style of a well-formed commit message
- Ask the user if they are ready to proceed to the next step
  - "Ready for Step N ({short reminder of what Step N is})?"
```

