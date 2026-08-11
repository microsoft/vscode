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
                │  (model: send, CRUD,     │     aggregates sessions,
                │   recency, new-session   │     routes actions
                │   draft, deduplication)  │     (active session in view)
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
- **`ISessionsProvider`** (`sessionsProvider.ts`) — Contract every provider implements. Covers workspace discovery, session CRUD, sending requests, model enumeration/selection/presentation (`getModelsSnapshot`, `getModelPickerOptions`, `onDidChangeModels`, `setModel`), and firing change events.
- **`ISessionsManagementService`** (`sessionsManagement.ts`) — The session **model** service. Aggregates sessions from all providers, owns the pending new-session draft (`createNewSession`/`newSession`), send (`sendNewChatRequest`/`createAndSendNewChatRequest`/`sendRequest`), current-request cancellation, CRUD (archive/delete/rename), and recency history. It performs **no** view/layout mutation and never imports the view or part service. It does **not** own the active session — that lives in the view service.
  The Automation dialog uses a separate `automationSession` draft lifecycle so changing or closing the dialog never replaces the regular new-session draft.

> **Model vs view.** The active session (`activeSession`), the visible-session slots and their arrangement, opening sessions, focus, Back/Forward navigation, and per-session view persistence live in **`ISessionsService`** (services — see `services/sessions/browser/sessionsService.ts`), not the management service. The split mirrors `IEditorService.activeEditor` (the active item is owned by the view-facing service) rather than the underlying model. See [Model vs View](#model-vs-view-session-services).

### Layer 2 — Sessions Services (`services/sessions/browser/`)

Concrete implementations of the core interfaces:

- **`SessionsProvidersService`** — A pure registry. Providers register here; it fires `onDidChangeProviders` and provides lookup by ID. It does **not** aggregate sessions or route actions.
- **`SessionsManagementService`** — The model implementation: aggregates provider sessions, owns the pending draft, send, CRUD, recency history, and provider subscriptions. Reduced send methods to provider calls + `onWillSendRequest`/`onDidStartSession`/`onDidSendRequest` events; the view reacts to those (and `onDidReplaceSession`) to keep the visible slot and active session in sync. It performs no visible-session/layout mutation and does not own the active session.

The **view** counterpart, **`SessionsService`** (services, `services/sessions/browser/sessionsService.ts`), owns the canonical `activeSession` and the active-session context keys, the `VisibleSessions` model (slots/arrangement), immediate display (`showSession`), loading opens (`openSession`/`openChat`/`openNewSession`/`openNewChatInSession`), `insertAt`, stickiness, `close*`, focus (drives the passive part and honours `openSession(..., { preserveFocus })`), `SessionsNavigation` (Back/Forward), and `restoreVisibleSessions` + per-session view persistence. Living in the **services** layer, it imports the part service and the management service (both services); the concrete `SessionsPart` (core `browser/parts/`) implements `ISessionsPartService`. The active session is simply the wrapper of the active visible slot (`VisibleSessions.activeSession`) — there is no separate model mirror.

In the Agents window, Browser Back/Forward keybindings and mouse back/forward buttons route through `SessionsNavigation` while focus is outside the editor area. Editor focus retains the shared editor-history behavior, and mouse navigation continues to respect `workbench.editor.mouseBackForwardToNavigate`.

#### Model vs View (session services)

| `ISessionsManagementService` (model — `services/sessions`)                                      | `ISessionsService` (view — `services/sessions/browser/`)                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| providers, getters, recently-opened, session types, `resolveWorkspace`                          | canonical `activeSession` (= active visible slot wrapper) + active-session context keys; `isNewChatSession` (new-draft ctx key)                                                                   |
| `createNewSession` + new-session draft (`newSession` observable, `discardNewSession`)           | `visibleSessions` (slots/arrangement) + active-slot wrappers                                                                                                                                      |
| `sendNewChatRequest`/`createAndSendNewChatRequest`/`sendRequest` (provider calls + send events) | `showSession`/`openSession`/`openChat`/`openNewSession`/`openNewChatInSession`; `insertAt`, `toggleSessionStickiness`, `closeSession`/`closeAllSessions`, `setActive`                             |
| CRUD: archive/delete/rename + events; recency history; provider subscriptions                   | focus mechanics (drives the part); `preserveFocus`; Back/Forward navigation (`SessionsNavigation`); `restoreVisibleSessions` + per-session view persistence; reflects send/replace **reactively** |

**Data-flow contract:**

```
open existing:  view.openSession(uri, { preserveFocus })
                  → view arranges visible slot (activeSession = active slot) + focuses    // focus skipped when preserveFocus
external link:   workbench openSessionByResource(uri)
                  → Agents-window opener participant → view.openSession(uri)
new session:    composer → view.openNewSession({ folderUri, ... })  // view: management.createNewSession() (model draft) + activates it
                  → view observes activeSession == draft → shows draft slot
delegate:       command → management.createNewSession({ providerId, sessionTypeId })
                  → view.insertAt(draft, sourceSessionId, 'right', true)  // show beside source
                  → management.sendNewChatRequest(draft, transcript attachments)
send:           composer → management.sendNewChatRequest()  // model: provider calls + events
                  → view reacts (onDidReplaceSession + active-session chats) → swaps slot / active chat
focus a slot:   part.onDidFocusSession → view.setActive → updates active visible slot
```

Activating a session or empty slot that is already visible updates only `activeSession` and its
`preserveFocus` intent. It does not republish `visibleSessions`: focus changes are not slot/catalog
changes, and keeping that observable stable prevents per-session menus and other catalog consumers
from rebuilding while an anchored picker is opening.

The Agents-window chat surface also registers the workbench chat pre-submit handlers. These handlers can consume provider-specific client-side commands before the normal send path, while the actual send still routes through the sessions provider model.

The Agents Window overrides the shared `IWorkspaceFolderLabelService` with a session-aware
implementation. It matches projected workspace-folder URIs against the active session exposed by
`ISessionsService` so editor breadcrumbs can use repository identity while the Files workspace root
retains its verbose repository-and-branch label. The label service is delayed and consumed when
`BreadcrumbsControl.update()` creates a model for an active file, after editor-part construction.
When the active session does not own the projected folder, it falls back to sessions aggregated by
`ISessionsManagementService`.

User selections in the Agents-window mode picker report the shared `chat.modeChange` telemetry event. Agent Host execution-mode transitions (`interactive`, `plan`, and `autopilot`) are reported separately as `agentHost.executionModeChanged`.

The `sessions.showSessionsPicker` command globally prioritizes non-archived sessions that need input, followed by other unread sessions. Each priority group preserves the picker's existing recent-first order, and sessions in neither group remain in the existing "recently opened" and "other sessions" sections. Archived-session exclusion is owned by the picker grouping helper so archived sessions cannot enter any section regardless of status or read state. The picker initially selects the first session rather than the preceding New Session item or the active session.

The Agents-window composer uses the shared dictation toggle semantics: activating dictation again while the speech-to-text model is downloading or loading cancels preparation, while activating it during recording stops and transcribes. The new-session composer renders the shared chat-tip content above its input only after the cumulative Agents request counter reaches two; because it is not an `IChatWidget`, the chat-tip service treats an Agents window with zero registered foreground chat widgets as this single composer surface.

The part (interface `services/sessions/browser/sessionsPartService.ts`; concrete `browser/parts/sessionsPart.ts`) is a **passive renderer**: it injects neither the model nor the view, and only exposes `updateVisibleSessions(visible, active)`, `focusSession`, and `onDidFocusSession`. The view owns the reconcile autorun and focus and wires `part.onDidFocusSession → view.setActive`.

### Layer 3 — Providers (`contrib/providers/`)

Each provider lives in its own subfolder and implements `ISessionsProvider`:

```
src/vs/sessions/contrib/providers/
├── agentHost/            # Agent host provider — shared base + local agent host
├── copilotChatSessions/  # Copilot chat sessions provider (wraps ChatSessionsService)
└── remoteAgentHost/      # Remote agent host provider (one instance per connection)
```

Providers can expose `automations` to own durable Automation entities and run history. `ProviderAutomationService` aggregates these stores behind `IAutomationService`, routes mutations to the owning store, and keeps the legacy global ledger mounted while equivalent entries migrate idempotently by Automation and run ID. Divergent same-ID snapshots remain in both stores for explicit conflict handling rather than silently discarding legacy data.
When an update changes the resolved owning provider, the aggregate service transfers the updated Automation and run history before conditionally removing the matching source snapshot.
Startup recovery attempts every available store independently, so one unavailable provider does not block stale-run recovery in the remaining stores.
The scheduler activates stale-run recovery only while its window is leader. Provider stores added during that leadership period are recovered after migration, and leadership loss disables recovery for later registrations.
Legacy migration also isolates failures by Automation and removes a source copy only when it still matches the imported Automation and run snapshot. Concurrent source changes are retried a bounded number of times, while a concurrent deletion rolls back the unchanged destination copy.

Providers can import from all layers below them (core, services, non-provider contribs). **Non-provider contribs must NOT import from providers.** Shared symbols should be extracted to `services/` or `common/`.

Permission picker labels and descriptions use provider-neutral language and stay aligned across Copilot Chat and Agent Host providers. Agent Host mode and running-session permission pickers use provider-specific list options in both the workbench and Agents window so their descriptive text has a consistent minimum width. `chat.defaultConfiguration.approvals` sets the initial permission level for new sessions using `default`, `assisted`, or `allowAll`; the live session config continues to use the Agent Host protocol's `autoApprove` value.

The sessions-layer `AgentHostCustomizationService` adapts the workbench customization service contract to `IAgentHostSessionsProvider`. It reads session MCP servers through the owning provider, including optional start/stop lifecycle actions, and writes root MCP server definitions by merging the provider's current root `mcpServers` config map before calling `setRootConfigValue`, so additions preserve existing host-level servers.

#### Provider internals stay in the provider (`IAgentSessionsService`)

`IAgentSessionsService` (`vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService`) is a **Copilot-provider internal** and must be consumed **only** by the Copilot chat sessions provider (`contrib/providers/copilotChatSessions/`). The rest of the Agents window — core, services, and non-provider contribs (e.g. the sessions list, the visible-sessions grid) — must stay **provider-agnostic** and interact with sessions exclusively through `ISession`/`ISessionsManagementService`. Reaching into `IAgentSessionsService` from shared code (for example to call `model.observeSession(...)` for lazy loading) couples the whole window to one provider and is prohibited. If a provider needs to react to provider-agnostic signals (such as a session becoming visible), surface that signal on the shared services and subscribe to it **inside the provider**. This rule is enforced by an ESLint `no-restricted-imports` ban scoped to `src/vs/sessions/**` (with the Copilot provider folder exempted).

> **Temporary exception (tracked by [#320480](https://github.com/microsoft/vscode/issues/320480)):** the sessions list (`contrib/sessions/browser/views/sessionsList.ts`) currently keeps one deliberate `IAgentSessionsService` usage to trigger lazy resolution of expensive session properties for rows scrolling into view. It carries a prominent comment and a localized `eslint-disable-next-line no-restricted-imports`. This must be moved into the Copilot provider; do not add further usages or copy the suppression.

### Provider-Specific Documentation

- [Copilot Chat Sessions Provider](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md) — wraps `ChatSessionsService`, metadata contract, workspace derivation
- [Agent Host Provider](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md) — shared base + local agent host, dynamic session config, draft/graduate send flow
- [Remote Agent Host Provider](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md) — remote connections, per-host provider instances

During a CLI-managed remote-host upgrade, a passive transport transition to `disconnected` still causes an explicit reconnect when no reconnect has reached `connecting` or `connected`.

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
├── capabilities.supportsRename     ← gates the header/list rename UI
└── session-level observables      ← derived from chats
```

Session-level properties are derived from chats:

- Most properties (`title`, `changes`, `changesets`, `modelId`, etc.) come from the main chat
- `updatedAt` and `lastTurnEnd` are the latest across all chats
- `status` is aggregated (`NeedsInput` > `InProgress` > other)
- `isRead` is `true` only when all chats are read

#### Read-only and hidden chats

Each `IChat` exposes `interactivity: IObservable<ChatInteractivity>` — a provider-agnostic tri-state (`Full` / `ReadOnly` / `Hidden`) that mirrors the agent host protocol's `ChatInteractivity` but is decoupled from it so any provider can report it. Providers that don't distinguish interactivity report `Full`.

- **`Full`** — the user can send messages (default). Composer shown.
- **`ReadOnly`** — the chat is shown but the composer is hidden: the agents-window chat view (`ChatView`) calls `ChatWidget.setReadOnly(true)`, which applies the `chat-input-hidden` class, hides composer content while retaining visible children of `chat-input-persistent-content` such as status pills, focuses the message list, and sets the widget-scoped `chatIsReadonly` context key. When there is no visible persistent content, the whole input part is removed from layout. The context key gates mutating per-request actions so read-only chats do not offer **Start Over**, **Restore Checkpoint**, **Restore to Last Checkpoint**, or **Undo Requests** (their menus and keybindings negate `ChatContextKeys.readOnly`). The tab shows a lock icon (`chatCompositeBar`). Archived sessions additionally show a read-only banner whose inline unarchive/restore action follows `chat.experimental.sessionArchiveActionWording`. This supports the agent-team pattern where worker chats are observable but not directly steerable.
- **`Hidden`** — an internal worker chat that must not be surfaced in the UI at all. The visible session model (`VisibleSession`) filters `Hidden` chats out of `openChats` (the tab strip) and never selects one as the active chat (the close-chat and active-chat fallbacks skip them). `Hidden` is a *visibility* concern handled by the UI layer; providers still report it faithfully on `IChat`.

`ChatView` treats any non-`Full` interactivity as read-only (`setReadOnly(interactivity !== Full)`); `Hidden` chats are filtered before they reach a `ChatView`.

In the agent host, the main producer of read-only chats is **subagent (worker) chats**: when an agent's tool spawns a subagent, `AgentSideEffects._handleSubagentStarted` (`src/vs/platform/agentHost/node/agentSideEffects.ts`) calls `stateManager.addChat(...)` with `interactivity: ChatInteractivity.ReadOnly` and an `origin` of `{ kind: Tool, ... }`. The lead chat stays `Full` (the user steers the agent there) while the subagent chat is observable but read-only. The interactivity flows on the protocol `ChatSummary` into `applyChatCatalog` and through the provider-agnostic `IChat.interactivity` mapping above.

A second producer sits **outside** the protocol: `IAgentHostAdapterOptions.readOnly` (`baseAgentHostSessionsProvider.ts`) is an observable that forces every chat on a session read-only regardless of what the host reported, ORed with `isArchived` in the same `effectiveChatInteractivity` derivation. `RemoteAgentHostSessionsProvider.setReadOnly()` drives it, and the cloud sandbox contribution sets it when a managed sandbox's compute is gone and the session is being served from Mission Control's persisted history (`cloudSandboxReadOnlySessionHandler.ts`): the transcript is genuine, but there is no host left to send to. It is deliberately distinct from a `disconnected` connection status, which may still come back.

**Surfacing subagent chats as tabs.** Subagent chats are hidden from the tab strip by default, but can be surfaced as read-only peer tabs (in addition to the inline `ChatSubagentContentPart` rendering in the parent chat). Two pieces make this work:

- `applyChatCatalog` (`baseAgentHostSessionsProvider.ts`) surfaces a non-default chat as a peer when the session supports multiple chats (`copilotcli`) **or** the chat is a subagent (`origin.kind === Tool`). So subagent chats exist in the peer-chat catalog even in single-chat session types (e.g. `claude`), while ordinary user/fork/side-chat peers still require the usual session support.
- `VisibleSession` keeps tool-origin chats out of `visibleChatTabs` until the user explicitly opens one (for example from the transcript pill or the **Conversations** menu). `chatCompositeBar` renders whatever is in `visibleChatTabs`, so user-created peers such as side chats behave like ordinary tabs while subagents stay hidden/read-only by default. The trailing **New Chat** action remains gated to `capabilities.supportsMultipleChats`, so single-chat sessions that merely host a subagent don't expose chat creation.

Non-main chat tabs close from their close button, the active-chat close keybinding, or a middle click anywhere on the tab. Closing a committed chat hides it until it is reopened from the **Chats** menu, from the palette (**Reopen Last Closed Chat**), or with `Ctrl/Cmd+Shift+T` (**Reopen Closed Chat or Session**, which restores whichever chat or session was closed most recently); closing an untitled draft deletes it.

Subagent chats **persist** in the session catalog after the subagent completes (completion only marks the chat's turn complete; the chat is removed only when the whole session is disposed), so the read-only tab stays reviewable for the lifetime of the session.

**Opening a subagent chat from the transcript.** `ChatSubagentContentPart` and `OpenSubagentChatActionViewItem` provide one shared rich pill in both windows. The Agents window opens the surfaced peer chat; regular chat editors use the default-enabled `chat.subagents.useRichRendering` setting to open the child in a read-only editor instead of rendering its full activity inline. Editor-hosted children show the shared **This chat is read-only** banner above the transcript.

The pill reads live status, timing, title/model metadata, and active-tool data from the parent invocation; history enrichment restores the same data after recreation. Inline model text is hidden only when it matches the parent, while hover/ARIA always include the child model. Streaming tools do not replace the current formed tool; same-tool updates render in place, and only a new `toolCallId` animates. Hover, pointer cursor, and click are scoped to the bordered pill, not its attached tool row.

Editor opening carries the exact upstream `ahp-chat://subagent/...` channel on the editor resource. `AgentHostSessionHandler` validates its chat id and owning session before subscribing, avoiding a dependency on `SessionState.chats` hydration. The pill itself never acquires the child `ChatModel`; only explicit opening does.

**Confirmations in read-only subagent chats.** Read-only hides the composer, but the tool-confirmation carousel remains visible and keeps the input part in layout. This lets multi-chat/side-chat subagent views resolve their own confirmations without making the chat message composer interactive.

A terminal parent response is authoritative for active subagent timing. Stop can surface as either a canceled or completed response depending on the provider/turn path, so every terminal response force-finalizes active subagent parts with a local duration fallback; otherwise `Working for …` can continue indefinitely until reload. Non-terminal responses still follow the child chat's own active state.

**Subagent terminal progress.** When the last meaningful response part is the parent subagent invocation, its pill is the active progress affordance and `ChatListItemRenderer` must not append a second generic shimmering working-progress phrase below it. Child tool/hook updates can arrive later in the raw response array while still rendering inside an earlier pill, so they must not suppress progress that visually follows normal markdown. Subagent-tagged or regular markdown is supporting output, not the pill itself; if markdown follows the pill, normal working-progress rules apply.

**Restoring subagent chats.** Subagent chats are in-memory only; on restart the agent host restores them as separate sessions but no longer re-adds them to the parent catalog. `AgentService._registerRestoredSubagent` mirrors the live `_handleSubagentStarted` flow on restore — it re-adds the subagent to the parent session's catalog (same `ahp-chat://subagent/...` chat URI, `origin: Tool`, `interactivity: ReadOnly`, restored turns) so it remains available to reopen as a read-only tab.

History restoration must also repair parent tool calls whose persisted `_meta`/subagent result content was lost. `AgentHostSessionHandler._enrichHistoryWithSubagentCalls` treats the session's tool-origin chat catalog as the canonical spawn record: a serialized tool call whose id matches `origin.toolCallId` is upgraded to `toolSpecificData.kind === "subagent"` with the catalog title/resource, so reload renders the pill instead of a generic "Delegating task" row.

**Chats dropdown groups.** `SessionConversationsMenuContribution` contributes each visible session's navigation actions to `Menus.SessionConversations`. Ordinary chats, forks, and side chats use `1_chats`; tool-origin chats associated with the active chat use `2_subagents`. These fixed group IDs map directly to local **Chats**/**Subagents** presentation metadata in `SessionConversationsActionViewItem`; no separate group registry or contribution is used. The top-level **Chats** header is hidden because it repeats the dropdown's own label; the existing **Subagents** group title explains the separation from first-level conversations. `SessionConversationsActionViewItemContribution` registers the custom renderer with `IActionViewItemService` for `(Menus.SessionHeaderMeta, Menus.SessionConversations)`, so the generic `MenuWorkbenchToolBar` resolves it before the normal meta-pill fallback. Conversation actions omit `checked`, so Action Widget renders them as ordinary menu items; only actions with an explicit boolean `checked` state use checkbox semantics. On open, `getInitialFocusActionId` focuses the active chat or active subagent directly.

When the menu contains exactly one first-level chat, that row is redundant and is omitted; only the active chat's Subagents group remains. Side chats count as first-level chats, so their presence retains the first-level chat list.

Each row displays the existing Sessions status icon (`ISessionsListModelService.getStatusIcon`). Non-default/actionable states also show localized text: **New**, **In Progress**, **Input Needed**, or **Failed**. **Completed** stays visually quiet (status icon only) because it is the common settled state, but its accessible description still says **State: Completed**; every other state likewise receives an explicit **State: _status_** label so progress is not color/icon-only. The Subagents group title and state indicators cover #329176 in the current design: separation is named, and each conversation exposes its progress without redundant subtitle or completion copy.

Subagent association uses `IChatOrigin.parentChat`. A regular active chat scopes the flat Subagents group to children that name it as parent. When a subagent is active, its `origin.parentChat` is used as the scope so sibling subagents stay listed. Side chats remain ordinary first-level conversations and scope any of their own subagents normally. `SessionActiveChatHasSubagentsContext` uses the same expression so the dropdown remains visible even if no second committed user chat exists. Subagents on their own do **not** show the chat tab strip: `IActiveSession.shouldShowChatTabs` is shown only when there is more than one visible tab (e.g. a subagent explicitly opened as a tab alongside the main chat) — a subagent that has not been opened as a tab is ignored. The **Chats** dropdown is always surfaced in the **session header meta row** (at the end of the pills), independent of the strip's visibility.

**Browsers and background activities above the chat input.** `SessionChatInputToolbar` mounts two independent activity pills, both rendered by the shared `SessionActivityPill` widget (which owns only the button, picker, and visibility — each control supplies its own activities, category titles, icons, and multi-activity summary): a **browsers** pill (`SessionBrowsersControl`) for live integrated browsers, and a **background activities** pill (`SessionBackgroundActivitiesControl`) for the viewed chat's active subagents — the latter is the extension point for further background-activity kinds. Browsers come from `IBrowserViewWorkbenchService.getKnownBrowserViews()` and belong to the viewed chat when their `IBrowserViewOwner.sessionId` matches that chat or one of its direct tool-origin subagents; subagents come from the owning session's tool-origin chats whose `origin.parentChat` is the viewed chat and whose status is active (`InProgress` or `NeedsInput`). Keeping `NeedsInput` visible is important because a pending tool or input confirmation does not end the subagent's active turn. A pill with a single activity shows its kind icon and label (browser page title, falling back to "Browser"; subagent title truncated after 30 characters with `...`). Multiple activities of one kind show **N Active Browsers/Subagents**; a pill holding mixed kinds shows **N Background Activities** with the session-in-progress icon. Any multi-item pill opens `IActionWidgetService` with categorized **Browsers** and **Subagents** sections (browser section first), where every selectable row has its kind icon and label. Opening a browser activity prefers a contextual browser page already **Sharing with Agent** for the same destination (exact URL first, then the browser tools' same-host rule), so the user sees the page the agent is driving; when no shared match exists, it opens the activity's normal browser input. The boolean `chat.turnStatusPills` setting gates the entire status-pills surface; for compatibility, any `true` member in the former per-pill object form enables the whole surface. When enabled, completed-turn pills replace the older checkpoint file-changes summary. Completed `create_session` and `create_chat` result pills are rendered once the response completes and ordered after the final response markdown has drained to the DOM, alongside the completed-turn adjuncts, so they remain visible instead of being folded into the completed-work disclosure or being repositioned while focused. `ChatView` mounts the toolbar in `ChatInputPart.persistentContentContainerElement`, which remains in layout when `ChatWidget.setReadOnly(true)` hides the rest of the composer, so these pills also remain available on read-only chats.

**Debugging chat input UI without a live session.** Outside stable quality, the Developer command **Configure Fake Session Chat UI** is contributed to the Command Palette only while the active concrete session view is `ChatView` (not the new-session or new-chat composer). `SessionChatPillsDebugService` owns the command, active-view registration, and modal form. The form accepts non-negative files/insertions/deletions counts, failed/pending CI check counts, PR/agent feedback-to-address counts, plus comma- or newline-separated Markdown file names, subagent names, and browser labels. Its changes section also offers an auto-increment checkbox: while enabled, a disposable two-second interval independently increases insertions and deletions by values from 0 through 15. Each increment is the minimum of two uniform samples, giving strictly decreasing probabilities (0 most likely, 15 least likely). **Apply** forces the active toolbar and `SessionInputBanners` host to render those values independently of provider state, dismissal state, and `chat.turnStatusPills`; **Clear** removes the override; **Cancel** leaves it unchanged. Fake banner actions and dismiss controls are inert so they cannot invoke real CI or feedback operations. Applying again replaces the previous interval; Clear, active chat/view changes, and service disposal cancel it through the service-owned `MutableDisposable<WindowIntervalTimer>`. All debug-only coordination is isolated in `sessionChatInputToolbarDebug.ts`; the production widgets expose only the small override seams consumed by that service.

Read-only is honored on both rendering paths: `SessionView` only routes an `Untitled` chat to the editable new-chat composer (`NewChatView`) when the chat is also `Full` — a non-interactive chat always uses the standard `ChatView` (whose `setReadOnly(true)` hides the input). Without this guard a freshly-added read-only peer chat (which is briefly `Untitled`) would surface the new-chat composer and remain editable.

The active session (`IActiveSession`) extends `ISession` with an `activeChat` observable that tracks which chat the user is viewing.

Chat input history in the Agents Window is scoped by `ISession.sessionId`. Pressing Up/Down in a chat input only navigates prompts previously submitted in the same session, including across multiple chats in that session. Users can disable `chat.agentSessions.scopedInputHistory` to restore shared input history across sessions. When a provider replaces a temporary untitled session with a committed session after the first send, history is moved from the temporary session id to the committed session id.

Agent-host chat input completions preserve the host's result order through Monaco sorting and filtering. Every result uses the current trigger token as its filter text because the host has already applied path-aware filtering and ranking.

### Workspaces and Folders

Each session operates on an **`ISessionWorkspace`** containing one or more **`ISessionFolder`** instances. Folders encapsulate a working directory and optional git repository information (`ISessionGitRepository`), including branch state, upstream tracking, and GitHub PR info.

Agent-host sessions retain up to ten deduplicated pull request URLs in most-recent-first order. Rediscovering a PR moves it to the front; legacy metadata containing a singular `pullRequestUrl` is read as a one-item list. The client projects the first entry as `IGitHubInfo.pullRequest`, so CI, review comments, session-list status, context actions, and all other existing PR behavior continue to target only the most recent PR. `IGitHubInfo.pullRequests` exposes the ordered history solely for the session-header pill: one PR renders `#N`, while multiple render `N Pull Requests` and open the same keyboard-accessible icon/number/title list used for referenced issues. The header keeps every retained PR's core state, CI checks, and review threads live so each row's icon and title stay current.

Workspaces carry a `group` label (e.g., `"Local"`, `"Remote"`) used by the workspace picker to organize entries into tabs via the `SESSION_WORKSPACE_GROUP_LOCAL` / `SESSION_WORKSPACE_GROUP_REMOTE` constants. The picker supplements its own history with VS Code's recently opened folders. Folders below a path segment ending in `.worktrees` or named `copilot-worktrees` appear only when the user previously selected them in an Agents picker; they are excluded from VS Code's general recents and never automatically preselected. For other folders, the picker restores the last explicitly selected workspace first, then other Agents-owned recents, and finally the most recent resolvable workspace from VS Code's general history. If none of those sources produces a workspace, `SessionWorkspaceFallback` examines the 15 most recently updated provider sessions, counts their primary workspace folders, and returns the most frequent folder that still resolves and exists; frequency ties prefer the workspace from the newer session. Quick chats and worktree sessions identified by `worktreePending`, `gitRepository.workTreeUri`, or the historical path heuristic are excluded. Late provider-session updates retry this final fallback until the user makes an explicit choice, except while the new-session surface is hosting a workspace-less quick-chat composer. The picker owns only fallback eligibility, race handling, and publishing the returned selection.

Tasks with `runOptions.runOn === "worktreeCreated"` are dispatched client-side only for sessions that this window has just started. `SessionsManagementService` emits `onDidStartSession` from `sendNewChatRequest` after `provider.sendRequest(...)` commits, and `WorktreeCreatedTaskDispatcher` tracks only those sessions until they report a concrete `gitRepository.workTreeUri`. Restored/synced catalog sessions and runtimes that declare `capabilities.runsWorktreeCreatedTasks` are skipped so setup tasks are not re-run on window open or double-run with server-side provisioning.

### Session Types

An **`ISessionType`** identifies an agent backend (e.g., `'copilot-cli'`, `'copilot-cloud'`). Each provider declares which session types it supports and can dynamically update the list via `onDidChangeSessionTypes`. The management service exposes `getAllSessionTypes()` for UI pickers.

Session types are surfaced ordered by each provider's `order` property (lower first; ties keep registration order). The default `order` is `0`; the local agent host provider uses `-1` so its session types sort before all other providers. The sort lives in `SessionsManagementService._getOrderedProviders()` and applies to both `getAllSessionTypes()` and `getSessionTypesForFolder()` — the orchestration layer stays provider-agnostic (it sorts purely by `order`, with no knowledge of specific provider ids).

The session type picker persists the last selection as `{ providerId, sessionTypeId }` (the `providerId` disambiguates when two providers offer the same `sessionType.id`, e.g. `copilotcli`). Like any picker, it writes storage whenever the value changes — both on a manual dropdown pick and whenever the active session's type changes — so an auto-selected or defaulted type also survives reload (otherwise the stored preference would be empty and the restored draft would fall back to the first provider by `order`).

On reload, providers register asynchronously and agent hosts connect lazily, so the preferred provider may not have surfaced its session types when the restored draft is created. Rather than blocking on a "ready" gate, `NewChatWidget` creates the draft immediately with the best available provider, then upgrades it in place once the preferred `(providerId, sessionTypeId)` pair becomes servable (driven by `onDidChangeSessionTypes`). The upgrade path subscribes before attempting draft creation and replays a provider change that arrives while creation is in flight, so readiness cannot land between the failed creation and listener registration. Starting a newer creation cancels the previous one, and `SessionsService` checks cancellation after workspace trust resolves but before it mutates the pending draft, so an older attempt cannot replace the latest selection. The listener has **no** timeout or `LifecyclePhase` give-up, since an agent host can connect arbitrarily late, and is cancelled if the user picks a different type or the draft is sent.

Scheduled automations follow the same lazy-registration rule. Before claiming a run row, `AutomationRunner` checks whether its exact target is currently advertised; an unavailable target is deferred without advancing `nextRunAt`, and `AutomationScheduler` retries due automations when `onDidChangeSessionTypes` fires. The automation dialog binds its chat input to the selected `ISessionType.chatSessionType` model target rather than the logical session type id, keeping extension-backed and Agent Host model namespaces distinct; when editing a legacy automation, it resolves a matching logical-target model into the selected concrete target before restoring the pick. Once a draft exists, an explicitly selected model waits on `getModelsSnapshot` / `onDidChangeModels` until it is available or conclusively unavailable, then applies the provider-resolved model identifier; workspace-backed drafts also re-check folder-specific session types. No startup delay or readiness timeout is used.

### Quick Chats

A **quick chat** is a workspace-less session — one that is not scoped to any folder, so `ISession.workspace` resolves to `undefined`. Quick chats let the user start a conversation immediately, without first picking a repository or worktree.

The contract is small and provider-agnostic:

- **`ISessionsProvider.supportsQuickChats`** (optional `boolean`) — whether the provider can mint quick chats. Providers that truly change capabilities at runtime can signal that via the optional **`onDidChangeCapabilities`** event. The local agent-host provider always supports quick chats whenever it is registered.
- **`ISessionsProvider.createQuickChat(sessionTypeId)`** — required when `supportsQuickChats` is `true`. Returns an untitled draft (like `createNewSession`) that is not added to the session list until the first request is sent.
- **`ISessionsManagementService.createQuickChat(options?)`** — selects the first quick-chat-capable provider (honouring `order` and `options.providerId`), resolves the session type from `options.sessionTypeId` or the last-used / first advertised type, persists the resolved type as last-used, and mints a new quick-chat session **per call** (New Quick Chat = new session).
- **`ISessionsManagementService.getQuickChatSessionTypes()`** — every session type advertised by quick-chat-capable providers, for the inline composer type picker.
- **`ISessionsService.openQuickChat(options?)`** — view-layer entry point; opens the quick chat as a normal session.
- **`ISession.isQuickChat`** (optional `IObservable<boolean>`) — set only by quick-chat-capable providers (absent ⇒ `false`). Consumers read it via the `isQuickChatSession(session)` helper. The agent-host adapter derives it from the host's `workspaceless` tag, **not** from `workspace === undefined`, which can be transiently undefined for workspace-bound sessions too.
- **`ISession.hasGitRepository`** (optional `IObservable<boolean>`) — provider-refined usable Git availability. `setSessionContextKeys` publishes it as `SessionHasGitRepositoryContext` in both root and per-session scoped context-key services, falling back to workspace repository metadata when absent. This keeps declarative menu visibility aligned with each toolbar's scoped `ISessionContext` when multiple sessions are visible.

Presentation: a quick chat is a **single-chat** session that uses the normal session header (no peer-chat tab strip); only the Done/archive affordance is hidden. Its untitled-title fallback is **"New Chat"** (not "New Session") — every fallback site (titlebar, session header, list hover, sessions picker) routes through the shared `getUntitledSessionTitle(isQuickChat)` helper (`services/sessions/common/session.ts`). **Cmd+N always creates a new session** (`NewChatInSessionsWindowAction` → `openNewSession`); a quick chat is created **only** via the "Chats"-section **"+"** (`NewQuickChatAction`, also bound to **Cmd+K Cmd+N**), which opens the composer with the inline session-type picker feeding `openQuickChat({ sessionTypeId })` on send. Peer chats within a session are a third gesture (chat **"+"** / Cmd+T). Keep these three creation actions distinct.

On the agent host, workspace-less is **inferred from an absent `workingDirectory`** at session start (forks are excluded — they inherit the source context), not from any wire flag. The host tags such sessions with `workspaceless` in the session `_meta` bag, gives each a stable per-session scratch directory, and uses a repo-less system prompt. See [`AGENT_HOST_SESSIONS_PROVIDER.md`](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md) for the host-side details and [`SESSIONS_LIST.md`](SESSIONS_LIST.md) for the in-list "Chats" section.

### Changesets

Sessions produce file changes organized into **`ISessionChangeset`** groups — named, togglable collections of file modifications that let users review and selectively apply changes.

Review-capable changesets expose `setReviewState(resource, reviewed)`. In the Changes multi-diff editor, the **Viewed** checkbox and a middle-click anywhere on the file-entry header invoke the same review action: marking a file viewed collapses its diff, while marking it not viewed expands it. Agent-host changesets dispatch the client-originated `changeset/filesReviewChanged` action to the changeset channel, where the subscription applies it optimistically and reconciles it with the server echo.

---

## Data Flow

### Creating a New Session

```
1. User picks a folder in the workspace picker
   → WorkspacePicker fires onDidSelectWorkspace(folderUri)
   → NewChatWidget → ISessionsService.openNewSession({ folderUri, ...options })
   → view resolves the folder via SessionsManagementService.resolveWorkspace(folderUri,
     options?.providerId) and, when the resolved workspace requires trust, awaits the
     workspace-trust prompt **before** creating anything; declining returns
     `{ session: undefined, trustDeclined: true }` and never calls createNewSession
   → view calls SessionsManagementService.createNewSession(folderUri, options?)
   → Iterates providers, picks the first one whose resolveWorkspace(folderUri)
     succeeds (filtered by options.sessionTypeId when given)
   → Calls provider.createNewSession(folderUri, sessionTypeId)
   → If another workspace draft is pending, deletes that provider draft and
     fires onDidReplaceNewDraftSession before publishing the replacement
   → SessionsTerminalContribution transfers terminals when the drafts share a
     cwd/backend; otherwise it rehomes the old terminals as standalone
   → Returns ISession (model draft, `newSession`); the view then activates it so
     it becomes the activeSession and the draft slot shows reactively, and
     openNewSession resolves `{ session, trustDeclined: false }`

   This trust gate is the **single** checkpoint for creating a session against a
   folder — every folder-based entry point (composer, quick pick, dropdown) goes
   through `openNewSession`, so none can bypass it. Callers distinguish "the user
   declined trust" from other non-creation outcomes (for example the no-provider
   case) via the returned `trustDeclined` flag rather than treating any falsy
   `session` the same way.

   Consumers that require asynchronous workspace acceptance must use
   `WorkspacePicker`'s `canSelectWorkspace` option so the decision runs before
   the selection is committed and remains covered by the picker's stale-selection
   generation guard.

2. User picks a different session type for the same folder
   → SessionTypePicker queries getSessionTypesForFolder(folderUri),
     groups entries by provider, shows them in the dropdown
   → On selection, fires onDidSelectSessionType({ providerId, sessionTypeId })
   → NewChatWidget → ISessionsService.openNewSession({ folderUri, providerId, sessionTypeId })
     routes through the picked provider — even when the same sessionType.id
     is also offered by another provider

3. User types a message and sends
   → SessionsManagementService.sendNewChatRequest(session, {query, attachedContext})
   → Calls provider.createNewChat(sessionId)
   → Provider creates the backend chat model and returns an IChat
   → Management fires onWillSendRequest(session); the view follows the send to
     keep the newest chat active in the visible slot
  → ChatView clears the embedded ChatWidget before loading a different chat,
    while its session-target picker keeps the destination chat's exact type
    (including extension-host Copilot CLI); before any chat is assigned it
    defaults to Agent Host Copilot. Chat input context keys also derive model
    targeting from that delegated type while the model resource is absent, so
    the model picker remains mounted during loading. Before clearing the old
    model, the view locks to the destination contributed chat session type (for
    example agent-host-codex), keeping the Agent Host mode and permission
    pickers mounted too; follow-up turns therefore route to the owning provider
   → Delegates to provider.sendRequest(sessionId, chatResource, options)
   → Provider sends request, returns committed session
   → Management fires onDidStartSession(committedSession) + onDidSendRequest(...)
   → isNewChatSession context → false
```

The repository section's **Create Session from Pull Request** action calls `ISessionsManagementService.createAndSendNewChatRequest` with worktree isolation, the checkoutable GitHub `refs/pull/<number>/head` ref, `worktreeBranchTrack: true`, and initial GitHub session metadata containing the selected PR URL and source branch. Using the pull ref makes fork PRs resolve to the selected PR commit instead of an unrelated same-named branch on the base repository. Agent Host carries the metadata through eager `createSession`, publishes it as the session's standard GitHub state, and persists it when the session becomes ready; this drives the PR icon and actions without waiting for branch-based lookup. Headless provider resolution skips session types that do not advertise worktree configuration. Before invoking the synchronous `onSessionCreated` hook, the management service calls the provider's optional `startNewSessionRequest` hook so an untitled draft enters its preparing state and renders the real chat shell. `onSessionCreated` then activates that provisional session and closes the picker before worktree configuration starts. The transcript readiness status uses the same provider-agnostic session status message as the sessions-list row (for example, **Creating isolated worktree (42%)**), falling back to **Getting ready...** before activity arrives; it remains visible while the model is loading, has no request, or is running only the hidden bootstrap, and disappears when that bootstrap completes or any visible request appears.

Before creation, GitHub supplies one JSON snapshot containing the PR title/description, all paged file patches, and all paged issue-level and review comments in chronological order. The snapshot uses the first-class transcript-context attachment kind on the hidden bootstrap and is represented by a PR context pill at the top of the empty transcript. On the first visible submit, `ChatWidget` synchronously adds the same attachment before it captures request context (including programmatic `preserveInput` sends); the standalone pill disappears and the normal request context row owns it from then on. A rejected/failed send restores the standalone pill for retry. Agent Host preserves the kind, PR URL, icon, and tooltip through its simple-attachment round trip.

The bootstrap request records the pull request identity, explicitly forbids inspection/tools/file operations, and asks only for a readiness acknowledgement. `hideFromTranscript` marks the request and response as hidden in the live chat model and in Agent Host message metadata, so the bootstrap turn remains available as model history but is omitted from the transcript, including after restore. A visible message submitted while that hidden turn is active is queued rather than steered into the hidden response, ensuring any resulting tools or confirmations belong to a visible request.

Follow-up messages to an existing chat go through
`SessionsManagementService.sendRequest(session, chat, options)`. The view makes
the sent chat the active chat by reacting to the send events. When
`options.background` is set, the send is **fire-and-forget** and skips the
`onWillSendRequest` notification, so the view's send-follow never navigates the
visible slot into the sent chat — see _Adding a Chat to an Existing Session_
below.

When fixing transient picker state during chat loading, keep the fallback in
`ChatView`'s reactive session-type delegate; it announces the destination as
soon as `setChat` assigns it, and the rendered target picker and chat input
context keys react before the model loads. Changing the shared picker's defaults
or visibility would alter intentional behavior outside that transition.
All chat-input context derived from the session type must use the same effective
type (the scoped delegate when provided, otherwise the model resource), or
individual picker slots can disappear during the handoff.
Likewise, update the widget's coding-agent lock from the destination type before
clearing the old model; waiting for the new model to load transiently hides
Agent Host-only mode and permission actions.

For agent-host sessions, the floating turn-status pills above the chat input read
the viewed chat's `lastTurnChanges` while the turn streams. They remain visible
when the chat transitions from `InProgress` to `NeedsInput`, since tool or input
confirmation does not end the active turn. Opening the changes pill labels its
multi-diff editor **Current Turn Changes** while the turn is active, including
`NeedsInput`, and updates the open editor to **Last Turn Changes** as soon as the
turn completes. Each `lastTurnChanges` entry carries
`isOutsideWorkspace`, derived from the owning session's workspace folder,
working directory, and worktree roots. `AgentHostSessionAdapter` caches that
classification in its generic session-output cache under
`isOutsideWorkspace:${uri.toString()}` and clears the cache when its workspace changes.
The changes count and diff include only workspace entries, while the markdown
preview pill includes only external entries. The completed-response pill receives
the same per-session classification from its response-file provider. The preview
pill itself stays a compact resource label (file icon + name); preview wording is
kept to tooltips and actions, not rendered as visible pill text.

Explicit user-initiated "new session" gestures (Ctrl/Cmd+N, the **New** button,
the mobile titlebar "+" button, and the sessions quick picker's "New Session"
item) call `ISessionsService.openNewSession()`. With no `folderUri` this
switches to the new-session view, restoring the in-progress draft (`newSession`)
when one exists or showing the empty placeholder otherwise. Internal callers
(restore fallback, archive, background reseed, and the close-session fallback)
invoke `openNewSession()` the same way.

The new-session input separately persists its text and attachments in
workspace-scoped machine storage. `NewChatWidget` saves that draft when it is
disposed (for example, when navigating to an existing session), and the
replacement widget restores it when the user returns to the new-session view.
Starting a send clears the stored draft before request dispatch and any view
replacement.

The V3 new-session onboarding tour uses the same first-request, sign-in, view,
and workspace-picker readiness gates as V2. The trigger also waits for the real
`restoreVisibleSessions()` operation to settle, rather than guessing readiness
with a delay. Its workspace step is shared with V2, so it appears only when no
workspace is preselected. Once that step completes (or is skipped because a
workspace was preselected), the sequence advances to a non-visual `run` step
that finds the mounted editable new-session composer through
`INewSessionComposerService`. The `prompt` and `githubPrompt` variations fill the
input over 2.5 seconds. The `options` variation first shows three loading
skeletons, then resolves up to two assigned, unlinked GitHub issues followed by
up to two authored pull requests with failing CI or unaddressed review comments.
`options` is the default when no variation treatment is assigned; `prompt` and
`githubPrompt` remain available as explicit treatments and developer overrides.
Any remaining slots are filled, in order, by the standard Implement a feature,
Fix a bug, and Fix CI options. GitHub work is resolved silently with bounded
cancellable lookups and shared issue/pull-request state icons. The complete
lookup has a 10-second ceiling; summary requests receive up to 5 seconds,
issue-linkage requests 2.5 seconds, and review-thread requests 4 seconds within
that total budget. Failures and timeouts leave every candidate completed by that
point in place and fill the rest with standard options. Repository discovery and
API authentication use github.com by default. When GitHub Enterprise is
configured, repository discovery accepts only that Enterprise host and API calls
use its endpoint and `github-enterprise` authentication provider; hostless
session metadata and github.com remotes are not mixed into that connection.
Changing the selected
workspace clears the repository-specific option set immediately, shows loading
skeletons, and starts a fresh lookup for the replacement draft so cards from the
previous repository cannot be inserted into the new workspace. Clearing the
workspace cancels the active lookup, removes only untouched/generated option
text, and hides the widget so stale results cannot reappear.

Selecting the first option focuses the input immediately and animates its prompt
into an empty input. Later selections replace the generated prompt immediately.
A different option can replace the input only while it is empty, exactly matches
the previously selected prompt, or exactly matches that prompt after its editable
placeholder was activated and removed. Any other edit disables every option but
preserves the selected presentation; clearing the input clears the selection and
enables every option, while restoring either exact generated form enables the
options without clearing the selection. The option widget remains mounted after
selection and is disposed with the composer. Its heading row ends with a close
action that cancels an in-flight lookup, hides the widget for the lifetime of
that composer, preserves inserted or partially typed text, and returns focus to
the input. GitHub numbers and repository titles use the standard foreground so
they retain contrast across themes. Standard prompts contain action-specific
editable placeholders and the same inspect, explain, implement, and validate
guidance as the prompt variation.

Successful option insertions and the close action emit
`onboarding.promptOptionInteraction`. The event records only the interaction and
a fixed option category (`implementFeature`, `fixBug`, `fixCI`, `githubIssue`,
`githubPRCI`, or `githubPRComments`); it never records issue/PR numbers, titles,
URLs, prompt text, or other repository content.

GitHub prompt personalization must keep repository discovery and API connection
selection on the same host. Do not add Enterprise hosts to the github.com
allowlist while routing every API request through Enterprise; either preserve
the resolved host through the request or make Enterprise discovery exclusive,
including hostless metadata paths.

The run step awaits typing or option resolution and forwards sequence
cancellation; cancellation or composer disposal preserves only text already
typed and removes unresolved loading UI, while explicit placeholder activation
completes the template before replacement. Run steps count in sequence telemetry
but not in spotlight progress; V3 therefore has two sequence steps while
displaying one spotlight step. Reduced-motion and screen-reader modes fill a
selected template at once. The task placeholder uses the same themed highlight
as slash commands. Clicking it, or placing the caret inside and pressing Enter,
removes the placeholder, focuses the input, and places the caret at the
replacement position.

Non-visual onboarding behavior must not be attached to a spotlight payload as a
completion callback. Model heterogeneous tours with the sequence presentation
and explicit step kinds (`spotlight`, `run`, and future kinds such as `pulse`),
so spotlight counters include only visual spotlight steps while sequence
telemetry retains every step.

The new-session view mounts the aquarium action outside
`.new-chat-widget-content`. Its surrounding surface has checked **Aquarium** and
**Pet (/vscode-pet)** context-menu items. `AquariumService` owns the
application-scoped action visibility preference; `IChatPetService` owns the same
persisted pet state used by `/vscode-pet`. Context-menu events from inside
`.new-chat-widget-content` are left untouched so the composer retains its own
context-menu behavior. The aquarium preference is also keyboard-accessible
through the **Developer: Toggle Aquarium Action Visibility** command.
`NewChatView` forwards its effective grid visibility to the aquarium mount so a
hidden composer cannot leave the aquarium rendering behind the visible chat
surface. Since `NewChatView` also hosts the peer-chat composer,
aquarium-specific lifecycle calls must first narrow the wrapped widget to
`NewChatWidget`. The pet's sprites are scheduled at their source frame
boundaries instead of polling at the display refresh rate, and scheduling pauses
while the document is hidden. In both the shared chat input and new-session
composer, the pet host spans the complete input stack while its optical bottom
edge aligns to the topmost visible surface in that stack. Placement follows the
measured input-to-host inset up to the confirmation alignment, so persistent
content above the input becomes the active platform. Passive status pills in the
persistent-content slot are excluded from that calculation; confirmations,
questions, banners, and other substantive surfaces still become the platform.
The new-session composer uses its root as the pet's movement bounds rather than
the nested input area so pickup and falling remain valid across the view. When
the pet approaches the input's
right edge while rendering, its speech bubble moves to the pet's left
so the ellipsis remains visible without changing the pet's direction. Other pet
states keep their standard presentation. Dragging uses a subtle wiggle while the
current drop target lands on the input and a stronger wiggle when it will fall
off. Falls accelerate with distance; revival returns the pet to its default
position 32px from the active platform's right edge.

Agent feedback created while the active session is undefined or uncreated uses
one shared new-session feedback scope, so it follows every undefined/uncreated
new-session view. The comments belong to the draft's workspace: a draft that has
already picked one scopes its comments to that workspace's folders exactly like a
created session, and selecting a different workspace in the picker discards them.
A draft without a workspace accepts comments on any file and simply adopts the
first selection. The composer shows a non-dismissible `N comments` banner above
the input; **Reveal** opens the first comment through the editor feedback UI, and
normal feedback navigation reaches the others. Comments make an otherwise-empty
composer sendable. On send, the prompt is followed by one bullet per comment in
`comment (workspace/relative/path:line:column-line:column)` form, with replies as
nested `reply:` bullets. The sole comment omits its leading bullet when the typed
prompt is empty. A successful send removes the comments; a failed foreground send
keeps them. Editor **Submit Feedback** delegates to this same live composer path,
opening the composer first when it is not mounted in the grid, and opens the
workspace picker without clearing input or comments when no concrete draft exists
yet.

The editor feedback toolbar's visual widget is shared with workbench plan review
through `AgentEditorCommentsOverlayWidget`. Each host keeps its own menu actions
and state adapter, while the toolbar layout, count presentation, action rendering,
keyboard labels, and styling have one workbench-owned implementation.
Plan review binds the plan resource to its owning session while that review is
active. Only accepted comments created after the active review registration are
included in plan submission, so pre-existing or already-submitted session feedback
is not resent or cleared. Ownership snapshots include hidden feedback states so a
pre-existing comment cannot become plan-owned merely by transitioning to accepted.

Agent-host feedback is session-scoped and shared by every peer chat. The feedback
server tools normalize chat channels to the parent annotations channel, while the
review-confirmation command bridge resolves the rendered `IChat.resource` through
`ISessionsManagementService.getSessionForChatResource` before reading or mutating
feedback. This keeps the unreviewed count, picker contents, and reveal selection on
the same parent session even when the tool is invoked from an additional chat.
`viewUnreviewedComments` returns an explicit picker selection when one exists;
otherwise, including when confirmation is automatically approved, it returns every
created PR and code-review comment and transitions them directly to `submitted`.
The picker disables **Reveal Selected** when no comments are selected. When there
are no created comments or pending selections to reveal, providers execute the
empty tool call without presenting a confirmation, regardless of permission mode:
Copilot and Claude gate their confirmation on
`IAgentServerToolHost.requiresConfirmation`, while Codex runs server
tools as dynamic tool calls, which never round-trip for approval.

Per-session view state (the last active chat, the set of closed chats, grid
order, stickiness, and which slot was active) is held in `SessionsService`'s
`_sessionStates` map and serialized to workspace-scoped machine storage. The
grid order / stickiness / active-slot flags are snapshotted from the live grid
at save time (`onWillSaveState`), the last active chat is tracked reactively,
and the closed-chat set is maintained **deterministically** in
`closeChat`/`openChat` (`_setChatClosedState`) — adding the chat's resource when
it is closed and removing it when reopened. This matters because switching to
another session disposes the previous session's `VisibleSession` wrapper (and
its in-memory closed set) before the next storage flush; keeping
`_sessionStates` current means switching back re-seeds the wrapper
(`_restoreClosedChats`) with the right closed chats, so closed tabs stay hidden
across both reloads and session switches. The set is updated on the close/open
action itself rather than derived from the `closedChats` observable (which
intersects with the session's _loaded_ chats), so it never depends on chats
having loaded or on autorun timing. Stale URIs for chats that were later deleted
are harmless: restore intersects the persisted set with the live chat list.

`ClosedItemHistory` (`services/sessions/browser/closedItemHistory.ts`) owns
reopening entirely: an **in-memory, single-entry** memo of the most recently
closed chat or session, plus the logic to put it back. It backs
`SessionsService.reopenLastClosedItem()` (`Ctrl/Cmd+Shift+T`, "Reopen Closed
Chat or Session"), which is a one-line delegation, as are the three recording
call sites. It deliberately holds one entry only: reopening consumes it, so
pressing the chord repeatedly cannot walk further back through history, and a
reload starts empty. Exactly three things record into it —
`recordClosedChat` (from `closeChat`), `recordClosedSession` (from
`closeSession`, which reads the session's current grid slot itself), and
`recordReplacedSlot`, which `VisibleSessions.setActive` reports through a
constructor callback when a newly opened slot pushes a non-sticky session out.
An untitled draft is discarded rather than hidden, so it never records;
deletions and grid restores never record either. **Close All Chats** closes
each chat through the same `closeChat` path, so it passes
`{ skipHistory: true }` — remembering only the final chat of a batch would make
one arbitrary member of it reopenable. `reopenLast()` consumes the entry
**before** acting, then re-resolves the session by id (the recorded one may be
a disposed wrapper, and a provider can drop a session from its catalog without
firing `onDidDeleteSession`); consuming first means a no-longer-resolvable
entry cannot linger and leave the command enabled but permanently inert. A
chat is reopened with the service's `openChat`; a session
that was closed explicitly returns via `insertAtIndex` to the grid index it
occupied, while a session that was pushed out uses `replaceSlot` to take its
slot back, removing whatever replaced it (including the empty new-session
slot). It runs inside an internal suspension so its own activations cannot
re-record, and the entry is dropped when its session is deleted
(`onDidDeleteSession`). The class also binds `SessionsHasClosedItemContext`,
which drives command-palette visibility; the keybinding itself is not
gated on it, so outside the editor scope the chord always belongs to the
sessions area. "Editor scope" is `SessionsEditorScopeContext`
(`common/contextkeys.ts`) — `editorAreaFocus || auxiliaryBarFocus`, i.e. an
editor part or the auxiliary bar, which the single-pane layout docks into the
side pane as the detail panel. While it holds, `Ctrl/Cmd+Shift+T` falls through
to VS Code's own **Reopen Closed Editor**. The other chat-tab chords
(`Ctrl/Cmd+W`, `Ctrl/Cmd+T`, `Ctrl+Tab`, …) remain scoped on `editorAreaFocus`
alone.

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
purely a management/UI concern. The gesture is **Alt+Enter** (or **Alt-click**
the Send button); plain Enter / click sends in the foreground. It is offered both
by the new-session composer and by the new-chat-in-session composer (see _Adding
a Chat to an Existing Session_ below).

For callers outside the new-session composer,
`createAndSendNewChatRequest(folderUri, options, createOptions?)` creates a fresh
session for the folder and sends the request in one call, **without** touching
the pending/active session or navigating the current view — the started session
just appears in the sessions list once the provider commits it. It shares the
underlying commit helper with the composer's background send; if the send fails
it disposes the stranded draft via `deleteNewSession` and rejects so the caller
can react. After resolving
the exact provider/session type and workspace once, it checks that workspace's
`requiresWorkspaceTrust` policy and queries resource trust before
`provider.createNewSession`. An untrusted required workspace rejects with
`WorkspaceNotTrustedError`, so headless callers fail closed before provider code
can load workspace-controlled configuration or run commands.

### Adding a Chat to an Existing Session (Agent Host Multi-Chat)

Providers that set `capabilities.supportsMultipleChats` can host several peer
chats inside one session that share a single backend scope (workspace, model,
config). For the agent host providers this is enabled for the `copilotcli` and
`claude` session types, whose backends (`CopilotAgent` / `ClaudeAgent`)
implement the peer-chat lifecycle (`createChat` / `disposeChat` / `getChats`).

```
1. User adds a chat to a running session
   → SessionsManagementService.createNewChat(session)
   → Provider.createNewChat(sessionId)
   → (existing running session, not a draft) → _createAdditionalChat:
       • mint a client-chosen chat URI: buildChatUri(sessionUri, uuid)
         (ahp-chat://<chatId>/<base64(session)>; the chatId also rides in the
          IChat.resource URI fragment so the chat view opens a distinct widget)
       • connection.createChat(sessionUri, chatUri, { model })
       • host adds the chat to the session's catalog and emits SessionChatAdded
       • the session-state subscription stays alive, so the catalog change flows
         into applyChatCatalog and surfaces the new IChat in ISession.chats
       • waitForState resolves once the new chat appears; getOrCreateChatSession
         opens its widget
   → Returns the new IChat
```

The **new-chat-in-session composer** (`NewChatInSessionWidget`) is shown when the
active chat is `Untitled` (`openNewChatInSession` creates/reuses an untitled chat
and makes it active). Sending from it calls
`sendRequest(session, untitledChat, options)`. Plain Enter / click sends in the
**foreground** (the view follows the send and navigates into the now-running
chat). **Alt+Enter** / **Alt-click** sends in the **background**: the widget first
resets the composer to a fresh untitled chat via
`openNewChatInSession(session, { forceNew: true })`, then the management service
runs the send fire-and-forget without firing `onWillSendRequest` (so the view's
send-follow never navigates into it). `forceNew` skips the reuse-untitled lookup
so a genuinely new chat is created rather than re-binding the composer to the
chat being sent. The user stays in the composer to start another parallel
conversation while the sent chat appears in the session's chat list once it
commits.

The reset is sequenced **before** the send on purpose. Creating the replacement
chat (`provider.createNewChat`) and dispatching the send both reach into shared
chat-session state (`acquireOrLoadSession` / `getOrCreateChatSession`) for chats
in the **same group**. Running them concurrently raced and left the sent chat
stuck spinning with its message never dispatched. Fully awaiting the composer
reset before firing the background send keeps the send running on its own.

Tab order in the chat composite bar is **stabilised by the renderer**, not by
the providers. The rebuild autorun (in `browser/parts/chatCompositeBar.ts`)
keeps each provider's reported chat order but moves any in-composer `Untitled`
chat to the end. This is provider-agnostic on purpose: the agent host re-sorts
its `state.chats` catalog when a chat finishes a turn (moving the just-completed
chat to the end) — pinning the untitled composer chat last keeps a
just-completed background chat from visibly jumping past it in the tab strip.

On the host, `AgentHostStateManager` keeps an authoritative multi-chat catalog
per session: `addChat`/`removeChat` create/delete a per-chat `ChatState` and
dispatch `SessionChatAdded`/`SessionChatRemoved`; the default chat (whose
resource equals the session resource) cannot be removed and is deleted only when
the whole session is removed. Each AHP `SessionState` therefore carries a `chats`
array plus a `defaultChat` pointer.

`AgentService.createChat`/`disposeChat` resolve the owning agent via
`_findProviderForSession` — **not** the `_sessionToProvider` map directly. That
map is only populated by `createSession`, so a session **restored** after a host
restart (present in the state manager but never created in this process) is
absent from it. `_findProviderForSession` falls back to the session URI's scheme
provider (e.g. `copilotcli`), so adding a peer chat to a restored session works
just like sending it a message. Using the raw map here would throw
`no provider for session` and silently break Add Chat for restored sessions.

The provider's `applyChatCatalog(state)` reconciles that catalog into observables:
the default chat maps to the session's primary `IChat` (`mainChat`); every other
catalog entry becomes an `AdditionalChat` keyed by its `chatId`, disposed when it
leaves the catalog. Single-chat sessions (or non-multi-chat types) degrade to
`[defaultChat]`.

`AdditionalChat` is a disposable. The owning `AgentHostSessionAdapter` extends
`Disposable` and holds its peers in a `DisposableMap`, so peers are disposed both
when reconciliation drops them and when the adapter itself is evicted from
`_sessionCache` (session removed/deleted) or the provider is disposed. Never drop
a peer with `map.clear()`/`map.delete()` — use `clearAndDisposeAll()`/
`deleteAndDispose()` so the `AdditionalChat` is actually torn down.

#### Forking into a new chat (multi-chat sessions)

For sessions that support multiple chats, the **Fork Conversation** gesture
creates a new **peer chat** in the _same_ session — seeded with the source
chat's history up to the fork point — instead of a brand-new session. The
single-chat fork (which mints a new session via `createSession({ fork })`) is
kept as the fallback for non-multi-chat sessions.

Routing: `ForkConversationAction` exposes a `_tryForkAsChat` hook (default
no-op). The Agents window override (in `agentHostForkActions.ts`)
resolves the owning `ISession`, and only for agent-host sessions that
`supportsMultipleChats`, calls
`ISessionsManagementService.forkChatInSession(session, sourceChat, turnId)` →
`ISessionsProvider.forkChat` and then `openChat`s the new chat. The service
returns the new chat or throws (for example when the session does not support
multi-chat forking); it never returns `undefined`. Non-agent-host sessions keep
the new-session fork path. The `turnId` is the **last turn to keep**: forking
from a selected request forks _before_ it (so `turnId` is the previous request's
id), matching the new-session fork path (`AgentHostSessionHandler._forkSession`);
forking the whole conversation keeps everything up to the source chat's last
request.

On the agent host, `forkChat` mints a client-chosen chat URI and calls
`connection.createChat(sessionUri, chatUri, { fork: { source, turnId } })`. The
`source` is the backend chat URI (a `chatId` fragment addresses a peer chat,
otherwise the session's default chat). `AgentService.createChat` resolves the
source chat's turns up to the fork point, mints fresh turn IDs
(`fork.turnIdMapping`), forwards the fork to the agent, and seeds the new chat's
`ChatState` with the remapped turns (`addChat({ turns })`) plus a `Forked:`
title. If the requested `turnId` is not present in the source state, the fork is
dropped (mirroring the no-turn `createSession` fallback) so the agent does not
inherit the whole backend conversation while the new chat is seeded with zero
turns. `CopilotAgent.createChat` forks the source chat's SDK conversation
(`sessions.fork` at the turn's event id), copies its database into the new
chat's data dir, resumes it, and `remapTurnIds`. The forked chat is committed
(not `Untitled`) and surfaces through the normal `SessionChatAdded` catalog
flow.

The `Forked: <source>` title is only a placeholder: because a fork seeds
pre-existing turns, the usual first-message/first-turn title generation never
fires for it. Instead `AgentService` calls
`AgentHostSessionTitleController.generateForkedTitle` once at fork time (for both
forked chats and forked sessions), which summarizes the inherited conversation
via the Copilot utility model and replaces the placeholder with a
content-derived title. The context lists the kept turns oldest-first and, when
the source title is known, prepends a short framing note that the conversation
was branched from that earlier chat so the model titles the ongoing topic (the
prompt forbids labelling the result as forked/branched). The conversation
context is bounded to the same character budget (middle-truncated) as first-turn
refinement, so it costs at most one small-model call, and a concurrent manual
`/rename` suppresses it.

#### Side chats (`/btw`)

A **side chat** is a peer chat branched from an existing chat's latest turn
to ask an unrelated, "by the way" question without polluting the source
conversation. Unlike a fork (which continues the same line of work as a new
chat), a side chat is meant for a tangential question, but it still reuses the
same ordinary peer-chat surfaces as any other user-created chat.

Capability: `ISessionCapabilities.supportsSideChat`, derived by the agent host
provider from `agentCapabilities.multipleChats.sideChat` (mirroring
`supportsMultipleChats`/`fork`). Only providers with a complete side-chat
context/restore implementation advertise it (currently Claude and Copilot).

Origin: side chats carry `IChat.origin.kind === ChatOriginKind.SideChat`. They may also carry `IChat.origin.selection`, an immutable `{ text, responsePartId? }` snapshot captured when the side chat was created. It is provenance only, not a live range back into the source chat.
Unlike subagent (`Tool`) chats, side chats participate in the normal
user-facing peer-chat surfaces: the chat tab strip
(`shouldShowChatTabs`/`visibleChatTabs`), the **Chats** dropdown's contributed
**Chats** group (`SessionConversationsMenuContribution`), the chats picker, close/reopen, the
active-chat fallback, and `committedChatCount`. Tool-origin subagents remain
the special case: they stay hidden/read-only by default and surface only when
explicitly opened.

Creation: `ISessionsManagementService.createSideChatInSession(session,
sourceChat, turnId, selection?)` → `ISessionsProvider.createSideChat`. The service throws
if the provider or session doesn't support side chats (mirroring
`forkChatInSession`); it never returns `undefined`. On the agent host,
`createSideChat` mints a client-chosen chat URI and calls
`connection.createChat(sessionUri, chatUri, { model, sideChat: { source,
turnId, selection? } })` — analogous to `forkChat`'s `{ fork: { source, turnId } }`, but
the new chat inherits the **source chat's own** model/agent selection (not the
session-level default), read via `getChatModelId(sourceChat)`/
`getChatMode(sourceChat)` and re-applied to the new chat once it appears in the
catalog (`setChatModelId`/`setChatAgent`/`_updateChatSessionState`), matching
the plan's "inherits model/agent" requirement for a side chat asking a
tangential question with the same context as the turn it branched from.
The host records the `SideChat` origin, rejects empty `selection.text`, and does not mutate the first user
message. Claude and Copilot use their SDK fork primitives to inherit source
context privately, persist the inherited-prefix length plus any selected-text snapshot in providerData, and
filter those inherited turns from `getMessages()` so the side chat only
shows turns authored in that side chat.

Invocation: the `/btw` slash command (registered against the core
`IChatSlashCommandService`, in `contrib/chat/browser/btwSlashCommand.contribution.ts`
— a sessions-owned contribution, not a change to the core `chatSlashCommands.ts`)
is only offered in the Agents window, on created (non-`Untitled`), non-archived
sessions whose provider `supportsSideChat` (`when` gates the completion; the
callback re-checks all three at execution time, since `when` is not
re-evaluated when a command actually runs). It is `silent: true` (no
request/response row is added to the **source** chat) and
`executeDuringRequest: true`, so the chat widget invokes it directly instead of
queueing or steering it behind an active source turn. It anchors to the source
chat's latest request, including an in-progress turn; only a chat with no turns
shows a localized warning. When the widget has a non-empty native DOM selection whose anchor/focus nodes belong to that chat's transcript, `/btw` snapshots the exact selected string (trimming only to decide emptiness) and forwards it as `selection.text`.
Each invocation creates a **fresh** side chat (there is no "reuse the last side
chat" behavior). After creating the chat, it activates that peer chat through
the normal `ISessionsService.openChat(session, sideChat.resource)` flow so the
standard session/chat focus behavior applies, then sends the prompt on that
chat through the normal foreground send path.

The agent host accepts the anchor when it is either in `turns` or
`activeTurn`. Claude and Copilot serialize side-chat creation on the new chat's
key rather than the source session's send key, allowing their native fork
primitive to snapshot all provider transcript/events written up to that moment
while the source turn continues. Native Copilot forks do not persist an active turn until it reaches the backing
transcript, so AgentService separately snapshots the active turn's user request
plus any user-visible assistant markdown already streamed (both bounded to
20,000 characters).
The provider wraps the first SDK prompt in a private `<side-chat-context>`
block. Every side chat receives the succinct instruction: "Prefer explanation
over action; do not make changes or carry out work unless the user explicitly
asks." When present, the injected context also includes `Selected text:` followed by the immutable snapshot exactly once in that first hidden prompt, plus any partial-response snapshot.
Provider reconstruction strips the whole block from the first visible side-chat
turn, so the UI and restored transcript continue to show only the user's `/btw`
question. Reasoning, tool payloads, and other non-markdown response parts are
deliberately not injected.

The session handler (`agentHostSessionHandler.ts`) routes each chat widget to its
own AHP chat channel. Session-scoped reads (`summary`/`config`/`activeClient`)
stay on the session URI, while conversation reads/dispatches
(`turns`/`activeTurn`/`queuedMessages`/`steeringMessage`/`inputRequests`,
tool-call confirmations, input requests) are threaded through the resolved chat
URI so peer chats run concurrently without cross-talk. `_resolveSessionUri`
ignores the fragment to find the parent session; `_resolveChatUri` returns the
fragment's chat URI (or the default chat URI when there is no fragment).
Agent backends must emit chat progress signals against the chat channel that owns
the turn/tool call. `AgentSideEffects` treats that channel as authoritative; if a
permission request from an additional chat arrives on the parent session URI, that
is a producer bug because the peer-chat UI will not receive the AHP update. When
an `ahp-chat` channel is malformed, handlers throw instead of falling back to the
parent session URI so routing bugs are not hidden.
Tool-call confirmation bookkeeping (`_toolCallAgents`) is keyed by the same chat
channel that received `ChatToolCallStart`/`ChatToolCallReady`; confirmations sent
to the parent session URI are invalid and will not resolve the SDK permission
request.

##### Direct selection invocation (Agents window only)

Besides typing `/btw`, a user can select assistant markdown text in a chat
response and get an inline "Ask Question" affordance that creates the same
kind of side chat directly from that selection. This is Agents-window-only —
it never appears in the regular workbench chat surface — and reuses
`ISessionsManagementService.createSideChatInSession`/`sendRequest` and
`ISessionsService.openChat`, the identical plumbing `/btw` uses (see
`sideChatOrchestration.ts`'s `createAndSendSideChat`/`openAndSendSideChat`
helpers, shared by both entry points).

`ResponseSelectionSideChatController` (`contrib/chat/browser/`) is owned by
`ChatView` per chat widget. It listens for `selectionchange` on the widget's
document and resolves the selection via `resolveResponseSelection`
(`responseSelectionResolver.ts`), which only accepts a selection when:
- both selection endpoints fall inside the **same** assistant response
  (resolved through `IChatWidget.getElementFromNode`, `isResponseVM`), and
- the selection stays within that response's rendered markdown
  (`.chat-markdown-part`), excluding any embedded Monaco editor
  (`.monaco-editor`) or tool-invocation UI (`.chat-tool-invocation-part`).

A resolved selection shows an "Ask Question" input positioned under the
selection, reusing the same visual/input component as the editor's feedback
affordance: `FeedbackInputWidget` (`contrib/agentFeedback/browser/
feedbackInputWidget.ts`), extracted from `AgentFeedbackInputWidget` so both
consumers share one textarea/action-bar implementation. Submitting creates a
side chat anchored to the **selected response's turn**
(`IChatResponseViewModel.requestId`, not the chat's last turn) with
`selection.text` set to the exact selected text, mirroring `/btw`'s
"inherits model/agent, immutable selection snapshot" semantics. The same
runtime capability/status gate as `/btw` applies before creating the side
chat (`session.capabilities.get().supportsSideChat`, not `Untitled`, not
archived); failing that gate shows a warning notification instead of
creating a partially-supported side chat.

Submitting does not eagerly dismiss the overlay: it stays visible with a busy
state (`FeedbackInputWidget.setBusy(true, statusLabel)` — disabled input,
hidden action bar, a spinning `Codicon.loading` indicator, `aria-busy` plus an
`aria.status` announcement) while the create/open/send orchestration is
in-flight, and duplicate submission is blocked both by the disabled action and
an explicit `isBusy` guard in `_submit`. Opening the newly-created side chat
naturally dismisses the overlay via `setChat`, which force-dismisses only when
the chat's *resource* actually changes: `ChatView` re-invokes `setChat` for the
same chat on unrelated status/interactivity observable updates, so a
same-resource call must preserve a visible draft and, critically, a pending
busy submission rather than clearing it and letting a duplicate race in. On
failure the busy state clears, the typed question and normal controls are
restored, and the input is refocused so the user can retry without losing
their text — the existing warning/error notification and log call are
unchanged. A completion/error that settles after a genuine chat navigation
already force-dismissed the overlay (`setChat` with a different chat resource)
is tracked via a submission generation counter bumped on that force-dismiss,
so the stale handler no-ops instead of reopening, refocusing, or mutating the
now-unrelated overlay. Escape, scrolling, and selection invalidation are all
ignored while a submission is pending so they cannot race the in-flight
request. The action-bar slot and the spinner that replaces it both size to the
widget's shared `_LINE_HEIGHT` constant (applied as an inline style to each
element, matching the textarea's line-height) and center via flex, rather than
a hardcoded icon height or a positional transform — this keeps both optically
centered on the input's single line, and still flush to the last line when the
textarea grows multi-line (the row keeps `align-items: flex-end`).

The `selectionchange` listener ignores events entirely while focus is inside
the "Ask Question" input (`dom.isAncestorOfActiveElement`): focusing the
textarea collapses the browser's native document selection as a side effect,
and without this guard that collapse would dismiss the very input the user
just focused. The captured selection is treated as an immutable snapshot for
that reason — it is not re-read from the live DOM selection on submit.
Escape (or any other dismissal while the input has focus) restores focus to
the source response via `IChatWidget.focusResponseItem(true)` rather than
letting it fall through to the document body. Plain Enter submits and
prevents the default newline; Shift+Enter and Enter during IME composition
(`e.browserEvent.isComposing`) are left alone so the textarea inserts a
newline or lets composition finish. The overlay's position clamps
both horizontally and vertically against the chat widget's own bounds and the
visible viewport, measured after `FeedbackInputWidget.show()`/`autoSize()` so
real dimensions are used; when there isn't room below the selection it flips
above instead, falling back to the nearest in-bounds edge only when neither
placement fully fits.

`FeedbackInputWidget.setPlaceholder` only derives `aria-label` from the
placeholder when the widget was constructed without an explicit
`options.ariaLabel`; a caller (like this controller, which sets a dedicated
accessible name) keeps its configured `aria-label` untouched across
placeholder changes.

Agent-host approval levels map to the Copilot SDK allow-all modes before each
turn: Default permissions uses `off`, Allow all uses `on`, and Assisted permissions
uses `auto`. Assisted permissions only skips a prompt when the SDK's
model recommendation is `approve`; every other recommendation follows the normal
confirmation flow. Judge rationale can arrive asynchronously: the confirmation
reason is `loading` until the completed result supplies its explanation and a
normalized safety score (`0` unsafe, `1` safe). Clients render that result in the
existing risk-badge position with safety-appropriate visuals. A live
approval-level change is pushed to every in-memory SDK
chat immediately, including during an active turn, so leaving Allow all
cannot leave the SDK in allow-all mode for later tool calls in that turn.
Client tools preserve this approval when they execute without a live chat
observer: the Agent Host's `autoApproveBySetting` metadata becomes the tool
invocation's `preApproved` reason, and the headless invocation path honors it
unless a pre-tool-use hook explicitly requests confirmation.
`chat.experimental.autoApprovals.enabled` controls whether Assisted permissions is
offered in approval pickers and defaults on outside Stable builds. Enterprise
policy still leaves Approve When Safe and Allow All visible, but disables both with an
administrator-directed explanation and normalizes either value back to Ask When Needed.
The agent mode axis is independent: Autopilot with Ask When Needed still uses
SDK permission mode `off` and preserves the configured sandbox policy.

Subagents are modelled as additional chats on the parent session, not as separate
sessions. When a `subagent_started` signal arrives, the host adds a subagent chat
to the parent session and dispatches the subagent turn on that chat URI; restoring
a standalone subagent session would create only session state and leave chat
actions with no `_chatStates` entry. Subagent chat URIs use the stable
`ahp-chat://subagent/...` authority and store the case-sensitive tool call id in
the path (`buildSubagentChatUri`), because URI authorities are case-insensitive.
Subagent chats are created with `origin.kind === "tool"` and are hidden from the
chat tab strip; the parent tool invocation is their visible UI entry point.

On the workbench side, `AgentHostSessionHandler` stores the upstream chat channel
in `_chatURIsBySessionResource` after hydrating the session state. For default
chats this URI comes from `SessionState.defaultChat`; for peer chats it is matched
from `SessionState.chats` by the resource fragment. The handler must not
reconstruct the default URI with `buildDefaultChatUri` before dispatching turns,
because providers are free to choose a different default-chat URI shape.

#### Renaming: session vs chat are independent

The session title and each chat's title are independent:

- **`ISessionsManagementService.renameSession(session, title)` → `ISessionsProvider.renameSession`**
  renames the _session_ only. The agent host provider dispatches
  `SessionTitleChanged` on the **session URI**; the host persists it as the
  session's `customTitle`. Used by the sessions-list "Rename Session" action and
  the session header inline-rename.
- **`renameChat(session, chatUri, title)`** renames a single _chat tab_. The
  provider dispatches `SessionTitleChanged` on that **chat channel**
  (`buildChatUri`/`buildDefaultChatUri`). The host detects the chat channel
  (`chatChannel` is set in `agentSideEffects.handleAction`) and translates it to a
  per-chat `SessionChatUpdated` via `AgentHostStateManager.updateChatTitle`, so the
  session title is untouched. Used by the chat composite bar (per-tab rename).

The default chat starts with an **empty** catalog title so it _inherits_ the
session title for display (`_ensureDefaultChat` seeds `title: ''`). The provider's
`mainChat.title` is `derived(_defaultChatTitleOverride ?? session.title)`, and
`applyChatCatalog` only sets the override when the default chat's catalog title is
non-empty (i.e. it was renamed independently). The moment a session gains its first
additional chat, `AgentHostStateManager.addChat` **snapshots the current session
title onto the still-inheriting default chat** (via `updateChatTitle`), so once a
session is multi-chat the session title and the default chat tab title are fully
independent — renaming the session no longer moves the default chat tab and
vice-versa. Auto-titling from the first message
titles the _session_ for the default chat and the _chat itself_ (via
`updateChatTitle`) for additional chats — see `agentHostSessionTitleController`.

Single-chat providers implement `renameSession` by renaming their single main
chat. `renameSession` is a mandatory
`ISessionsProvider` method (no optional methods — see the interface guideline).

Whether the rename UI is _offered_ is gated on `capabilities.supportsRename`, not
on the provider id. `ISession.capabilities` is an `IObservable<ISessionCapabilities>`
so consumers react when a provider's advertised capabilities hydrate or change after
the session is first surfaced (e.g. an agent host whose root state arrives after the
session's first state update). The session header inline-rename
(`SessionHeader._isTitleEditable`) and the sessions-list "Rename..." action (gated on
the `sessionSupportsRename` context-menu-overlay key, set from
`element.capabilities.get().supportsRename` in `sessionsList`) both read this flag.
Providers declare it truthfully: agent-host sessions are always renameable;
`copilotChatSessions` sets it only for the CopilotCLI and Claude session types,
since `renameChat` throws for other backends. Omitting the flag means the session
is not renameable.

### Session Change Propagation

All session state flows through observables:

```
Backend state change (turn complete, status update, etc.)
  → Provider detects change, updates ISession observables
  → Provider fires onDidChangeSessions { added, removed, changed }
  → SessionsProvidersService forwards the event
  → SessionsManagementService forwards; the view service updates the active session & context keys
  → UI re-renders via observable subscriptions
```

Providers may fire `onDidReplaceSession` when a temporary (untitled) session is atomically replaced by a committed one after the first turn.

Workspace draft replacement is management-owned: `createNewSession` creates the
replacement, deletes the previous provider draft, fires
`onDidReplaceNewDraftSession`, and only then publishes the replacement through
`newSession`. Terminal ownership relies on this ordering so compatible terminals
can transfer before activation eagerly ensures the replacement terminal.
Incompatible terminals are detached as standalone terminals and excluded from
future session matching and visibility management. A terminal that finishes
creating after its draft was replaced is disposed before activation.

Provider add notifications are authoritative upserts. A provisional `listSessions()` entry may already be cached when the backend publishes its materialized project and working directory, so providers update the existing session adapter in place and report it as changed rather than replacing its identity.

Providers initialize synchronous session caches before registration completes. Read APIs such as `getSessions()` and `getSession()` must not populate a cache and synchronously emit `onDidChangeSessions`, because callers can read them while rendering a session-list tree update.

### First-Time Window-Open Telemetry

Editor entry points pass an `AgentsWindowOpenSource` through `INativeHostService.openAgentsWindow` and the `vscode:selectAgentsFolder` startup handoff. The source distinguishes command-palette, keyboard, title-bar, chat-title, handoff-tip, discovery-banner, and command-line opens without collecting workspace or session identifiers.

On the first handoff in a window, `SelectAgentsFolderContribution` starts `SessionsWindowOpenTelemetry` only when the application-scoped `TOTAL_SESSIONS_KEY` counter is still zero. The collector freezes whether the settled initial view is a workspace-preselected new-session view (or records `undefined` when a created session is visible), records whether that workspace came from the checked workspace, recents, existing sessions, a provided folder, or a user choice, reads whether the initial setup flow showed its sign-in dialog, and emits `agents/firstTimeWindowOpen` once. A close within three minutes includes `windowCloseDurationMs`; otherwise the event emits at the three-minute boundary with that field undefined.

`SessionsWindowStartupExperiment` reads the `agentsWindowStartupAA` treatment at `WorkbenchPhase.BlockStartup`. Both A/A variants use the same treatment value, so the read records experiment exposure without changing the Agents window experience.

### Automation Run Lifecycle

`AutomationRunner` exposes separate dispatch and lifecycle promises. It resolves
dispatch after recording the committed session resource on the run row, then
observes the session's main chat status until it reaches a terminal state. `InProgress`,
`Untitled`, and `NeedsInput` all keep the automation run `running`; `Completed`
completes the run and `Error` fails it.
Scheduler cancellation also stops the observation and fails the run. On timeout,
the scheduler records the timeout failure before cancelling the observation, so
neither path leaves a live observable subscription even though the session may
remain active.

An automation stores an explicit discriminated `target` rather than inferring
workspace-less execution from an absent folder. A `quickChat` target requires its
quick-chat-capable provider and session type and cannot carry repository state. A
`workspace` target requires its folder and an isolation discriminant; only
`worktree` isolation carries its required base branch. Workspace-less runs use
`createAndSendQuickChatRequest`, whose headless path calls the provider's existing
`createQuickChat` contract and shares configuration, cancellation, draft cleanup,
commit detection, and non-navigation lifecycle with workspace-backed headless
sends.

The persisted ledger uses schema v3 for the target union and migrates schema-v1/v2
flat records without rewriting them until the next normal save. Older builds
therefore treat the new shape as a newer read-only schema instead of dropping
workspace-less rows.

The automation dialog keeps a Worktree branch selection as explicit intent,
separate from the repository's live `HEAD`. Folder isolation displays live
`HEAD` but persists no branch. Worktree isolation persists the selected local
branch, falling back to the current named `HEAD` until the user makes a choice.
Provider-default isolation displays as Folder but remains provider-default until
the user explicitly selects an isolation mode, so unrelated edits do not change it.
Repository refresh failures and deleted local refs do not silently replace an
edited branch. The automation and new-session surfaces share the provider-agnostic
`contrib/chat/browser/branchPicker` trigger, ActionWidget, filtering, focus, and
accessibility behavior; their adapters supply branch state and selection side
effects. The Automations dialog keeps its form focus cycle, popup command
allowlist, and popup-first Escape handling in its own adapter instead of changing
the shared Dialog widget. An edited automation's saved provider/session type
remains pending while providers are discovered, so a provisional fallback cannot erase Worktree intent;
the user can still explicitly choose an available alternative. `ISessionType`
advertises Worktree configuration support; unsupported targets keep the branch
control read-only. The headless session path awaits the existing provider
`setIsolationMode` and `setBranch` setters before sending. Agent-host Copilot CLI
maps the generic `workspace` isolation value to its `folder` config value and
verifies each resolved value. Automation values are one-shot and do not replace
the user's remembered interactive session defaults. The headless management
operation accepts the automation run's cancellation token so repository
configuration and commit detection are cancelled together; cancellation rejects
the run, cancels an in-flight chat request, suppresses post-cancellation lifecycle
events, and disposes the provisional draft. The dialog's workspace dropdown has a
**No workspace** entry that switches the existing session-type picker to
`getQuickChatSessionTypes()`, preserves an unavailable saved provider/type until
late discovery completes, and hides repository-only controls. Its target model
owns the workspace/quick-chat observables atomically, ignores hidden workspace
picker updates in quick-chat mode, and reloads repository state when the user
returns to workspace mode. Workspace-backed legacy records may retain a
provider-less session type and resolve the provider lazily; workspace-less records
require the explicit provider/type pair.

---

## Adding a New Provider

1. **Implement `ISessionsProvider`** with a unique `id`, `sessionTypes`, and `browseActions`
2. **Create session data classes** implementing `ISession` with observable properties
3. **Place code under `contrib/providers/<name>/`**
4. **Register via a workbench contribution** at `WorkbenchPhase.AfterRestored`:
   ```typescript
   class MyProviderContribution
   	extends Disposable
   	implements IWorkbenchContribution
   {
   	constructor(
   		@IInstantiationService instantiationService: IInstantiationService,
   		@ISessionsProvidersService
   		sessionsProvidersService: ISessionsProvidersService,
   	) {
   		super();
   		const provider = this._register(
   			instantiationService.createInstance(MyProvider),
   		);
   		this._register(sessionsProvidersService.registerProvider(provider));
   	}
   }
   registerWorkbenchContribution2(
   	MyProviderContribution.ID,
   	MyProviderContribution,
   	WorkbenchPhase.AfterRestored,
   );
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

The **agents window core workbench** is defined as all sessions code _outside_ `src/vs/sessions/contrib/providers/` — that is, code in `src/vs/sessions/services/`, `src/vs/sessions/browser/`, `src/vs/sessions/common/`, and non-provider `src/vs/sessions/contrib/*` folders (views, UI contributions, toolbars, etc.).

When you add a property or method to `ISession` or `ISessionsProvider`, it **must** be referenced by at least one file in the core workbench, not only within provider implementations.

**Rationale:** If an interface member is only used inside providers, it belongs on the provider's concrete class, not on the shared interface. Interfaces should capture what the orchestration layer (management service, UI) needs from providers — not internal implementation details that leak outward.

### Do not use context keys to read or derive runtime state

Context keys are an output/gating mechanism, **not** a source of truth. Do **not** mirror dynamic state (e.g. "the active session has models", a count, a selection) into a context key only to read it back in imperative code, and do not call `IContextKeyService.getContextKeyValue(...)` to drive logic. Instead, read state directly from the owning service or observable (`ISessionsService.activeSession`, `ISessionsProvider.getModelsSnapshot`, etc.) and react with `autorun`/`derived`.

Context keys remain the correct tool for **declarative** `when` clauses on menu, command, and keybinding contributions — there is no alternative there, because those are evaluated by the platform. The rule targets _imperative_ code: a component that already has access to a service must consult the service, not a context key that shadows it.

**Example:** each `NewChatInputWidget` owns a scoped `SessionModelSelectionModel` (`contrib/chat/browser/sessionModelSelectionModel.ts`). The model reads the session or remembered model identifier before calling `provider.getModelsSnapshot(...)`, whose `desiredModelResolution` field reports `notRequested`, `pending`, `available`, or `unavailable` using the same catalog resolution helper as the workbench `ChatInputPart`. A pending desired model does not apply an available fallback, and send stays disabled until the model arrives or the user explicitly selects another model. With no desired model, an automatic first-available choice is provisional and is re-evaluated when the provider default arrives. The desktop and compact phone pickers consume the resulting models, selection, pending identifier, options, and send eligibility; opened-session phone sheets and notification actions perform explicit selections through the same provider/storage path. Menu `when` clauses only gate on genuinely declarative conditions such as phone layout and whether the provider offers a combined config picker.

Workbench and Sessions share only the pure transition policy in `vs/workbench/contrib/chat/common/modelSelection.ts`. Each surface owns its state and effects: `ChatInputModelSelectionController` owns Workbench selection and pending intent, while `SessionModelSelectionModel` owns Sessions reducer memory and provider effects.

For a fresh conversation the precedence is `chat.defaultModel` (when resolvable), then the remembered explicit identifier, then the location default or first available model. A draft or existing conversation's own model is authoritative, and an explicit in-conversation pick is preserved until the next conversation. Only explicit user picks update `chat.currentLanguageModel.${location}[.${modelTarget}]` in profile/user storage; configured, restored, default, and first-available choices update conversation/provider state without rewriting that preference. The retired `.isDefault` companion value is removed lazily on read. Previous application-scoped workbench values and `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId` values migrate lazily. Omitted `ISessionModelPickerOptions.showAutoModel` is normalized to `true`.

Both surfaces emit structured `[ChatModelSelection]` entries through the shared diagnostics sink. Policy events include initialization, transitions, compatibility/default decisions, conversation restores, and explicit selections; Sessions enriches them with provider-write outcomes. Storage changes are diagnostic-only and are promoted to Info when external or when they conflict with the in-memory selection, so cross-window overwrites remain visible without changing picker behavior.

Model-picker-aware chat input notifications also stay input-scoped. Each `NewChatInputWidget` owns an `INewChatModelPickerService`; its model picker registers both an opener and identifier-based selection, and the notification widget delegates semantic model actions to that service. Notification `sessionTypes` are concrete language-model target identifiers: derive them from `getChatSessionType(session.resource)` or `ISessionType.chatSessionType`, never from the logical `ISession.sessionType` (for Agent Host sessions these are `agent-host-copilotcli` and `copilotcli`, respectively). The harness picker exposes that concrete target as an observable and the notification widget subscribes to it; do not pair a pull getter with manual re-render calls, because the trigger and value can drift during asynchronous session recreation. The latest registration owns both picker operations, so phone layouts cannot open one picker while selecting through another. Notification-driven selection calls the scoped model and follows the same canonical storage and provider update path as a manual pick, but emits only `chatInputNotificationAction`; it does not emit picker-close telemetry because no picker was opened.

**Rationale:** Mirroring service state into a context key duplicates the source of truth, adds an extra listener that can drift out of sync, and hides real data dependencies behind a stringly-typed key. Reading the service/observable keeps a single source of truth and makes dependencies explicit.

### Delegate provider-specific decisions to the provider

Core (non-provider) code must **not** branch on a provider's identity or session type to decide provider-specific behavior. Do not inspect `session.sessionType` or `providerId` in the core to special-case a provider. Instead, add a method to `ISessionsProvider` that returns the decision and let each provider answer for itself.

**Example:** the sessions-core model picker presentation (grouping, featured models, the "Manage Models" action) is not decided in core. The core picker asks the active session's provider via `ISessionsProvider.getModelPickerOptions(sessionId)`, which returns an `ISessionModelPickerOptions`. Core never inspects the session type to make this choice. When the workbench entitlement still reports signed out but a provider already exposes targeted non-BYOK models, the shared picker promotes the available models that are featured in either control-manifest tier; it does not surface unavailable manifest entries until entitlement resolves.

Every model-picker trigger identifies the selected model's vendor with a leading provider icon derived from the model metadata (for example OpenAI, Claude, Gemini, or Copilot), including editor chat, active sessions, new sessions, and phone-layout pickers. Auto is provider-agnostic and always uses the Copilot icon, regardless of provider metadata or generic-icon presentation. Standard editor and Agents-window chat inputs collapse the trigger to that provider icon below 280px while retaining the full accessible model label.

**Rationale:** Hardcoding provider identity in core re-couples the orchestration layer to specific providers, defeating the pluggable provider model. New providers would silently get wrong defaults and require edits to core. Delegating keeps each provider authoritative over its own behavior and keeps core provider-agnostic.
