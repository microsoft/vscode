# Sessions Provider Architecture

## Overview

The Sessions Provider architecture introduces an **extensible provider model** for managing agent sessions in the Agent Sessions window. Instead of hardcoding session types and backends, multiple providers register with a central registry (`ISessionsProvidersService`), and the management service (`ISessionsManagementService`) aggregates sessions from all providers and routes actions to the correct one.

This design allows new compute environments (remote agent hosts, cloud backends, third-party agents) to plug in without modifying core session management code.

### Architectural Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                            │
│  (SessionsView, TitleBar, NewSession, Changes | Terminal)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsManagementService│  ← High-level orchestration
                │  (active session, send,  │     context keys, session
                │   session types, etc.)   │     aggregation & routing
                └───────────┬──────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsProvidersService │  ← Central registry
                │  (register providers,    │
                │   lookup by ID)          │
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

### `ISession` — Universal Session Facade

**File:** `src/vs/sessions/services/sessions/common/session.ts`

The common session interface exposed by all providers. It is a self-contained facade — consumers should not reach back to underlying services to resolve additional data. All mutable properties are **observables** for reactive UI binding. A session groups one or more chats together; `ISession` fields are propagated from the primary (first) chat.

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string` | Globally unique ID in the format `providerId:localId` |
| `resource` | `URI` | Resource URI identifying this session |
| `providerId` | `string` | ID of the owning provider |
| `sessionType` | `string` | Session type ID (e.g., `'copilot-cli'`, `'copilot-cloud'`) |
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
| `description` | `IObservable<IMarkdownString \| undefined>` | Status description (e.g., current agent action), supports markdown |
| `lastTurnEnd` | `IObservable<Date \| undefined>` | When the last agent turn ended |
| `gitHubInfo` | `IObservable<IGitHubInfo \| undefined>` | GitHub owner/repo/PR info associated with the session |
| `chats` | `IObservable<readonly IChat[]>` | The chats belonging to this session group |
| `mainChat` | `IChat` | The main (first) chat of this session |

#### Supporting Types

**`ISessionWorkspace`** — Workspace information for a session:
- `label: string` — Display label (e.g., "my-app", "org/repo")
- `icon: ThemeIcon` — Workspace icon
- `repositories: ISessionRepository[]` — One or more repositories
- `requiresWorkspaceTrust: boolean` — Whether workspace trust is required to operate

**`ISessionRepository`** — A repository within a workspace:
- `uri: URI` — Source repository URI (`file://` or `github-remote-file://`)
- `workingDirectory: URI | undefined` — Worktree or checkout path
- `detail: string | undefined` — Provider-chosen display detail (e.g., branch name)
- `baseBranchName: string | undefined` — Name of the base branch
- `baseBranchProtected: boolean | undefined` — Whether the base branch is protected

**`IGitHubInfo`** — GitHub information associated with a session:
- `owner: string` — GitHub repository owner
- `repo: string` — GitHub repository name
- `pullRequest?: { number: number; uri: URI; icon?: ThemeIcon }` — Associated pull request

**`IChat`** — A single chat within a session:
- `resource: URI` — Resource URI identifying this chat
- `createdAt: Date` — When the chat was created
- `title: IObservable<string>` — Chat display title
- `updatedAt: IObservable<Date>` — When the chat was last updated
- `status: IObservable<SessionStatus>` — Current chat status
- `changes: IObservable<readonly IChatSessionFileChange[]>` — File changes
- `modelId: IObservable<string | undefined>` — Selected model
- `mode: IObservable<{ id: string; kind: string } | undefined>` — Selected mode
- `isArchived: IObservable<boolean>` — Archive state
- `isRead: IObservable<boolean>` — Read/unread state
- `description: IObservable<IMarkdownString | undefined>` — Status description
- `lastTurnEnd: IObservable<Date | undefined>` — When the last agent turn ended

**`SessionStatus`** — Enum: `Untitled`, `InProgress`, `NeedsInput`, `Completed`, `Error`

---

### `ISessionsProvider` — Provider Contract

**File:** `src/vs/sessions/services/sessions/common/sessionsProvider.ts`

A sessions provider encapsulates a compute environment. It owns workspace discovery, session creation, session listing, and picker contributions. One provider can serve multiple session types, and multiple provider instances can serve the same session type (e.g., one per remote agent host).

#### Identity

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique provider instance ID (e.g., `'default-copilot'`, `'agenthost-hostA'`) |
| `label` | `string` | Display label |
| `icon` | `ThemeIcon` | Provider icon |
| `sessionTypes` | `readonly ISessionType[]` | Session types this provider supports |
| `onDidChangeSessionTypes?` | `Event<void>` | Optional; fires when session types change dynamically (e.g., a remote host advertises a new agent) |

#### Workspace Discovery

| Member | Description |
|--------|-------------|
| `browseActions: readonly ISessionWorkspaceBrowseAction[]` | Actions shown in the workspace picker (e.g., "Folders", "Repositories") |
| `resolveWorkspace(repositoryUri: URI): ISessionWorkspace` | Resolve a URI to a session workspace with label and icon |

#### Session Listing

| Member | Description |
|--------|-------------|
| `getSessions(): ISession[]` | Returns all sessions owned by this provider |
| `onDidChangeSessions: Event<ISessionChangeEvent>` | Fires when sessions are added, removed, or changed |
| `onDidReplaceSession?: Event<{ from: ISession; to: ISession }>` | Optional; fires when a temporary (untitled) session is atomically replaced by a committed session after the first turn |

#### Session Lifecycle

| Method | Description |
|--------|-------------|
| `createNewSession(workspace)` | Create a new session for a given workspace |
| `setSessionType(sessionId, type)` | Change the session type; returns the updated `ISession` |
| `getSessionTypes(sessionId)` | Get available session types for a session |
| `renameChat(sessionId, chatUri, title)` | Rename a chat within a session |
| `setModel(sessionId, modelId)` | Set the model |
| `archiveSession(sessionId)` | Archive a session |
| `unarchiveSession(sessionId)` | Unarchive a session |
| `deleteSession(sessionId)` | Delete a session |
| `deleteChat(sessionId, chatUri)` | Delete a single chat from a session |
| `setRead(sessionId, read)` | Mark read/unread |

#### Send

| Method | Description |
|--------|-------------|
| `sendAndCreateChat(sessionId, options)` | Send a request, creating a new chat in the session; returns the updated `ISession` |

#### Supporting Types

**`ISessionType`** — A platform-level session type identifying an agent backend:
- `id: string` — Unique identifier (e.g., `'copilot-cli'`, `'copilot-cloud'`)
- `label: string` — Display label
- `icon: ThemeIcon` — Icon

**`ISessionWorkspaceBrowseAction`** — A browse action shown in the workspace picker:
- `label: string`, `icon: ThemeIcon`, `providerId: string`
- `run(): Promise<ISessionWorkspace | undefined>` — Opens the browse dialog

**`ISessionChangeEvent`** — Change event:
- `added: readonly ISession[]`
- `removed: readonly ISession[]`
- `changed: readonly ISession[]`

**`ISendRequestOptions`** — Send request options:
- `query: string` — Query text
- `attachedContext?: IChatRequestVariableEntry[]` — Optional attached context entries

---

### `ISessionsProvidersService` — Central Registry

**File:** `src/vs/sessions/services/sessions/browser/sessionsProvidersService.ts`

Central service that manages the provider registry. Providers register and unregister here; the service fires change events to notify consumers.

#### Provider Registry

| Member | Description |
|--------|-------------|
| `registerProvider(provider): IDisposable` | Register a provider; returns disposable to unregister |
| `getProviders(): ISessionsProvider[]` | Get all registered providers |
| `getProvider<T>(providerId): T \| undefined` | Get a specific provider by ID |
| `onDidChangeProviders: Event<ISessionsProvidersChangeEvent>` | Fires with `{ added, removed }` arrays when providers are registered or unregistered |

**Note:** The providers service is a pure registry. It does **not** aggregate sessions or route actions — that responsibility belongs to `ISessionsManagementService`.

**`ISessionsProvidersChangeEvent`**:
- `added: readonly ISessionsProvider[]`
- `removed: readonly ISessionsProvider[]`

---

### `ISessionsManagementService` — High-Level Orchestration

**File:** `src/vs/sessions/services/sessions/common/sessionsManagement.ts` (interface) / `src/vs/sessions/services/sessions/browser/sessionsManagementService.ts` (implementation)

Coordinates active session tracking, provider selection, and user workflows. Sits above the providers service and adds UI-facing concerns like context keys, session aggregation, and action routing.

#### Sessions

| Member | Description |
|--------|-------------|
| `getSessions(): ISession[]` | Get all sessions from all registered providers |
| `getSession(resource: URI): ISession \| undefined` | Look up a session by its resource URI |
| `getSessionTypes(session): ISessionType[]` | Get session types available for a session |
| `getAllSessionTypes(): ISessionType[]` | Get all session types from all registered providers |
| `onDidChangeSessionTypes: Event<void>` | Fires when available session types change |
| `onDidChangeSessions: Event<ISessionsChangeEvent>` | Fires when sessions change across any provider |

#### Active Session

| Member | Description |
|--------|-------------|
| `activeSession: IObservable<IActiveSession \| undefined>` | The currently active session (extends `ISession` with `activeChat: IObservable<IChat>`) |
| `activeProviderId: IObservable<string \| undefined>` | Auto-selects when one provider exists, persists to storage |
| `setActiveProvider(providerId)` | Set the active sessions provider by ID |
| `openSession(sessionResource, options?)` | Select an existing session as active |
| `openChat(session, chatUri)` | Open a specific chat within a session |
| `openNewSessionView()` | Switch to the new-session view |

#### Session Creation & Send

| Method | Description |
|--------|-------------|
| `createNewSession(providerId, workspace)` | Create a new session, delegates to the correct provider |
| `unsetNewSession()` | Unset the current new session |
| `sendAndCreateChat(session, options)` | Send a request, creating a new chat in the session |
| `setSessionType(session, type)` | Update the session type for a new session |

#### Context Keys Managed

The management service binds and updates these context keys:

| Context Key | Type | Description |
|-------------|------|-------------|
| `isNewChatSession` | `boolean` | `true` when viewing the new-session form |
| `activeSessionProviderId` | `string` | Provider ID of the active session |
| `activeSessionType` | `string` | Session type of the active session |
| `isActiveSessionBackgroundProvider` | `boolean` | Whether the active session uses the background agent provider |
| `isActiveSessionArchived` | `boolean` | Whether the active session is archived |
| `activeSessionSupportsMultiChat` | `boolean` | Whether the active session supports multiple chats |

---

## Multi-Chat Sessions

A session can contain **multiple chats** (conversations), controlled by the session's `capabilities.supportsMultipleChats` property. When enabled, users can start additional conversations within the same session, sharing its workspace context.

### Session–Chat Relationship

`ISession` groups one or more `IChat` instances:

```
ISession
├── mainChat: IChat              ← primary (first) chat
├── chats: IObservable<IChat[]>  ← all chats in creation order
├── capabilities                 ← session capabilities
│   └── supportsMultipleChats    ← whether this session supports multi-chat
└── session-level properties     ← derived from chats
```

**Property derivation from chats:**
- `title`, `changes`, `modelId`, `mode`, `loading`, `isArchived`, `description`, `gitHubInfo` — all come from `mainChat`
- `updatedAt` — latest `updatedAt` across all chats
- `status` — aggregated: `NeedsInput` > `InProgress` > other statuses
- `isRead` — `true` only when **all** chats are read
- `lastTurnEnd` — latest `lastTurnEnd` across all chats

### Context Keys

When the active session supports multi-chat (`capabilities.supportsMultipleChats` is `true`), the context key `activeSessionSupportsMultiChat` is set to `true`, enabling multi-chat UI elements (e.g., "New Chat" button).

### Active Chat Tracking

`IActiveSession` extends `ISession` with an `activeChat` observable:

```typescript
interface IActiveSession extends ISession {
    readonly activeChat: IObservable<IChat>;
}
```

- Initialized to the first chat when a session becomes active
- Updated when `openChat(session, chatUri)` is called to switch between chats
- Automatically updated to the latest chat when `sendAndCreateChat` creates a new one

### Multi-Chat Provider Methods

| Method | Description |
|--------|-------------|
| `sendAndCreateChat(sessionId, options)` | Creates a new chat in the session and sends the request. For new sessions this is the first chat; for existing sessions it adds another chat to the group. |
| `deleteChat(sessionId, chatUri)` | Deletes an individual chat; if only one chat remains, deletes the entire session |
| `renameChat(sessionId, chatUri, title)` | Renames a specific chat by its URI |
| `openChat(session, chatUri)` | Switches the active chat within the session (management service) |

---

## Data Flow: Session Lifecycle

### Creating a New Session

```
1. User picks a workspace in the workspace picker
   → SessionsManagementService.createNewSession(providerId, workspace)
   → Looks up provider by ID in SessionsProvidersService
   → Calls provider.createNewSession(workspace)
   → Provider creates CopilotCLISession (file://) or RemoteNewSession (github-remote-file://)
   → Returns ISession, sets as activeSession observable

2. User configures session (model, isolation mode, branch)
   → Modifies observable fields on the new session object
   → Selections synced to IChatSessionsService via setOption()

3. User types a message and sends
   → SessionsManagementService.sendAndCreateChat(session, {query, attachedContext})
   → Delegates to provider.sendAndCreateChat(sessionId, options)
   → Provider sends the request and returns the session
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

---

## Context Keys

### Session Provider Context Keys (managed by `SessionsManagementService`)

| Context Key | Type | Description |
|-------------|------|-------------|
| `isNewChatSession` | `boolean` | `true` when viewing the new-session form (no established session selected) |
| `activeSessionProviderId` | `string` | Provider ID of the active session (e.g., `'default-copilot'`) |
| `activeSessionType` | `string` | Session type of the active session (e.g., `'copilot-cli'`, `'copilot-cloud'`) |
| `isActiveSessionBackgroundProvider` | `boolean` | Whether the active session uses the background agent provider |
| `isActiveSessionArchived` | `boolean` | Whether the active session is archived (marked as done) |
| `activeSessionSupportsMultiChat` | `boolean` | Whether the active session's provider supports multiple chats per session |

### Other Session Context Keys (defined in `common/contextkeys.ts`)

| Context Key | Type | Description |
|-------------|------|-------------|
| `activeSessionHasGitRepository` | `boolean` | Whether the active session has an associated git repository |
| `chatSessionProviderId` | `string` | The provider ID of a session in context menu overlays |

---

## Adding a New Provider

To add a new sessions provider:

1. **Implement `ISessionsProvider`** with a unique `id`, supported `sessionTypes`, `capabilities`, and `browseActions`
2. **Create session data classes** implementing `ISession` with observable properties for the new session type
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
4. Session IDs must use the format `${providerId}:${localId}` so the management service can route actions correctly
5. Fire `onDidChangeSessions` when sessions are added, removed, or updated
6. Fire `onDidReplaceSession` when a temporary session is atomically replaced by a committed one
7. The provider's `browseActions` will automatically appear in the workspace picker
8. The provider's `sessionTypes` will be available for session type selection
