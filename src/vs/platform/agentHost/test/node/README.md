# Agent Host node tests

Choose the lowest test type that exercises the behavior:

- `*.test.ts`: in-process unit tests for one service, mapper, reducer, or provider component.
- `protocol/`: a real Agent Host server driven over AHP with `ScriptedMockAgent`. Use for server and protocol contracts that do not depend on a provider SDK.
- `e2e/providers/`: the whole server and bundled provider process with deterministic LLM captures and AHP snapshots. Use when provider behavior is part of the contract.
- `providerIntegration/`: a real provider process backed by the local mock LLM. Use when provider lifecycle matters but realistic model behavior does not.
- Other `*.integrationTest.ts` files at this level: focused component integrations that do not exercise AHP end to end, such as direct SDK or Git-service coverage.

Tests that launch a real provider process isolate its home, configuration, logs, and session state in a temporary directory.

The protocol and E2E folders contain their own running and authoring instructions.

## Request-survival model metadata

Outgoing contributions receive the explicit or inherited model selection captured by the send path after selection updates. The survival logger captures that selection's identifier synchronously at the originating boundary and retains it independently of later chat model changes. `baseModel` and `observationModel` describe selections, not provider-resolved executing models; Auto/Fusion remains a selection and unresolved values stay null.

The effective-selection cases in [requestDiffSurvival.test.ts](./requestDiffSurvival.test.ts) cover character-diff records, inherited selection, explicit override, unknown values, Auto/Fusion, and later model changes. The model-selection suite in [agentSideEffects.test.ts](./agentSideEffects.test.ts) verifies that the real send path forwards those facts without changing the outgoing message.

## Request-survival experiment cadence

With `VSCODE_AGENT_HOST_REQUEST_DIFF_SURVIVAL_LOG=1`, `requestCharacterDiffSurvivalObservation` is the sole experimental survival record kind. Schema version 6 adds `storageStrategy: 'checkpointIds'` and removes retained-budget fields. It preserves ordinary request-end observations: index 0 describes the originating request, and indices 1–10 describe the next ten eligible completed requests in the same chat. `maximumObservationCount` is 11 including the initial record; `maximumFollowUpCount` is 10. Index 10 is final and retires the tracker. Requests without available Git checkpoints do not produce ordinary observations. Success, cancellation, and non-resumable errors finalize started requests; resumable errors do not.

For a complete initial observation, the states are `(A, B, B)`, so all original additions and deletions survive. The ratio is 1 for a nonempty edit and null for no net edit. Incomplete results must not be interpreted as valid survival. Subsequent observations compare the original start/end checkpoints directly against the latest end checkpoint. Changes between requests and within the next request are therefore combined.

Trackers retain immutable Git tree IDs for A and B, plus small lifecycle/model metadata, not diff ranges or text. B's named checkpoint ref is resolved to a tree ID before tracking. Each follow-up reconstructs A→B, A→C, and B→C locally; initial A→C reuses that observation's A→B and B→B is empty. Git object availability still depends on existing checkpoint ownership; a missing object produces an explicit incomplete/unavailable result, not a successful empty diff. There is no new pinning, disk copy, or cache.

The two input budgets and ten-follow-up limit are centralized in [requestDiffSurvivalLimits.ts](../../node/chatContributions/requestDiffSurvival/requestDiffSurvivalLimits.ts): 512 KiB combined before/after Git blob bytes per file comparison and 4 MiB cumulative input per originating request's observation. Exactly-at-limit work is allowed. All required comparison metadata is checked before any blob reads or worker dispatch; initial A→B input counts once, and follow-ups share one input budget across all three comparisons, counting repeated inputs again. Reconstructing A→B can reject observations admitted by the retained baseline. The obsolete 16 MiB retained-diff limit is removed, not silently reported as zero.

Ordinary records have `status: 'measured'` and numeric zero budget flags. A violated budget emits one terminal `status: 'budgetExceeded'` record, `complete: false`, `isFinalObservation: true`, and one or both numeric flags: `fileInputBudgetExceeded` and `observationInputBudgetExceeded`. Every survival field, including the ratio, is -1; `diffs` is absent. Identity, model selection, cadence metadata, limits, and small `budgetDiagnostics` remain. No extra final computation occurs, and that origin is permanently retired. A zero flag does not certify a check that was never reached. Missing or invalid size metadata is an explicit incomplete calculation, not a zero-byte estimate.

Observation-local blobs, strings, worker messages, mappings, and three materialized diffs still allocate memory. Log sinks can retain serialized payloads independently of tracking. This is not a hard heap/RSS, temporary-memory, or backlog bound, nor proof of reduced peak memory or GC time. Measure matched runs before claiming a memory benefit. Queued work cannot revive retired or evicted state.

Tracker lifetime limits are centralized in the same limits object: `idleExpiryMs` is 60 minutes and `maximumTrackerAgeMs` is 24 hours. Same-chat request-start/end activity resets the idle clock; idle expiry is suspended while a request runs. Typing, view focus, streaming chunks, and other chats do not extend it. Maximum age starts at the originating request-end boundary, not completion of queued observation work, and continues during active requests. A single disposable scheduler uses monotonic time and runs without another request arriving. Exactly-at-deadline expiry applies, and maximum age takes precedence when both deadlines have elapsed.

Expiry emits at most one terminal record at the next observation index with `observationBoundary: 'expiry'`, `terminalReason: 'idleExpired' | 'maximumAgeExceeded'`, and `isFinalObservation: true`. It reuses the last associated `observationRequestId` and model; no synthetic request or independent counter is created. The boundary, not the request ID, identifies expiry-triggered work. A tracker already finalized at index 10 produces no expiry record.

When safe, expiry captures fresh working-tree tree IDs with the existing Git temp-index helper and reconstructs A→B/A→C/B→C under the same input budgets. Valid results remain `status: 'measured'`. A confirmed budget violation remains `status: 'budgetExceeded'` with its flags and expiry reason, without further computation. Unsafe/missing/failed capture or incomplete computation emits `status: 'unavailable'`, `complete: false`, no `diffs`, and -1 for every survival field, with `unavailableReason`: `repositoryBusy`, `repositoryActivity`, `captureFailed`, `computationFailed`, `initialObservationIncomplete`, or `observationInProgress`.

Known active turns in overlapping repositories prevent capture, including other chats; unknown active-turn directories conservatively prevent it too. Host activity observed during capture invalidates it even if the activity ended before capture completed. This is not a guarantee against external processes mutating repositories. Expiry does not wait for a quiet window or behind queued ordinary observations. A tracker with observation work already in flight receives an unavailable terminal and retires immediately; its pending work cannot later emit an ordinary observation or revive tracking. Objects referenced by in-flight work become reclaimable when that work unwinds.

Eviction, unregister, and shutdown cancel owned scheduling and release state without requiring new Git work or a final measurement. Lifetime cutoffs are not hard execution deadlines: event-loop stalls can delay recognition, synchronous diff calls cannot be interrupted, and existing Git timeouts/cancellation still govern asynchronous work. Ordinary Git checkpoints and normal editor/host edit telemetry remain unchanged; expiry tree snapshots do not add persistent per-turn checkpoint refs or delete existing checkpoints.

The former `requestDiffSurvivalObservation`, `requestCharacterSurvivalSnapshot`, and `requestFocusWindowSurvivalSnapshot` streams and their exclusive collection work have been removed. No line-diff survival computation or original line-diff payload is retained. Consumers of historical logs must distinguish the old start/end cadence, schema-2 end-only measurements, schema-3 budget terminals, and schema-4 expiry boundaries. Exclude budget/unavailable and incomplete records from measured survival aggregates; analyze valid expiry measurements separately from ordinary request-end follow-ups. Expiry and budget termination censor the remaining follow-up window, rather than themselves proving survival loss.

## Request-survival input protection and validation

Input protection preflights the entire observation before any blob-content reads or character-diff calls. It enumerates changed files and reads before/after blob-size metadata for A→B at index 0, or all three comparisons at follow-up/expiry. All repositories and required comparisons share the 4 MiB allowance; repeated inputs count again and equality remains allowed. Preflight stops as soon as a file or cumulative input violation is known, without scanning remaining files just to calculate a full rejected total. A late oversized file, repository, or third-comparison rejection therefore prevents character work for the whole observation, not just its unprocessed suffix.

Preflight stores only file descriptors, immutable checkpoint refs, sizes, and explicit errors, never blob contents. Admitted work reuses that metadata rather than repeating size queries or charging input twice; loaded content must still match its preflight size. Missing metadata remains an explicit incomplete file result, not a zero-size estimate. The worker's cooperative timeout is not a hard CPU-time or end-to-end deadline, so under-budget difficult inputs can still be expensive.

Only `[RequestCharacterDiffSurvivalObservation]` records remain. Compute/size events, worker CPU and elapsed-time measurements, task/observation timing, event-loop sampling, drain tracking, and their diagnostic environment control have been removed. No performance collector runs when survival logging is disabled. Survival schema 6, verbose diff payloads, timestamps, budget flags and rejection details, lifecycle boundaries, and normal warning/error reporting are unchanged. This cleanup does not add product telemetry.

[requestDiffSurvival.test.ts](./requestDiffSurvival.test.ts) covers immutable B identity, observation-local reconstruction, shared three-comparison budgets, checkpoint failures, independent chats, retirement, disabled logging, and survival/cadence behavior. Its injectable expiry scheduler tests exact deadlines, activity/reset/isolation, fresh-state survival changes, capture and computation failures, budgets, queued/in-flight races, log-failure isolation, horizon finalization, and disposal. A regression verifies survival-only output even when the obsolete diagnostic environment flag is set.

### Hybrid worker engine

Survival uses only `worker-hybrid`: VS Code line alignment plus raw character refinement through the existing diff worker. Enable it with `VSCODE_AGENT_HOST_REQUEST_DIFF_SURVIVAL_LOG=1`. The experimental pure-character engines and engine environment selector have been removed. This remains an opt-in local experiment, not a new product configuration or permission.

Worker operations use the existing 5,000 ms cooperative algorithm timeout. A timeout/algorithm or transport failure emits a final unavailable survival observation with `unavailableReason: 'computationFailed'`, no diff payload, and -1 survival values; it retires the tracker. Raw hybrid mappings are translated to full-document UTF-16 offsets; a linear gap pass restores newline-only edits omitted by the line engine without replacing the whole file or falling back to whole-file character LCS. Unexpected unmatched text is an explicit failure. Alignment can differ from historical whole-text character results even when both reconstruct the exact text.

Input preflight rejects before dispatch; stale-result checks still run on the host. Chat/session eviction and expiry can retire a pending tracker without resurrecting it when its result arrives. Already-dispatched jobs, including queued jobs, are not removed or forcibly interrupted: they finish or cooperatively time out, and stale results are discarded. No shared worker is killed to cancel one tracker. Worker loss/disposal rejects pending calls, and a disposed service cannot spawn another worker. This is not a hard end-to-end deadline, queue/backlog bound, or temporary-memory limit.

Run the focused survival/contribution suites via `scripts/test.sh`. Real-worker cases in [survivalDiff.test.ts](./survivalDiff.test.ts) must also run in Node because Electron's test renderer cannot construct Node workers:

```bash
pnpm run test-node --run src/vs/platform/agentHost/test/node/survivalDiff.test.ts
```

The engine suite verifies real worker messaging without diagnostic payloads, disposal, exact reconstruction (including deterministic mixed-newline edits), A/B coordinate intersections, and timeout results. Contribution tests verify preflight-before-dispatch, reuse/cadence, timeout retirement, and stale-result cleanup.

## Request-survival attribution coverage

Every experimental `requestCharacterDiffSurvivalObservation` includes `originalRequestUsedEditTool`. The contribution collects provider-owned tool outcomes synchronously within the originating request, including parent and nested-subagent tools, and freezes the value at success, cancellation, or non-resumable error. Later observations repeat that value; a resumable error does not finalize it. This field does not filter requests or change the observation horizon, diff metrics, telemetry consent, or experiment opt-in.

`true` means a recognized native edit tool executed, even if it failed or made no change; terminal-only commands and denied-before-execution invocations do not qualify. Copilot reuses `isEditTool(toolName, command)` and its SDK success/failure outcomes (SDK execution-start events precede permission checks and are not sufficient evidence). Claude reuses `isClaudeFileEditTool` and successful results. `false` means a supported provider finished the observed tool lifecycles without such an attempt. `null` means no positive evidence was available and coverage was insufficient: unsupported providers, client/MCP tools, unfinished calls, ambiguous Copilot outcomes, or Claude edit failures that its result stream cannot distinguish from SDK-owned pre-execution denial. Positive evidence remains `true` despite other unknown calls. No editor/other-source activity flag is collected.

`vscode.toolRequest` preserves the provider's root chat and request identity before subagent routing remaps action turn IDs, so reusable descendants and late outcomes cannot be attributed to a later request. Provider evidence metadata is emitted only under the existing experiment opt-in; protocol action turn IDs remain unchanged. Focused cases in `requestDiffSurvival.test.ts`, `copilotAgentSession.test.ts`, `claudeMapSessionEvents.test.ts`, `copilotToolDisplay.test.ts`, `claudeToolDisplay.test.ts`, and `agentToolCallMeta.test.ts` cover execution classification, metadata validation, queued-checkpoint races, request-end freezing, nested routing, and missing coverage.

## Request-survival experiment log retention

With `VSCODE_AGENT_HOST_REQUEST_DIFF_SURVIVAL_LOG=1`, the utility-process Agent Host and non-quiet standalone Agent Host use a 100 MiB per-file limit with six rotated backups plus the current file (approximately 700 MiB of bounded retention). Without that exact flag value, their normal 5 MiB per-file limit remains unchanged. Other loggers keep their existing limits. This is local diagnostic retention, not a new telemetry consent or managed setting.

Log rotation is size-based, not duration-based. Export all current and rotated Agent Host log files promptly after an experiment; sufficiently verbose or long runs can still rotate away early observations. Changing the limit requires rebuilding and restarting the host and cannot recover previously deleted history.

The retention case in [agentHostBootstrap.test.ts](./agentHostBootstrap.test.ts) covers the flag gate used by both entry points. [loggerService.test.ts](../../../log/test/node/loggerService.test.ts) exercises the real native logger at the default 5 MiB and experiment 100 MiB thresholds, verifies the six-backup bound, and rejects invalid overrides.

```bash
./scripts/test.sh --run src/vs/platform/log/test/node/loggerService.test.ts --run src/vs/platform/agentHost/test/node/agentHostBootstrap.test.ts --grep 'Native logger retention|log retention' --reporter dot
```

## Reasoning timing

AHP reasoning parts carry optional producer-owned `startedAt` and `duration` fields for one contiguous run of thinking output. A run starts at its first nonempty reasoning text and ends at the next markdown or tool-call part, or at turn termination. SDK reasoning IDs, reasoning-complete events, full-message boundaries, and sideband notifications do not split a run. Timing-only `chat/reasoning` updates finish the run before publishing the following content or terminal action.

Copilot measures runs with a monotonic clock and stores the observed ordering of reasoning, markdown, and tool references against durable assistant-message event IDs in `assistant_response_parts`. A run may span SDK messages; its fragments share one ID and are updated with the same final duration, then reassembled without summing it during replay. Conversely, two runs separated by markdown or a tool retain separate IDs and durations even when the SDK saves one message containing both. Native tool results are retained and placed at the recorded boundaries. The projection is used only when its text still matches the provider transcript. Whitespace around a message's reasoning or answer does not count as a difference: a saved message can omit it, as Claude messages omit the blank lines that end their reasoning.

Recorded parts follow turn remapping and pruning. The earlier draft's aggregate `reasoning_timing` rows are not reinterpreted as per-run timings. Unknown history and unfinished runs remain untimed rather than counting time while the host is stopped. This does not add capture to other providers or estimate older history.

Conversation import stores the original reasoning projections against the synthesized assistant-message IDs before resuming the SDK session, so imported durations also survive restart. The workbench marks every AHP thinking part as provider-owned independently of whether it carries timing values; a live delta after reconnect must never turn a locally observed tail into a persisted total. Local, non-AHP providers retain their existing client-side timing.

Single-run thinking headers use labels such as "Thought for 5s". Labels round the recorded millisecond duration up to whole seconds, with a 1s minimum, so a short run never reads as "Thought for 0s"; the stored duration itself is unchanged. Conversation grouping remains available, but its expanded reasoning rows show their individual durations instead of a group-wide sum. `copilotReasoningTiming.test.ts` covers 5s/12s markdown/tool boundaries through a real database restart and a single run spanning SDK messages. The provider, model, database, and renderer tests cover live boundaries, identity, migration, serialization, grouped display, and accessible text.

Finalized sections refresh both visible and accessible timing when a duration arrives after answer text. Regression coverage includes string/array reasoning, an earlier run inside a completed conversation group, and an import/event-log/database reopen round trip.

## Mission Control session configuration

The Mission Control listener publishes Copilot Host's `approvalMode` vocabulary (`manual`, `assisted`, `allow-all`) in place of VS Code's native `autoApprove` vocabulary (`default`, `assisted`, `autoApprove`). The independent `mode` property advertises `interactive`, `plan`, and `autopilot`. Local clients and persisted configuration keep the native representation; Mission Control requests, snapshots, action echoes, and reconnect replay use the wire representation.

Workspace configuration uses `target` (`workspace`, `worktree`) and `baseBranch` on Mission Control, mapped to native `isolation` (`folder`, `worktree`) and `branch`. Schema enums, defaults, labels, required keys, and branch completion requests use the corresponding vocabulary. Schema projection translates only recognized axes and preserves generic or mixed-vocabulary properties and their values. Native input names remain accepted for older clients; conflicting native and wire values are rejected.

`MissionControlHost` injects the configuration adapter separately from the Copilot extension contribution. The generic protocol handler delegates configuration conversion, including rejected-action projection, without interpreting Copilot property names. The extension contribution registers project and session methods and supplies the public root catalogue; authentication, passive restrictions, channel visibility, and replay remain handler-owned.

`missionControlSessionConfig.test.ts` covers the mapping and schema, and the `Mission Control session configuration` suite in `protocolServerHandler.test.ts` covers both sides of the protocol boundary. Run them with:

```bash
./scripts/test.sh --run src/vs/platform/agentHost/test/node/missionControlSessionConfig.test.ts --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --grep "Mission Control session config"
```

The `listener extensions` suite checks arbitrary contribution methods, authentication, passive access (including collisions with built-in methods), and listener-owned live/replay projections. Built-in handlers take precedence, and extension metadata cannot grant passive access to a mutating built-in. `missionControlHost.test.ts` checks the injected Copilot implementation and host wiring:

```bash
./scripts/test.sh --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --run src/vs/platform/agentHost/test/node/missionControlHost.test.ts --grep "listener extensions|MC Copilot extensions|Mission Control host integration"
```

## MCP routing rollout telemetry

`agentHost.mcpUsageStarted` and `agentHost.mcpUsageCompleted` observe live Copilot root turns in both routing arms, including turns with no tool use. The session's immutable `routingEnabled` value describes effective behavior; `toolSearchActive` and `configuredServerCount` are snapshots at turn start. The configured inventory is computed identically in both arms from user, workspace and plugin configuration and already-discovered Connectors, excluding launch-disabled servers. It is not a measure of user intent, successful connections, or all servers that may arrive later. Restored history does not generate usage. Child tool activity observed during the root turn is included, not reported again as independent root turns. A mapped subagent error does not finalize the root usage tracker. SDK tool outcomes are counted when observed, before asynchronous resource persistence or UI publication; client-side authentication cancellation is also counted before retiring its tool call.

The primary rollout outcome is an observed successful **real MCP tool call**, not a routing proxy connection or an OAuth token. `mcpToolCalls`, `mcpToolSuccesses`, `mcpToolErrors`, `mcpToolCancellations` and `serversUsed` exclude proxies. The parallel `routingTool*` counters describe proxy selection and completion separately. `searches` and `searchesReturningRoutingTools` count successful host-overridden tool searches, including empty results, and how many returned at least one registered proxy. They do not measure searches performed outside that override or whether the model actually consumed a result. Tool starts without observed completion remain in starts but not outcome counters; duplicate starts/completions are deduplicated within the turn. Server names and tool-call IDs stay in memory and are discarded when the turn ends.

Join starts to completions by `sdkSessionId`, `chatSessionId` and `turnId`. Keep zero-use turns in the denominator, and report missing completions separately: a crash can leave a start without a completion, while disposal without a terminal outcome reports `interrupted`. Do not filter the population on proxy selection, sign-in, connected servers, or tool success, since routing changes those outcomes. Compare the share of started turns and initiating devices with at least one successful real MCP call, alongside calls, errors, cancellations and unresolved starts. Treat `configuredServerCount > 0` and `toolSearchActive` as descriptive start-time strata rather than proof of MCP intent or a complete experiment-exposure trigger.

For randomized A/B analysis, use the existing experiment assignment context and treatment `config.chat.agentHost.experimental.mcpToolRouting` (the setting remains off by default). Effective routing state alone is not random assignment: user overrides and older live sessions can differ from the current assignment. Restrict to a build shipping these events, separate assignment from effective state, exclude missing assignments from randomized comparisons, and account for devices appearing in both effective cohorts. No approximate experiment trigger is added because proactive-hint suppression and tool registration can affect a session before any routing tool is selected.

`agentHost.mcpAuthentication` reports settled SDK authentication callbacks in both arms, including background requests. It captures the initiating turn (if any), whether a related tool call was active, effective routing state, an opaque request ID, duration, and `tokenProvided`, `runtimeRefresh`, `cancelled`, `unhandled` or `failed`. SDK callback outcomes and duration are recorded outside the cancellation guard, so callbacks interrupted or received during abort report the result returned to the SDK, even if an underlying token lookup later succeeds. Providing a token or requesting refresh is **not server acceptance**. Callback cancellation can be caused by turn/session teardown; it is not necessarily a user cancelling OAuth. Reuse of an existing token counts as token provision. These events do not measure sign-in prompt impressions or clicks, and are not an authentication conversion rate. Use successful real tool use as the rollout guardrail; renderer-visible impressions, explicit UI actions and server-verified authentication would need separate instrumentation for a UI conversion study.

All events use existing telemetry consent and assignment plumbing. No names, URLs, scopes, tool arguments, content, tokens or configuration values other than the routing boolean are added. Numbers and booleans are measurements. Focused coverage exercises both arms, zero-use turns, proxy-only success, real MCP outcomes, deduplication, interrupted/late completion, authentication cancellation and turn attribution, and credential exclusion:

```bash
pnpm run build-fast --client-only
./scripts/test.sh --run src/vs/platform/agentHost/test/node/copilotMcpUsageTelemetry.test.ts --run src/vs/platform/agentHost/test/node/copilotAgentSession.test.ts --grep "Copilot MCP usage telemetry|MCP usage telemetry|MCP authentication telemetry|MCP routing|cached MCP tools|configured MCP server adds|tool-search"
```
