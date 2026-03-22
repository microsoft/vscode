# Remote Agent Host - Architecture Review

Review of the remote agent host connection management system across:
- `src/vs/platform/agentHost/` - service interface and implementation
- `src/vs/sessions/contrib/remoteAgentHost/` - sessions-layer orchestrator
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/` - shared handler/controller/provider components

## Critical Findings

### 1. Hanging turn on connection drop

`_handleTurn()` in `AgentHostSessionHandler` captures a `connection` reference and awaits a `done` promise that only resolves when `SessionClientState.onDidChangeSessionState` fires the turn-complete signal. If the WebSocket drops mid-turn:

- The connection-scoped `onDidAction` listener gets disposed (via `MutableDisposable`)
- State updates stop flowing → `finish()` is never called → `done` hangs forever
- The UI shows a perpetual spinner with no way to recover

This is the most impactful issue since the reconnection spec explicitly says agent hosts shut down on idle. A user who leaves a session open will hit this.

**Fix**: Turns must observe the connection going away. Options: use a per-turn `AbortSignal` tied to the connection's `onDidClose`, or have `updateConnection()`/disconnect call `finish()` on all active turns with an appropriate error message so the UI can unblock and the user can retry.

### 2. No timeout on connect/reconnect

`RemoteAgentHostProtocolClient.connect()` and `reconnect()` have no timeout. They depend on WebSocket TCP timeouts (30-120s+) and the `initialize`/`reconnect` JSON-RPC handshake has no timeout at all (the `DeferredPromise` waits forever). Many callers of `ensureConnected()` don't pass a `CancellationToken` - e.g., `resolveConnection`, `AgentHostFileSystemProvider._getConnection()`.

**Fix**: Add a protocol-level timeout (e.g., 30s) to `connect()` and `reconnect()`, racing the handshake with a deadline. This is a system boundary where defensive timeout is essential.

### 3. Dual connection-update path creates ambiguous ownership

`AgentHostSessionHandler` receives connection updates via two independent paths:

- **Push**: Contribution calls `handler.updateConnection(newConnection)` during `_wireConnection()`
- **Pull**: Handler's `_ensureConnection()` calls `resolveConnection()`, gets a new object, and calls `updateConnection()` on itself

Both paths converge on `updateConnection()` → `_wireConnectionEvents()`, and can race. If the handler's pull triggers a reconnect, the contribution's push also fires, potentially double-wiring subscriptions.

**Fix**: Pick one owner. The cleanest option is **push-only**: the contribution pushes new connections, the handler treats `this._connection` as authoritative. Remove `resolveConnection` from the config and `_ensureConnection()` from the handler. If a turn needs a connection and none is available, throw - the contribution is responsible for connection state.

## Improvement Findings

### 4. DRY - Local and remote contributions duplicate ~70% of orchestration logic

`RemoteAgentHostContribution` and `AgentHostContribution` independently implement near-identical logic for: root state subscription, `_handleRootStateChange` (agent diff), `_registerAgent` (session type + list controller + session handler + models), auth wiring, and IPC tracing. The only real difference is that the remote version handles per-address lifecycle and reconnection.

**Suggestion**: Extract a shared `AgentHostRegistrar` that encapsulates "given a connection + root state, manage agent lifecycle." The local contribution becomes trivially thin. The remote contribution becomes focused on the connection lifecycle delta - settings reconciliation, WebSocket state machine, FS provider. This would also naturally resolve the dual-update-path problem since the registrar would own the pattern consistently.

### 5. `IConnectionEntry` is a mutable bag of fields with no encapsulation

Six mutable fields modified from four different methods (`_connectTo`, `_reconnect`, `_disconnectEntry`, `_removeEntry`). The multi-step mutation in `_disconnectEntry` (capture metadata, dispose client, null fields) is ordering-sensitive and easy to get wrong.

**Suggestion**: Make this a class with `connect(client)`, `disconnect()`, `reconnect(client)` transition methods that enforce invariants.

### 6. Silent error swallowing in session list `refresh()`

The bare `catch {}` in `AgentHostSessionListController.refresh()` silently preserves cached items on failure. While correct for disconnects, it also swallows protocol errors and unexpected exceptions with no diagnostic.

**Suggestion**: Log the error. Distinguish network errors (expected cache behavior) from unexpected errors (warn-level log).

### 7. Stale connection reference in auth retry

`_createAndSubscribe()` captures `connection` once, then on `AHP_AUTH_REQUIRED`, authenticates and retries `connection.createSession()` with the same (potentially dead) reference.

**Suggestion**: Re-resolve the connection before retry.

### 8. Setting removal during pending reconnect

`_removeEntry()` disposes the entry but doesn't cancel the in-flight reconnect promise. The reconnect resolves, detects the entry is gone, disposes and throws - but the caller gets an error for an entry that no longer exists.

**Suggestion**: Store a `CancellationTokenSource` alongside pending reconnects so removal can cancel them immediately.

## Notes (Informational)

- **Layering is clean** - platform → workbench → sessions, all dependencies point downward. The shared handler/controller/provider classes are genuinely reusable between local and remote.
- **`_pendingReconnects` coalescing** is well-done, preventing race conditions on concurrent `ensureConnected()` calls.
- **`_rejectPendingRequests`** on WebSocket close is good fail-fast behavior.
- **Guard closures** (`guardedDisconnect`) in the service correctly prevent stale callbacks.
- **Dual `SessionClientState`** (one for root state, one per session handler) is correct but not obvious - a comment would help.
- **Config bag (`IAgentHostSessionHandlerConfig`)** mixes static identity with dynamic callbacks - minor ISP issue, low priority given only two consumers.

## Suggested Priority

1. **Add connection-drop handling to active turns** (Critical #1)
2. **Add protocol-level timeouts** (Critical #2)
3. **Eliminate dual update path** (Critical #3)
4. **Extract shared agent registrar** (Improvement #4) - naturally simplifies #3
5. **Encapsulate `IConnectionEntry`** (Improvement #5)
6. **Log errors in `refresh()`** (Improvement #6)
7. **Re-resolve connection on auth retry** (Improvement #7)
