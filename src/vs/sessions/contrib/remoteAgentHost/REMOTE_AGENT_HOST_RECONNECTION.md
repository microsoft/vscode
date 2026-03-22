# Remote Agent Host Connection Lifecycle

## Background

A remote agent host process may shut down while the sessions app remains open. The CLI proxy that fronts the agent host stays alive and will restart the server on the next incoming connection. The sessions app must handle this gracefully.

## Requirements

### Connection State

1. A configured remote agent host (from `chat.remoteAgentHosts`) must remain visible in the UI regardless of whether the WebSocket connection is currently active.

2. The service must expose whether each configured connection is currently connected or disconnected.

3. `getConnection()` must return `undefined` when the connection is not active. This is the existing contract and callers already handle it.

### Disconnect Behavior

4. When the WebSocket connection closes (agent host idle shutdown, crash, network loss), the connection entry must not be removed. It transitions to a disconnected state.

5. The session list in the sidebar must not be cleared when the connection drops. The last known session items are retained and displayed.

6. The protocol already delivers session changes via push notifications (`notify/sessionAdded`, `notify/sessionRemoved`, `session/turnComplete`). The imperative `listSessions()` call is only needed for initial population after a connection is established.

### Reconnection

7. The system must not automatically reconnect immediately after a disconnect. The agent host shut down intentionally (idle timeout) and restarting it without user intent wastes resources.

8. When the user performs an action that requires an active connection, the system must establish a new connection on demand. The CLI proxy will restart the agent host. Examples of such actions:
   - Creating a new session on the remote
   - Sending a message to a session on the remote
   - Browsing the remote filesystem (folder picker, file operations)

9. If reconnection fails (proxy also shut down, network unreachable), the error must surface to the user. The connection stays in disconnected state.

10. After a successful reconnection, the system must re-subscribe to protocol state (root state, session notifications) and refresh the session list, since push notifications were missed while disconnected.

### Session List While Disconnected

11. The session list controller must return cached items when the connection is unavailable, not an empty list.

12. The cached session list may be stale (sessions created/removed by other clients while disconnected). This is acceptable. The list will be refreshed on the next successful connection.

13. Refreshing the session list must not trigger a reconnection. It operates on cached data when disconnected.

### Other Clients

14. If another client connects to the same CLI proxy and starts sessions while this client is disconnected, this client will not know about those sessions until it reconnects. This is an accepted limitation.

15. A future improvement could be a lightweight CLI proxy health endpoint that reports whether the agent host is currently running without starting it. This would enable non-intrusive polling. The current CLI proxy starts the agent host on every request, so no such probe is possible today.

### Passive Callers

16. `ensureConnected()` may be called by passive system operations (e.g. the file service resolving persisted `agenthost://` URIs on window restore). These calls must not show progress UI or notifications. The service itself is silent; callers that want progress UI must wrap the call at their level.

### Progress UI

17. When a user-initiated action triggers reconnection (browsing the remote filesystem, creating a session) and the connection takes more than a brief moment, the caller should show a progress notification ("Connecting to {name}...") with a cancel option. This is the responsibility of the caller, not the service, since only the caller knows whether the action was user-initiated.
