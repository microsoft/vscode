# Sessions Provider Architecture

## Overview

The Sessions Provider architecture introduces an **extensible provider model** for managing agent sessions in the Sessions window. Instead of hardcoding session types and backends, multiple providers register with a central registry (`ISessionsProvidersService`), which aggregates sessions from all providers and routes actions to the correct one.

This design allows new compute environments (remote agent hosts, cloud backends, third-party agents) to plug in without modifying core session management code.

### Architectural Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                            │
│  (SessionsView, TitleBar, NewSession, ChatWidget)               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsManagementService│  ← High-level orchestration
                │  (active session, send,  │     context keys, provider
                │   session types, etc.)   │     selection
                └───────────┬──────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsProvidersService │  ← Central registry & router
                │  (register, aggregate,   │
                │   route by session ID)   │
                └──────┬──────────┬────────┘
                       │          │
          ┌────────────▼──┐  ┌───▼──────────────────┐
          │  CopilotChat  │  │ RemoteAgentHost       │
          │  Sessions     │  │ Sessions Provider     │
          │  Provider     │  │ (one per connection)  │
          └───────┬───────┘  └──────────┬────────────┘
                  │                     │
          ┌───────▼───────┐  ┌──────────▼────────────┐
          │ AgentSessions │  │  Agent Host Connection │
          │ Service /     │  │  (WebSocket, HTTP)     │
          │ ChatService   │  │                        │
          └───────────────┘  └────────────────────────┘
```

## Core Interfaces

### `ISessionData` — Universal Session Facade

**File:** `src/vs/sessions/contrib/sessions/common/sessionData.ts`

The common session interface exposed by all providers. It is a self-contained facade — consumers should not reach back to underlying services to resolve additional data. All mutable properties are **observables** for reactive UI binding.

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string` | Globally unique ID in the format `providerId:localId` |
| `resource` | `URI` | Resource URI identifying this session |
| `providerId` | `string` | ID of the owning provider |
| `sessionType` | `string` | Session type ID (e.g., `'background'`, `'cloud'`) |
| `icon` | `ThemeIcon` | Display icon |
| `createdAt` | `Date` | Creation timestamp |
| `workspace` | `IObservable<ISessionWorkspace \| undefined>` | Workspace info (repositories, label, icon) |
| `title` | `IObservable<string>` | Display title (auto-titled or renamed) |
| `updatedAt` | `IObservable<Date>` | Last update timestamp |
| `status` | `IObservable<SessionStatus>` | Current status (Untitled, InProgress, NeedsInput, Completed, Error) |
| `changes` | `IObservable<readonly IChatSessionFileChange[]>` | File changes produced by the session |
| `modelId` | `IObservable<string \| undefined>` | Selected model identifier |
| `mode` | `IObservable<{id, kind} \| undefined>` | Selected mode identifier and kind |
| `loading` | `IObservable<boolean>` | Whether the session is initializing |
| `isArchived` | `IObservable<boolean>` | Archive state |
| `isRead` | `IObservable<boolean>` | Read/unread state |
| `description` | `IObservable<string \| undefined>` | Status description (e.g., current agent action) |
| `lastTurnEnd` | `IObservable<Date \| undefined>` | When the last agent turn ended |
| `pullRequestUri` | `IObservable<URI \| undefined>` | Associated pull request URI |

#### Supporting Types

**`ISessionWorkspace`** — Workspace information for a session:
- `label: string` — Display label (e.g., "my-app", "org/repo")
- `icon: ThemeIcon` — Workspace icon
- `repositories: ISessionRepository[]` — One or more repositories

**`ISessionRepository`** — A repository within a workspace:
- `uri: URI` — Source repository URI (`file://` or `github-remote-file://`)
- `workingDirectory: URI | undefined` — Worktree or checkout path
- `detail: string | undefined` — Provider-chosen display detail (e.g., branch name)
- `baseBranchProtected: boolean | undefined` — Whether the base branch is protected

**`SessionStatus`** — Enum: `Untitled`, `InProgress`, `NeedsInput`, `Completed`, `Error`

---

### `ISessionsProvider` — Provider Contract

**File:** `src/vs/sessions/contrib/sessions/browser/sessionsProvider.ts`

A sessions provider encapsulates a compute environment. It owns workspace discovery, session creation, session listing, and picker contributions. One provider can serve multiple session types, and multiple provider instances can serve the same session type (e.g., one per remote agent host).

#### Identity

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique provider instance ID (e.g., `'default-copilot'`, `'agenthost-hostA-copilot'`) |
| `label` | `string` | Display label |
| `icon` | `ThemeIcon` | Provider icon |
| `sessionTypes` | `readonly ISessionType[]` | Session types this provider supports |

#### Workspace Discovery

| Member | Description |
|--------|-------------|
| `browseActions: readonly ISessionsBrowseAction[]` | Actions shown in the workspace picker (e.g., "Browse Folders...", "Browse Repositories...") |
| `resolveWorkspace(repositoryUri: URI): ISessionWorkspace` | Resolve a URI to a session workspace with label and icon |

#### Session Listing

| Member | Description |
|--------|-------------|
| `getSessions(): ISessionData[]` | Returns all sessions owned by this provider |
| `onDidChangeSessions: Event<ISessionsChangeEvent>` | Fires when sessions are added, removed, or changed |

#### Session Lifecycle

| Method | Description |
|--------|-------------|
| `createNewSession(workspace)` | Create a new session for a given workspace |
| `setSessionType(sessionId, type)` | Change the session type |
| `getSessionTypes(session)` | Get available session types for a session |
| `renameSession(sessionId, title)` | Rename a session |
| `setModel(sessionId, modelId)` | Set the model |
| `archiveSession(sessionId)` | Archive a session |
| `unarchiveSession(sessionId)` | Unarchive a session |
| `deleteSession(sessionId)` | Delete a session |
| `setRead(sessionId, read)` | Mark read/unread |

#### Send

| Method | Description |
|--------|-------------|
| `sendRequest(sessionId, options)` | Send the initial request for a new session; returns the created `ISessionData` |

#### Supporting Types

**`ISessionType`** — A platform-level session type identifying an agent backend:
- `id: string` — Unique identifier (e.g., `'background'`, `'cloud'`)
- `label: string` — Display label
- `icon: ThemeIcon` — Icon
- `requiresWorkspaceTrust?: boolean` — Whether workspace trust is required

**`ISessionsBrowseAction`** — A browse action shown in the workspace picker:
- `label`, `icon`, `providerId`
- `execute(): Promise<ISessionWorkspace | undefined>` — Opens the browse dialog

**`ISessionsChangeEvent`** — Change event:
- `added: readonly ISessionData[]`
- `removed: readonly ISessionData[]`
- `changed: readonly ISessionData[]`

**`ISendRequestOptions`** — Send request options:
- `query: string` — Query text
- `attachedContext?: IChatRequestVariableEntry[]` — Optional attached context entries

---

### `ISessionsProvidersService` — Central Registry & Aggregator

**File:** `src/vs/sessions/contrib/sessions/browser/sessionsProvidersService.ts`

Central service that aggregates sessions across all registered providers. Owns the provider registry, unified session list, and routes session actions to the correct provider.

#### Provider Registry

| Member | Description |
|--------|-------------|
| `registerProvider(provider): IDisposable` | Register a provider; returns disposable to unregister |
| `getProviders(): ISessionsProvider[]` | Get all registered providers |
| `onDidChangeProviders: Event<void>` | Fires when providers are added or removed |

#### Session Types

| Member | Description |
|--------|-------------|
| `getSessionTypesForProvider(providerId)` | Get session types from a specific provider |
| `getSessionTypes(session)` | Get session types available for a session |

#### Aggregated Sessions

| Member | Description |
|--------|-------------|
| `getSessions(): ISessionData[]` | Get all sessions from all providers |
| `getSession(sessionId): ISessionData \| undefined` | Look up a session by its globally unique ID |
| `onDidChangeSessions: Event<ISessionsChangeEvent>` | Fires when sessions change across any provider |

#### Routed Actions

Actions are automatically routed to the correct provider by extracting the provider ID from the session ID:

- `archiveSession(sessionId)`
- `unarchiveSession(sessionId)`
- `deleteSession(sessionId)`
- `renameSession(sessionId, title)`
- `setRead(sessionId, read)`
- `resolveWorkspace(providerId, repositoryUri)`

#### Session ID Format

Session IDs use the format `${providerId}:${localId}`, where `providerId` identifies the owning provider and `localId` is a provider-scoped identifier (typically the session resource URI string). The separator `:` allows the registry to parse the provider ID for routing.

---

### `ISessionsManagementService` — High-Level Orchestration

**File:** `src/vs/sessions/contrib/sessions/browser/sessionsManagementService.ts`

Coordinates active session tracking, provider selection, and user workflows. Sits above the providers service and adds UI-facing concerns.

#### Key Responsibilities

- **Active session tracking** — `activeSession: IObservable<ISessionData | undefined>` tracks the currently selected session
- **Provider selection** — `activeProviderId: IObservable<string | undefined>` auto-selects when one provider exists, persists to storage
- **Context keys** — Manages `isNewChatSession`, `activeSessionProviderId`, `activeSessionType`, `isActiveSessionBackgroundProvider`
- **Session creation** — `createNewSession(providerId, workspace)` delegates to the correct provider
- **Send orchestration** — `sendRequest(session, options)` sends through the provider and manages state transitions
- **GitHub context** — `getGitHubContext(session)` derives owner/repo/PR info from session metadata
- **File resolution** — `resolveSessionFileUri(sessionResource, relativePath)` resolves file paths within session worktrees

---

## Provider Implementations

### `CopilotChatSessionsProvider` — Default Copilot Provider

**File:** `src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`

The default sessions provider, registered with ID `'default-copilot'`. Wraps the existing agent session infrastructure into the extensible provider model. Supports two session types: **Copilot CLI** (local) and **Copilot Cloud** (remote).

#### Registration

Registered via `DefaultSessionsProviderContribution` workbench contribution at `WorkbenchPhase.AfterRestored`:

```
src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessions.contribution.ts
```

```typescript
class DefaultSessionsProviderContribution extends Disposable {
    constructor(instantiationService, sessionsProvidersService) {
        const provider = instantiationService.createInstance(CopilotChatSessionsProvider);
        sessionsProvidersService.registerProvider(provider);
    }
}
```

#### Identity

| Property | Value |
|----------|-------|
| `id` | `'default-copilot'` |
| `label` | `'Copilot Chat'` |
| `icon` | `Codicon.copilot` |
| `sessionTypes` | `[CopilotCLISessionType, CopilotCloudSessionType]` |

#### Browse Actions

- **"Browse Folders..."** — Opens a folder dialog; creates a workspace with a `file://` URI
- **"Browse Repositories..."** — Executes `github.copilot.chat.cloudSessions.openRepository`; creates a workspace with a `github-remote-file://` URI

#### New Session Classes

When `createNewSession(workspace)` is called, the provider creates one of two concrete `ISessionData` implementations based on the workspace URI scheme:

**`CopilotCLISession`** — For local `file://` workspaces:
- Implements `ISessionData` plus provider-specific observable fields (`permissionLevel`, `branchObservable`, `isolationModeObservable`)
- Performs async git repository resolution during construction (sets `loading` to true until resolved)
- Configuration methods: `setIsolationMode()`, `setBranch()`, `setModelId()`, `setMode()`, `setPermissionLevel()`, `setModeById()`
- Tracks selected options via `Map<string, IChatSessionProviderOptionItem>` and syncs to `IChatSessionsService`
- Uses `IGitService` to open the repository and resolve branch information

**`RemoteNewSession`** — For cloud `github-remote-file://` workspaces:
- Implements `ISessionData`
- Manages dynamic option groups from `IChatSessionsService.getOptionGroupsForSessionType()` with `when` clause visibility
- No-ops for isolation/branch/client mode (cloud-managed)
- Provides `getModelOptionGroup()`, `getOtherOptionGroups()` for UI to render provider-specific pickers
- Watches context key changes to dynamically show/hide option groups

#### `AgentSessionAdapter` — Wrapping Existing Sessions

Adapts an existing `IAgentSession` from the chat layer into the `ISessionData` facade:
- Constructs with initial values from the agent session's metadata and timing
- `update(session)` performs a batched observable transaction to update all reactive properties
- Extracts workspace info, changes, description, and PR URI from session metadata
- Maps `ChatSessionStatus` → `SessionStatus`
- Handles both CLI and Cloud session metadata formats for repository resolution

#### Session Cache & Change Events

The provider maintains a `Map<string, AgentSessionAdapter>` cache keyed by resource URI:
- `_ensureSessionCache()` performs lazy initialization
- `_refreshSessionCache()` diffs current `IAgentSession` list against the cache, producing `added`, `removed`, and `changed` arrays
- Changed adapters are updated in-place via `adapter.update(session)`
- Change events are forwarded through `onDidChangeSessions`

#### Send Flow

1. Validate the session is a current new session (`CopilotCLISession` or `RemoteNewSession`)
2. Resolve mode, permission level, and send options from session configuration
3. Get or create a chat session via `IChatSessionsService`
4. Open the chat widget via `IChatWidgetService.openSession()`
5. Load the session model and apply selected model, mode, and options
6. Send the request via `IChatService.sendRequest()`
7. Wait for a new `IAgentSession` to appear in `IAgentSessionsService.model.sessions`
8. Wrap the new agent session as `AgentSessionAdapter` and return it
9. Clear the current new session reference

---

### `RemoteAgentHostSessionsProvider` — Remote Agent Host Provider

**File:** `src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts`

A sessions provider for a single agent on a remote agent host connection. One instance is created per agent discovered on each connection.

#### Registration

Registered dynamically by `RemoteAgentHostContribution`:

```
src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHost.contribution.ts
```

- Monitors `IRemoteAgentHostService.onDidChangeConnections`
- Creates one `RemoteAgentHostSessionsProvider` per agent per connection
- Registers via `sessionsProvidersService.registerProvider(sessionsProvider)` into a per-agent `DisposableStore`
- Disposes providers when connections are removed

#### Identity

| Property | Format |
|----------|--------|
| `id` | `'agenthost-${sanitizedAuthority}-${agentProvider}'` |
| `label` | Connection name or `'${agentProvider} (${address})'` |
| `icon` | `Codicon.remote` |
| `sessionTypes` | `[CopilotCLISessionType]` (reuses the platform type) |

#### Browse Actions

- **"Browse Remote Folders..."** — Opens a file dialog scoped to the agent host filesystem (`agent-host://` scheme)

#### New Session Behavior

`createNewSession(workspace)` creates a minimal `ISessionData` object literal (not a class instance) with:
- All observable fields initialized via `observableValue()`
- Status set to `SessionStatus.Untitled`
- Workspace label derived from the URI path

#### Stubbed Operations

Most session actions are no-ops because session lifecycle is managed by the existing `AgentHostSessionHandler` and `AgentHostSessionListController`, which are registered separately by the contribution:
- `archiveSession` / `unarchiveSession` / `deleteSession` / `renameSession` / `setRead` — no-op
- `sendRequest` — throws (handled by the session handler)
- `getSessions()` — returns empty array (managed by the list controller)

---

## Data Flow: Session Lifecycle

### Creating a New Session

```
1. User picks a workspace in the workspace picker
   → SessionsManagementService.createNewSession(providerId, workspace)
   → Looks up provider by ID in SessionsProvidersService
   → Calls provider.createNewSession(workspace)
   → Provider creates CopilotCLISession (file://) or RemoteNewSession (github-remote-file://)
   → Returns ISessionData, sets as activeSession observable

2. User configures session (model, isolation mode, branch)
   → Modifies observable fields on the new session object
   → Selections synced to IChatSessionsService via setOption()

3. User types a message and sends
   → SessionsManagementService.sendRequest(session, {query, attachedContext})
   → Delegates to provider.sendRequest(sessionId, options)
   → Provider opens chat widget, applies config, sends through IChatService
   → Waits for IAgentSession to appear in the model
   → Wraps as AgentSessionAdapter, caches it
   → Returns new ISessionData
   → isNewChatSession context → false
```

### Session Change Propagation

```
Agent session state changes (turn complete, status update, etc.)
  → AgentSessionsService.model.onDidChangeSessions
  → CopilotChatSessionsProvider._refreshSessionCache()
    - Diffs current IAgentSession list vs cache
    - Updates existing AgentSessionAdapter observables
    - Creates/removes entries as needed
    - Fires onDidChangeSessions { added, removed, changed }
  → SessionsProvidersService forwards the event
  → SessionsManagementService forwards and updates active session
  → UI re-renders via observable subscriptions
```

### Session ID Routing

When the management service or UI invokes an action (e.g., `archiveSession`):

```
sessionId = "default-copilot:background:///untitled-abc123"
           ├──────────────┤ ├──────────────────────────────┤
            provider ID      local ID (resource URI string)

SessionsProvidersService._resolveProvider(sessionId)
  → Splits at first ':'
  → Looks up provider 'default-copilot' in the registry
  → Delegates to provider.archiveSession(sessionId)
```

---

## Context Keys

| Context Key | Type | Description |
|-------------|------|-------------|
| `isNewChatSession` | `boolean` | `true` when viewing the new-session form (no established session selected) |
| `activeSessionProviderId` | `string` | Provider ID of the active session (e.g., `'default-copilot'`) |
| `activeSessionType` | `string` | Session type of the active session (e.g., `'background'`, `'cloud'`) |
| `isActiveSessionBackgroundProvider` | `boolean` | Whether the active session uses the background agent provider |

---

## Adding a New Provider

To add a new sessions provider:

1. **Implement `ISessionsProvider`** with a unique `id`, supported `sessionTypes`, and `browseActions`
2. **Create session data classes** implementing `ISessionData` with observable properties for the new session type
3. **Register via a workbench contribution** at `WorkbenchPhase.AfterRestored`:
   ```typescript
   class MyProviderContribution extends Disposable implements IWorkbenchContribution {
       constructor(
           @IInstantiationService instantiationService: IInstantiationService,
           @ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
       ) {
           super();
           const provider = this._register(instantiationService.createInstance(MyProvider));
           this._register(sessionsProvidersService.registerProvider(provider));
       }
   }
   registerWorkbenchContribution2(MyProviderContribution.ID, MyProviderContribution, WorkbenchPhase.AfterRestored);
   ```
4. Session IDs must use the format `${providerId}:${localId}` so the registry can route actions correctly
5. Fire `onDidChangeSessions` when sessions are added, removed, or updated
6. The provider's `browseActions` will automatically appear in the workspace picker
7. The provider's `sessionTypes` will be available for session type selection
