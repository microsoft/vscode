# RemoteAgentHostSessionsProvider — Remote Agent Host Provider

**File:** `src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts`

A sessions provider for a single agent on a remote agent host connection. One instance is created per agent discovered on each connection.

## Registration

Registered dynamically by `RemoteAgentHostContribution`:

```
src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHost.contribution.ts
```

- Monitors `IRemoteAgentHostService.onDidChangeConnections`
- Creates one `RemoteAgentHostSessionsProvider` per connection
- Registers via `sessionsProvidersService.registerProvider(sessionsProvider)`
- Disposes providers when connections are removed

## Identity

| Property | Format |
|----------|--------|
| `id` | `'agenthost-${sanitizedAuthority}'` |
| `label` | Connection name or `address` |
| `icon` | `Codicon.remote` |
| `sessionTypes` | Dynamically populated from `rootState.agents`; copilot agents use the platform `COPILOT_CLI_SESSION_TYPE` (`copilotcli`) as the logical session type id, other agents use `remoteAgentHostSessionTypeId(sanitizedAuthority, agent.provider)` (format: `'remote-${sanitizedAuthority}-${agent.provider}'`), label is the agent's `displayName` |

The per-connection identifier built by `common/remoteAgentHostSessionType.ts` is used as the resource URI scheme registered via `registerChatSessionContentProvider` and the `targetChatSessionType` published by `AgentHostLanguageModelProvider`. For copilot agents, `ISession.sessionType` uses the platform `COPILOT_CLI_SESSION_TYPE` so that remote copilot sessions align with local CLI and cloud copilot sessions. A dedicated remote agent host model picker filters by `session.resource.scheme` to find models for the active connection.

Agents are discovered dynamically from each host's `rootState`; there is no hard-coded allowlist of supported agent providers. A single `RemoteAgentHostSessionsProvider` per host fans out into one `ISessionType` per advertised agent, and fires `onDidChangeSessionTypes` when the host's agent list changes. Each incoming session's type is derived from its backend URI scheme, so sessions for any agent the host exposes route through the same provider.

## IDs and URI Schemes

A remote session uses three distinct identifiers. For a copilot agent on host `myhost:3000`:

| Purpose | Value | Example |
|---------|-------|---------|
| `ISession.sessionType` | Platform type — `COPILOT_CLI_SESSION_TYPE` for copilot agents, per-connection ID for others | `copilotcli` |
| `resource.scheme` | Unique per-connection ID from `remoteAgentHostSessionTypeId()` | `remote-myhost__3000-copilot` |
| LM vendor / `targetChatSessionType` | Same as resource scheme | `remote-myhost__3000-copilot` |

Decoupling these allows copilot sessions from different providers (local CLI, remote hosts, cloud) to share the platform session type while keeping content-provider and model-provider routing isolated per host.

### How each ID is used

- **`ISession.sessionType`** — The logical session type visible to the sessions framework. Controls session-type pickers, context keys (`activeSessionType`), and behavioral gating (e.g. `isActiveSessionBackgroundProvider`). Copilot agents share `copilotcli` so they behave consistently with local copilot sessions.

- **`resource.scheme`** — The URI scheme of `ISession.resource` (e.g. `remote-myhost__3000-copilot:///abc123`). Routes `registerChatSessionContentProvider` calls to the correct `AgentHostSessionHandler` for each host. The remote agent host model picker filters available models by `session.resource.scheme` (not `session.sessionType`).

- **LM vendor** — The `targetChatSessionType` published by `AgentHostLanguageModelProvider` and used as the vendor when registering language models. Same value as the resource scheme, ensuring each host's models are isolated.

### Other IDs

- **`rawId`** — The session-local identifier (e.g. `abc123`), extracted from the session URI path. Used as the key in `_sessionCache`.
- **`sessionId`** — `{providerId}:{resource}` (e.g. `agenthost-myhost__3000:remote-myhost__3000-copilot:///abc123`). The provider-scoped ID passed to `ISessionsProvider` methods.
- **`providerId`** — `agenthost-${sanitizedAuthority}` (e.g. `agenthost-myhost__3000`). Identifies the provider instance, shared across all agents on the same host.
- **Backend session URI** — `{agentProvider}:///{rawId}` (e.g. `copilot:///abc123`). Used for protocol operations like `disposeSession`, reconstructed via `AgentSession.uri()`.

## Browse Actions

- **"Folders"** — Opens a file dialog scoped to the agent host filesystem (`agent-host://` scheme)

## New Session Behavior

`createNewSession(workspace)` creates a minimal `ISession` object literal (not a class instance) with:
- All observable fields initialized via `observableValue()`
- Status set to `SessionStatus.Untitled`
- Session type set to the first advertised agent type from the host
- Workspace label derived from the URI path

## Connection Management

- `setConnection(connection, defaultDirectory?)` — Wires a live agent host connection; dynamically discovers session types from the host's root state agents
- `clearConnection()` — Clears the connection when the host disconnects
- Handles session notifications (`notify/sessionAdded`, `notify/sessionRemoved`) and state changes
- Fires `onDidChangeSessionTypes` when the host's agent list changes

## Stubbed Operations

- `deleteChat` — No-op (agent host sessions don't support deleting individual chats)

## Send Flow

1. Requires an active connection
2. Validates session is the current new session
3. Opens the chat widget and loads the session model
4. Sends the request through the chat service (delegates to `AgentHostSessionHandler`)
5. Adds the untitled session to the pending set
6. Waits for a real backend session to appear via notification
7. Returns committed session or keeps temp visible on timeout
8. Fires `onDidReplaceSession` when the real session replaces the temporary one
