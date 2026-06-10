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
- **`ISessionsProvider`** (`sessionsProvider.ts`) — Contract every provider implements. Covers workspace discovery, session CRUD, sending requests, model enumeration/selection/presentation (`getModels`, `getModelPickerOptions`, `onDidChangeModels`, `setModel`), and firing change events.
- **`ISessionsManagementService`** (`sessionsManagement.ts`) — The session **model** service. Aggregates sessions from all providers, owns the canonical `activeSession` (+ `setActiveSession`, called by the view), the pending new-session draft (`createNewSession`/`isNewChatSession`), send (`sendNewChatRequest`/`createAndSendNewChatRequest`/`sendRequest`), CRUD (archive/delete/rename), recency history, and the active-session context keys. It performs **no** view/layout mutation and never imports the core view or part.

> **Model vs view.** Opening sessions, the visible-session slots and their arrangement, focus, Back/Forward navigation, and per-session view persistence live in **`ISessionsViewService`** (core — see `browser/sessionsViewService.ts`), not the management service. The split mirrors `IEditorService.activeEditor` (model) vs `IEditorGroupsService.activeGroup` + focus (view). See [Model vs View](#model-vs-view-session-services).

### Layer 2 — Sessions Services (`services/sessions/browser/`)

Concrete implementations of the core interfaces:

- **`SessionsProvidersService`** — A pure registry. Providers register here; it fires `onDidChangeProviders` and provides lookup by ID. It does **not** aggregate sessions or route actions.
- **`SessionsManagementService`** — The model implementation: aggregates provider sessions, owns `activeSession`/`setActiveSession`, the pending draft, send, CRUD, recency history, and active-session context keys. Reduced send methods to provider calls + `onWillSendRequest`/`onDidStartSession`/`onDidSendRequest` events; the view reacts to those (and `onDidReplaceSession`) to keep the visible slot in sync. It performs no visible-session/layout mutation.

The **view** counterpart, **`SessionsViewService`** (core, `browser/sessionsViewService.ts`), owns the `VisibleSessions` model (slots/arrangement), opening (`openSession`/`openChat`/`openNewSession`/`openNewChatInSession`), `insertAt`, stickiness, `close*`, focus (drives the passive part and honours `openSession(..., { preserveFocus })`), `SessionsNavigation` (Back/Forward), and `restoreVisibleSessions` + per-session view persistence. Because it is **core**, it may import both the part (core) and the management service (services). It pushes the active slot into the model via `management.setActiveSession(...)`.

#### Model vs View (session services)

| `ISessionsManagementService` (model — `services/sessions`) | `ISessionsViewService` (view — core `browser/`) |
|---|---|
| canonical `activeSession` + `setActiveSession(session)` (called by the view) | `visibleSessions` (slots/arrangement) + active-slot wrappers |
| active-session context keys; `isNewChatSession` (new-draft ctx key) | `openSession`/`openChat`/`openNewSession`/`openNewChatInSession` |
| providers, getters, recently-opened, session types, `resolveWorkspace` | `insertAt`, `toggleSessionStickiness`, `closeSession`/`closeAllSessions`, `setActive` |
| `createNewSession` + new-session draft (`newSession` observable, `discardNewSession`) | focus mechanics (drives the part); `preserveFocus` |
| `sendNewChatRequest`/`createAndSendNewChatRequest`/`sendRequest` (provider calls + send events) | Back/Forward navigation (`SessionsNavigation`) |
| CRUD: archive/delete/rename + events; recency history; provider subscriptions | `restoreVisibleSessions` + per-session view persistence; reflects send/replace **reactively** |

**Data-flow contract:**

```
open existing:  view.openSession(uri, { preserveFocus })
                  → management.setActiveSession(session)   // model truth (core → services)
                  → view arranges visible slot + focuses    // focus skipped when preserveFocus
new session:    composer → view.openNewSession({ folderUri, ... })  // view: management.createNewSession() (model draft) + activates it
                  → view observes activeSession == draft → shows draft slot
send:           composer → management.sendNewChatRequest()  // model: provider calls + events
                  → view reacts (onDidReplaceSession + active-session chats) → swaps slot / active chat
focus a slot:   part.onDidFocusSession → view.setActive → management.setActiveSession
```

The part (`browser/parts/sessionsPartService.ts`) is a **passive renderer**: it injects neither the model nor the view, and only exposes `updateVisibleSessions(visible, active)`, `focusSession`, and `onDidFocusSession`. The view owns the reconcile autorun and focus and wires `part.onDidFocusSession → view.setActive`.

### Layer 3 — Providers (`contrib/providers/`)

Each provider lives in its own subfolder and implements `ISessionsProvider`:

```
src/vs/sessions/contrib/providers/
├── agentHost/            # Agent host provider — shared base + local agent host
├── copilotChatSessions/  # Copilot chat sessions provider (wraps ChatSessionsService)
├── localChatSessions/    # Local in-process VS Code chat sessions provider
└── remoteAgentHost/      # Remote agent host provider (one instance per connection)
```

Providers can import from all layers below them (core, services, non-provider contribs). **Non-provider contribs must NOT import from providers.** Shared symbols should be extracted to `services/` or `common/`.

#### Provider internals stay in the provider (`IAgentSessionsService`)

`IAgentSessionsService` (`vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService`) is a **Copilot-provider internal** and must be consumed **only** by the Copilot chat sessions provider (`contrib/providers/copilotChatSessions/`). The rest of the Agents window — core, services, and non-provider contribs (e.g. the sessions list, the visible-sessions grid) — must stay **provider-agnostic** and interact with sessions exclusively through `ISession`/`ISessionsManagementService`. Reaching into `IAgentSessionsService` from shared code (for example to call `model.observeSession(...)` for lazy loading) couples the whole window to one provider and is prohibited. If a provider needs to react to provider-agnostic signals (such as a session becoming visible), surface that signal on the shared services and subscribe to it **inside the provider**. This rule is enforced by an ESLint `no-restricted-imports` ban scoped to `src/vs/sessions/**` (with the Copilot provider folder exempted).

> **Temporary exception (tracked by [#320480](https://github.com/microsoft/vscode/issues/320480)):** the sessions list (`contrib/sessions/browser/views/sessionsList.ts`) currently keeps one deliberate `IAgentSessionsService` usage to trigger lazy resolution of expensive session properties for rows scrolling into view. It carries a prominent comment and a localized `eslint-disable-next-line no-restricted-imports`. This must be moved into the Copilot provider; do not add further usages or copy the suppression.

### Provider-Specific Documentation

- [Copilot Chat Sessions Provider](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md) — wraps `ChatSessionsService`, metadata contract, workspace derivation
- [Local Chat Sessions Provider](contrib/providers/localChatSessions/LOCAL_CHAT_SESSIONS_PROVIDER.md) — local in-process VS Code chat, self-managed session list via storage
- [Agent Host Provider](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md) — shared base + local agent host, dynamic session config, draft/graduate send flow
- [Remote Agent Host Provider](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md) — remote connections, per-host provider instances

### Related Specifications

- [Sessions List](SESSIONS_LIST.md) — UI surface for browsing sessions: tree widget, grouping, filtering, pinning, read/unread state, mobile adaptations

---

## Key Concepts

### Sessions and Chats

A **session** groups one or more **chats** (conversations) that share the same workspace context. The relationship is:

```
ISession
├── mainChat: IObservable<IChat>   ← primary (first) chat (settable by provider when committing a new session)
├── chats: IObservable<IChat[]>    ← all chats in creation order
├── capabilities.supportsMultipleChats
└── session-level observables      ← derived from chats
```

Session-level properties are derived from chats:
- Most properties (`title`, `changes`, `changesets`, `modelId`, etc.) come from the main chat
- `updatedAt` and `lastTurnEnd` are the latest across all chats
- `status` is aggregated (`NeedsInput` > `InProgress` > other)
- `isRead` is `true` only when all chats are read

The active session (`IActiveSession`) extends `ISession` with an `activeChat` observable that tracks which chat the user is viewing.

Chat input history in the Agents Window is scoped by `ISession.sessionId`. Pressing Up/Down in a chat input only navigates prompts previously submitted in the same session, including across multiple chats in that session. Users can disable `chat.agentSessions.scopedInputHistory` to restore shared input history across sessions. When a provider replaces a temporary untitled session with a committed session after the first send, history is moved from the temporary session id to the committed session id.

### Workspaces and Folders

Each session operates on an **`ISessionWorkspace`** containing one or more **`ISessionFolder`** instances. Folders encapsulate a working directory and optional git repository information (`ISessionGitRepository`), including branch state, upstream tracking, and GitHub PR info.

Workspaces carry a `group` label (e.g., `"Local"`, `"Remote"`) used by the workspace picker to organize entries into tabs via the `SESSION_WORKSPACE_GROUP_LOCAL` / `SESSION_WORKSPACE_GROUP_REMOTE` constants.

Tasks with `runOptions.runOn === "worktreeCreated"` are dispatched client-side only for sessions that this window has just started. `SessionsManagementService` emits `onDidStartSession` from `sendNewChatRequest` after `provider.sendRequest(...)` commits, and `WorktreeCreatedTaskDispatcher` tracks only those sessions until they report a concrete `gitRepository.workTreeUri`. Restored/synced catalog sessions and runtimes that declare `capabilities.runsWorktreeCreatedTasks` are skipped so setup tasks are not re-run on window open or double-run with server-side provisioning.

### Session Types

An **`ISessionType`** identifies an agent backend (e.g., `'copilot-cli'`, `'copilot-cloud'`). Each provider declares which session types it supports and can dynamically update the list via `onDidChangeSessionTypes`. The management service exposes `getAllSessionTypes()` for UI pickers.

Session types are surfaced ordered by each provider's `order` property (lower first; ties keep registration order). The default `order` is `0`, so the Copilot Chat sessions provider keeps precedence by default. The local agent host provider sets its `order` reactively from the experimental `chat.agentHost.defaultSessionsProvider` setting (default `false`, gated behind `chat.agentHost.enabled`): when enabled it returns a negative order so its session types sort before all other providers; otherwise it sorts after the defaults. The provider fires `onDidChangeSessionTypes` when the setting toggles so the management service re-collects and re-sorts. The sort itself lives in `SessionsManagementService._getOrderedProviders()` and applies to both `getAllSessionTypes()` and `getSessionTypesForFolder()` — the orchestration layer stays provider-agnostic (it sorts purely by `order`, with no knowledge of specific provider ids).

The session type picker persists the last selection as `{ providerId, sessionTypeId }` (the `providerId` disambiguates when two providers offer the same `sessionType.id`, e.g. `copilotcli`). Like any picker, it writes storage whenever the value changes — both on a manual dropdown pick and whenever the active session's type changes — so an auto-selected or defaulted type also survives reload (otherwise the stored preference would be empty and the restored draft would fall back to the first provider by `order`).

On reload, providers register asynchronously and agent hosts connect lazily, so the preferred provider may not have surfaced its session types when the restored draft is created. Rather than blocking on a "ready" gate, `NewChatWidget` creates the draft immediately with the best available provider, then upgrades it in place once the preferred `(providerId, sessionTypeId)` pair becomes servable (driven by `onDidChangeSessionTypes`). The upgrade listener lives for the widget's lifetime — there is **no** timeout or `LifecyclePhase` give-up, since an agent host can connect arbitrarily late — and is cancelled if the user picks a different type or the draft is sent.

### Changesets

Sessions produce file changes organized into **`ISessionChangeset`** groups — named, togglable collections of file modifications that let users review and selectively apply changes.

---

## Data Flow

### Creating a New Session

```
1. User picks a folder in the workspace picker
   → WorkspacePicker fires onDidSelectWorkspace(folderUri)
   → NewChatWidget → ISessionsViewService.openNewSession({ folderUri, ...options })
   → view calls SessionsManagementService.createNewSession(folderUri, options?)
   → Iterates providers, picks the first one whose resolveWorkspace(folderUri)
     succeeds (filtered by options.sessionTypeId when given)
   → Calls provider.createNewSession(folderUri, sessionTypeId)
   → Returns ISession (model draft, `newSession`); the view then activates it so
     it becomes the activeSession and the draft slot shows reactively

2. User picks a different session type for the same folder
   → SessionTypePicker queries getSessionTypesForFolder(folderUri),
     groups entries by provider, shows them in the dropdown
   → On selection, fires onDidSelectSessionType({ providerId, sessionTypeId })
   → NewChatWidget → ISessionsViewService.openNewSession({ folderUri, providerId, sessionTypeId })
     routes through the picked provider — even when the same sessionType.id
     is also offered by another provider

3. User types a message and sends
   → SessionsManagementService.sendNewChatRequest(session, {query, attachedContext})
   → Calls provider.createNewChat(sessionId)
   → Provider creates the backend chat model and returns an IChat
   → Management fires onWillSendRequest(session); the view follows the send to
     keep the newest chat active in the visible slot
  → ChatView locks the embedded ChatWidget to the contributed chat session type
    (for example agent-host-codex) before setting the model, so follow-up turns
    keep routing to the provider that owns the session; local chat sessions unlock
   → Delegates to provider.sendRequest(sessionId, chatResource, options)
   → Provider sends request, returns committed session
   → Management fires onDidStartSession(committedSession) + onDidSendRequest(...)
   → isNewChatSession context → false
```
Follow-up messages to an existing chat go through
`SessionsManagementService.sendRequest(session, chat, options)`. The view makes
the sent chat the active chat by reacting to the send events.

Explicit user-initiated "new session" gestures (Ctrl/Cmd+N, the **New** button,
the mobile titlebar "+" button, and the sessions quick picker's "New Session"
item) call `ISessionsViewService.openNewSession()`. With no `folderUri` this
switches to the new-session view, restoring the in-progress draft (`newSession`)
when one exists or showing the empty placeholder otherwise. Internal callers
(restore fallback, archive, background reseed, and the close-session fallback)
invoke `openNewSession()` the same way.

`sendNewChatRequest(session, options)` accepts a `background` flag: a background
new-session send returns the agents window to a fresh new-session view (via
`openNewSession`) **before** creating and sending the session, and skips the
visible-slot swap (`updateResourceOfSession`/`updateSession`) that the foreground
path uses. This keeps the composer in view the whole time — the started session is
never momentarily shown in the chat view — and it just appears in the sessions
list once the provider commits it.

Background sends are **fire-and-forget** at the management layer: the composer is
allowed to reset and reseed immediately while the provider commit continues
asynchronously. Providers are therefore required to support multiple concurrent
new sessions. If that async commit fails, the management service calls
`deleteNewSession(sessionId)` to dispose the stranded draft because it is no
longer referenced by `_pendingNewSession`.

`background` lives on the management-layer `ISendRequestOptions` (which extends
the provider's send-request options). Providers do not interpret the flag; it is
purely a management/UI concern. In the new-session composer the gesture is
**Alt+Enter** (or **Alt-click** the Send button); plain Enter / click sends in
the foreground. The background gesture is only offered for the new-session
composer, not when sending a new chat within an existing session.

For callers outside the new-session composer,
`createAndSendNewChatRequest(folderUri, options, createOptions?)` creates a fresh
session for the folder and sends the request in one call, **without** touching
the pending/active session or navigating the current view — the started session
just appears in the sessions list once the provider commits it. It shares the
underlying commit helper with the composer's background send; if the send fails
it disposes the stranded draft via `deleteNewSession` and rejects so the caller
can react.

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
6. Fire `onDidChangeSessions` on every session change and `onDidReplaceSession` from the provider on untitled→committed transitions
7. Set `supportsLocalWorkspaces: true` if the provider can resolve local file-system workspaces

---

## Interface Design Guidelines

### `ISessionsProvider` must have no optional methods

Every method on `ISessionsProvider` is part of the mandatory contract. Do **not** declare any method as optional (i.e., using `?`). Every provider must implement the full interface. If a method is not meaningful for a particular provider, implement it as a no-op or return a safe default.

**Rationale:** Optional methods weaken the contract and force call sites to add guard code (`if (provider.method)`). Mandatory methods keep the management service clean and ensure the interface documents the complete capability set of every provider.

### Any addition to `ISession` or `ISessionsProvider` must be consumed in the agents window core workbench

The **agents window core workbench** is defined as all sessions code *outside* `src/vs/sessions/contrib/providers/` — that is, code in `src/vs/sessions/services/`, `src/vs/sessions/browser/`, `src/vs/sessions/common/`, and non-provider `src/vs/sessions/contrib/*` folders (views, UI contributions, toolbars, etc.).

When you add a property or method to `ISession` or `ISessionsProvider`, it **must** be referenced by at least one file in the core workbench, not only within provider implementations.

**Rationale:** If an interface member is only used inside providers, it belongs on the provider's concrete class, not on the shared interface. Interfaces should capture what the orchestration layer (management service, UI) needs from providers — not internal implementation details that leak outward.

### Do not use context keys to read or derive runtime state

Context keys are an output/gating mechanism, **not** a source of truth. Do **not** mirror dynamic state (e.g. "the active session has models", a count, a selection) into a context key only to read it back in imperative code, and do not call `IContextKeyService.getContextKeyValue(...)` to drive logic. Instead, read state directly from the owning service or observable (`ISessionsManagementService.activeSession`, `ISessionsProvider.getModels`, etc.) and react with `autorun`/`derived`.

Context keys remain the correct tool for **declarative** `when` clauses on menu, command, and keybinding contributions — there is no alternative there, because those are evaluated by the platform. The rule targets *imperative* code: a component that already has access to a service must consult the service, not a context key that shadows it.

**Example:** the sessions-core model picker (`contrib/chat/browser/modelPicker.ts`) does not maintain an `activeSessionHasModels` context key. It reads `provider.getModels(...)` directly and toggles its own visibility, while its menu `when` clause only gates on genuinely declarative conditions (phone layout, and whether the provider offers a combined config picker).

**Rationale:** Mirroring service state into a context key duplicates the source of truth, adds an extra listener that can drift out of sync, and hides real data dependencies behind a stringly-typed key. Reading the service/observable keeps a single source of truth and makes dependencies explicit.

### Delegate provider-specific decisions to the provider

Core (non-provider) code must **not** branch on a provider's identity or session type to decide provider-specific behavior. Do not write `if (session.sessionType === SessionType.Local)` or `if (providerId === '…')` in the core to special-case a provider. Instead, add a method to `ISessionsProvider` that returns the decision and let each provider answer for itself.

**Example:** the sessions-core model picker presentation (grouping, featured models, the "Manage Models" action) is not decided in core. The core picker asks the active session's provider via `ISessionsProvider.getModelPickerOptions(sessionId)`, which returns an `ISessionModelPickerOptions`. The local provider returns `showManageModelsAction: true`; the others return `false`. Core never inspects the session type to make this choice.

**Rationale:** Hardcoding provider identity in core re-couples the orchestration layer to specific providers, defeating the pluggable provider model. New providers would silently get wrong defaults and require edits to core. Delegating keeps each provider authoritative over its own behavior and keeps core provider-agnostic.
