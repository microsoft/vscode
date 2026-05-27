<!-- refreshed: 2026-05-27 -->
# Agent Host Architecture

**Analysis Date:** 2026-05-27
**Scope:** Agent host subsystem only (`src/vs/platform/agentHost/**`, the
renderer-side handler under
`src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/**`, the
sessions-window provider under `src/vs/sessions/contrib/providers/agentHost/**`,
and the on-wire protocol under
`src/vs/platform/agentHost/common/state/protocol/**`).

This document covers what an agent-harness author needs to know to
implement a new `IAgent`. It deliberately does not map the rest of VS
Code.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Renderer (workbench)                                                     │
│                                                                          │
│  AgentHostSessionHandler  ──▶  IChatSessionContentProvider               │
│   `agentHostSessionHandler.ts:373`                                       │
│                                                                          │
│  AgentHostActiveClientService                                            │
│   `agentHostActiveClientService.ts:27` — owns clientId / customizations  │
│                                                                          │
│  Sessions-window provider                                                │
│   `baseAgentHostSessionsProvider.ts` + `localAgentHostSessionsProvider`  │
│                                                                          │
│           ▲ subscribe / dispatchAction / onDidAction                     │
│           │ (IAgentConnection, agentService.ts:893)                      │
└───────────┼──────────────────────────────────────────────────────────────┘
            │
            │ Transport (one of):
            │   • MessagePort IPC channel  `AgentHostIpcChannels.AgentHost`
            │     (agentService.ts:33)
            │   • WebSocket / JSON-RPC      (webSocketTransport.ts)
            │   • SSH relay                 (sshRemoteAgentHostServiceImpl.ts)
            │   • Tunnel relay              (tunnelAgentHostService.ts)
            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Agent host utility process (Node)                                        │
│                                                                          │
│   ProtocolServerHandler  `protocolServerHandler.ts:197`                  │
│        │  JSON-RPC: initialize / subscribe / dispatchAction / commands   │
│        ▼                                                                 │
│   AgentService  `agentService.ts:65`  ──┐                                │
│        │                                ├─▶ IAgent providers            │
│        │                                │   • CopilotAgent              │
│        │                                │   • ClaudeAgent (opt-in)      │
│        ▼                                │                                │
│   AgentHostStateManager  `agentHostStateManager.ts:56`                  │
│     ├─ rootReducer / sessionReducer / changesetReducer                  │
│     ├─ ActionEnvelope emission with monotonic serverSeq                 │
│     └─ Session GC, subscriber refcount, summary notifications            │
│                                                                          │
│   AgentSideEffects, AgentHostChangesetService, AgentHostTerminalManager  │
│   AgentHostFileMonitorService, AgentHostCompletions, ...                │
└──────────────────────────────────────────────────────────────────────────┘
            │
            ▼
   Per-provider SDKs (Copilot CLI SDK, @anthropic-ai/claude-agent-sdk),
   on-disk SQLite session database, worktrees, shell PTYs.
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `ElectronAgentHostStarter` | Spawn agent host as Electron utility process; connect via `MessagePortClient` | [src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts](src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L28) |
| `NodeAgentHostStarter` | Spawn agent host as a plain Node child process (CLI/server/dev fallback); may also start a WebSocket listener | [src/vs/platform/agentHost/node/nodeAgentHostStarter.ts](src/vs/platform/agentHost/node/nodeAgentHostStarter.ts#L36) |
| `SshRemoteAgentHostService` (renderer-side `SSHRemoteAgentHostService`) + main-side impl | Connect to an agent host running on a remote machine over an SSH relay; transports JSON-RPC over the relay | [src/vs/platform/agentHost/electron-browser/sshRemoteAgentHostServiceImpl.ts](src/vs/platform/agentHost/electron-browser/sshRemoteAgentHostServiceImpl.ts#L41), [src/vs/platform/agentHost/node/sshRemoteAgentHostService.ts](src/vs/platform/agentHost/node/sshRemoteAgentHostService.ts) |
| `TunnelAgentHostMainService` | Connect to a remote agent host over a dev-tunnels WebSocket relay (port `TUNNEL_AGENT_HOST_PORT`) | [src/vs/platform/agentHost/node/tunnelAgentHostService.ts](src/vs/platform/agentHost/node/tunnelAgentHostService.ts#L105) |
| `AgentService` | DI singleton inside the utility process. Hosts registered `IAgent` providers, owns the state manager, exposes `IAgentService` over IPC (`AgentHostIpcChannels.AgentHost`) | [src/vs/platform/agentHost/node/agentService.ts](src/vs/platform/agentHost/node/agentService.ts#L65) |
| `AgentHostStateManager` | Authoritative reducer-driven state tree (root + per-session + per-changeset). Applies actions, assigns `serverSeq`, emits `ActionEnvelope`s | [src/vs/platform/agentHost/node/agentHostStateManager.ts](src/vs/platform/agentHost/node/agentHostStateManager.ts#L56) |
| `ProtocolServerHandler` | JSON-RPC server framing: `initialize`, `reconnect`, `subscribe`/`unsubscribe`, `dispatchAction`, file/resource commands. Used by the WebSocket transport | [src/vs/platform/agentHost/node/protocolServerHandler.ts](src/vs/platform/agentHost/node/protocolServerHandler.ts#L197) |
| `AgentSideEffects` | Cross-cuts agent registration / action dispatch — pushes `agentsChanged`, publishes `protectedResources`, routes signals into actions | [src/vs/platform/agentHost/node/agentSideEffects.ts](src/vs/platform/agentHost/node/agentSideEffects.ts#L103) |
| `AgentHostSessionHandler` | Renderer-side `IChatSessionContentProvider` for one session type. Observes session state and emits `IChatProgress[]` for the chat UI; dispatches client actions (`turnStarted`, `turnCancelled`, `toolCallConfirmed`) back to the server | [src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L373) |
| `AgentHostActiveClientService` | Per-`sessionType` client identity, customization sync, and the `clientTools` observable that feeds `setClientTools` | [src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts#L27) |
| `LocalAgentHostSessionsProvider` (+ `baseAgentHostSessionsProvider`) | Surfaces agent-host sessions in the Agents window — list, create, open, archive | [src/vs/sessions/contrib/providers/agentHost/browser/localAgentHostSessionsProvider.ts](src/vs/sessions/contrib/providers/agentHost/browser/localAgentHostSessionsProvider.ts), [src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts](src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts) |

## Process Topology and Transport

The agent host is its own process — **not** an extension host, **not** a
renderer. It runs the Copilot CLI SDK (and optionally
`@anthropic-ai/claude-agent-sdk`) on the user's machine (or on a
remote/tunneled host), so long-running model turns, tool calls, PTYs,
and git worktrees survive workbench reloads and don't share the
renderer's event loop.

How it gets started, by environment:

- **Desktop / Electron**: `ElectronAgentHostStarter` spawns it as a
  `UtilityProcess` with `entryPoint: 'vs/platform/agentHost/node/agentHostMain'`
  and connects via a `MessagePortClient` named
  `'agentHost'` ([electronAgentHostStarter.ts:58](src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L58)).
- **Code-server / CLI / dev fallback**: `NodeAgentHostStarter` spawns a
  plain Node child via `Client` from `ipc.cp`, and can additionally open
  a WebSocket listener for external clients (see
  `setWebSocketConfig`, [nodeAgentHostStarter.ts:60](src/vs/platform/agentHost/node/nodeAgentHostStarter.ts#L60)).
- **Remote over SSH**: the renderer-side `SSHRemoteAgentHostService`
  drives an `SSHRelayTransport` that frames JSON-RPC to a
  `RemoteAgentHostProtocolClient` against the remote process
  ([sshRemoteAgentHostServiceImpl.ts:50](src/vs/platform/agentHost/electron-browser/sshRemoteAgentHostServiceImpl.ts#L50)).
- **Remote over dev-tunnels**: `TunnelAgentHostMainService` opens a
  WebSocket to `wss://…/agenthost` on `TUNNEL_AGENT_HOST_PORT`, with
  per-step timeouts ([tunnelAgentHostService.ts:105](src/vs/platform/agentHost/node/tunnelAgentHostService.ts#L105)).

The wire formats are deliberately uniform: both the MessagePort IPC
channel and the WebSocket transports speak the same JSON-RPC verbs
(`initialize`, `reconnect`, `subscribe`, `unsubscribe`,
`dispatchAction`, `createSession`, resource commands), so the same
`AgentHostStateManager` + `AgentService` serves every transport. The
IPC channel name is fixed by [`AgentHostIpcChannels.AgentHost`](src/vs/platform/agentHost/common/agentService.ts#L33).

The renderer-facing entry points are:

- [`IAgentService`](src/vs/platform/agentHost/common/agentService.ts#L722) — proxied over IPC; raw protocol surface.
- [`IAgentConnection`](src/vs/platform/agentHost/common/agentService.ts#L893) — consumer-facing wrapper layering subscription
  management and optimistic write-ahead.
- [`IAgentHostService`](src/vs/platform/agentHost/common/agentService.ts#L949) — the local-process wrapper that also exposes
  restart, `startWebSocketServer`, `getInspectInfo`, and an
  `authenticationPending` observable.

## The `IAgent` Provider Interface

Every agent harness implements [`IAgent`](src/vs/platform/agentHost/common/agentService.ts#L545)
and registers itself with `AgentService.registerProvider(...)` from
inside the agent host process (see
[agentHostMain.ts:167](src/vs/platform/agentHost/node/agentHostMain.ts#L167) for
`CopilotAgent` and [agentHostMain.ts:174](src/vs/platform/agentHost/node/agentHostMain.ts#L174)
for the opt-in `ClaudeAgent`).

Required surface (every method below cites the line in
[agentService.ts](src/vs/platform/agentHost/common/agentService.ts)):

| Member | Purpose | Line |
|--------|---------|------|
| `id: AgentProvider` | Stable provider id, becomes the session URI scheme (e.g. `copilot:/<rawId>`) | [551](src/vs/platform/agentHost/common/agentService.ts#L551) |
| `onDidSessionProgress: Event<AgentSignal>` | Streams `IAgentActionSignal` (verbatim protocol actions), `pending_confirmation`, `subagent_started`, `subagent_completed`, `steering_consumed` | [554](src/vs/platform/agentHost/common/agentService.ts#L554) |
| `onDidMaterializeSession?: Event<IAgentMaterializeSessionEvent>` | Fires once for a provisional session when its SDK session, worktree, and on-disk metadata land | [563](src/vs/platform/agentHost/common/agentService.ts#L563) |
| `createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult>` | Allocate a session URI. May be `provisional: true` (no SDK session yet) | [566](src/vs/platform/agentHost/common/agentService.ts#L566) |
| `resolveSessionConfig(params): Promise<ResolveSessionConfigResult>` | Return the dynamic per-session config schema for `IAgentCreateSessionConfig.config` | [569](src/vs/platform/agentHost/common/agentService.ts#L569) |
| `sessionConfigCompletions(params): Promise<SessionConfigCompletionsResult>` | Provide completions for a single config property | [572](src/vs/platform/agentHost/common/agentService.ts#L572) |
| `sendMessage(session, prompt, attachments?, turnId?): Promise<void>` | Inject a user turn into a session | [575](src/vs/platform/agentHost/common/agentService.ts#L575) |
| `setPendingMessages?(session, steering, queued): void` | Notified when steering message changes mid-turn | [583](src/vs/platform/agentHost/common/agentService.ts#L583) |
| `getSessionMessages(session): Promise<readonly Turn[]>` | Reconstruct protocol [`Turn[]`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L539) from SDK-specific event logs (also called for subagent URIs) | [591](src/vs/platform/agentHost/common/agentService.ts#L591) |
| `disposeSession(session): Promise<void>` | Release SDK / worktree resources for a session | [594](src/vs/platform/agentHost/common/agentService.ts#L594) |
| `abortSession(session): Promise<void>` | Cancel an in-flight turn | [597](src/vs/platform/agentHost/common/agentService.ts#L597) |
| `changeModel(session, model): Promise<void>` | Swap the model selection on a live session | [600](src/vs/platform/agentHost/common/agentService.ts#L600) |
| `changeAgent?(session, agent \| undefined): Promise<void>` | Swap the selected custom agent | [608](src/vs/platform/agentHost/common/agentService.ts#L608) |
| `respondToPermissionRequest(requestId, approved): void` | Resolve a `pending_confirmation` decision (host calls this after applying its auto-approval policy) | [611](src/vs/platform/agentHost/common/agentService.ts#L611) |
| `respondToUserInputRequest(requestId, response, answers?): void` | Resolve a `SessionInputRequested` round-trip with `SessionInputResponseKind` + per-question `SessionInputAnswer` map | [614](src/vs/platform/agentHost/common/agentService.ts#L614) |
| `getDescriptor(): IAgentDescriptor` | Provider id / display name / description published in root state | [617](src/vs/platform/agentHost/common/agentService.ts#L617) |
| `models: IObservable<readonly IAgentModelInfo[]>` | Observable list of available models — drives `root/agentsChanged` and the model picker | [620](src/vs/platform/agentHost/common/agentService.ts#L620) |
| `listSessions(): Promise<IAgentSessionMetadata[]>` | Enumerate persisted sessions for the provider | [623](src/vs/platform/agentHost/common/agentService.ts#L623) |
| `getSessionMetadata?(session): Promise<IAgentSessionMetadata \| undefined>` | Single-session lookup without enumerating | [626](src/vs/platform/agentHost/common/agentService.ts#L626) |
| `getProtectedResources(): ProtectedResourceMetadata[]` | RFC 9728-style resources the agent needs bearer tokens for | [629](src/vs/platform/agentHost/common/agentService.ts#L629) |
| `onDidCustomizationsChange?: Event<void>` | Customization-state churn — triggers `AgentInfo` republish | [635](src/vs/platform/agentHost/common/agentService.ts#L635) |
| `getCustomizations?(): readonly CustomizationRef[]` | Host-owned customizations advertised on `AgentInfo` | [641](src/vs/platform/agentHost/common/agentService.ts#L641) |
| `getSessionCustomizations?(session): Promise<readonly SessionCustomization[]>` | Per-session resolved customizations with status | [646](src/vs/platform/agentHost/common/agentService.ts#L646) |
| `authenticate(resource, token): Promise<boolean>` | Accept a bearer token for a `getProtectedResources()` entry | [651](src/vs/platform/agentHost/common/agentService.ts#L651) |
| `truncateSession?(session, turnId?): Promise<void>` | Optional history truncation | [658](src/vs/platform/agentHost/common/agentService.ts#L658) |
| `onArchivedChanged?(session, isArchived): Promise<void>` | Notified of archive flips (e.g. drop the worktree on archive) | [665](src/vs/platform/agentHost/common/agentService.ts#L665) |
| `setClientCustomizations(session, clientId, customizations): Promise<ISyncedCustomization[]>` | Sync client-provided customization refs into per-session storage | [674](src/vs/platform/agentHost/common/agentService.ts#L674) |
| `setClientTools(session, clientId, tools): void` | Register client-provided tools; called on every `activeClientChanged` | [685](src/vs/platform/agentHost/common/agentService.ts#L685) |
| `onClientToolCallComplete(session, toolCallId, result): void` | Resolve a client-side tool handler back to the SDK | [702](src/vs/platform/agentHost/common/agentService.ts#L702) |
| `setCustomizationEnabled(uri, enabled): void` | Toggle a customization; may restart the client before the next message | [708](src/vs/platform/agentHost/common/agentService.ts#L708) |
| `shutdown(): Promise<void>` | Drain and stop all sessions | [711](src/vs/platform/agentHost/common/agentService.ts#L711) |
| `dispose(): void` | Tear down the provider | [714](src/vs/platform/agentHost/common/agentService.ts#L714) |

## State Manager + Reducer Flow

The state tree is split into three resource families, each with its own
reducer ([`sessionReducers.ts`](src/vs/platform/agentHost/common/state/sessionReducers.ts) re-exports them):

- **Root** at `agenthost:/root` ([`ROOT_STATE_URI`](src/vs/platform/agentHost/common/state/sessionState.ts)) — agent list, models, host config, protected resources.
- **Session** at the provider-scoped session URI (`copilot:/<id>`, `claude:/<id>`) — the [`SessionState`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L85) tree.
- **Changeset** at a changeset URI — separated cache so retention policy stays local.

End-to-end, an SDK event becomes a chat-UI progress part as follows:

1. The agent harness receives an SDK callback and either fabricates a
   [`SessionAction`](src/vs/platform/agentHost/common/state/sessionActions.ts) (wrapping it in an `IAgentActionSignal`) or
   emits a non-action signal (`pending_confirmation`,
   `subagent_started`, `subagent_completed`, `steering_consumed`).
2. The signal flows through `AgentService.onDidSessionProgress` to
   `AgentSideEffects` ([agentSideEffects.ts:103](src/vs/platform/agentHost/node/agentSideEffects.ts#L103)),
   which applies host-side policy (auto-approval, subagent routing) and
   calls `AgentHostStateManager.dispatchClientAction(channel, action,
   origin)` or the server-origin variant.
3. `_applyAndEmit` ([agentHostStateManager.ts:551](src/vs/platform/agentHost/node/agentHostStateManager.ts#L551))
   runs the matching reducer (`rootReducer`, [`sessionReducer`](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts#L243),
   or `changesetReducer`), assigns the next `serverSeq`, and fires
   `onDidEmitEnvelope` with an [`ActionEnvelope`](src/vs/platform/agentHost/common/state/sessionActions.ts).
4. `AgentService` re-fires it on `onDidAction` ([agentService.ts:68](src/vs/platform/agentHost/node/agentService.ts#L68)),
   which the transport layer forwards to every subscribed client.
5. The renderer's `AgentHostSessionHandler` subscribes to the session
   resource via `IAgentConnection.getSubscription(StateComponents.Session, …)`,
   then runs the always-on observation graph
   (`_observeTurn` / `activeTurnToProgress` /
   `stateToProgressAdapter.ts`) that diffs immutable session state into
   `IChatProgress[]` for the chat UI ([agentHostSessionHandler.ts:373](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L373)).

Notable consequences of the reducer model:

- Actions are pure — `_applyAndEmit` may short-circuit a no-op
  `RootConfigChanged` to avoid feedback loops between client subscribers
  ([agentHostStateManager.ts:561](src/vs/platform/agentHost/node/agentHostStateManager.ts#L561)).
- Active-turn tracking is derived from `state.activeTurn` after the
  reducer runs, not from raw turn-ids on actions — the only safe way to
  keep `RootActiveSessionsChanged` consistent with reality
  ([agentHostStateManager.ts:594](src/vs/platform/agentHost/node/agentHostStateManager.ts#L594)).
- Summary-status derivation lives in the session reducer
  (`summaryStatus` / `refreshSummaryStatus`,
  [channels-session/reducer.ts:57](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts#L57)),
  and dirty summaries are coalesced through a 100 ms `RunOnceScheduler`
  ([agentHostStateManager.ts:81](src/vs/platform/agentHost/node/agentHostStateManager.ts#L81)).

## Session Lifecycle

```text
createSession(config)
   │
   ├─ provisional: true  ──▶ in-memory placeholder; sessionAdded deferred
   │       │
   │       └─ first sendMessage triggers materialization
   │            └─ IAgent.onDidMaterializeSession
   │                 └─ AgentService publishes final summary +
   │                    deferred sessionAdded notification
   │
   └─ provisional: false ──▶ sessionAdded immediately
                                │
                                ▼
                       sendMessage(prompt) — repeat per turn
                                │
                                ├─ SessionTurnStarted (write-ahead from client)
                                ├─ AgentSignal stream → SessionAction*
                                ├─ optional SessionInputRequested round-trip
                                ├─ optional pending_confirmation round-trip
                                └─ SessionTurnEnded (terminal status)
                                │
                                ▼
                       disposeSession(session)
```

Key contracts:

- `IAgentCreateSessionResult.provisional` defers the `sessionAdded`
  protocol notification so the session is not visible to other clients
  until it has been persisted ([agentService.ts:268](src/vs/platform/agentHost/common/agentService.ts#L268)).
- `onDidMaterializeSession` fires exactly once, carries the resolved
  `workingDirectory` and `project` ([agentService.ts:280](src/vs/platform/agentHost/common/agentService.ts#L280)).
- `abortSession` cancels a turn; `truncateSession?` rolls history back
  to a specific turn id ([agentService.ts:658](src/vs/platform/agentHost/common/agentService.ts#L658)).
- `disposeSession` frees SDK + worktree; reborn sessions go through
  `restore` (next section).
- The host runs a debounced GC for empty, unsubscribed sessions after
  `SESSION_GC_GRACE_MS = 30_000` ([agentService.ts:55](src/vs/platform/agentHost/node/agentService.ts#L55)) so that a
  reload/disconnect window doesn't tear down a worktree the user is
  about to come back to.

## Restore Path

Restoration is symmetric to creation but starts from persisted
metadata:

1. Client calls `IAgentConnection.listSessions()` →
   `IAgentService.listSessions()` → each registered provider's
   `listSessions()`.
2. Client opens a session by calling `IAgentConnection.subscribe(StateComponents.Session, sessionUri)`,
   which materializes a `SessionState` from the agent's SDK-specific
   on-disk log via `IAgent.getSessionMessages(session)` →
   `readonly Turn[]` ([agentService.ts:591](src/vs/platform/agentHost/common/agentService.ts#L591), `Turn` shape at
   [channels-session/state.ts:539](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L539)).
3. The renderer's `AgentHostSessionHandler.provideChatSessionContent`
   builds the initial `IChatSession` from that snapshot — markdown /
   reasoning prefixes already in the snapshot are tracked in
   `seedEmittedLengths` so the live observation graph doesn't re-emit
   them ([agentHostSessionHandler.ts:555](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L555)).
4. Subagent sessions use a synthetic prefix
   (`buildSubagentSessionUriPrefix` /
   `parseSubagentSessionUri`) — `getSessionMessages` is called with the
   subagent URI to walk the child session's turns.

`Turn[]` is the on-wire restoration unit. An agent harness owns the
conversion from its SDK event log to protocol turns and is responsible
for stable `turnId`s across restores (so write-ahead actions and
checkpoints reconcile).

## Per-Session Configuration

`IAgentCreateSessionConfig.config` is an opaque
`Record<string, unknown>` whose shape is owned by each provider
([agentService.ts:347](src/vs/platform/agentHost/common/agentService.ts#L347)). The host queries the schema and
completions at session-create time:

- [`resolveSessionConfig(IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>`](src/vs/platform/agentHost/common/agentService.ts#L569) — returns
  a [`ConfigSchema`](src/vs/platform/agentHost/common/state/protocol/common/state.ts#L185)-shaped descriptor (typed by
  [`SessionConfigSchema`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L248)) keyed by property name.
- [`sessionConfigCompletions({ ..., property, query? }): Promise<SessionConfigCompletionsResult>`](src/vs/platform/agentHost/common/agentService.ts#L572) — returns
  completions for a specific property value (e.g. branch names for an
  isolation: worktree config).

Well-known property keys live in
[`sessionConfigKeys.ts`](src/vs/platform/agentHost/common/sessionConfigKeys.ts) (`SessionConfigKey`); the
renderer-side schema/completions pickers consume them via
`AgentHostSessionConfigPicker` ([baseAgentHostSessionsProvider context](src/vs/sessions/contrib/providers/agentHost/browser/agentHostSessionConfigPicker.ts)).

The resolved per-session config snapshot lives on
[`SessionConfigState`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L265) in the session state tree.

## Authentication and Protected Resources

The host follows an RFC 9728 / RFC 6750 model:

- Each provider declares
  [`getProtectedResources(): ProtectedResourceMetadata[]`](src/vs/platform/agentHost/common/agentService.ts#L629).
  Definition at [protocol/common/state.ts:83](src/vs/platform/agentHost/common/state/protocol/common/state.ts#L83).
- `AgentSideEffects` aggregates the set into root state on
  `agentsChanged` ([agentSideEffects.ts:140](src/vs/platform/agentHost/node/agentSideEffects.ts#L140)),
  surfaced as `AgentInfo.protectedResources` on
  [`RootState`](src/vs/platform/agentHost/common/state/protocol/channels-root/state.ts#L31).
- Clients pass bearer tokens via
  [`IAgentService.authenticate({ resource, token })`](src/vs/platform/agentHost/common/agentService.ts#L731);
  `AgentService.authenticate` routes to the provider whose resource
  matches ([agentService.ts:278](src/vs/platform/agentHost/node/agentService.ts#L278)).
- The renderer's `AgentHostContribution` toggles
  [`IAgentHostService.authenticationPending`](src/vs/platform/agentHost/common/agentService.ts#L963)
  around its auth pass so dependent UIs (sessions provider, banners)
  mark sessions as still loading.
- A canonical Copilot resource constant
  ([`GITHUB_COPILOT_PROTECTED_RESOURCE`](src/vs/platform/agentHost/common/agentService.ts#L336))
  ensures every provider that consumes a Copilot token advertises the
  same `resource` string, so the renderer routes one token to all of
  them.

## Permissions and User Input Requests

Two distinct round-trips share a similar shape but mean different
things:

### Permission requests (tool-use approval)

Triggered by the agent emitting an
[`IAgentToolPendingConfirmationSignal`](src/vs/platform/agentHost/common/agentService.ts#L419)
(`kind: 'pending_confirmation'`). The host:

1. Applies its auto-approval policy in `SessionPermissionManager.getAutoApproval`
   ([sessionPermissions.ts:89](src/vs/platform/agentHost/node/sessionPermissions.ts#L89))
   over the signal's `permissionKind` (`'shell' | 'write' | 'mcp' |
   'read' | 'url' | 'custom-tool' | 'hook' | 'memory'`) and
   `permissionPath`.
2. Dispatches the matching `SessionToolCallReady` action — either with
   confirmation options baked in (user-approval branch) or
   `confirmed: NotNeeded` (auto-approved branch).
3. When the user picks an option, the renderer dispatches
   `SessionToolCallConfirmed` back; `AgentService` calls
   [`IAgent.respondToPermissionRequest(requestId, approved)`](src/vs/platform/agentHost/common/agentService.ts#L611)
   to resolve the SDK's deferred.

### User input requests (the `AskUserQuestion` flow)

Triggered by the agent dispatching a
[`SessionInputRequestedAction`](src/vs/platform/agentHost/common/state/protocol/channels-session/actions.ts)
that carries a
[`SessionInputRequest`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L408)
(text / number / boolean / single-select / multi-select questions). The
renderer fulfils it by dispatching `SessionInputCompleted`; the host
calls
[`IAgent.respondToUserInputRequest(requestId, response, answers)`](src/vs/platform/agentHost/common/agentService.ts#L614)
with a [`SessionInputResponseKind`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L279)
and a per-question
[`SessionInputAnswer`](src/vs/platform/agentHost/common/state/protocol/channels-session/state.ts#L505)
map.

Agents must keep these flows distinct: `AskUserQuestion` is a Q/A
carousel; tool-permission gates (including Claude's `ExitPlanMode`)
route through `pending_confirmation` instead, per the migration noted
in [claude/phase7-plan.md](src/vs/platform/agentHost/node/claude/phase7-plan.md).

## Models

`IAgent.models: IObservable<readonly IAgentModelInfo[]>` is the single
source of truth for what the model picker shows. It's an observable
because providers refresh model lists asynchronously (e.g. Copilot CLI
re-fetches on auth, Claude announces a static set). `AgentSideEffects`
publishes the union into root state on every churn.

Changing a session's model goes through
[`changeModel(session, model)`](src/vs/platform/agentHost/common/agentService.ts#L600);
the resulting `RootAgentsChanged` / `SessionModelChanged` actions ride
the normal reducer path so all clients converge.

`IAgentModelInfo` is defined at [agentService.ts:391](src/vs/platform/agentHost/common/agentService.ts#L391) — note
`policyState`, `configSchema`, and the meta bag for provider-specific
fields (Copilot usage, etc.).

## Customizations / Skills / Plugins — high-level

Customizations are the catalog of instructions, skills, plugins, and
MCP servers that get pushed into a session at startup. A harness author
should treat the customization layer as a black box: implement
`setClientCustomizations`, `setClientTools`, and
`setCustomizationEnabled` as pass-throughs that update SDK state and
let the renderer drive the policy.

What the renderer owns:

- [`AgentHostActiveClientService`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts#L27)
  constructs a per-`sessionType` [`AgentCustomizationSyncProvider`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.ts),
  a [`SyncedCustomizationBundler`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/syncedCustomizationBundler.ts),
  and an observable list of `CustomizationRef`s resolved from
  `IPromptsService`, `IAgentPluginService`, and storage.
- The same service derives a `clientTools` observable from
  `ILanguageModelToolsService.observeTools(undefined)` filtered by the
  `chat.agentHost.clientTools` allow-list ([agentHostActiveClientService.ts:74](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts#L74));
  this feeds `IAgent.setClientTools(...)` on every `activeClientChanged`.
- The host-side plugin/customization registry lives in
  [`agentPluginManager.ts`](src/vs/platform/agentHost/common/agentPluginManager.ts) (interface) and
  [`agentPluginManager.ts`](src/vs/platform/agentHost/node/agentPluginManager.ts) (impl); the per-session sync
  resolves to `ISyncedCustomization[]`.

What the harness author should **not** touch:

- The on-disk customization layout, the sync provider's checksumming, or
  the bundler — these are renderer-owned and shared across providers.
- `IAgentHostActiveClientService` / `IAgentHostUntitledProvisionalSessionService` —
  renderer-only DI singletons.
- The `chat.agentHost.clientTools` allow-list — owned by the chat config
  contribution.

## Recent Refactors (post `9da354bc01c`)

Authors familiar with older revisions should be aware of:

- **Unified `ClaudeAgentSession` lifecycle** (Phase 10.5): Claude's
  per-session lifecycle was consolidated into a single
  [`ClaudeAgentSession`](src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L68)
  class with explicit materialization + dispose phases that match the
  `provisional → materialized → live → disposed` contract on `IAgent`.
- **`AgentHostEditingSession` removed**: file-edit progress now flows
  through the chat model's `externalEdit` progress part. The handler
  hydrates per-tool-call edits via `_hydrateFileEdits` returning
  `IChatExternalEdit` parts ([agentHostSessionHandler.ts:2341](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L2341)) instead
  of maintaining a parallel editing-session object.
- **`IAgentHostActiveClientService` introduced**: the renderer's
  per-`sessionType` client identity, customization sync, and `clientTools`
  observable now live in
  [agentHostActiveClientService.ts](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts) — handlers receive a
  `SessionActiveClient` via DI rather than threading it through ad-hoc
  parameters.
- **`ChangesetFileMonitorCoordinator` added**: file-system watches that
  feed changeset rebuilds were extracted to
  [agentHostChangesetFileMonitorCoordinator.ts](src/vs/platform/agentHost/node/agentHostChangesetFileMonitorCoordinator.ts),
  so the changeset service no longer reaches into the file monitor
  directly.
- **Settings registration moved out of the renderer** (`f3831aeef7d`):
  agent-host configuration registration lives in
  [agentHost.config.contribution.ts](src/vs/platform/agentHost/common/agentHost.config.contribution.ts) and
  [agentHostStarter.config.contribution.ts](src/vs/platform/agentHost/common/agentHostStarter.config.contribution.ts),
  imported from the starter files. The renderer no longer registers
  `chat.agentHost.*` settings — schema authors edit the platform
  contributions.
- **Agent host enabled by default for Insiders** (`b4b5c20cbba`): the
  [`AgentHostEnabledSettingId = 'chat.agentHost.enabled'`](src/vs/platform/agentHost/common/agentService.ts#L40)
  default is now `true` in Insiders. Harness code should not assume the
  user opted in — the relevant gate for new code is
  [`isAgentHostEnabled`](src/vs/platform/agentHost/common/agentService.ts#L43), which also returns `false` on web.

## Architectural Constraints

- **Process boundary**: the agent host runs in its own Node process.
  Anything reachable from a harness must be serializable across IPC —
  no `URI` prototype rehydration assumed beyond what the agent host
  protocol already does, no `CancellationToken` round-trips
  ([agentService.ts:761](src/vs/platform/agentHost/common/agentService.ts#L761)).
- **Single state owner**: `AgentHostStateManager` is the sole writer of
  protocol state. Harnesses must dispatch actions through it
  (via `IAgentService.dispatchAction` or by emitting
  `IAgentActionSignal`) — never mutate session state directly.
- **`URI` schemes as routing**: session URI scheme equals provider id
  (`AgentSession.uri(provider, rawId)`, [agentService.ts:478](src/vs/platform/agentHost/common/agentService.ts#L478)).
  Reusing a scheme means joining the same provider — pick a new id
  carefully.
- **Subscription refcounting**: `subscribe` / `unsubscribe` /
  `addSubscriber` are refcounted per `clientId`; idle sessions are
  evicted only when the count reaches zero and the GC grace period
  expires ([agentService.ts:108](src/vs/platform/agentHost/node/agentService.ts#L108)).
- **No web support**: `isAgentHostEnabled` early-returns `false` when
  `isWeb`. Pure-browser callers must degrade gracefully.

## Anti-Patterns

### Mutating session state outside the reducer

**What happens:** Harness code calls something on
`AgentHostStateManager` directly or mutates a returned `SessionState`.
**Why it's wrong:** Subscribers reconcile from the `ActionEnvelope`
stream and the monotonic `serverSeq`; out-of-band writes don't ride
that stream and cause clients to silently desync (see the active-turn
derivation comment at [agentHostStateManager.ts:594](src/vs/platform/agentHost/node/agentHostStateManager.ts#L594)).
**Do this instead:** Emit a `SessionAction` and let
[`sessionReducer`](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts#L243) compute the next state.

### Forwarding SDK permission prompts via `SessionInputRequest`

**What happens:** A harness wires the SDK's tool-permission prompt into
`SessionInputRequested` because it has questions and answers.
**Why it's wrong:** `SessionInputRequest` is for `AskUserQuestion`-style
Q/A carousels — the renderer treats the round-trip as a question, not a
tool gate, and the resulting state is not a tool call. The Claude
migration in [claude/phase7-plan.md:11](src/vs/platform/agentHost/node/claude/phase7-plan.md) documents the
same trap.
**Do this instead:** Emit `IAgentToolPendingConfirmationSignal` so the
host runs auto-approval and dispatches `SessionToolCallReady`. Resolve
the deferred in `respondToPermissionRequest`.

### Bundling the Claude SDK

**What happens:** A patch adds `@anthropic-ai/claude-agent-sdk` to
`package.json` to make the Claude provider work out of the box.
**Why it's wrong:** The SDK is intentionally unbundled and gated on
[`AgentHostClaudeAgentSdkPathSettingId`](src/vs/platform/agentHost/common/agentService.ts#L66) +
the `VSCODE_AGENT_HOST_CLAUDE_SDK_PATH` env var — see the comment block
at [agentService.ts:55](src/vs/platform/agentHost/common/agentService.ts#L55) and the registration logic at
[agentHostMain.ts:169](src/vs/platform/agentHost/node/agentHostMain.ts#L169).
**Do this instead:** Document the opt-in path; load the SDK via
dynamic `import()` from the user-provided absolute path inside the
agent host process.

## Error Handling

- Protocol errors round-trip as JSON-RPC errors built by
  `buildErrorResponse` / `buildErrorResponseFromUnknown`
  ([protocolServerHandler.ts:67](src/vs/platform/agentHost/node/protocolServerHandler.ts#L67)).
  Use [`ProtocolError`](src/vs/platform/agentHost/common/state/sessionProtocol.ts) to preserve `code` and `data`.
- Reducer logging is best-effort via the optional `log?` callback —
  reducers are pure and never throw; they soft-assert on unknown
  actions ([channels-session/reducer.ts](src/vs/platform/agentHost/common/state/protocol/channels-session/reducer.ts)).
- The host's auth pass swallows individual provider failures so a
  flaky agent doesn't block the others ([agentService.ts:278](src/vs/platform/agentHost/node/agentService.ts#L278)).

## Cross-Cutting Concerns

- **Logging:** All host-side components take `ILogService`. AHP JSONL
  transport logs are gated on
  [`AgentHostAhpJsonlLoggingSettingId`](src/vs/platform/agentHost/common/agentService.ts#L49); per-host IPC traffic
  logs are gated on [`AgentHostIpcLoggingSettingId`](src/vs/platform/agentHost/common/agentService.ts#L46).
- **Telemetry:** `AgentHostTelemetryService` (and its reporter) live in
  [agentHostTelemetryService.ts](src/vs/platform/agentHost/node/agentHostTelemetryService.ts) and follow the
  user's telemetry level (`updateAgentHostTelemetryLevelFromConfig`,
  [agentHostTelemetryService.ts](src/vs/platform/agentHost/node/agentHostTelemetryService.ts)).
- **OpenTelemetry:** `chat.agentHost.otel.*` settings translate into
  env vars consumed inside the process — see
  [`buildAgentHostOTelEnv`](src/vs/platform/agentHost/common/agentService.ts#L154) and
  [OTEL.md](src/vs/platform/agentHost/OTEL.md).
- **Authentication:** the renderer's
  [`AgentHostContribution`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.ts)
  is the auth driver — see the `authenticationPending` contract on
  `IAgentHostService` ([agentService.ts:963](src/vs/platform/agentHost/common/agentService.ts#L963)).

---

*Architecture analysis: 2026-05-27*
