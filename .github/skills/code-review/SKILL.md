---
name: code-review
description: Review code changes for correctness, regressions, and unintended scope. Use when reviewing a pull request, branch, commit, patch, or local diff, including when invoked with /code-review.
---

# Code Review

Review the proposed changes as a senior maintainer. Focus on actionable defects introduced by the changes, especially correctness issues, regressions, and changes that are not necessary for the stated goal.

## Establish the Review Scope

Before reviewing:

1. Determine the intended change from the request, pull request description, linked issue, and maintainer comments.
2. Identify the complete diff against the appropriate base.
3. Account for every changed file and subsystem.

Do not infer the purpose solely from the implementation. If the intended behavior is unclear, state the assumption used for the review.

## Review the Changes

Trace the changed behavior through its callers, dependencies, and tests. Check for:

- Incorrect logic, broken edge cases, or behavior that contradicts the stated goal.
- Regressions in existing behavior, including platform-specific and lifecycle behavior.
- Missing or incorrect error handling.
- Unsafe assumptions about data, ordering, concurrency, or object lifetime.
- Tests that do not cover the changed behavior or that would pass without the fix.
- Changes whose connection to the stated goal is unclear.

Keep fixes tied to the underlying cause. Do not accept unrelated changes to behavior, state management, or architecture merely because they make the reported symptom disappear.

Treat prerequisite or tightly coupled changes as in scope only when their necessity is clear from the implementation or pull request description. A changed file should be necessary for the stated goal or be a directly related test, documentation update, generated artifact, or required refactor. Independent cleanup and speculative improvements belong in a separate change.

## Report Findings

Report only findings that are:

- Introduced or made materially worse by the changes under review.
- Specific and actionable.
- Supported by the code or by a concrete missing validation.

For each finding:

1. State the user-visible or engineering impact.
2. Explain the conditions that trigger it.
3. Point to the smallest relevant changed line or range.
4. Explain why the current implementation is incorrect.

Prioritize findings by severity. Do not report stylistic preferences, speculative concerns, or pre-existing problems unrelated to the change. If no actionable findings remain, say so explicitly and mention any meaningful validation gaps.

Flag changes whose connection to the stated goal is unclear even when tests pass or the resulting behavior appears correct. Ask for the causal link to be explained; if none exists, recommend reverting the change or moving it to a separate pull request.
