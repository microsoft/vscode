# Session comparison architecture

> **Specification change gate:** Update this document only when comparison ownership, participant roles, persistence, or lifecycle invariants change.

## Scope

Session comparisons run the same task on several models side by side and preserve every implementation in an isolated worktree. The user chooses the models with Compare Models in the new-session model picker and follows the runs, the review, and what to keep in one comparison view. The workflow is provider-neutral: comparison code uses `ISessionsManagementService`, while providers remain responsible for listing and resolving their own model identifiers, creating worktrees, and deleting sessions.

## Ownership

| Concern | Owner |
|---|---|
| Comparison records, participant lifecycle, and selection | `ISessionComparisonService` |
| Compare mode: which models run, on the draft's harness and with the draft's permission choice | new-session composer, through the model picker's multi-model mode |
| Provider-native permission options, mapping, and policy enforcement | Sessions provider |
| Session creation, model resolution, and worktree isolation | Sessions provider through `ISessionsManagementService` |
| Parallel run progress, attempt evidence, and user actions | comparison view (one conversation per comparison), with a context bar in each participant's chat |
| Bounded attempt manifest | `readAttemptComparison` tool |
| Targeted transcript follow-up | existing Agent Host `get_session_context` tool |
| Structured recommendation | visible grouped Judge session and `completeAttemptComparison` tool |

Comparison records are persisted in profile storage. Session and chat resources remain provider-owned identities. Each terminal attempt snapshots the producer-measured first-turn duration from the Agent Host protocol and the provider-reported input-plus-output token total used by the Judge result; cost is not recorded. Comparison telemetry records that duration, while analytical token totals come from provider-native OTel chat spans correlated by the same hashed comparison identifier and attempt index.
The Sessions group service persists the comparison's session membership so the hierarchy survives window reloads.

## Participant hierarchy

Each comparison has one visible Sessions group containing all of its participants:

- **Attempt:** one model chosen in Compare mode, run on the draft's harness with the draft's permission choice, in its own isolated worktree. Attempts carry the same record shape as before, so a harness may still differ per attempt when a caller supplies one.
- **Judge:** reviews with the first model chosen in Compare mode, on the same harness and permission choice, starts after at least two successfully launched attempts reach a terminal state and at least one of them completed, and submits one structured verdict. An attempt that only dropped out of its provider's catalog holds judging until it returns or its deletion is confirmed. Users see the Judge as the comparison's **Review** (its session is titled `Review: <prompt>`), and the Judge names attempts by model in everything they read.
- **Synthesis:** optional new attempt that combines what the user kept, shown to users as the **Combined** version (`Combined: <prompt>`). Unless a synthesizer harness was recorded at launch, it runs on the harness and model of the attempt the user continued with or the Judge recommended. It never mutates an original attempt.

The comparison service creates attempts directly and adds each launched participant to the ordinary Sessions group. The group displays synthesis first, then the Judge, followed by attempts in their stable launch order; only attempts use connector decoration. It reconciles every participant back into that group as provider catalogs hydrate, so attempts, the Judge, and synthesis cannot fall back into separate workspace sections after a reload. It does not create a model-backed coordinator: orchestration is deterministic service behavior, and no model participant may create a second session tree.

## Lifecycle invariants

1. The prompt, attachment entries and references, workspace, branch, and every participant's harness/model/permission choice are frozen at launch. Referenced attachment contents are not copied or frozen and may change at their original URI. The prompt and attachment references are shared across attempts, while each attempt independently selects its model, optional supported reasoning effort, and permission choice.
2. Every harness must support worktree configuration, and the selected Git repository must have at least one commit and a remote; the model picker offers Compare Models only when these hold. Model identifiers remain provider-local and are never matched across providers by identifier or display name. Each harness stores the opaque permission identifier and display label advertised by its Sessions provider; the composer inherits the draft's configured choice (or the provider default), the provider owns its native configuration mapping, and it must apply organization policy before the draft's first configuration resolution. There is no setup dialog: choosing models in the picker and sending the prompt is the whole setup.
3. Attempts launch concurrently. One launch failure is recorded without deleting successful attempts. If fewer than two attempts launch, comparison setup fails and any successful sessions remain available outside the comparison group. An attempt whose launch was interrupted by a window reload is recorded as a failed launch. The comparison service remains the single orchestration owner for Judge and synthesis creation; Agent Host does not infer ownership from client subscription state. Opening the comparison parent shows the comparison view: the prompt, one subagent pill per participant with its live status and activity, the review, and the results. It opens as soon as the comparison record exists, before worktrees finish launching. The composer's draft is kept (with its prompt cleared) rather than discarded, because every attempt gets its own session and re-creating the draft would navigate away from the comparison view. Selecting a pill opens that participant's session; Open Side by Side shows every available attempt in a tiled Sessions grid. Opening a participant never hides the side pane, so its Changes view stays available.
4. The Judge calls `readAttemptComparison` once to obtain the original task, successful participants, worktree locations, changed files, change summaries, and exact provider-owned transcript targets. Because terminal commands start in the Judge worktree, it explicitly changes to the manifest's exact attempt working directory for every command that inspects or validates that attempt. It reviews every attempt's diff, calls the existing `get_session_context` tool with those exact targets to inspect validation claims or other focused transcript evidence, and runs missing targeted validation when needed. It records whether each validation result came from the attempt report, a Judge run, unavailable evidence, or did not apply. For each semantic decision section, it summarizes every relevant attempt's approach, rates it as better, neutral, or worse from concrete evidence, and rates the recommended option as better before successfully calling `completeAttemptComparison`. A rejected invalid verdict may be corrected and retried, but a successful verdict is not resubmitted. It does not discover sessions, guess references, create sessions, or modify attempts.
5. After the Judge submits a verdict, the comparison view describes each attempt under its pill: a past-tense summary of what it did, its checks, anything it left open (as unchecked items beside its checks, not warnings), diff size and token total. It names the strongest starting point with a one-sentence explanation and a collapsed **Why** list (comparison, checks, code, solution, and conflicts). It never labels an attempt as worse or not recommended; the recommendation appears only as a **Suggested** tag. Participant chats show a context bar above the input that names the comparison and links back to it.
6. Judge recommendations are advisory. **Where they differ** lists each semantic decision with what every attempt did for it, as a radio group defaulting to the recommendation, plus **Let the combined version decide**. Each option can open its attempt at the turn that first edited the decision's affected files (otherwise at its final turn) and briefly highlights that turn. Selections persist in the synthesis plan. The next step adapts: when every kept choice comes from one attempt, **Continue with** that attempt is primary; otherwise **Combine What You Kept** is. Continuing records a preference and opens that attempt's session; it does not apply changes to the user's working tree. Combining treats the plan and any instructions as user requirements and creates a new isolated grouped participant. Original attempts remain available.

## Evidence

The Judge result uses the persisted structured verdict and provider-neutral participant state. Missing validation evidence is shown as unknown rather than inferred as successful or equal.

`readAttemptComparison` is intentionally a bounded manifest rather than a second transcript API. Agent Host already owns transcript retrieval through `get_session_context`, including summary, digest, and full detail levels. For attempts owned by the same provider authority as the Judge, the manifest maps provider-neutral participant records to exact provider-owned targets accepted by that existing tool. Cross-provider or cross-host attempts remain comparable through their bounded change, worktree, and validation evidence, but do not advertise an unusable transcript target.

Both comparison tools are registered as ordinary workbench language-model tools and members of a hidden internal tool set. This follows the same client-tool publication path as other workbench-provided Agent Host tools: `AgentHostActiveClientService` publishes enabled tool-set members through `SessionActiveClient.tools`, and the owning VS Code client executes their implementations. Registering a tool without adding it to a tool set does not make it available to Agent Host sessions.

## End-to-end flow

```mermaid
flowchart TD
	Composer[New-session composer<br/>Compare Models in the model picker<br/>2-4 models on the draft's harness] -->|Run N Models| Service[SessionComparisonService<br/>Create comparison record and Sessions group]

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
	Service -->|Open as soon as created| View[Comparison view<br/>prompt + live subagent pills<br/>review + what each attempt did]
	View -.->|Select a pill or a decision option| A1
	View -.-> A2
	View -.-> AN
	View -.->|Open Side by Side| Grid[Sessions grid<br/>all available attempts]
	A1 --> Terminal{At least two launched attempts terminal}
	A2 --> Terminal
	AN --> Terminal
	Terminal -->|createAndSendNewChatRequest| Judge

	Judge -->|1. readAttemptComparison comparisonId| 	Manifest[Bounded manifest<br/>task + participant IDs + worktrees<br/>changed files + change summaries + context targets]
	Manifest --> Judge
	Judge -.->|2. get_session_context exact target<br/>only when more transcript evidence is needed| Context[Existing Agent Host transcript reader]
	Context -.-> Judge
	Judge -->|3. completeAttemptComparison successfully| Verdict[Persisted structured verdict]
	Verdict -->|Render in comparison view| Result[What each attempt did<br/>where they differ + what to keep]
	Result -->|Continue with an attempt| A1
	Result -->|Combine what you kept| Synthesis
```
