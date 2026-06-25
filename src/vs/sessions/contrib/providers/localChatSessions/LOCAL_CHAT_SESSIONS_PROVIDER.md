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
	readonly parentUri?: UriComponents; // primary chat's URI for child chats
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
- **`createNewChat`** — for the current new session, returns the already-prepared `IChat` and updates `mainChat`. For an existing committed session, creates a subsequent (child) chat linked to the primary via `parentResource`.
- **`deleteChat`** — removes a single child chat from a multi-chat session after a confirmation dialog; deleting the primary (or the last remaining chat) removes the whole session. An unknown/stale chat URI is a no-op.

Local sessions advertise `capabilities.supportsDelete`, so the shared sessions-list **"Delete..."** action (contributed by the sessions workbench, gated on `SessionSupportsDeleteContext`) confirms and then calls `ISessionsManagementService.deleteSessions` (routing to `deleteSession`/`deleteSessions` above). There is no provider-specific delete action.

## Multi-Chat Support

A local session may host multiple chats. The hierarchy is stored entirely in the provider's own metadata — there is no setting and multi-chat is always enabled.

- Each `LocalSession` has an optional `parentResource`. A session with no `parentResource` is a **primary** chat; one with a `parentResource` pointing at the primary's resource is a **child** chat.
- The parent→child link is persisted via `IStoredLocalSession.parentUri` so the hierarchy survives reloads.
- `getSessions()` surfaces only primary chats; children are aggregated into their primary's group. `_buildGroupISession` wraps a primary plus its children into a single `ISession` whose `chats` observable re-derives on group-membership changes, and whose `status`/`updatedAt`/`isRead`/`lastTurnEnd` are aggregated across the group. Such sessions report `capabilities.supportsMultipleChats: true`.
- The management service sends subsequent messages with the group (primary) `sessionId` and the child's chat resource; `sendRequest` routes these to `_sendChildChat`. A child is added to the cache immediately on `createNewChat` but only persisted once its first send succeeds; a rejected/unsent child is rolled back.
- On load, a child whose `parentUri` is not present in storage is promoted to a primary (non-destructive orphan handling).

## Picker Contributions

Local sessions reuse the Copilot provider's pickers (`ModePicker`, `PermissionPicker`) via `when` clauses that match `SessionTypeContext === 'local'`. The picker actions in `copilotChatSessionsActions.ts` include `IsActiveSessionLocal` in their `when` expressions so the same widgets surface for both the copilot CLI provider and this local provider.

The model picker is contributed by the sessions core (`contrib/chat/browser/modelPicker.ts`), not by this provider. It reads models via `ISessionsProvider.getModels`; for local sessions this returns general-purpose registered language models (those without a `targetChatSessionType` that are user-selectable). This provider's `getModelPickerOptions` returns `showManageModelsAction: true`, so the core picker surfaces the **Manage Models** action for local sessions — the decision lives in the provider, not in core.

## Differences from `CopilotChatSessionsProvider`

- **No `IAgentSessionsService` dependency.** Uses `IChatService` directly.
- **No untitled→committed URI swap.** Local session resources never change.
- **Multi-chat hierarchy stored in provider metadata.** A local session may host multiple chats; the parent→child link is persisted via `IStoredLocalSession.parentUri` (see Multi-Chat Support above).
- **Self-managed session list.** Storage owns the source of truth, not the chat history.
- **No worktree / branch / isolation.** Local sessions run in-process against the workspace folder as-is.
