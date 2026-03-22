# Remote Agent Host Chat Agents - Architecture

This document describes how remote agent host chat agents are registered, how
sessions are created, and the URI/target conventions used throughout the system.

## Overview

A **remote agent host** is a VS Code agent host process running on another
machine, connected over WebSocket. The user configures remote addresses in the
`chat.remoteAgentHosts` setting. Each remote host may expose one or more agent
backends (currently only the `copilot` provider is supported). The system
discovers these agents, dynamically registers them as chat session types, and
creates sessions that stream turns via the agent host protocol.

```
┌─────────────┐    WebSocket     ┌───────────────────┐
│  VS Code    │ ◄──────────────► │ Remote Agent Host │
│  (client)   │   AHP protocol   │  (server)         │
└─────────────┘                  └───────────────────┘
```

## Connection Lifecycle

### 1. Configuration

Connections are configured via the `chat.remoteAgentHosts` setting:

```jsonc
"chat.remoteAgentHosts": [
  { "address": "http://192.168.1.10:3000", "name": "dev-box", "connectionToken": "..." }
]
```

Each entry is an `IRemoteAgentHostEntry` with `address`, `name`, and optional
`connectionToken`.

### 2. Service Layer

`IRemoteAgentHostService` (`src/vs/platform/agentHost/common/remoteAgentHostService.ts`)
manages WebSocket connections. The Electron implementation reads the setting,
creates `RemoteAgentHostProtocolClient` instances for each address, and fires
`onDidChangeConnections` when connections are established or lost.

Each connection satisfies the `IAgentConnection` interface (which extends
`IAgentService`), providing:

- `subscribe(resource)` / `unsubscribe(resource)` - state subscriptions
- `dispatchAction(action, clientId, seq)` - send client actions
- `onDidAction` / `onDidNotification` - receive server events
- `createSession(config)` - create a new backend session
- `browseDirectory(uri)` - list remote filesystem contents
- `clientId` - unique connection identifier for optimistic reconciliation

### 3. Connection Metadata

Each active connection exposes `IRemoteAgentHostConnectionInfo`:

```typescript
{
  address: string;        // e.g. "http://192.168.1.10:3000"
  name: string;           // e.g. "dev-box" (from setting)
  clientId: string;       // assigned during handshake
  defaultDirectory?: string; // home directory on the remote machine
}
```

## Agent Discovery

### Root State Subscription

`RemoteAgentHostContribution` (`src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHost.contribution.ts`)
is the central orchestrator. For each connection, it subscribes to `ROOT_STATE_URI`
(`agenthost:/root`) to discover available agents.

The root state (`IRootState`) contains:

```typescript
{
  agents: IAgentInfo[];       // discovered agent backends
  activeSessions?: number;    // count of active sessions
}
```

Each `IAgentInfo` describes an agent:

```typescript
{
  provider: string;           // e.g. "copilot"
  displayName: string;        // e.g. "Copilot"
  description: string;
  models: ISessionModelInfo[]; // available language models
}
```

### Authority Encoding

Remote addresses are encoded into URI-safe authority strings via
`agentHostAuthority(address)`:

- Alphanumeric addresses pass through unchanged
- "Normal" addresses (`[a-zA-Z0-9.:-]`) get colons replaced with `__`
- Everything else is url-safe base64 encoded with a `b64-` prefix

Examples:
- `localhost:8081` → `localhost__8081`
- `192.168.1.1:8080` → `192.168.1.1__8080`
- `http://127.0.0.1:3000` → `b64-aHR0cDovLzEyNy4wLjAuMTozMDAw`

## Agent Registration

When `_registerAgent()` is called for a discovered copilot agent from address `X`:

### Naming Conventions

| Concept | Value | Example |
|---------|-------|---------|
| **Authority** | `agentHostAuthority(address)` | `localhost__8081` |
| **Session type** | `remote-${authority}-${provider}` | `remote-localhost__8081-copilot` |
| **Agent ID** | same as session type | `remote-localhost__8081-copilot` |
| **Vendor** | same as session type | `remote-localhost__8081-copilot` |
| **Display name** | `configuredName \|\| "${displayName} (${address})"` | `dev-box` |

### Four Registrations Per Agent

1. **Chat session contribution** - via `IChatSessionsService.registerChatSessionContribution()`:
   ```typescript
   { type: sessionType, name: agentId, displayName, canDelegate: true, requiresCustomModels: true }
   ```

2. **Session list controller** - `AgentHostSessionListController` handles the
   sidebar session list. Lists sessions via `connection.listSessions()`, listens
   for `notify/sessionAdded` and `notify/sessionRemoved` notifications.

3. **Session handler** - `AgentHostSessionHandler` implements
   `IChatSessionContentProvider`, bridging the agent host protocol to chat UI
   progress events. Also registers a _dynamic chat agent_ via
   `IChatAgentService.registerDynamicAgent()`.

4. **Language model provider** - `AgentHostLanguageModelProvider` registers
   models under the vendor descriptor. Model IDs are prefixed with the session
   type (e.g., `remote-localhost__8081-copilot:claude-sonnet-4-20250514`).

## URI Conventions

| Context | Scheme | Format | Example |
|---------|--------|--------|---------|
| New session resource | `<sessionType>` | `<sessionType>:/untitled-<uuid>` | `remote-localhost__8081-copilot:/untitled-abc` |
| Existing session | `<sessionType>` | `<sessionType>:/<rawId>` | `remote-localhost__8081-copilot:/abc-123` |
| Backend session state | `<provider>` | `<provider>:/<rawId>` | `copilot:/abc-123` |
| Root state subscription | (string) | `agenthost:/root` | - |
| Remote filesystem | `agenthost` | `agenthost://<authority>/<path>` | `agenthost://localhost__8081/home/user/project` |
| Language model ID | - | `<sessionType>:<rawModelId>` | `remote-localhost__8081-copilot:claude-sonnet-4-20250514` |

### Key distinction: session resource vs backend session URI

- The **session resource** URI uses the session type as its scheme
  (e.g., `remote-localhost__8081-copilot:/untitled-abc`). This is the URI visible to
  the chat UI and session management.
- The **backend session** URI uses the provider as its scheme
  (e.g., `copilot:/abc-123`). This is sent over the agent host protocol to the
  server. The `AgentSession.uri(provider, rawId)` helper creates these.

The `AgentHostSessionHandler` translates between the two:
```typescript
private _resolveSessionUri(sessionResource: URI): URI {
    const rawId = sessionResource.path.substring(1);
    return AgentSession.uri(this._config.provider, rawId);
}
```

## Session Creation Flow

### 1. User Selects or Adds a Remote Workspace

In the `WorkspacePicker`, the user clicks **"Browse Remotes..."**. The picker
shows existing connected remotes and an **"Add Remote..."** action. When the
user chooses **"Add Remote..."**, they:

1. Paste a host, `host:port`, or WebSocket URL.
2. Enter a display name for that remote.
3. The parsed address is written into `chat.remoteAgentHosts`.
4. The client waits for the new remote connection to come up.
5. The user is immediately taken into the remote folder picker.

Supported address inputs include raw `host:port`, `ws://` / `wss://` URLs, and
log-line text such as `Listening on ws://127.0.0.1:8089`. If the input includes
`?tkn=...`, the token is extracted into `connectionToken` and the stored address
is normalized without that query parameter.

After choosing an existing remote or successfully adding a new one, the user
picks a folder on the remote filesystem. This produces a `SessionWorkspace`
with an `agenthost://` URI:

```
agenthost://localhost__8081/home/user/myproject
                ↑ authority            ↑ remote filesystem path
```

### 2. Session Target Resolution

`NewChatWidget._createNewSession()` detects `project.isRemoteAgentHost` and
resolves the matching session type via `getRemoteAgentHostSessionTarget()`
(defined in `remoteAgentHost.contribution.ts`):

```typescript
// authority "localhost__8081" → find connection → "remote-localhost__8081-copilot"
const target = getRemoteAgentHostSessionTarget(connections, authority);
```

### 3. Resource URI Generation

`getResourceForNewChatSession()` creates the session resource:

```typescript
URI.from({ scheme: target, path: `/untitled-${generateUuid()}` })
// → remote-localhost__8081-copilot:/untitled-abc-123
```

### 4. Session Object Creation

`SessionsManagementService.createNewSessionForTarget()` creates an
`AgentHostNewSession` (when the `agentHost` option is set). This is a
lightweight `INewSession` that supports local model and mode pickers but
skips isolation mode, branch, and cloud option groups.
The project URI is set on the session, making it available as
`activeSessionItem.repository`.

### 5. Backend Session Creation (Deferred)

`AgentHostSessionHandler` defers backend session creation until the first turn
(for "untitled" sessions), so the user-selected model is available:

```typescript
const session = await connection.createSession({
    model: rawModelId,
    provider: 'copilot',
    workingDirectory: '/home/user/myproject',  // from activeSession.repository.path
});
```

### 6. Working Directory Resolution

The `resolveWorkingDirectory` callback in `RemoteAgentHostContribution` reads
the active session's repository URI path:

```typescript
const resolveWorkingDirectory = (resourceKey: string): string | undefined => {
    const activeSessionItem = this._sessionsManagementService.getActiveSession();
    if (activeSessionItem?.repository) {
        return activeSessionItem.repository.path;
        // For agenthost://authority/home/user/project → "/home/user/project"
    }
    return undefined;
};
```

## Turn Handling

When the user sends a message, `AgentHostSessionHandler._handleTurn()`:

1. Converts variable entries to `IAgentAttachment[]` (file, directory, selection)
2. Dispatches `session/modelChanged` if the model differs from current
3. Dispatches `session/turnStarted` with the user message + attachments
4. Listens to `SessionClientState.onDidChangeSessionState` and translates
   the `activeTurn` state changes into `IChatProgress[]` events:

| Server State | Chat Progress |
|-------------|---------------|
| `streamingText` | `markdownContent` |
| `reasoning` | `thinking` |
| `toolCalls` (new) | `ChatToolInvocation` created |
| `toolCalls` (completed) | `ChatToolInvocation` finalized |
| `pendingPermissions` | `awaitConfirmation()` prompt |

5. On cancellation, dispatches `session/turnCancelled`

## Filesystem Provider

`AgentHostFileSystemProvider` is a read-only `IFileSystemProvider` registered
under the `agenthost` scheme. It proxies `stat` and `readdir` calls through
`connection.browseDirectory(uri)` RPC.

- The URI authority identifies the remote connection (sanitized address)
- The URI path is the remote filesystem path
- Authority-to-address mappings are registered by `RemoteAgentHostContribution`
  via `registerAuthority(authority, address)`

## Data Flow Diagram

```
Settings (chat.remoteAgentHosts)
  │
  ▼
RemoteAgentHostService (WebSocket connections)
  │
  ▼
RemoteAgentHostContribution
  │
  ├─► subscribe(ROOT_STATE_URI) → IRootState.agents
  │     │
  │     ▼
  │   _registerAgent() for each copilot agent:
  │     ├─► registerChatSessionContribution()
  │     ├─► registerChatSessionItemController()
  │     ├─► registerChatSessionContentProvider()
  │     └─► registerLanguageModelProvider()
  │
  └─► registerProvider(AGENT_HOST_FS_SCHEME, fsProvider)

User picks remote workspace in WorkspacePicker
  │
  ▼
NewChatWidget._createNewSession(project)
  │  target = getRemoteAgentHostSessionTarget(connections, authority)
  ▼
SessionsManagementService.createNewSessionForTarget()
  │  creates AgentHostNewSession
  ▼
User sends message
  │
  ▼
AgentHostSessionHandler._handleTurn()
  │  resolves working directory
  │  creates backend session (if untitled)
  │  dispatches session/turnStarted
  ▼
connection ← streams state changes → IChatProgress[]
```
