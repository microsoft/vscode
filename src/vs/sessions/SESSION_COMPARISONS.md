# Session comparison architecture

> **Specification change gate:** Update this document only when comparison ownership, participant roles, persistence, or lifecycle invariants change.

## Scope

Session comparisons run the same task through multiple Sessions providers and preserve every implementation in an isolated worktree. The workflow is provider-neutral: comparison code uses `ISessionsManagementService`, while providers remain responsible for listing and resolving their own model identifiers, creating worktrees, and deleting sessions.

## Ownership

| Concern | Owner |
|---|---|
| Comparison records, participant lifecycle, selection, and cleanup | `ISessionComparisonService` |
| Attempt and Judge harness/provider-local model selection | new-session composer |
| Session creation, model resolution, and worktree isolation | Sessions provider through `ISessionsManagementService` |
| Attempt evidence and user actions | comparison editor |
| Bounded attempt manifest | `readAttemptComparison` tool |
| Targeted transcript follow-up | existing Agent Host `get_session_context` tool |
| Structured recommendation | visible grouped Judge session and `completeAttemptComparison` tool |

Comparison records are persisted in profile storage. Session and chat resources remain provider-owned identities; the comparison record snapshots only the final content-free token summary needed to preserve attempt evidence after a reload or participant cleanup.
The Sessions group service persists the comparison's session membership so the hierarchy survives window reloads.

## Participant hierarchy

Each comparison has one visible Sessions group containing all of its participants:

- **Attempt:** one uniquely identified setup entry with one selected harness, one provider-local model selection, and one isolated worktree. Multiple attempts may use the same harness and model.
- **Judge:** uses the harness and model selected in comparison setup, starts after at least two successfully launched attempts reach a terminal state, and submits one structured verdict.
- **Synthesis:** optional new attempt using the recommended or selected attempt's harness. It never mutates an original attempt.

The comparison service creates attempts directly and adds each launched participant to the ordinary Sessions group. It reconciles every participant back into that group as provider catalogs hydrate, so attempts, the Judge, and synthesis cannot fall back into separate workspace sections after a reload. It does not create a model-backed coordinator: orchestration is deterministic service behavior, and no model participant may create a second session tree.

## Lifecycle invariants

1. The prompt, attachments, workspace, branch, permission level, and Judge harness/model are frozen at launch. The prompt and attachments are shared across attempts, and each attempt independently selects a model advertised by its harness provider.
2. Every harness must support worktree configuration. Model identifiers remain provider-local and are never matched across providers by identifier or display name.
3. Attempts launch concurrently. One launch failure is recorded without deleting successful attempts.
4. The Judge calls `readAttemptComparison` once to obtain the original task, successful participants, worktree locations, changed files, change summaries, and exact provider-owned transcript targets. It reviews every attempt's diff, calls the existing `get_session_context` tool with those exact targets to inspect validation claims or other focused transcript evidence, and runs missing targeted validation when needed. It records whether each validation result came from the attempt report, a Judge run, or unavailable evidence, then calls `completeAttemptComparison` exactly once. It does not discover sessions, guess references, create sessions, or modify attempts.
5. The completed verdict makes the comparison ready for review. Reviewing an attempt records a preference, opens its session, and opens its Changes editor; it does not apply changes to the user's working tree.
6. Judge recommendations are advisory. Synthesis starts only through an explicit user action and creates a new isolated grouped participant. Original attempts remain until an explicit, confirmed discard.
7. Cleanup reports partial deletion failures and retains records for attempts that could not be deleted.

## Evidence

The comparison editor derives file counts, diff size, elapsed time, file overlap, attempt-specific files, starting-source/base-branch agreement, and live token usage from provider-neutral session state. When an attempt becomes terminal, the comparison service persists aggregate input, cached-input, and output totals plus their per-model breakdown and completeness. Missing evidence is shown as unknown rather than inferred as successful or equal.

`readAttemptComparison` is intentionally a bounded manifest rather than a second transcript API. Agent Host already owns transcript retrieval through `get_session_context`, including summary, digest, and full detail levels. For attempts owned by the same provider authority as the Judge, the manifest maps provider-neutral participant records to exact provider-owned targets accepted by that existing tool. Cross-provider or cross-host attempts remain comparable through their bounded change, worktree, and validation evidence, but do not advertise an unusable transcript target. Token usage is not included in the Judge manifest or prompts, so it remains informational and cannot silently become a ranking criterion.

Both comparison tools are registered as ordinary workbench language-model tools and members of a hidden internal tool set. This follows the same client-tool publication path as other workbench-provided Agent Host tools: `AgentHostActiveClientService` publishes enabled tool-set members through `SessionActiveClient.tools`, and the owning VS Code client executes their implementations. Registering a tool without adding it to a tool set does not make it available to Agent Host sessions.

## End-to-end flow

```mermaid
flowchart TD
	Composer[New-session composer] --> Setup[Compare agents setup<br/>Prompt + N attempt agent/models + Judge agent/model]
	Setup -->|Run Attempts| Service[SessionComparisonService<br/>Create comparison record and Sessions group]

	subgraph Group[One comparison group]
		direction TB
		A1[Attempt 1 session<br/>isolated worktree]
		A2[Attempt 2 session<br/>isolated worktree]
		AN[Attempt N session<br/>isolated worktree]
		Judge[Judge session<br/>selected agent + model]
		Synthesis[Synthesis session<br/>optional isolated worktree]
	end

	Service -->|createAndSendNewChatRequest| A1
	Service -->|createAndSendNewChatRequest| A2
	Service -->|createAndSendNewChatRequest| AN
	A1 --> Terminal{At least two launched attempts terminal}
	A2 --> Terminal
	AN --> Terminal
	Terminal -->|createAndSendNewChatRequest| Judge

	Judge -->|1. readAttemptComparison comparisonId| 	Manifest[Bounded manifest<br/>task + participant IDs + worktrees<br/>changed files + change summaries + context targets]
	Manifest --> Judge
	Judge -.->|2. get_session_context exact target<br/>only when more transcript evidence is needed| Context[Existing Agent Host transcript reader]
	Context -.-> Judge
	Judge -->|3. completeAttemptComparison exactly once| Verdict[Persisted structured verdict]
	Verdict --> Editor[Comparison editor<br/>recommendation + evidence<br/>Review Recommended Attempt]
	Editor -->|Synthesize explicitly| Synthesis
	Editor -->|Discard explicitly| Cleanup[Delete original attempt sessions/worktrees<br/>retain partial failures]
```
