# Agent Harness Patterns

**Analysis Date:** 2026-05-27
**Focus:** Reference model for building a new agent harness (`codex-app-server`), with the Claude harness as the primary template and the Copilot harness as a structural contrast.

---

## 1. The `IAgent` contract

Every harness implements the `IAgent` interface declared in [src/vs/platform/agentHost/common/agentService.ts](src/vs/platform/agentHost/common/agentService.ts#L545). The `IAgentService` (same file, [L530](src/vs/platform/agentHost/common/agentService.ts#L530)) dispatches to the matching provider by id.

Required surface (every harness MUST implement):

| Member | Kind | Purpose |
|--------|------|---------|
| `id: AgentProvider` | property | Provider key (`'copilotcli'`, `'claude'`, …); appears as the URI scheme via [`AgentSession.uri`](src/vs/platform/agentHost/common/agentService.ts#L516). |
| `onDidSessionProgress: Event<AgentSignal>` | event | Single fan-out of per-session signals (actions, pending-confirmation, steering-consumed). See [agentService.ts:550](src/vs/platform/agentHost/common/agentService.ts#L550). |
| `models: IObservable<readonly IAgentModelInfo[]>` | observable | Live model list, observed by root state. |
| `createSession(config)` | method | Create new (or fork) session; may return a `provisional` result. |
| `resolveSessionConfig(params)` | method | Dynamic schema for the session-creation form. |
| `sessionConfigCompletions(params)` | method | Dynamic completions for schema properties (branches, etc.). |
| `sendMessage(session, prompt, attachments?, turnId?)` | method | Inject one user turn. |
| `getSessionMessages(session)` | method | Replay transcript as `Turn[]` — used on restore. |
| `disposeSession(session)` | method | Free per-session resources. |
| `abortSession(session)` | method | Cancel in-flight turn. |
| `changeModel(session, model)` | method | Mid-session model swap. |
| `respondToPermissionRequest(requestId, approved)` | method | Resolve a `pending_confirmation` signal. |
| `respondToUserInputRequest(requestId, response, answers?)` | method | Resolve a `SessionInputRequested` action. |
| `getDescriptor()` | method | Display name / description. |
| `getProtectedResources()` | method | RFC 9728 auth descriptors. |
| `listSessions()` | method | Enumerate persisted sessions. |
| `authenticate(resource, token)` | method | RFC 6750-style bearer token. |
| `setClientTools(session, clientId, tools)` | method | Register workbench-provided MCP-style tools for this session. |
| `onClientToolCallComplete(session, toolCallId, result)` | method | Workbench reports a client tool result. |
| `setClientCustomizations(session, clientId, refs)` | method | Sync client-provided plugins/instructions/agents. |
| `setCustomizationEnabled(uri, enabled)` | method | Toggle a customization. |
| `shutdown()` | method | Graceful drain. |
| `dispose()` | method | Hard teardown. |

Optional members (declared `?` — a harness may omit):

| Member | Purpose |
|--------|---------|
| `onDidMaterializeSession?` | Fires when a provisional session has been materialized. See [agentService.ts:560](src/vs/platform/agentHost/common/agentService.ts#L560). |
| `setPendingMessages?` | Steering / queued message hook (queue is always empty at the boundary). |
| `changeAgent?` | Custom-agent selection (Copilot only). |
| `getSessionMetadata?` | Single-session lookup (skip catalog enumeration). |
| `onDidCustomizationsChange?` | Republish customization metadata. |
| `getCustomizations?` / `getSessionCustomizations?` | Host-owned customization surface. |
| `truncateSession?` | History truncation. |
| `onArchivedChanged?` | Archive lifecycle hook (e.g. worktree cleanup). |

The Claude implementation lives at [claudeAgent.ts:138](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L138); the Copilot implementation at [copilotAgent.ts:233](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L233).

---

## 2. Anatomy of the Claude harness

Folder: `src/vs/platform/agentHost/node/claude/`. The directory is split across small modules, each owning a single concern. New harnesses should follow this shape.

### Core lifecycle

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeAgent.ts](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L138) | `ClaudeAgent` | The `IAgent` implementation. Owns the `_sessions: DisposableMap<string, ClaudeSessionEntry>`, two `SequencerByKey<string>` (one for dispose, one for sendMessage), models observable, and the proxy handle. All `IAgent` methods route here. |
| [claudeAgentSession.ts](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L68) | `ClaudeAgentSession` | Per-session coordinator. Holds the pipeline, the `SubagentRegistry`, two `PendingRequestRegistry` (permissions, user input), and the `SessionClientToolsDiff`. Built provisional via `createProvisional` ([L88](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L88)) and promoted via `materialize(ctx)` ([L172](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L172)). |
| [claudeSdkPipeline.ts](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L63) | `ClaudeSdkPipeline` | Long-lived event loop. Owns the `WarmQuery` + `AbortController`, drives a `ClaudePromptQueue`, dispatches each SDK message through `ClaudeSdkMessageRouter`, fires `SessionTurnComplete` when the queue fully drains. |
| [claudePromptQueue.ts](src/vs/platform/agentHost/node/claude/claudePromptQueue.ts#L46) | `ClaudePromptQueue` | Async-iterable steering queue handed to `WarmQuery.query(...)`. Pushes user messages and `priority: 'now'` steering messages into the SDK. |
| [claudeSdkMessageRouter.ts](src/vs/platform/agentHost/node/claude/claudeSdkMessageRouter.ts#L31) | `ClaudeSdkMessageRouter` | Per-session reduce of `SDKMessage → AgentSignal[]`. Wraps `mapSDKMessageToAgentSignals` with the file-edit observer side effect and the session's `clientId` stamping. |

### SDK abstraction

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeAgentSdkService.ts](src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L15) | `IClaudeAgentSdkService`, `ClaudeAgentSdkService`, `IClaudeSdkBindings` | Per-method passthrough shim over `@anthropic-ai/claude-agent-sdk`. Lazy `import()` of the user-supplied SDK path; **compile-time drift detection** at the bottom of the file ([L194](src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L194)) makes the build fail if the SDK rename/changes a signature. Tests subclass and override `_loadSdk`. |
| [claudeSdkOptions.ts](src/vs/platform/agentHost/node/claude/claudeSdkOptions.ts) | `buildOptions`, `buildClientMcpServers` | Build the `Options` blob handed to `sdk.startup({ options })`. |
| [claudeModelId.ts](src/vs/platform/agentHost/node/claude/claudeModelId.ts) | `tryParseClaudeModelId` | Narrow a CAPI model id to the real Claude family (excludes synthetic ids like `auto`). |
| [anthropicBetas.ts](src/vs/platform/agentHost/node/claude/anthropicBetas.ts) | beta feature flags | Anthropic beta header values. |
| [anthropicErrors.ts](src/vs/platform/agentHost/node/claude/anthropicErrors.ts) | error helpers | Friendly mapping of SDK errors. |

### Auth & proxy

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeProxyService.ts](src/vs/platform/agentHost/node/claude/claudeProxyService.ts#L134) | `IClaudeProxyService`, `ClaudeProxyService`, `IClaudeProxyHandle` | Refcounted local proxy server that bridges the SDK's `/v1/messages` calls onto the Copilot CAPI. Most-recent-token-wins; the agent acquires the new handle BEFORE disposing the old one (atomic swap at [claudeAgent.ts:259](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L259)). |
| [claudeProxyAuth.ts](src/vs/platform/agentHost/node/claude/claudeProxyAuth.ts) | auth helpers | Token validation, header construction. |

### Stream mapping (live + replay)

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeMapSessionEvents.ts](src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L214) | `mapSDKMessageToAgentSignals`, `ClaudeMapperState` ([L47](src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L47)) | **Live mapper.** Pure reduction of one `SDKMessage` to `AgentSignal[]`. State object carries the `Map<tool_use_id, turnId>` attribution table (CONTEXT.md M7). |
| [claudeReplayMapper.ts](src/vs/platform/agentHost/node/claude/claudeReplayMapper.ts#L43) | `mapSessionMessagesToTurns` | **Replay mapper.** Reduces the SDK's on-disk `SessionMessage[]` transcript into `Turn[]`. Pure function; no I/O. Distinct from the live mapper because envelope shape and terminal-state-only output differ (see file header). |
| [claudeFileEditObserver.ts](src/vs/platform/agentHost/node/claude/claudeFileEditObserver.ts#L41) | `ClaudeFileEditObserver` | Watches the SDK's file edit tool calls and emits `FileEdit` payloads for the changeset channel. |

### Permissions, interactive tools, subagents

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeCanUseTool.ts](src/vs/platform/agentHost/node/claude/claudeCanUseTool.ts#L69) | `handleCanUseTool` | The SDK `Options.canUseTool` callback. Pure UI bridge: fires `pending_confirmation` and parks on `ClaudeAgentSession.requestPermission` (or `requestUserInput` for `AskUserQuestion` / `ExitPlanMode`). |
| [claudeInteractiveTools.ts](src/vs/platform/agentHost/node/claude/claudeInteractiveTools.ts#L32) | `buildExitPlanModeConfirmationState`, `parseAskUserQuestionInput`, `buildAskUserSessionInputQuestions`, `flattenAskUserAnswers` | Convert the SDK's interactive built-ins to/from `SessionInputRequest`. |
| [claudeToolCallRegistry.ts](src/vs/platform/agentHost/node/claude/claudeToolCallRegistry.ts#L63) | `ClaudeToolCallRegistry` | Per-session tracking of tool-call lifecycle (start → ready → complete) for attribution and display. |
| [claudeToolDisplay.ts](src/vs/platform/agentHost/node/claude/claudeToolDisplay.ts) | `getClaudeToolDisplayName`, `getClaudePermissionKind`, `getClaudeInvocationMessage`, `getClaudePastTenseMessage`, `getClaudeConfirmationTitle`, `getClaudeToolKind`, `buildClaudeToolMeta`, `INTERACTIVE_CLAUDE_TOOLS`, … | All UI strings and metadata derived from a tool name. Single source of truth for tool presentation. |
| [claudeSubagentRegistry.ts](src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L123) | `SubagentRegistry`, `SubagentSpawn` ([L53](src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L53)), `SUBAGENT_TOOL_NAMES`, `scanTranscriptForAgentIds` | Per-session record of `Task`/`Agent` tool calls that spawn subagents, plus reverse index from inner `tool_use_id` to parent Task. |
| [claudeSubagentResolver.ts](src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts#L249) | `NativeStrategy`, `PromptMatchStrategy` ([L120](src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts#L120)), `TextSuffixStrategy` ([L48](src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts#L48)), `getSubagentTranscript` | Strategy chain for resolving a subagent URI → SDK `agentId` → transcript. |
| [claudeSubagentSignals.ts](src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts#L138) | `tagWithParent` ([L38](src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts#L38)), `mapSubagentSystemMessage` ([L83](src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts#L83)), `buildTopLevelSubagentReadyAction`, `emitInnerAssistantSignals` ([L191](src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts#L191)) | Helpers for stamping subagent-scoped signals with `parentToolCallId`. |

### Persistence & per-session state

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeSessionMetadataStore.ts](src/vs/platform/agentHost/node/claude/claudeSessionMetadataStore.ts#L52) | `ClaudeSessionMetadataStore`, `IClaudeSessionOverlay` | Per-session DB overlay (`customizationDirectory`, `model`, `permissionMode`). Projects SDK info + overlay into `IAgentSessionMetadata` via `project()`. |
| [claudeSessionPermissionMode.ts](src/vs/platform/agentHost/node/claude/claudeSessionPermissionMode.ts) | `readClaudePermissionMode` | Read the live per-session permission mode override from the config service. |
| [claudePromptResolver.ts](src/vs/platform/agentHost/node/claude/claudePromptResolver.ts) | `resolvePromptToContentBlocks` | Convert prompt + attachments → SDK content blocks. |

### Client tools (in-process MCP — Phase 10)

Folder: [src/vs/platform/agentHost/node/claude/clientTools/](src/vs/platform/agentHost/node/claude/clientTools/).

| File | Export(s) | Responsibility |
|------|-----------|----------------|
| [claudeClientToolMcpServer.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts) | `buildClientToolMcpServer`, `extractToolUseId` ([L68](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts#L68)), `CLAUDE_CLIENT_MCP_SERVER_NAME` ([L85](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts#L85)), `stripClientToolNamePrefix`, `hasClientToolNamePrefix` | Build the per-session in-process MCP server exposed via `Options.mcpServers['client']`. Each tool handler reads `tool_use_id` from `extra._meta["claudecode/toolUseId"]` and parks on a `PendingRequestRegistry<CallToolResult>` deferred. |
| [claudeSessionClientToolsModel.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeSessionClientToolsModel.ts#L40) | `SessionClientToolsModel`, `SessionClientToolsDiff` ([L70](src/vs/platform/agentHost/node/claude/clientTools/claudeSessionClientToolsModel.ts#L70)) | Tracks the workbench-published client-tool snapshot and a "changed since last build" dirty bit. Drives the `rebindForClientTools` yield-restart. |
| [claudeJsonSchemaToZod.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeJsonSchemaToZod.ts#L19) | `jsonSchemaToZodRawShape` | Convert a workbench `ToolDefinition.inputSchema` to a Zod raw shape for `sdk.tool()`. |
| [claudeClientToolResult.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolResult.ts#L35) | `convertToolCallResult` | Convert workbench `ToolCallResult` to MCP `CallToolResult`. |

---

## 3. The Claude streaming loop

The flow from `IAgent.sendMessage` to `SessionTurnComplete`:

1. **`ClaudeAgent.sendMessage`** ([claudeAgent.ts:766](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L766)) — wraps the body in `_sessionSequencer.queue(sessionId, …)` so concurrent first sends collapse into one materialize + ordered sends. Picks an effective `turnId` (caller-supplied or `generateUuid()`).
2. **Session lookup** — `_findAnySession(sessionId)`; if missing, falls back to `_resumeSession` ([L284](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L284)) which rebuilds provisional state from the SDK transcript store. If provisional, calls `_materializeProvisional` ([L218](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L218)) which calls `ClaudeAgentSession.materialize` ([claudeAgentSession.ts:172](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L172)) — `sdk.startup({ options })`, `_sessionDataService.openDatabase`, constructs `ClaudeSdkPipeline`, wires its `onDidProduceSignal` to the session's `_onDidSessionProgress` emitter, attaches the rematerializer closure.
3. **Build SDK content blocks** — `resolvePromptToContentBlocks(prompt, attachments)`; wrap in an `SDKUserMessage` whose `uuid` is the turnId (M1: `Turn.id ↔ SDKUserMessage.uuid`).
4. **`ClaudeAgentSession.send`** ([claudeAgentSession.ts:347](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L347)) — pre-flight: if `toolDiff.hasDifference`, call `rebindForClientTools` (yield-restart); else push live permission mode to the pipeline. Delegate to `ClaudeSdkPipeline.send`.
5. **`ClaudeSdkPipeline.send`** ([claudeSdkPipeline.ts:231](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L231)) — if `_needsRebind`, call `_rebindQuery('recover')` ([L370](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L370)); if no `Query` bound yet, call `_warm.query(this._queue.iterable)` and `_replayCurrentConfig`. Then `_ensureConsumerLoop()` and push an `IPendingSdkMessage` onto the queue. The returned promise is the entry's `DeferredPromise` — resolved when the matching `result` message is consumed.
6. **`_processMessages` consumer loop** ([claudeSdkPipeline.ts:436](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L436)) — `for await (const message of query)`. For each message:
   - Re-check `_abortController.signal.aborted` → throw `CancellationError`.
   - First `system:init` flips `_isResumed`.
   - `await this._router.handle(message, turnId)` — `ClaudeSdkMessageRouter` wraps `mapSDKMessageToAgentSignals` ([claudeMapSessionEvents.ts:214](src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L214)) and fires each emitted `AgentSignal` via `onDidProduceSignal`. The router awaits because the file-edit observer side effect is async.
   - On `message.type === 'result'`: `_queue.settleHead()` resolves the head entry's deferred. If `_queue.isEmpty`, fire `SessionTurnComplete` ([claudeSdkPipeline.ts:475](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L475)) — intermediate results during steering preempt do NOT fire turn-complete (CONTEXT.md M10).
7. **Cancellation** — `IAgent.abortSession` ([claudeAgent.ts:832](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L832)) bypasses the send sequencer (would deadlock) and calls `ClaudeAgentSession.abort` → `ClaudeSdkPipeline.abort` ([claudeSdkPipeline.ts:300](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L300)) which calls `_abortController.abort()`, `_queue.failAll(new CancellationError())`, and sets `_needsRebind = true`. The next `send` triggers `_rebindQuery('recover')`.
8. **Steering** — `IAgent.setPendingMessages` ([claudeAgent.ts:853](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L853)) calls `ClaudeAgentSession.injectSteering` which builds a `priority: 'now'` `SDKUserMessage` and pushes onto the queue via `ClaudeSdkPipeline.injectSteering` ([claudeSdkPipeline.ts:263](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L263)). When the queue yields the steering entry to the SDK, `ClaudePromptQueue` fires the `steering_consumed` signal.

---

## 4. The Copilot harness for contrast

Folder: `src/vs/platform/agentHost/node/copilot/`. Same `IAgent` contract, very different shape — Copilot is the older harness and predates the per-module split Claude adopted.

| File | Lines | Notable difference |
|------|-------|--------------------|
| [copilotAgent.ts](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L233) | 2286 | Monolithic. `CopilotAgent` ([L233](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L233)) owns the single shared `_client: CopilotClient` from `@github/copilot-sdk` ([L6](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L6)) — one SDK instance for the whole provider, not per-session subprocesses. Also defines worktree helpers ([L149](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L149)–[L170](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L170)), plan-mode RPC params ([L125](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L125)), and a const system message ([L96](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L96)). |
| [copilotAgentSession.ts](src/vs/platform/agentHost/node/copilot/copilotAgentSession.ts#L304) | 2356 | Per-session coordinator that includes worktree creation, plugin sync, plan mode, and skill streaming — Claude split these into separate files. |
| [copilotSessionWrapper.ts](src/vs/platform/agentHost/node/copilot/copilotSessionWrapper.ts#L15) | 222 | Thin adapter over `CopilotClient.session(...)`. |
| [mapSessionEvents.ts](src/vs/platform/agentHost/node/copilot/mapSessionEvents.ts) | 643 | Equivalent to `claudeMapSessionEvents.ts` — note the file is **not** prefixed `copilot…` (older naming). Exports `ISessionEventToolStart`, `ISessionEventToolComplete`, `ISessionEventMessage`, `ISessionEventSkillInvoked`, `ISessionEventSubagentStarted`. |
| [copilotToolDisplay.ts](src/vs/platform/agentHost/node/copilot/copilotToolDisplay.ts) | 1036 | Tool name → display string, permission display ([L934](src/vs/platform/agentHost/node/copilot/copilotToolDisplay.ts#L934)), skill synthesis ([L752](src/vs/platform/agentHost/node/copilot/copilotToolDisplay.ts#L752)). |
| [copilotShellTools.ts](src/vs/platform/agentHost/node/copilot/copilotShellTools.ts) | 1093 | Owns a `ShellManager` ([L107](src/vs/platform/agentHost/node/copilot/copilotShellTools.ts#L107)) that spawns and manages persistent shell PTYs — Claude has no equivalent because shell tools route through MCP. |
| [copilotPluginConverters.ts](src/vs/platform/agentHost/node/copilot/copilotPluginConverters.ts) | 391 | Convert workbench plugin defs → SDK config (`toSdkMcpServers` [L31](src/vs/platform/agentHost/node/copilot/copilotPluginConverters.ts#L31), `toSdkHooks` [L272](src/vs/platform/agentHost/node/copilot/copilotPluginConverters.ts#L272), `toSdkSkillDirectories`, `toSdkInstructionDirectories`). |
| [copilotSlashCommandCompletionProvider.ts](src/vs/platform/agentHost/node/copilot/copilotSlashCommandCompletionProvider.ts#L76) | 119 | Registers an `IAgentHostCompletionItemProvider` for `/`-commands. Claude has none. |
| [sessionCustomizationDiscovery.ts](src/vs/platform/agentHost/node/copilot/sessionCustomizationDiscovery.ts#L85) | 235 | Filesystem-walking discovery of in-repo `.copilot/` customizations. |
| [agentHostSandboxEngine.ts](src/vs/platform/agentHost/node/copilot/agentHostSandboxEngine.ts#L110) | 122 | `createAgentHostSandboxEngine` — sandbox abstraction for shell tools. |
| [copilotGitProject.ts](src/vs/platform/agentHost/node/copilot/copilotGitProject.ts) | 58 | `projectFromCopilotContext` / `projectFromRepository` — shared with Claude (Claude imports it via [claudeAgent.ts:31](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L31)). |
| [pendingEditContentStore.ts](src/vs/platform/agentHost/node/copilot/pendingEditContentStore.ts) | 48 | Custom file-system scheme for in-flight edit previews. |

**Key structural differences** versus Claude: Copilot uses one shared SDK client process (Claude spawns a `WarmQuery` per session), it manages git worktrees and PTY shells in-process, and it discovers plugins by walking the filesystem. Both harnesses, however, hit the same `IAgent` surface and fire the same `SessionAction` vocabulary.

> ⚠ The user prompt described Copilot as "uses vscode-jsonrpc directly, manages its own daemon" — that does not match what is in this branch. Copilot here imports `CopilotClient` from `@github/copilot-sdk` ([copilotAgent.ts:6](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L6)); jsonrpc is encapsulated inside the SDK package, not used directly in `src/vs/platform/agentHost/node/copilot/`.

---

## 5. The `SessionAction` vocabulary

Every signal a harness sends to clients eventually lands as one of these reducer-handled actions in [src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts). The file is **auto-generated** by `scripts/sync-agent-host-protocol.ts` — don't edit by hand. Reducer cases for each live in the same folder's `reducer.ts`.

### Session lifecycle

| Action | Line | Effect on `SessionState` |
|--------|------|--------------------------|
| `SessionReadyAction` | [L48](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L48) | Marks `lifecycle = Ready`. |
| `SessionCreationFailedAction` | [L58](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L58) | Marks `lifecycle = Failed`, records `error`. |
| `SessionTurnStartedAction` | [L71](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L71) | Opens an `activeTurn` with `userMessage`, transitions `summary.status` to `InProgress`. |
| `SessionTurnCompleteAction` | [L313](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L313) | Moves `activeTurn` into `turns`, clears active, returns to `Idle`. |
| `SessionTurnCancelledAction` | [L326](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L326) | Same as complete but marks the turn cancelled. |
| `SessionErrorAction` | [L338](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L338) | Terminal-status switch to `Error`. |

### Streaming content

| Action | Line | Effect |
|--------|------|--------|
| `SessionResponsePartAction` | [L106](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L106) | Creates a markdown / reasoning / tool-call response part on the active turn. MUST precede `SessionDelta` for that part. |
| `SessionDeltaAction` | [L90](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L90) | Appends text to a specific `partId`. |
| `SessionReasoningAction` | [L383](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L383) | Reasoning trace delta. |

### Tool call lifecycle

| Action | Line | Effect |
|--------|------|--------|
| `SessionToolCallStartAction` | [L124](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L124) | Creates a tool call in `Running` state. |
| `SessionToolCallDeltaAction` | [L143](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L143) | Streaming input arguments delta. |
| `SessionToolCallReadyAction` | [L169](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L169) | Transitions to `PendingConfirmation` (host or user must approve). |
| `SessionToolCallApprovedAction` | [L199](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L199) | Approves a pending tool call. |
| `SessionToolCallDeniedAction` | [L221](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L221) | Denies a pending tool call. |
| `SessionToolCallCompleteAction` | [L262](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L262) | Terminal `Completed`/`Failed` with result. |
| `SessionToolCallResultConfirmedAction` | [L279](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L279) | User confirmed a result that was held for review. |
| `SessionToolCallContentChangedAction` | [L301](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L301) | Updates tool-call content blob (e.g. file edit re-render). |

### Session-level metadata

| Action | Line |
|--------|------|
| `SessionTitleChangedAction` | [L354](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L354) |
| `SessionUsageAction` | [L366](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L366) |
| `SessionModelChangedAction` | [L400](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L400) |
| `SessionAgentChangedAction` | [L420](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L420) |
| `SessionIsReadChangedAction` | [L439](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L439) |
| `SessionIsArchivedChangedAction` | [L455](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L455) |
| `SessionActivityChangedAction` | [L470](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L470) |
| `SessionChangesetsChangedAction` | [L491](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L491) |
| `SessionServerToolsChangedAction` | [L505](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L505) |
| `SessionActiveClientChangedAction` | [L523](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L523) |
| `SessionActiveClientToolsChangedAction` | [L540](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L540) |
| `SessionCustomizationsChangedAction` | [L557](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L557) |
| `SessionCustomizationToggledAction` | [L573](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L573) |
| `SessionCustomizationUpdatedAction` | [L598](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L598) |
| `SessionConfigChangedAction` | [L629](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L629) |
| `SessionMetaChangedAction` | [L645](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L645) |
| `SessionTruncatedAction` | [L668](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L668) |

### Pending / queued messages

| Action | Line |
|--------|------|
| `SessionPendingMessageSetAction` | [L689](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L689) |
| `SessionPendingMessageRemovedAction` | [L710](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L710) |
| `SessionQueuedMessagesReorderedAction` | [L731](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L731) |

### User input requests

| Action | Line | Effect |
|--------|------|--------|
| `SessionInputRequestedAction` | [L749](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L749) | Adds to `inputRequests`, transitions status to `InputNeeded`. |
| `SessionInputAnswerChangedAction` | [L764](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L764) | Records partial user input. |
| `SessionInputCompletedAction` | [L784](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts#L784) | Removes the request; status returns to `InProgress`/`Idle`. |

The reducer ([reducer.ts](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts)) is also auto-generated; it dispatches on `ActionType` and recomputes `summary.status` via `summaryStatus` ([L60](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts#L60)) so the orthogonal `InputNeeded`/`InProgress`/`Idle` bits stay correct.

---

## 6. Restore / replay pattern

Restored sessions render identically to live ones because both produce the same `Turn[]` shape — the live mapper assembles them incrementally via reducer dispatches, the replay mapper assembles them from the SDK's on-disk JSONL transcript.

`ClaudeAgent.getSessionMessages` ([claudeAgent.ts:553](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L553)) is the entry point:

1. Reject provisional sessions (return `[]`).
2. If the URI is a subagent URI (`isSubagentSession`), delegate to `getSubagentTranscript` ([claudeSubagentResolver.ts](src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts)).
3. Otherwise call `this._sdkService.getSessionMessages(sessionId, { includeSystemMessages: true })` to fetch the flat `SessionMessage[]` transcript.
4. Call `mapSessionMessagesToTurns(messages, session, logService)` ([claudeReplayMapper.ts:43](src/vs/platform/agentHost/node/claude/claudeReplayMapper.ts#L43)) — pure function that reduces to `readonly Turn[]`.
5. If the parent session is materialized, call `parentSession.subagents.primeFromTranscript(turns)` to seed the subagent registry's agentId index so later subagent reads short-circuit the strategy chain.
6. Every failure path warn-logs and returns `[]` rather than propagating — `agentService.ts:188-204` (the resilient pattern) fans out across all providers and one harness's transcript failure must not nuke the others.

The shared invariant between live and replay mappers is the `Map<tool_use_id, turnId>` attribution table (CONTEXT M7): a `tool_result` legitimately lands in a later user message and must resolve back to the announcing `tool_use`'s turn.

---

## 7. Permission & user-input flow

The Anthropic SDK invokes `Options.canUseTool` whenever a tool call needs host approval (the SDK's own `permissionMode` already filters auto-approvals). The flow:

1. SDK calls `canUseTool(toolName, input, options)` — bridged by `handleCanUseTool` ([claudeCanUseTool.ts:69](src/vs/platform/agentHost/node/claude/claudeCanUseTool.ts#L69)).
2. For the `AskUserQuestion` and `ExitPlanMode` built-ins, the bridge constructs a `SessionInputRequest` and parks on `ClaudeAgentSession.requestUserInput` ([claudeAgentSession.ts:438](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L438)), which fires `SessionInputRequestedAction` and returns a deferred.
3. For any other tool, the bridge builds a `ToolCallPendingConfirmationState`, calls `ClaudeAgentSession.requestPermission` ([claudeAgentSession.ts:413](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L413)) which atomically registers a `PendingRequestRegistry<boolean>` deferred and fires `pending_confirmation`.
4. Workbench calls `IAgent.respondToPermissionRequest(requestId, approved)` ([claudeAgent.ts:809](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L809)) or `respondToUserInputRequest(requestId, response, answers?)` ([L820](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L820)). Both iterate `_sessions` and let the matching session resolve the deferred — `requestId` is the SDK's `tool_use_id`, globally unique so a single match is sufficient.
5. On `abort` / `dispose`, parked deferreds are settled with `false` / `Cancel` so the SDK's `canUseTool` callback unwinds cleanly.

Note: the protocol-level auto-approve (for write tools) lives in `agentSideEffects.ts:_handleToolReady` and synchronously calls `respondToPermissionRequest` after observing `pending_confirmation` — see the JSDoc on `handleCanUseTool` for the contract.

---

## 8. Subagent support

Trio of files:

- [claudeSubagentRegistry.ts](src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L123) — per-session `SubagentRegistry` keyed by Task `tool_use_id`. Built into `ClaudeAgentSession` ([claudeAgentSession.ts:113](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L113)). `SUBAGENT_TOOL_NAMES = {'Task', 'Agent'}` ([L21](src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L21)) controls which tools spawn subagents.
- [claudeSubagentResolver.ts](src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts) — strategy chain (`NativeStrategy`, `PromptMatchStrategy`, `TextSuffixStrategy`) that resolves a subagent URI to an SDK `agentId` for transcript replay. `getSubagentTranscript` is the public entry.
- [claudeSubagentSignals.ts](src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts) — helpers that tag emitted `AgentSignal`s with `parentToolCallId` so the workbench routes them to the subagent sub-session.

> **For codex-app-server:** unless the new SDK has a subagent concept (parallel agent invocation that produces its own transcript), do NOT port this. The whole trio can be omitted from a v1 harness.

---

## 9. Tool integration via in-process MCP

Phase 10 exposes workbench-provided client tools to the SDK via an **in-process MCP server** mounted on `Options.mcpServers['client']`. The entry point is `buildClientToolMcpServer` in [claudeClientToolMcpServer.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts) — for each `ToolDefinition`, it calls `sdk.tool(name, description, zodShape, handler)` where the handler:

1. Extracts `tool_use_id` from `extra._meta["claudecode/toolUseId"]` (verified empirically against `@anthropic-ai/claude-agent-sdk@0.2.128` — falls back to an error result if the SDK ever drops the meta field).
2. Returns `awaitResult(toolUseId)` — a promise parked on a `PendingRequestRegistry<CallToolResult>` deferred owned by the session ([claudeAgentSession.ts:118](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L118)).
3. When the workbench calls `IAgent.onClientToolCallComplete`, `ClaudeAgentSession.completeClientToolCall` ([claudeAgentSession.ts:498](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L498)) converts the result via `convertToolCallResult` and resolves the deferred.

Snapshot changes trigger a yield-restart: `SessionClientToolsDiff` ([claudeSessionClientToolsModel.ts:70](src/vs/platform/agentHost/node/claude/clientTools/claudeSessionClientToolsModel.ts#L70)) tracks a dirty bit; on the next `send`, `ClaudeAgentSession.send` ([L349](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L349)) calls `rebindForClientTools` which rebuilds `Options.mcpServers` and rebinds the `Query`.

> **Decision point for codex-app-server:** if the codex SDK accepts native tool definitions directly (no MCP indirection), skip this folder entirely and pass tools straight through `Options`. Adopt this pattern only if the SDK requires an MCP server endpoint.

---

## 10. Anti-patterns / pitfalls

From [.github/copilot-instructions.md](.github/copilot-instructions.md) and patterns observed in the harness:

- **No `any` / `unknown`** as variable, parameter, or return types unless absolutely necessary. The Claude shim explicitly disables the lint only where the SDK forces it (`SdkMcpToolDefinition<any>` at [claudeAgentSdkService.ts:43](src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L43)).
- **Register disposables on construction, not on every call.** If a method runs repeatedly, returning an `IDisposable` is preferred over `_register(...)` inside the method. The `ClaudeSessionEntry` class ([claudeAgent.ts:967](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L967)) exists specifically to bundle per-session disposables without growing parallel `DisposableMap`s on the agent.
- **Do not stub globals or use `any` casts in tests.** Inject the dependency via a constructor parameter and pass a fake that implements the real interface — that pattern is how `ClaudeAgentSdkService._loadSdk` is overridden in tests.
- **Use `IEditorService` to open editors**, never `IEditorGroupsService.activeGroup.openEditor` directly.
- **Service deps must be declared in constructors**, never resolved via `IInstantiationService` at call time.
- **No `bind()` / `call()` / `apply()`** for `this`-binding — use arrow functions.
- **Do not drive control flow via events.** Events broadcast state; orchestration uses direct method calls. The Claude pipeline calls `_router.handle` directly inside its consumer loop rather than wiring it via an event.
- **Async `dispose()` is wrong.** `Disposable.dispose` is sync; use `Symbol.asyncDispose` (e.g. `WarmQuery`) for resources that need async teardown, and chain them via `toDisposable(() => { void Promise.resolve(...).catch(...) })` (see [claudeSdkPipeline.ts:139](src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L139)).
- **Per-session sequencer keyspace separation.** Claude uses `_disposeSequencer` and `_sessionSequencer` as separate `SequencerByKey<string>` instances ([claudeAgent.ts:206](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L206), [L207](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L207)) — abort must NOT route through the send sequencer or it deadlocks behind the very turn it's cancelling (see comment at [claudeAgent.ts:832](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L832)).
- **Lifecycle ordering on dispose.** SDK subprocesses must die BEFORE the proxy handle is released — see the dispose comment block at [claudeAgent.ts:914](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L914).
- **Resilient transcript reads.** Every replay path warn-logs and returns `[]` on failure; one corrupt session must not nuke the catalog. See `listSessions` at [claudeAgent.ts:597](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L597).
- **Stale-write guards on async data fetches.** `_refreshModels` captures `_githubToken` at entry and rechecks identity after each `await` ([claudeAgent.ts:299](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L299)).
- **Two-axis vs one-axis approval surfaces.** Decide upfront whether your harness inherits the platform's `autoApprove`/`mode` two-axis schema or collapses onto a single SDK-native enum like Claude's `permissionMode`. See [claudeAgent.ts:709](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L709) for how Claude does it.

---

## 11. Template — adding a new harness

Steps for a developer building `codex-app-server` (or any new provider). Treat as a checklist, not a script — each step has its own complexity.

1. **Create the folder.** `src/vs/platform/agentHost/node/codex/` (or whatever the provider id is). Mirror the Claude split: one module per concern.
2. **Pick a provider id and reserve it.** Add to the `AgentProvider` union if it's typed; the URI scheme will be this string (see [`AgentSession.uri`](src/vs/platform/agentHost/common/agentService.ts#L516)).
3. **Write the SDK shim.** `codexAgentSdkService.ts` — pure per-method passthrough over the SDK package, with a compile-time drift assertion at the bottom mirroring [claudeAgentSdkService.ts:194](src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L194). Register the service via DI and add a path env var (mirror `AgentHostClaudeSdkPathEnvVar` at [agentService.ts](src/vs/platform/agentHost/common/agentService.ts) — search for the constant) if the SDK is opt-in.
4. **Write `codexMapSessionEvents.ts`.** Pure function `mapSDKMessageToAgentSignals(message, state, sessionUri) → AgentSignal[]`. Keep a `MapperState` class to hold the `tool_use_id → turnId` attribution map. Model on [claudeMapSessionEvents.ts:47](src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L47) and [L214](src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L214).
5. **Write `codexReplayMapper.ts`.** Pure `mapSessionMessagesToTurns(messages, sessionUri, logService) → Turn[]`. Model on [claudeReplayMapper.ts:43](src/vs/platform/agentHost/node/claude/claudeReplayMapper.ts#L43). Share invariants with the live mapper.
6. **Write `codexSdkPipeline.ts`** (optional but recommended). Owns the SDK lifecycle: warm + abort controller + message router + prompt queue. Keep the per-session coordinator (next step) ignorant of SDK internals.
7. **Write `codexAgentSession.ts`.** Per-session coordinator. Owns `PendingRequestRegistry` for permissions and user inputs, plus the pipeline. Provides `materialize`, `send`, `abort`, `dispose`. Model on [claudeAgentSession.ts:68](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L68).
8. **Write `codexAgent.ts` — the `IAgent` implementation.** Use two `SequencerByKey<string>` (dispose vs send). Provisional → materialize → resume lifecycle. Forward `onDidSessionProgress` from each session. Wire `onDidMaterializeSession`. Model on [claudeAgent.ts:138](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L138).
9. **Write `codexCanUseTool.ts`** (only if the SDK has a `canUseTool` callback). Pure UI bridge: fire `pending_confirmation` and park on the session's pending registries. Model on [claudeCanUseTool.ts:69](src/vs/platform/agentHost/node/claude/claudeCanUseTool.ts#L69).
10. **Write `codexToolDisplay.ts`.** Display strings, permission kinds, icons, confirmation titles — one file, every tool. Model on [claudeToolDisplay.ts](src/vs/platform/agentHost/node/claude/claudeToolDisplay.ts).
11. **Decide on client tool integration.** If the SDK takes tools natively, skip MCP. Otherwise build a `clientTools/` folder mirroring [claudeClientToolMcpServer.ts](src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts).
12. **Skip subagents** unless the SDK has them. Add only when needed.
13. **Register the agent.** Add to [agentHostMain.ts:174](src/vs/platform/agentHost/node/agentHostMain.ts#L174) under a `process.env[…]` opt-in gate if the SDK is not bundled. Also add to [agentHostServerMain.ts:241](src/vs/platform/agentHost/node/agentHostServerMain.ts#L241) for the remote/server path.
14. **Add session config schema.** `resolveSessionConfig` returns a schema specific to your SDK. Reuse `platformSessionSchema.definition[SessionConfigKey.Permissions]` if possible — see [claudeAgent.ts:709](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L709).
15. **Add settings.** Workbench-side settings (path to SDK, default permission mode, etc.) — search for `chat.agentHost.claudeAgent.path` to see how Claude is wired.
16. **Add a session type to the picker (if desired).** The workbench session picker reads the registered providers from root state; usually no extra work is required as long as `getDescriptor` returns a sensible `displayName`.
17. **Add tests.** Mirror the structure at `src/vs/platform/agentHost/test/node/claudeAgent.test.ts` — use the SDK shim override pattern (subclass `ClaudeAgentSdkService` and override `_loadSdk`) to inject a fake SDK.
18. **Run hygiene + typecheck.** `npm run compile-check-ts-native` (or rely on the running `VS Code - Build` task) and the project's hygiene script before opening a PR.

---

*Harness pattern analysis: 2026-05-27*
