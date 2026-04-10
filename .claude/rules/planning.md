# Planning

When in Plan Mode, structure plans into discrete steps. The contents of each step and their order should "tell a story" to make it easier for a human reviewer to follow and understand the larger change that the plan implements. Rather than having a separate step to update tests and documentation, each step (if appropriate) should create or update related tests, and update related documentation and versioned agent context (e.g. `.claude/rules/`).

Always add this implementation protocol to the plan you create:

```
## Implementation Protocol

- Pause after implementing each step (even if you have permission to edit automatically)
- Display a codeblock with a summary of the change in the style of a well-formed commit message
- Ask the user if they are ready to proceed to the next step
  - "Ready for Step N ({short reminder of what Step N is})?"
```
