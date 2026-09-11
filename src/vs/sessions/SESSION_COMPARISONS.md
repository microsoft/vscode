# Session comparison architecture

> **Specification change gate:** Update this document only when comparison ownership, participant roles, persistence, or lifecycle invariants change.

## Scope

Session comparisons run the same task through multiple Sessions providers and preserve every implementation in an isolated worktree. The workflow is provider-neutral: comparison code uses `ISessionsManagementService`, while providers remain responsible for listing and resolving their own model identifiers, creating worktrees, and deleting sessions.

## Ownership

| Concern | Owner |
|---|---|
| Comparison records, participant lifecycle, selection, and cleanup | `ISessionComparisonService` |
| Attempt, harness, and provider-local model selection | new-session composer |
| Session creation, model resolution, and worktree isolation | Sessions provider through `ISessionsManagementService` |
| Attempt evidence and user actions | comparison editor |
| Structured recommendation | visible Judge child session and `completeAttemptComparison` tool |

Comparison records are persisted in profile storage. Session and chat resources remain provider-owned identities; the comparison record does not duplicate provider session state.
Providers persist comparison child-session provenance with committed session identity so the parent-child hierarchy survives provider and window reloads.

## Participant hierarchy

Each comparison has one visible coordinator session. Attempts, the Judge, and an optional synthesis are created with `createdBySession` pointing to that coordinator:

- **Coordinator:** stable parent and grouping anchor; it does not implement the task.
- **Attempt:** one uniquely identified setup entry with one selected harness, one provider-local model selection, and one isolated worktree. Multiple attempts may use the same harness and model.
- **Judge:** starts after at least two successfully launched attempts reach a terminal state and submits one structured verdict.
- **Synthesis:** optional new attempt using the recommended or selected attempt's harness. It never mutates an original attempt.

The ordinary session-group and child-session mechanisms render this hierarchy. Comparison code must not create a second session tree.

## Lifecycle invariants

1. The prompt, attachments, workspace, branch, and permission level are frozen at launch and shared across attempts. Each attempt independently selects a model advertised by its harness provider.
2. Every harness must support worktree configuration. Model identifiers remain provider-local and are never matched across providers by identifier or display name.
3. Attempts launch concurrently. One launch failure is recorded without deleting successful attempts.
4. The Judge receives references to successful attempts and must classify tests, build, lint, and diagnostics as `passed`, `failed`, `notRun`, or `unknown`.
5. Selecting an attempt opens its session and records a preference; it does not apply changes to the user's working tree.
6. Judge recommendations are advisory. Synthesis starts only through an explicit user action and creates a new isolated child. Original attempts remain until an explicit, confirmed discard.
7. Cleanup reports partial deletion failures and retains records for attempts that could not be deleted.

## Evidence

The comparison editor derives file counts, diff size, elapsed time, file overlap, attempt-specific files, and starting-source/base-branch agreement from provider-neutral session state. Missing evidence is shown as unknown rather than inferred as successful or equal.
