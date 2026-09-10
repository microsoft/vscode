# Session comparison architecture

> **Specification change gate:** Update this document only when comparison ownership, participant roles, persistence, or lifecycle invariants change.

## Scope

Session comparisons run the same task through multiple Sessions providers and preserve every implementation in an isolated worktree. The workflow is provider-neutral: comparison code uses `ISessionsManagementService`, while providers remain responsible for resolving their own model identifiers, creating worktrees, and deleting sessions.

## Ownership

| Concern | Owner |
|---|---|
| Comparison records, participant lifecycle, selection, and cleanup | `ISessionComparisonService` |
| Harness and shared-model selection | new-session composer |
| Session creation, model resolution, and worktree isolation | Sessions provider through `ISessionsManagementService` |
| Attempt evidence and user actions | comparison editor |
| Structured recommendation | visible Judge child session and `completeAttemptComparison` tool |

Comparison records are persisted in profile storage. Session and chat resources remain provider-owned identities; the comparison record does not duplicate provider session state.

## Participant hierarchy

Each comparison has one visible coordinator session. Attempts, the Judge, and an optional synthesis are created with `createdBySession` pointing to that coordinator:

- **Coordinator:** stable parent and grouping anchor; it does not implement the task.
- **Attempt:** one selected harness, one provider-resolved instance of the shared logical model, and one isolated worktree.
- **Judge:** starts after at least two successfully launched attempts reach a terminal state and submits one structured verdict.
- **Synthesis:** optional new attempt using the recommended or selected attempt's harness. It never mutates an original attempt.

The ordinary session-group and child-session mechanisms render this hierarchy. Comparison code must not create a second session tree.

## Lifecycle invariants

1. The prompt, attachments, workspace, branch, permission level, and logical model selection are shared across attempts.
2. Every harness must support worktree configuration and resolve the selected logical model to its provider-local model identifier.
3. Attempts launch concurrently. One launch failure is recorded without deleting successful attempts.
4. The Judge receives references to successful attempts and must classify tests, build, lint, and diagnostics as `passed`, `failed`, `notRun`, or `unknown`.
5. Selecting an attempt opens its session and records a preference; it does not apply changes to the user's working tree.
6. Synthesis creates a new isolated child. Original attempts remain until an explicit, confirmed discard.
7. Cleanup reports partial deletion failures and retains records for attempts that could not be deleted.

## Evidence

The comparison editor derives file counts, diff size, elapsed time, file overlap, attempt-specific files, and starting-source/base-branch agreement from provider-neutral session state. Missing evidence is shown as unknown rather than inferred as successful or equal.
