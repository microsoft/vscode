# Sessions process protocol

> **Keep this document in sync with the code.** Changes to the state model, action types, protocol messages, or versioning strategy must be reflected here. Implementation lives in `common/state/`.

For process architecture and IPC details, see [architecture.md](architecture.md). For design decisions, see [design.md](design.md). For the task backlog, see [backlog.md](backlog.md).

## Goal

The sessions process is a portable, standalone server that multiple clients can connect to. Clients see a synchronized view of sessions and can send commands that are reflected back as state-changing actions. The protocol is designed around four requirements:

1. **Synchronized multi-client state** — an immutable, redux-like state tree mutated exclusively by actions flowing through pure reducers.
2. **Lazy loading** — clients subscribe to state by URI and load data on demand. The session list is fetched imperatively. Large content (images, long tool outputs) is stored by reference and fetched separately.
3. **Write-ahead with reconciliation** — clients optimistically apply their own actions locally, then reconcile when the server echoes them back alongside any concurrent actions from other clients or the server itself.
4. **Forward-compatible versioning** — newer clients can connect to older servers. A single protocol version number maps to a capabilities object; clients check capabilities before using features.

## URI-based subscriptions

All state is identified by URIs. Clients subscribe to a URI to receive its current state snapshot and subsequent action updates. This is the single universal mechanism for state synchronization:

- **Root state** (`agenthost:root`) — always-present global state (agents, models). Clients subscribe to this on connect.
- **Session state** (`copilot:/<uuid>`, etc.) — per-session state loaded on demand. Clients subscribe when opening a session.

The `subscribe(uri)` / `unsubscribe(uri)` mechanism works identically for all resource types.

## State model

### Root state

Subscribable at `agenthost:root`. Contains global, lightweight data that all clients need. **Does not contain the session list** — that is fetched imperatively via RPC (see Commands).

```
RootState {
    agents: AgentInfo[]
    models: ModelInfo[]
}
```

### Session state

Subscribable at the session's URI (e.g. `copilot:/<uuid>`). Contains the full state for a single session.

```
SessionState {
    summary: SessionSummary
    lifecycle: 'creating' | 'ready' | 'creationFailed'
    creationError?: ErrorInfo
    turns: Turn[]
    activeTurn: ActiveTurn | undefined
}
```

`lifecycle` tracks the asynchronous creation process. When a client creates a session, it picks a URI, sends the command, and subscribes immediately. The initial snapshot has `lifecycle: 'creating'`. The server asynchronously initializes the backend and dispatches `session/ready` or `session/creationFailed`.

```
Turn {
    id: string
    userMessage: UserMessage
    responseParts: ResponsePart[]
    toolCalls: CompletedToolCall[]
    usage: UsageInfo | undefined
    state: 'complete' | 'cancelled' | 'error'
}

ActiveTurn {
    id: string
    userMessage: UserMessage
    streamingText: string
    responseParts: ResponsePart[]
    toolCalls: Map<toolCallId, ToolCallState>
    pendingPermissions: Map<requestId, PermissionRequest>
    reasoning: string
}
```

### Session list

The session list can be arbitrarily large and is **not** part of the state tree. Instead:
- Clients fetch the list imperatively via `listSessions()` RPC.
- The server sends lightweight **notifications** (`sessionAdded`, `sessionRemoved`) so connected clients can update a local cache without re-fetching.

Notifications are ephemeral — not processed by reducers, not stored in state, not replayed on reconnect. On reconnect, clients re-fetch the list.

### Content references

Large content is **not** inlined in state. A `ContentRef` placeholder is used instead:

```
ContentRef {
    uri: string             // scheme://sessionId/contentId
    sizeHint?: number
    mimeType?: string
}
```

Clients fetch content separately via `fetchContent(uri)`. This keeps the state tree small and serializable.

## Actions

Actions are the sole mutation mechanism for subscribable state. They form a discriminated union keyed by `type`. Every action is wrapped in an `ActionEnvelope` for sequencing and origin tracking.

### Action envelope

```
ActionEnvelope {
    action: Action
    serverSeq: number                                     // monotonic, assigned by server
    origin: { clientId: string, clientSeq: number } | undefined  // undefined = server-originated
}
```

### Root actions

These mutate the root state. **All root actions are server-only** — clients observe them but cannot produce them.

| Type | Payload | When |
|---|---|---|
| `root/modelsChanged` | `ModelInfo[]` | Available models changed |
| `root/agentsChanged` | `AgentInfo[]` | Available agent backends changed |

### Session actions

All scoped to a session URI. Some are server-only (produced by the agent backend), others can be dispatched directly by clients.

When a client dispatches an action, the server applies it to the state and also reacts to it as a side effect (e.g., `session/turnStarted` triggers agent processing, `session/turnCancelled` aborts it). This avoids a separate command→action translation layer for the common interactive cases.

| Type | Payload | Client-dispatchable? | When |
|---|---|---|---|
| `session/ready` | — | No | Session backend initialized successfully |
| `session/creationFailed` | `ErrorInfo` | No | Session backend failed to initialize |
| `session/turnStarted` | `turnId, UserMessage` | Yes | User sent a message; server starts processing |
| `session/delta` | `turnId, content` | No | Streaming text chunk from assistant |
| `session/responsePart` | `turnId, ResponsePart` | No | Structured content appended |
| `session/toolStart` | `turnId, ToolCallState` | No | Tool execution began |
| `session/toolComplete` | `turnId, toolCallId, ToolCallResult` | No | Tool execution finished |
| `session/permissionRequest` | `turnId, PermissionRequest` | No | Permission needed from user |
| `session/permissionResolved` | `turnId, requestId, approved` | Yes | Permission granted or denied |
| `session/turnComplete` | `turnId` | No | Turn finished (assistant idle) |
| `session/turnCancelled` | `turnId` | Yes | Turn was aborted; server stops processing |
| `session/error` | `turnId, ErrorInfo` | No | Error during turn processing |
| `session/titleChanged` | `title` | No | Session title updated |
| `session/usage` | `turnId, UsageInfo` | No | Token usage report |
| `session/reasoning` | `turnId, content` | No | Reasoning/thinking text |

### Notifications

Notifications are ephemeral broadcasts that are **not** part of the state tree. They are not processed by reducers and are not replayed on reconnect.

| Type | Payload | When |
|---|---|---|
| `notify/sessionAdded` | `SessionSummary` | A new session was created |
| `notify/sessionRemoved` | session `URI` | A session was disposed |

Clients use notifications to maintain a local session list cache. On reconnect, clients should re-fetch via `listSessions()` rather than relying on replayed notifications.

## Commands and client-dispatched actions

Clients interact with the server in two ways:

1. **Dispatching actions** — the client sends an action directly (e.g., `session/turnStarted`, `session/turnCancelled`). The server applies it to state and reacts with side effects. These are write-ahead: the client applies them optimistically.
2. **Sending commands** — imperative RPCs for operations that don't map to a single state action (session creation, fetching data, etc.).

### Client-dispatched actions

| Action | Server-side effect |
|---|---|
| `session/turnStarted` | Begins agent processing for the new turn |
| `session/permissionResolved` | Unblocks the pending tool execution |
| `session/turnCancelled` | Aborts the in-progress turn |

### Commands

| Command | Effect |
|---|---|
| `createSession(uri, config)` | Server creates session, client subscribes to URI |
| `disposeSession(session)` | Server disposes session, broadcasts `sessionRemoved` notification |
| `listSessions(filter?)` | Returns `SessionSummary[]` |
| `fetchContent(uri)` | Returns content bytes |
| `fetchTurns(session, range)` | Returns historical turns |

### Session creation flow

1. Client picks a session URI (e.g. `copilot:/<new-uuid>`)
2. Client sends `createSession(uri, config)` command
3. Client sends `subscribe(uri)` (can be batched with the command)
4. Server creates the session in state with `lifecycle: 'creating'` and sends the subscription snapshot
5. Server asynchronously initializes the agent backend
6. On success: server dispatches `session/ready` action
7. On failure: server dispatches `session/creationFailed` action with error details
8. Server broadcasts `notify/sessionAdded` to all clients

## Client-server protocol

### Connection handshake

```
1. Client → Server:  ClientHello { protocolVersion, clientId, initialSubscriptions?: URI[] }
2. Server → Client:  ServerHello { protocolVersion, serverSeq, snapshots[] }
```

`initialSubscriptions` allows the client to subscribe to root state (and any previously-open sessions on reconnect) in the same round-trip as the handshake. The server responds with snapshots for each.

### URI subscription

After handshake, clients can subscribe/unsubscribe at any time:

```
Client → Server:  Subscribe { resource: URI }
Server → Client:  StateSnapshot { resource: URI, state, fromSeq }
```

After subscribing, the client receives all actions scoped to that URI with `serverSeq > fromSeq`. Multiple concurrent subscriptions are supported.

```
Client → Server:  Unsubscribe { resource: URI }
```

### Action delivery

The server broadcasts `ActionEnvelope`s to subscribed clients:
- Root actions go to all clients subscribed to root state.
- Session actions go to all clients subscribed to that session's URI.

Notifications go to all connected clients (no subscription required).

### Reconnection

```
Client → Server:  ClientReconnect { clientId, lastSeenServerSeq, subscriptions: URI[] }
```

Server replays actions since `lastSeenServerSeq` from a bounded replay buffer. If the gap exceeds the buffer, sends fresh snapshots. Notifications are **not** replayed — the client should re-fetch the session list.

## Write-ahead reconciliation

### Client-side state

Each client maintains per-subscription:
- `confirmedState` — last fully server-acknowledged state
- `pendingActions[]` — optimistically applied but not yet echoed by server
- `optimisticState` — `confirmedState` with `pendingActions` replayed on top (computed, not stored)

### Reconciliation algorithm

When the client receives an `ActionEnvelope` from the server:

1. **Own action echoed**: `origin.clientId === myId` and matches head of `pendingActions` → pop from pending, apply to `confirmedState`
2. **Foreign action**: different origin → apply to `confirmedState`, rebase remaining `pendingActions`
3. **Rejected action**: server echoed with `rejected: true` → remove from pending (optimistic effect reverted)
4. Recompute `optimisticState` from `confirmedState` + remaining `pendingActions`

### Why rebasing is simple

Most session actions are **append-only** (add turn, append delta, add tool call). Pending actions still apply cleanly to an updated confirmed state because they operate on independent data (the turn the client created still exists; the content it appended is additive). The rare true conflict (two clients abort the same turn) is resolved by server-wins semantics.

## Versioning

### Protocol version

Two constants define the version window:
- `PROTOCOL_VERSION` — the current version that new code speaks.
- `MIN_PROTOCOL_VERSION` — the oldest version we maintain compatibility with.

Bump `PROTOCOL_VERSION` when:
- A new feature area requires capability negotiation (e.g., client must know server supports it before sending commands)
- Behavioral semantics of existing actions change

Adding **optional** fields to existing action/state types does NOT require a bump. Adding **required** fields or removing/renaming fields **is a compile error** (see below).

```
Version history:
  1 — Initial: core session lifecycle, streaming, tools, permissions
```

### Version type snapshots

Each protocol version has a type file (`versions/v1.ts`, `versions/v2.ts`, etc.) that captures the wire format shape of every state type and action type in that version.

The **latest** version file is the editable "tip" — it can be modified alongside the living types in `sessionState.ts` / `sessionActions.ts`. The compiler enforces that all changes are backwards-compatible. When `PROTOCOL_VERSION` is bumped, the previous version file becomes truly frozen and a new tip is created.

The version registry (`versions/versionRegistry.ts`) performs **bidirectional assignability checks** between the version types and the living types:

```typescript
// AssertCompatible requires BOTH directions:
//   Current extends Frozen → can't remove fields or change field types
//   Frozen extends Current → can't add required fields
// The only allowed evolution is adding optional fields.
type AssertCompatible<Frozen, Current extends Frozen> = Frozen extends Current ? true : never;

type _check = AssertCompatible<IV1_TurnStartedAction, ITurnStartedAction>;
```

| Change to living type | Also update tip? | Compile result |
|---|---|---|
| Add optional field | Yes, add it to tip too | ✅ Passes |
| Add optional field | No, only in living type | ✅ Passes (tip is a subset) |
| Remove a field | — | ❌ `Current extends Frozen` fails |
| Change a field's type | — | ❌ `Current extends Frozen` fails |
| Add required field | — | ❌ `Frozen extends Current` fails |

### Exhaustive action→version map

The registry also maintains an exhaustive runtime map:

```typescript
export const ACTION_INTRODUCED_IN: { readonly [K in IStateAction['type']]: number } = {
    'root/modelsChanged': 1,
    'session/turnStarted': 1,
    // ...every action type must have an entry
};
```

The index signature `[K in IStateAction['type']]` means adding a new action to the `IStateAction` union without adding it to this map is a compile error. The developer is forced to pick a version number.

The server uses this for one-line filtering — no if/else chains:

```typescript
function isActionKnownToVersion(action: IStateAction, clientVersion: number): boolean {
    return ACTION_INTRODUCED_IN[action.type] <= clientVersion;
}
```

### Capabilities

The protocol version maps to a `ProtocolCapabilities` interface for higher-level feature gating:

```typescript
interface ProtocolCapabilities {
    // v1 — always present
    readonly sessions: true;
    readonly tools: true;
    readonly permissions: true;
    // v2+
    readonly reasoning?: true;
}
```

### Forward compatibility

A newer client connecting to an older server:
1. During handshake, the client learns the server's protocol version.
2. The client derives `ProtocolCapabilities` from the server version.
3. Command factories check capabilities before dispatching; if unsupported, the client degrades gracefully.
4. The server only sends action types known to the client's declared version (via `isActionKnownToVersion`).
5. As a safety net, clients silently ignore actions with unrecognized `type` values.

### Raising the minimum version

When `MIN_PROTOCOL_VERSION` is raised from N to N+1:
1. Delete `versions/vN.ts`.
2. Remove the vN compatibility checks from `versions/versionRegistry.ts`.
3. The compiler surfaces any dead code that only existed for vN compatibility.
4. Clean up that dead code.

### Backward compatibility

We do not guarantee backward compatibility (older clients connecting to newer servers). Clients should update before the server.

### Adding a new protocol version (cookbook)

1. Bump `PROTOCOL_VERSION` in `versions/versionRegistry.ts`.
2. Create `versions/v{N}.ts` — freeze the current types (copy from v{N-1} and add your new types).
3. Add your new action types to the living union in `sessionActions.ts`.
4. Add entries to `ACTION_INTRODUCED_IN` with version N (compiler forces this).
5. Add `AssertCompatible` checks for the new types in `versionRegistry.ts`.
6. Add reducer cases for the new actions (in new functions if desired).
7. Add capability fields to `ProtocolCapabilities` if needed.

## Reducers

State is mutated by pure reducer functions that take `(state, action) → newState`. The same reducer code runs on both server and client, which is what makes write-ahead possible: the client can locally predict the result of its own action using the same logic the server will run.

```
rootReducer(state: RootState, action: RootAction): RootState
sessionReducer(state: SessionState, action: SessionAction): SessionState
```

Reducers are pure (no side effects, no I/O). Server-side effects (e.g. forwarding a `sendMessage` command to the Copilot SDK) are handled by a separate dispatch layer, not in the reducer.

## File layout

```
src/vs/platform/agent/common/state/
├── sessionState.ts          # Immutable state types (RootState, SessionState, Turn, etc.)
├── sessionActions.ts        # Action + notification discriminated unions, ActionEnvelope
├── sessionReducers.ts       # Pure reducer functions (rootReducer, sessionReducer)
├── sessionProtocol.ts       # Protocol messages (handshake, subscribe, reconnect, RPC)
├── sessionCapabilities.ts   # Re-exports version constants + ProtocolCapabilities
├── sessionClientState.ts    # Client-side state manager (confirmed + pending + reconciliation)
└── versions/
    ├── v1.ts                # v1 wire format types (tip — editable, compiler-enforced compat)
    └── versionRegistry.ts   # Compile-time compat checks + runtime action→version map
```

## Relationship to existing IPC contract

The existing `IAgentProgressEvent` union in `agentService.ts` captures raw streaming events from the Copilot SDK. The new action types in `sessionActions.ts` are a higher-level abstraction: they represent state transitions rather than SDK events.

In the server process, the mapping is:
- `IAgentDeltaEvent` → `session/delta` action
- `IAgentToolStartEvent` → `session/toolStart` action
- `IAgentIdleEvent` → `session/turnComplete` action
- etc.

The existing `IAgentService` RPC interface remains unchanged. The new protocol layer sits on top: the sessions process uses `IAgentService` internally to talk to agent backends, and produces actions for connected clients.
