# Sessions Architecture

## Overview

The sessions architecture provides a **pluggable provider model** for managing agent sessions in the Agents Window. Multiple providers register with a central registry, and a management service aggregates sessions from all providers and routes user actions to the correct one. This lets new compute environments (local CLI, remote agent hosts, cloud backends) plug in without modifying core code.

## Architecture & Layers

The sessions system is organized in three layers, each with stricter import permissions. See [LAYERS.md](LAYERS.md) for the full ESLint-enforced rules.

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                            │
│  (SessionsView, TitleBar, NewSession, Changes, Terminal, etc.)  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsManagementService│  ← orchestration layer
                │  (active session, send,  │     aggregates sessions,
                │   navigation, context    │     routes actions,
                │   keys, deduplication)   │     manages context keys
                └───────────┬──────────────┘
                            │
                ┌───────────▼────────────┐
                │ SessionsProvidersService │  ← pure registry
                │  (register / unregister  │     lookup by ID
                │   providers)             │
                └──────┬──────────┬────────┘
                       │          │
          ┌────────────▼──┐  ┌───▼──────────────────┐
          │  CopilotChat  │  │ AgentHost / Remote    │
          │  Sessions     │  │ AgentHost Sessions    │
          │  Provider     │  │ Providers             │
          └───────────────┘  └───────────────────────┘
```

### Layer 1 — Sessions Core (`services/sessions/`)

Defines the foundational interfaces that all providers and consumers share:

- **`ISession`** (`session.ts`) — Universal session facade. A self-contained observable object representing a session; consumers never reach back to provider internals. Each session has a globally unique ID built via `toSessionId(providerId, resource)` and groups one or more `IChat` instances.
- **`ISessionsProvider`** (`sessionsProvider.ts`) — Contract every provider implements. Covers workspace discovery, session CRUD, sending requests, and firing change events.
- **`ISessionsManagementService`** (`sessionsManagement.ts`) — High-level orchestration interface consumed by UI. Aggregates sessions from all providers, tracks the active session, manages navigation history, and updates context keys.

### Layer 2 — Sessions Services (`services/sessions/browser/`)

Concrete implementations of the core interfaces:

- **`SessionsProvidersService`** — A pure registry. Providers register here; it fires `onDidChangeProviders` and provides lookup by ID. It does **not** aggregate sessions or route actions.
- **`SessionsManagementService`** — Wraps the providers service with UI concerns: active session tracking, back/forward navigation, and context key management.

### Layer 3 — Providers (`contrib/providers/`)

Each provider lives in its own subfolder and implements `ISessionsProvider`:

```
src/vs/sessions/contrib/providers/
├── agentHost/            # Local agent host provider
├── copilotChatSessions/  # Copilot chat sessions provider (wraps ChatSessionsService)
└── remoteAgentHost/      # Remote agent host provider (one instance per connection)
```

Providers can import from all layers below them (core, services, non-provider contribs). **Non-provider contribs must NOT import from providers.** Shared symbols should be extracted to `services/` or `common/`.

### Provider-Specific Documentation

- [Copilot Chat Sessions Provider](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md) — wraps `ChatSessionsService`, metadata contract, workspace derivation
- [Remote Agent Host Provider](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md) — remote connections, per-host provider instances

---

## Key Concepts

### Sessions and Chats

A **session** groups one or more **chats** (conversations) that share the same workspace context. The relationship is:

```
ISession
├── mainChat: IChat              ← primary (first) chat
├── chats: IObservable<IChat[]>  ← all chats in creation order
├── capabilities.supportsMultipleChats
└── session-level observables    ← derived from chats
```

Session-level properties are derived from chats:
- Most properties (`title`, `changes`, `changesets`, `modelId`, etc.) come from `mainChat`
- `updatedAt` and `lastTurnEnd` are the latest across all chats
- `status` is aggregated (`NeedsInput` > `InProgress` > other)
- `isRead` is `true` only when all chats are read

The active session (`IActiveSession`) extends `ISession` with an `activeChat` observable that tracks which chat the user is viewing.

### Workspaces and Folders

Each session operates on an **`ISessionWorkspace`** containing one or more **`ISessionFolder`** instances. Folders encapsulate a working directory and optional git repository information (`ISessionGitRepository`), including branch state, upstream tracking, and GitHub PR info.

Workspaces carry a `group` label (e.g., `"Local"`, `"Remote"`) used by the workspace picker to organize entries into tabs via the `SESSION_WORKSPACE_GROUP_LOCAL` / `SESSION_WORKSPACE_GROUP_REMOTE` constants.

### Session Types

An **`ISessionType`** identifies an agent backend (e.g., `'copilot-cli'`, `'copilot-cloud'`). Each provider declares which session types it supports and can dynamically update the list via `onDidChangeSessionTypes`. The management service exposes `getAllSessionTypes()` for UI pickers.

### Changesets

Sessions produce file changes organized into **`ISessionChangeset`** groups — named, togglable collections of file modifications that let users review and selectively apply changes.

---

## Data Flow

### Creating a New Session

```
1. User picks a workspace in the workspace picker
   → SessionsManagementService.createNewSession(providerId, workspaceUri, sessionTypeId?)
   → Looks up provider in SessionsProvidersService
   → Calls provider.createNewSession(workspaceUri, sessionTypeId)
   → Returns ISession, set as activeSession

2. User types a message and sends
   → SessionsManagementService.sendAndCreateChat(session, {query, attachedContext})
   → Delegates to provider.sendAndCreateChat(sessionId, options)
   → Provider sends request, returns committed session
   → isNewChatSession context → false
```

### Session Change Propagation

All session state flows through observables:

```
Backend state change (turn complete, status update, etc.)
  → Provider detects change, updates ISession observables
  → Provider fires onDidChangeSessions { added, removed, changed }
  → SessionsProvidersService forwards the event
  → SessionsManagementService forwards, updates active session & context keys
  → UI re-renders via observable subscriptions
```

Providers may fire `onDidReplaceSession` when a temporary (untitled) session is atomically replaced by a committed one after the first turn.

---

## Adding a New Provider

1. **Implement `ISessionsProvider`** with a unique `id`, `sessionTypes`, and `browseActions`
2. **Create session data classes** implementing `ISession` with observable properties
3. **Place code under `contrib/providers/<name>/`**
4. **Register via a workbench contribution** at `WorkbenchPhase.AfterRestored`:
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
5. Use `toSessionId(providerId, resource)` for session IDs
6. Fire `onDidChangeSessions` on every session change and `onDidReplaceSession` on untitled→committed transitions
7. Set `supportsLocalWorkspaces: true` if the provider can resolve local file-system workspaces

