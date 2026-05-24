---
name: testing-coverage
description: Guidance on writing meaningful tests — per-function vs codebase coverage, identifying gaps with granularity, and avoiding coverage-for-its-own-sake. Invoke when writing tests, reviewing coverage reports, deciding what to test next, or discussing test strategy.
---

# Testing Coverage

Effective test coverage means writing tests that meaningfully verify important code paths and edge cases, not chasing arbitrary percentages.

## Principles

### Per-function coverage

When writing tests for a specific function, aim for 100% coverage of that function if practical. This is the baseline: you should understand what your tests cover and intentionally cover important branches and edge cases. Use coverage reports at the function level to verify completeness.

### Codebase-level coverage

At the codebase level, don't target a specific percentage. Instead, optimize for **diminishing returns on effort**: keep adding tests until the cost to add the next test exceeds its value. A well-tested codebase doesn't have 100% coverage; it has high coverage in critical areas and pragmatic gaps elsewhere.

### Identifying gaps with granularity

Coverage reports at the whole-codebase level are misleading — a single test covering a large surface area can hide untested edge cases. Analyze coverage at granular levels: look at individual functions and branches, not just totals. A useful pattern: run a single test, check what it covers, ask "what edge cases did this miss?", and add focused tests.

### Meaningful > arbitrary

Avoid writing tests just to hit a coverage target. A test that exercises code but doesn't verify behavior, or that mirrors the implementation exactly, doesn't provide value. Focus on tests that would catch real bugs.

### Code that's hard to test

Some code is legitimately difficult to test (error handling in failures, platform-specific code, slow operations). Don't strain to reach 100% coverage in these areas if the effort isn't justified. Accept the gap and move on.

## Practice

- Review coverage reports regularly, especially for critical code paths.
- Use function-level coverage as a checklist when writing tests, not a goal.
- When you see low coverage in an important area, investigate whether it's due to missing edge-case tests or code that doesn't need testing.
