# LocalChatSessionsProvider — Local In-Process Chat Sessions

**File:** `src/vs/sessions/contrib/providers/localChatSessions/browser/localChatSessionsProvider.ts`

The local sessions provider, registered with ID `'local-chat'`. Wraps local in-process VS Code chat sessions (created via `IChatService.startNewLocalSession()`) into the extensible sessions provider model. Owns its own session list — does not rely on the chat history APIs at runtime.

## Identity

| Property | Value |
|----------|-------|
| `id` | `'local-chat'` |
| `label` | `'Local Chat'` |
| `icon` | `Codicon.vm` |
| `sessionTypes` | `[LocalSessionType]` (static — provider is only registered when `sessions.chat.localAgent.enabled` is true at startup) |
| `supportsLocalWorkspaces` | `true` |
| `browseActions` | `[]` (uses the workspace picker's built-in folder browser) |

`LocalSessionType` is defined as:

```typescript
{ id: 'local', label: 'Local', icon: Codicon.vm }
```

## Registration

Registration is gated by the `sessions.chat.localAgent.enabled` setting, read once at workbench startup in `localChatSessions.contribution.ts`. If the setting is `false`, the provider is not created or registered at all. **Toggling the setting requires a window reload to take effect** — the provider does not listen for runtime configuration changes.

## Architecture

### Single `LocalSession` class

Local sessions are represented by a single `LocalSession` class with two construction paths controlled by a `detail: IChatDetail | undefined` constructor parameter:

- **`detail === undefined`** → new session: creates a fresh chat model via `IChatService.startNewLocalSession(ChatAgentLocation.Chat)`, resolves git state for the workspace via `IGitService`, and retains the model reference for the session's lifetime.
- **`detail !== undefined`** → restored session: built from a persisted `IChatDetail` snapshot. Does not own a chat model reference; the model is loaded on demand via `IChatService.acquireOrLoadSession` when the user opens the session.

The class exposes the standard `ISession` observable surface plus pre-send configuration (`setModelId`, `setMode`, `setPermissionLevel`, `setTitle`, `setStatus`, `setArchived`) and `trackModel(model, onChange)` for reactive status binding.

### Provider state

- **`_currentNewSession: MutableDisposable<LocalSession>`** — holds the session being composed before its first `sendRequest`.
- **`_sessionCache: Map<string, LocalSession>`** — keyed by resource URI string. Populated when a session is sent for the first time or when persisted sessions are loaded on startup.

A `LocalSession` moves from `_currentNewSession` → `_sessionCache` when `sendRequest` succeeds. The resource never changes — the same `LocalSession` instance is kept.

### Persistence

Local sessions are persisted in `IStorageService` profile-scoped, machine-target storage under the key `sessions.localChat.sessions`. Each entry is an `IStoredLocalSession`:

```typescript
interface IStoredLocalSession {
	readonly uri: UriComponents;
	readonly title: string;
	readonly createdAt: number;
	readonly lastMessageDate: number;
	readonly workingDirectory: UriComponents; // mandatory
	readonly archived?: boolean;
}
```

- **Add** (`_addStoredSession`) — called after the first `sendRequest`. Refuses to persist if no working directory is available.
- **Update** (`_updateStoredSession`) — called on rename, archive, response-completion, or `onDidSubmitRequest`-driven sync.
- **Remove** (`_removeStoredSession`) — called from `deleteSession`.
- **Load** (`_loadPersistedSessions`) — on provider construction; reads stored entries and creates `LocalSession` instances from them.

Storage is self-contained: no `IChatService` calls are needed to list sessions, since title and timing are stored inline.

### One-time migration

On first run, `_migrateFromHistory()` reads `IChatService.getLocalSessionHistory()` once, imports each session with a working directory into our storage (skipping anything already stored), and sets the `sessions.localChat.migrated` flag. This brings forward existing local chat history when users upgrade.

### Live model tracking

When `onDidSubmitRequest` fires for a session in `_sessionCache`, `_syncSessionFromModel` calls `LocalSession.trackModel(model, onChange)`:

- Subscribes to `model.requestInProgress` via `autorun`
- Maps `true` → `SessionStatus.InProgress`, `false` → `SessionStatus.Completed`
- Calls `onChange()` so the provider updates title, timing, persisted storage, and fires `onDidChangeSessions`

A `MutableDisposable` on `LocalSession` ensures repeated `trackModel` calls don't accumulate listeners.

## Lifecycle Flow

### Creating a new session

```
1. User selects a folder in the workspace picker → createNewSession(folderUri, 'local')
   → resolveWorkspace produces ISessionWorkspace
   → LocalSession constructed with detail=undefined
   → startNewLocalSession() creates chat model, resource is captured
   → git state resolution scheduled
   → _currentNewSession.value = session
   → returns ISession

2. User types a message → sendRequest(sessionId, chatResource, options)
   → Sets title from first line of query, status InProgress
   → Builds IChatSendRequestOptions (mode, model, permissions, attachedContext)
   → _updateChatSessionState applies model/mode/permission to chat model
   → chatService.sendRequest(chatResource, query, options)
   → On success: session moves to _sessionCache, _currentNewSession cleared,
     _addStoredSession persists the URI + metadata
   → responseCompletePromise updates status to Completed and syncs from model
```

### Restoring sessions on startup

```
1. Provider constructor runs
2. _migrateFromHistory (idempotent) imports any pre-existing local chat history
3. _loadPersistedSessions reads IStoredLocalSession[] and creates LocalSession
   instances directly from stored metadata — no chat models loaded yet
4. Sessions appear in getSessions(); chat model is loaded lazily by the
   chat view pane when the user clicks a session
```

### Actions

- **`archiveSession` / `unarchiveSession`** — toggles `isArchived` on the cached session and persists.
- **`deleteSession`** — calls `chatService.removeHistoryEntry()`, removes from cache, removes from storage.
- **`renameChat`** — calls `chatService.setSessionTitle()`, updates session title, persists.
- **`setModel`** — only meaningful for the current new session before send; updates pre-send model id.
- **`createNewChat`** — for the current new session, returns the already-prepared `IChat` and updates `mainChat`.

## Picker Contributions

Local sessions reuse the Copilot provider's pickers (`ModePicker`, `SessionModelPicker`, `PermissionPicker`) via `when` clauses that match `ActiveSessionTypeContext === 'local'`. The picker actions in `copilotChatSessionsActions.ts` include `IsActiveSessionLocal` in their `when` expressions so the same widgets surface for both the copilot CLI provider and this local provider.

## Differences from `CopilotChatSessionsProvider`

- **No `IAgentSessionsService` dependency.** Uses `IChatService` directly.
- **No untitled→committed URI swap.** Local session resources never change.
- **No multi-chat support.** Each local session has exactly one chat.
- **Self-managed session list.** Storage owns the source of truth, not the chat history.
- **No worktree / branch / isolation.** Local sessions run in-process against the workspace folder as-is.
