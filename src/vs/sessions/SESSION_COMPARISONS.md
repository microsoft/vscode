# Session comparison architecture

> **Specification change gate:** Update this document only when comparison ownership, participant roles, persistence, or lifecycle invariants change.

## Scope

Session comparisons run the same task through multiple Sessions providers and preserve every implementation in an isolated worktree. The workflow is provider-neutral: comparison code uses `ISessionsManagementService`, while providers remain responsible for listing and resolving their own model identifiers, creating worktrees, and deleting sessions.

The new-session composer offers comparison setup in the model picker, behind `sessions.chat.compareAgents.enabled`. The guided flow selects Attempts, an optional Judge, and an optional Synthesizer. A comparison runs either two to ten distinct fixed models once each, or one fixed model two to ten times. Auto/routing models are excluded. Done saves the draft configuration; the composer's Run N Attempts action launches it.

## Ownership

| Concern | Owner |
|---|---|
| Comparison records, participant lifecycle, and selection | `ISessionComparisonService` |
| Attempt, Judge, and Synthesizer harness, provider-local model, reasoning-effort, and permission selection | new-session composer |
| Provider-native permission options, mapping, and policy enforcement | Sessions provider |
| Session creation, model resolution, and worktree isolation | Sessions provider through `ISessionsManagementService` |
| Attempt evidence and user actions | Judge chat result and comparison parent grid |
| Bounded attempt manifest | `readAttemptComparison` tool |
| Targeted transcript follow-up | existing Agent Host `get_session_context` tool |
| Structured recommendation | visible grouped Judge session and `completeAttemptComparison` tool |

Comparison records are persisted in profile storage. Session and chat resources remain provider-owned identities. Each terminal attempt snapshots the producer-measured first-turn duration from the Agent Host protocol and the provider-reported input-plus-output token total used by the Judge result; cost is not recorded. Comparison telemetry records that duration, while analytical token totals come from provider-native OTel chat spans correlated by the same hashed comparison identifier and attempt index.
The Sessions group service persists the comparison's session membership so the hierarchy survives window reloads.
Comparison groups use the standard bulk Mark All as Done action, confirmation, and Undo. Once all participants are archived, the comparison service retires the comparison and removes its automatically created group. Bulk Undo restores the comparison group and membership for restored sessions; manually created groups are not automatically removed. Membership reconciliation respects sessions explicitly assigned to another group, including sessions independently restored before Undo.

## Participant hierarchy

Each comparison has one visible Sessions group containing all of its participants:

- **Attempt:** one uniquely identified run with one provider-local fixed model and one isolated worktree. Repeated runs have distinct participant IDs even when their configurations are identical.
- **Judge:** optional model that starts after at least two successfully launched attempts reach a terminal state and at least one of them completed, and submits one structured verdict. An attempt that only dropped out of its provider's catalog holds judging until it returns or its deletion is confirmed. Omitting the Judge means no automatic evaluation or result panel.
- **Synthesis:** optional new participant using the explicitly configured Synthesizer model. It requires a Judge verdict and an explicit user action, and never mutates an original attempt. Omitting the Synthesizer leaves review available without offering synthesis.

The comparison service creates attempts directly and adds each launched participant to the ordinary Sessions group. The group displays synthesis first, then the Judge, followed by attempts in their stable launch order; only attempts use connector decoration. It reconciles every participant back into that group as provider catalogs hydrate, so attempts, the Judge, and synthesis cannot fall back into separate workspace sections after a reload. It does not create a model-backed coordinator: orchestration is deterministic service behavior, and no model participant may create a second session tree.

## Lifecycle invariants

1. The prompt, attachment entries and references, workspace, branch, and every participant's harness/model/effort/permission choice are frozen at launch. Referenced attachment contents are not copied or frozen and may change at their original URI. All roles inherit the current draft's harness and permission/mode choices, with separate role-specific model selections and supported model configuration.
2. Every harness must support worktree configuration, and the selected Git repository must have at least one commit and a remote. Model identifiers remain provider-local and are never matched across providers by identifier or display name. Reasoning effort is stored as model configuration and is offered only when the provider can scope that configuration to the new draft. Each harness stores the opaque permission identifier and display label advertised by its Sessions provider; the provider owns its native configuration mapping and must apply organization policy before the draft's first configuration resolution. A locked or unavailable draft permission blocks launch rather than silently selecting a different permission.
3. Attempts launch concurrently. One launch failure is recorded without deleting successful attempts. If fewer than two attempts launch, comparison setup fails and any successful sessions remain available outside the comparison group. An attempt whose launch was interrupted by a window reload is recorded as a failed launch. The comparison service remains the single orchestration owner for Judge and synthesis creation; Agent Host does not infer ownership from client subscription state. Opening the comparison parent opens every available attempt together in a tiled Sessions grid, regardless of whether the Judge or a synthesis session is available. Judge and synthesis sessions remain directly accessible from their participant rows.
4. The Judge calls `readAttemptComparison` once to obtain the original task, successful participants, worktree locations, changed files, change summaries, and exact provider-owned transcript targets. Because terminal commands start in the Judge worktree, it explicitly changes to the manifest's exact attempt working directory for every command that inspects or validates that attempt. It reviews every attempt's diff, calls the existing `get_session_context` tool with those exact targets to inspect validation claims or other focused transcript evidence, and runs missing targeted validation when needed. It records whether each validation result came from the attempt report, a Judge run, unavailable evidence, or did not apply. It submits a recommendation, concise categorized rationale, attempt evidence, and conflicts through `completeAttemptComparison`, without custom synthesis decision sections. A rejected invalid verdict may be corrected and retried, but a successful verdict is not resubmitted. It does not discover sessions, guess references, create sessions, or modify attempts.
5. After the Judge submits a verdict, its chat remains open and identifies the winner as **Attempt N (agent · model · effort)**, followed by four concise rationale points in this order: comparison, validation, code quality, and solution. It then presents strong points from other attempts and actions to focus the winner or, when configured, start synthesis. Each rationale point is bounded by the verdict tool schema so the result remains scannable. A collapsed disclosure contains a table of each attempt's total time and provider-reported token total. Focusing the winner records a preference and opens its session without automatically opening its Changes editor; it does not apply changes to the user's working tree. **Synthesize Attempts** starts recommended synthesis directly. Its split-button menu opens a persisted additional-instructions field. The field includes **Start Synthesis with Instructions** and supports Ctrl/Cmd+Enter, so entering requirements has an explicit submission path.
6. Judge recommendations are advisory. Synthesis creates a new isolated grouped participant, considering the recommendation and treating any additional free-form instructions as user requirements. Original attempts remain available. Restoration ignores obsolete decision sections and per-decision selections while preserving additional instructions and already-created synthesis participants; missing evaluator configuration never implicitly selects a fallback model.

## Evidence

The Judge result uses the persisted structured verdict and provider-neutral participant state. Missing validation evidence is shown as unknown rather than inferred as successful or equal.

`readAttemptComparison` is intentionally a bounded manifest rather than a second transcript API. Agent Host already owns transcript retrieval through `get_session_context`, including summary, digest, and full detail levels. For attempts owned by the same provider authority as the Judge, the manifest maps provider-neutral participant records to exact provider-owned targets accepted by that existing tool. Cross-provider or cross-host attempts remain comparable through their bounded change, worktree, and validation evidence, but do not advertise an unusable transcript target.

Both comparison tools are registered as ordinary workbench language-model tools and members of a hidden internal tool set. This follows the same client-tool publication path as other workbench-provided Agent Host tools: `AgentHostActiveClientService` publishes enabled tool-set members through `SessionActiveClient.tools`, and the owning VS Code client executes their implementations. Registering a tool without adding it to a tool set does not make it available to Agent Host sessions.

## End-to-end flow

```mermaid
flowchart TD
	Composer[New-session composer] --> Setup[Guided model picker<br/>Attempts, optional Judge, optional Synthesizer]
	Setup -->|Done, then Run N Attempts| Service[SessionComparisonService<br/>Create comparison record and Sessions group]

	subgraph Group[One comparison group]
		direction TB
		A1[Attempt 1 session<br/>isolated worktree]
		A2[Attempt 2 session<br/>isolated worktree]
		AN[Attempt N session<br/>isolated worktree]
		Judge[Judge session<br/>selected agent + model]
		Synthesis[Synthesis session<br/>selected agent + model<br/>optional isolated worktree]
	end

	Service -->|createAndSendNewChatRequest| A1
	Service -->|createAndSendNewChatRequest| A2
	Service -->|createAndSendNewChatRequest| AN
	Service -->|Open comparison parent| Grid[Sessions grid<br/>all available attempts]
	Grid -.-> A1
	Grid -.-> A2
	Grid -.-> AN
	A1 --> Terminal{At least two launched attempts terminal}
	A2 --> Terminal
	AN --> Terminal
	Terminal -->|Only when Judge configured| Judge

	Judge -->|1. readAttemptComparison comparisonId| 	Manifest[Bounded manifest<br/>task + participant IDs + worktrees<br/>changed files + change summaries + context targets]
	Manifest --> Judge
	Judge -.->|2. get_session_context exact target<br/>only when more transcript evidence is needed| Context[Existing Agent Host transcript reader]
	Context -.-> Judge
	Judge -->|3. completeAttemptComparison successfully| Verdict[Persisted structured verdict]
	Verdict -->|Render in Judge chat| Result[Judge result<br/>winner + evidence + other strengths]
	Result -->|Focus winner explicitly| A1
	Result -->|Synthesize explicitly, only when configured| Synthesis
```
