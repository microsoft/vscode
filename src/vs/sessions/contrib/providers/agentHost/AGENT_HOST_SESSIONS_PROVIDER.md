# Agent Host Sessions Provider

**Folder:** `src/vs/sessions/contrib/providers/agentHost/`

The agent host provider family backs sessions run by an **agent host** — an out-of-process (or in-process) agent runtime that exposes one or more agents (Copilot, Codex, Claude, …) over the agent host protocol (`platform/agentHost`). It is the largest provider in the Agents window and is shared between the local window and remote hosts:

| Class | File | Purpose |
|-------|------|---------|
| `BaseAgentHostSessionsProvider` | `browser/baseAgentHostSessionsProvider.ts` | Abstract base implementing the full `ISessionsProvider` surface against an `IAgentConnection`. ~2700 lines; contains `AgentHostSessionAdapter` (the `ISession` impl) and `NewSession` (pre-creation draft). |
| `LocalAgentHostSessionsProvider` | `browser/localAgentHostSessionsProvider.ts` | Concrete local-window provider backed by the in-process `IAgentHostService`. |
| `RemoteAgentHostSessionsProvider` | `../remoteAgentHost/` | Concrete remote provider (one per connection). Documented separately in [`REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md`](../remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md). |

This document covers the shared base and the **local** concrete provider. For the remote variant, read the remote doc — it extends the same base.

## Extended Provider Interface

Agent host providers implement `IAgentHostSessionsProvider` (defined in sessions core at `src/vs/sessions/common/agentHostSessionsProvider.ts`), which extends `ISessionsProvider` with:

- **Remote connection members** (optional, populated only by remote providers): `connectionStatus`, `remoteAddress`, `connect()`, `disconnect()`, `canConnectOnDemand`.
- **Dynamic session config**: `onDidChangeSessionConfig`, `getSessionConfig`, `isSessionConfigResolving`, `setSessionConfigValue`, `replaceSessionConfig`, `getSessionConfigCompletions`. These power the per-session configuration picker (isolation, branch, and other host-declared properties resolved live from the backend schema).

`isAgentHostProvider(provider: ISessionsProvider)` (same file) is a type guard returning `true` for the local and remote agent host providers; `isAgentHostProviderId(providerId: string)` is the id-only variant, `true` for `local-agent-host` and any `agenthost-*` (remote) provider id.

## Registration

Registered by `LocalAgentHostContribution` in `browser/localAgentHost.contribution.ts`:

- **Gated on `chat.agentHost.enabled`** (`AgentHostEnabledSettingId`). If the setting is off the contribution returns early and registers nothing.
- The enablement bit is read once through the sessions-layer `AgentHostEnablementService`; the contribution does not subscribe to config changes.
- Creates `LocalAgentHostSessionsProvider` via `IInstantiationService` and registers it through `ISessionsProvidersService.registerProvider`.
- Registers a per-session-type **working-directory resolver** (`IAgentHostSessionWorkingDirectoryResolver`) for each `agent-host-${sessionType.id}` scheme, refreshed on `onDidChangeSessionTypes`.
- The same module also wires the heavy lifting from the workbench chat layer at `WorkbenchPhase.AfterRestored`:
  - `AgentHostContribution` — agent discovery, session-handler registration, language-model providers, customization harness (via `IChatSessionsService`).
  - `AgentHostTerminalContribution` — terminal integration for agent host sessions.
  - The classic chat sidebar item controller is registered separately in the editor window only; the Agents window does not load or register `AgentHostSessionListController`.
- Registers the experimental `chat.agentHost.defaultSessionsProvider` setting (`LocalAgentHostDefaultProviderSettingId`, default `false`, startup experiment).

The Electron-only `electron-browser/agentHost.contribution.ts` adds desktop-only wiring on top.

## Identity

`LocalAgentHostSessionsProvider`:

| Property | Value |
|----------|-------|
| `id` | `'local-agent-host'` (`LOCAL_AGENT_HOST_PROVIDER_ID`) |
| `label` | `"Local Agent Host"` |
| `icon` | `Codicon.vm` |
| `supportsLocalWorkspaces` | `true` |
| `supportsQuickChats` | snapshots agent-host enablement at construction — `true` when `chat.agentHost.enabled` was on then, else `false` |
| `browseActions` | `[]` (local folders are browsed through the shared workspace picker) |
| `order` | `-1` when `chat.agentHost.defaultSessionsProvider` is enabled (sorts before all other providers), else `1` |
| `sessionTypes` | Dynamically populated from the local agent host's `rootState.agents`; the type label is the agent's unadorned `displayName` (e.g. `"Copilot"`), the type **id** is the agent provider name (e.g. `copilotcli`) so the same agent shares one session type across local and remote hosts |

When the default-provider setting flips, the provider re-fires `onDidChangeSessionTypes` so the management service re-collects and re-sorts session types with the new `order`.

These session-type icons are specific to the Agents window provider. In the editor window, `agentSessions.ts` maps local Agent Host Copilot to the Local harness's `Codicon.vm` picker icon, while `agentSessionsViewer.ts` uses the same session-list status dot as the Local harness.

## IDs and URI Schemes

A single agent host session uses several distinct identifiers:

| Purpose | Value | Example |
|---------|-------|---------|
| `ISession.sessionType` | Logical type — the agent provider name, shared across hosts | `copilotcli` |
| `resource.scheme` | `agent-host-${sessionType.id}` (`resourceSchemeForProvider`) | `agent-host-copilotcli` |
| LM vendor / `targetChatSessionType` | Same as the resource scheme | `agent-host-copilotcli` |
| `rawId` | Session-local id parsed from the resource path; key in `_sessionCache` | `abc123` |
| `sessionId` | `{providerId}:{resource}` via `toSessionId` | `local-agent-host:agent-host-copilotcli:///abc123` |
| `providerId` | The provider instance id | `local-agent-host` |

`ISession.sessionType` is intentionally the agent name (not the scheme) so a logical type like `copilotcli` covers local agent host, remote agent host, and extension-host Copilot CLI sessions in the filter menu and new-session picker. Routing (`registerChatSessionContentProvider`, model registration) is keyed off the per-provider `resource.scheme` instead.

`getModels(sessionId)` filters registered language models by `session.resource.scheme` (see `getAgentHostModels` in `browser/agentHostModelPicker.ts`); `getModelPickerOptions` returns grouped/featured models with no "Manage Models" action.

## Architecture

- **`AgentHostSessionAdapter`** (`baseAgentHostSessionsProvider.ts`) is the `ISession` implementation. It wraps an `IAgentSessionMetadata` from the backend and exposes the observable session surface (`status`, `title`, `workspace`, `mainChat`, `mode`, …). The base provider keeps a `_sessionCache` of adapters keyed by `rawId`.
- **`NewSession`** is a disposable draft (pre-creation) session. Several can be in flight simultaneously; the management layer tears down superseded drafts via `deleteNewSession`. A draft eagerly creates its backend session once authentication settles, then **graduates** into a committed `AgentHostSessionAdapter` on first send.
- The base provider is abstract; concrete providers supply: `connection`, `authenticationPending`, `resourceSchemeForProvider`, `_formatSessionTypeLabel`, `_adapterOptions` (workspace builder), `resolveWorkspace`, and optionally `_diffUriMapper`.

`notify/sessionAdded` is an authoritative upsert rather than create-only. An active provisional session can already have entered `_sessionCache` through `listSessions()` with its original checkout; when materialization publishes the final project and worktree working directory, the provider updates that adapter in place and reports it as changed.

## How Chat Content Loads & Sends (no `IChatSessionItemController`)

A common point of confusion is whether the Agents window needs to register an
`IChatSessionItemController` for agent host sessions. **It does not.** The item
controller and the chat-content path are two unrelated APIs:

| API | Responsibility | Used by the Agents window? |
|-----|----------------|----------------------------|
| `IChatSessionItemController` (`registerChatSessionItemController`) | Enumerate session **items** (`.items`, `onDidChangeChatSessionItems`) for the **classic** chat sidebar list. | **No.** The agent host `ISessionsProvider` builds its own list via `getSessions()` straight from the connection (`listSessions()` / `notify/sessionAdded` / `rootState`). The workbench `AgentHostSessionListController` is registered only for classic chat surfaces in the editor window; the Agents window neither loads nor consumes it. |
| `IChatSessionContentProvider` (`registerChatSessionContentProvider`) | Load a session's **chat content** (history/turns) for a resource, provide input completions, and handle the request stream. | **Yes — this is the only API on the chat path.** |

The classic `ChatWidget` is generic: it renders whatever `IChatModel` it is
handed and sends through `IChatService`. The agent host plugs into chat through
**two registrations**, neither of which is the item controller — both wired by
`AgentHostContribution` (workbench) / the remote `*.contribution.ts` at startup:

1. **`registerChatSessionContentProvider(sessionType, AgentHostSessionHandler)`** —
   binds the per-provider `resource.scheme` (e.g. `agent-host-copilotcli`) to a
   content provider. `AgentHostSessionHandler.provideChatSessionContent()`
   hydrates the model from the backend session state (turns → history) and owns
   the request stream.
2. **`AgentHostLanguageModelProvider`** — publishes language models under
   `targetChatSessionType` = the same resource scheme so the widget's model
   picker resolves the right models (see `getAgentHostModels`).

End-to-end in the Agents window:

- **List** — `getSessions()` reads from the agent host connection. *(no widget, no item controller)*
- **Open / load content** — `ChatView.setChat(chat)` → `IChatService.acquireOrLoadSession(chat.resource, …)` → `ChatWidget.setModel(ref.object)`. `IChatService` routes the resource scheme to `AgentHostSessionHandler.provideChatSessionContent()`. `ChatView` first **locks** the widget to the contributed chat session type so follow-up turns keep routing to the same handler.
- **Send** — `ISessionsManagementService.sendNewChatRequest` → `provider.createNewChat()` → `provider.sendRequest()` → `IChatService.sendRequest(chatResource, …)`, which the bound `AgentHostSessionHandler` forwards to the backend over the agent host protocol.

The Agents window thus depends on the classic `ChatWidget` for rendering and on
the `IChatSessionContentProvider` for content/send, but **not** on
`IChatSessionItemController` — that API exists only to feed the classic chat
sidebar list.

## New Session Flow

`createNewSession(workspaceUri, sessionTypeId)`:

1. Resolves the `ISessionType` and validates the workspace (`resolveWorkspace`).
2. Constructs a `NewSession` draft, stores it in `_newSessions`, and fires `onDidChangeSessionConfig`. New-session model/mode selection is seeded by the existing model/agent pickers and sent on the first message.
3. If a connection exists and authentication is **not** pending, eagerly starts the backend session and resolves its dynamic config in parallel. While auth is pending the draft waits; `_resumeNewSessionAfterAuthenticationSettles` (driven by the `authenticationPending` observable going false) starts the backend for all pending drafts.

The eager session-state subscription does not compute Git metadata while the host session lifecycle is `Creating`: its initial working directory is the selected checkout, not the final isolated worktree. Materialization publishes the resolved working directory through `notify/sessionAdded` and starts the first Git-state refresh against that path; the later `session/metaChanged` / `notify/sessionSummaryChanged` updates rebuild the adapter workspace with the resolved branch.

`createQuickChat(sessionTypeId)` is the **workspace-less** counterpart of `createNewSession` (declared via `supportsQuickChats`). It reuses the same `ISessionType` as a normal session — a quick chat is "identical minus exclusions", not a separate stack — but skips `resolveWorkspace` and builds the `NewSession` draft with `workspace === undefined` and `quickChat === true`. Both paths funnel through the shared `_createDraftSession` helper, so tracking, eager backend creation, and config resolution are otherwise identical. The draft's `session.workspace` resolves to `undefined`, and its eager `connection.createSession` call simply **omits `workingDirectory`** — there is no explicit quick-chat input flag on the wire. The agent host **infers workspace-less at create from the absent `workingDirectory`**, tags the session (`_meta.workspaceless` + persisted `copilot.workspaceless` metadata) and runs it in a stable per-session scratch cwd, with a **repo-less system prompt** (`COPILOT_AGENT_HOST_QUICK_CHAT_INSTRUCTIONS` appended) that tells the agent its cwd is a throwaway scratch directory, to stay read-only on real repos, and to delegate code changes to a dedicated session. The workspace-trust gate in `_startNewSessionBackend` is naturally skipped because a workspace-less draft has no folder to trust. Forks are **excluded** from this inference: `isWorkspaceless = !sessionConfig.fork && !sessionConfig.workingDirectory`, so a fork without an explicit `workingDirectory` inherits the source session's context rather than being tagged workspace-less.

**Restore (persistence).** Quick chats survive reloads via the normal catalog round-trip: `listSessions()` re-advertises them with the `_meta.workspaceless` tag (carried on the session summary) — but also with the throwaway scratch cwd the host assigned. `AgentHostSessionAdapter` resolves its **session-kind once, at construction**, from `readSessionWorkspaceless(metadata._meta)` (`QuickChatSessionKind` vs `WorkspaceSessionKind`); `_computeWorkspace()` delegates to that kind, so a quick chat returns `undefined` regardless of the scratch working directory, and `ISession.isQuickChat` is a `constObservable` of the kind. Because the kind is fixed at construction and **cannot be flipped by a later `update`/`setMeta`**, the `_meta.workspaceless` tag MUST be present in the metadata passed to **every** adapter-construction path — `_refreshSessions()`/`listSessions` **and** the live `_handleSessionAdded(summary)` notification (which carries `summary._meta`). Dropping `_meta` on either path locks the committed session into `WorkspaceSessionKind` and leaks its scratch dir as a workspace (e.g. the archive-on-delete fallback then pre-fills a new session with that folder). On the host side, `CopilotAgent.listSessions()` re-emits `_meta.workspaceless` from the persisted `copilot.workspaceless` metadata (mirroring `getSessionMetadata`) so restored sessions carry the tag even after the state manager's live summary is gone. `restoreVisibleSessions` itself is workspace-agnostic — it resolves persisted slots by `sessionResource`, so a quick chat re-hydrates like any other session once the provider re-lists it.

A quick chat is a **single-chat session** (`supportsMultipleChats: false`, forced by the `QuickChatSessionKind`), so it has no peer chats; `applyChatCatalog` collapses any state-advertised chats to the default chat. The agents-window core consumes `ISession.isQuickChat` (via `isQuickChatSession(session)`) for list grouping and context keys, rather than inferring quick-chat from `workspace === undefined`. While the fixed-at-construction kind means a later `SessionState._meta` can no longer change the workspace, the host still guarantees the tag rides on **both** the summary `_meta` and the subscribed `SessionState._meta` (`createSessionState(summary)` copies `summary._meta` onto the restored state), keeping the two channels consistent.

`createNewChat(chatId)` creates the chat session model (`IChatSessionsService.getOrCreateChatSession`) so the management service can open the widget, and returns the draft's main chat. For a committed multi-chat session, it asks the host to add a peer chat, waits for that chat to surface in the catalog, seeds its input state, and presents it as `Untitled` until its first request is sent.

## Send Flow

`sendRequest(chatId, chatResource, options)` for a draft session:

1. Requires the draft and an active connection.
2. Builds `IChatSendRequestOptions` (agent mode from the selected custom agent or the built-in agent, selected model, attached context, and `agentHostSessionConfig` from `getCreateSessionConfig`).
3. Loads the chat model and seeds the selected model / custom agent into the input state so the pickers reflect the choice immediately.
4. Snapshots existing cache keys, then `IChatService.sendRequest` (which the registered `AgentHostSessionHandler` routes to the backend).
5. Publishes a skeleton session (title seeded from the first line of the query) via `onDidChangeSessions` as `_pendingSession`.
6. Waits for the committed backend session (`_waitForNewSession`); on arrival the draft **graduates** (releases its eager subscription without firing `disposeSession`), config is preserved, `_pendingSession` is cleared, and `onDidReplaceSession` fires from skeleton → committed session.

For an already-committed session (including a newly-created peer chat), `sendRequest` loads and holds the target chat model through `IChatService.sendRequest`, applies the cached model/agent input state before dispatch, clears the draft afterwards, then clears the provider-side "new chat" flag so status returns to the host-reported value. Holding the model reference is required for peer chats opened by the lightweight new-chat composer, because no `ChatWidget` owns that model while the first message is dispatched.

Running-chat `setModel` / `setAgent` calls update the active chat's cached selection and the loaded chat model's input state. `AgentHostSessionHandler` debounces `IChatModel.inputModel.state` changes back into `chat/draftChanged`, so text/attachment/model/mode drafts survive reloads and restore from `ChatState.draft` when the chat is re-opened. The agent host persists drafts in the per-session database's `chat_drafts` table, keyed by chat URI.

When restoring Copilot SDK history, `mapSessionEvents` best-effort reconstructs each user message's model, launch/resume custom-agent fallback, and SDK-persisted attachments. Model selection is inferred from `session/model_change` events plus the launch fallback; SDK `subagent.selected` agent names are not treated as AHP agent URIs. Attachments come from the SDK `user.message` attachment payload.

## CRUD & Stubbed Operations

- `archiveSession` / `unarchiveSession` / `deleteSession` — round-trip to the backend. `deleteSessions` is the batch variant (used when multiple sessions are selected): it disposes each backend session and emits a single removal change event. Sessions advertise `capabilities.supportsDelete`, so the shared sessions-list "Delete..." action (contributed by the sessions workbench, gated on `SessionSupportsDeleteContext`) confirms and invokes deletion — there is no provider-specific delete action.
- `renameChat` — renames a single chat independently of the session title. For an additional peer chat it dispatches `SessionTitleChanged` on that chat's channel; for the default/main chat it dispatches on the default chat channel (`setDefaultChatTitle`). The host persists the new title under `customChatTitle:<chatUri>` and re-applies it on restore — the default chat's title is seeded back through `restoreSession`/`_ensureDefaultChat`, peer chats through `_restorePeerChats` — so an independently-renamed main/peer chat survives a process restart or idle eviction instead of reverting to the session title.
- `renameSession` — updates the session-level title.
- `deleteChat` — no-op (agent host sessions don't model individually deletable chats).
- `forkChat(sessionId, sourceChat, turnId)` — multi-chat only. Mints a peer chat URI and calls `connection.createChat(sessionUri, chatUri, { fork: { source, turnId } })`, where `source` is the backend chat URI (a `chatId` fragment addresses a peer chat, otherwise the session's default chat). The host seeds the new chat with the forked history; the provider waits for it to surface in `cached.chats` and returns it. Routed from the **Fork Conversation** gesture via `ISessionsManagementService.forkChatInSession`; single-chat sessions instead fork into a new session (the workbench `AgentHostSessionHandler.forkSession`).

## Picker & Action Contributions

The provider ships a rich set of session-scoped UI in `browser/`:

| File | Responsibility |
|------|----------------|
| `agentHostSessionConfigPicker.ts` | The per-session config picker (isolation, branch, and host-declared dynamic properties) backed by the dynamic-session-config API; includes `media/agentHostSessionConfigPicker.css`. |
| `agentHostAgentPicker.ts` | Custom-agent picker for a session. |
| `agentHostModePicker.ts` | Agent mode enum picker (extends a shared `AgentHostSessionEnumPicker`). |
| `agentHostModelPicker.ts` | `getAgentHostModels` — filters language models by the session resource scheme. |
| `agentHostClaudePermissionModePicker.ts` | Claude-specific permission-mode picker. |
| `agentHostPermissionPickerActionItem.ts` / `agentHostPermissionPickerDelegate.ts` | Toolbar action item + delegate for the permission picker. |
| `agentHostSkillButtons.ts` | Built-in skill toolbar buttons; defines the `sessions.isAgentHostSession` (`IsAgentHostSession`) context key bound to the active session's provider. |
| `agentHostSessionChangesets.ts` / `agentHostDiffs.ts` | Changeset model and diff conversion (`mapProtocolStatus` maps the protocol status bitset → `SessionStatus`). |
| `agentHostSessionBranchActions.ts` | Branch-related session actions. |
| `exportDebugLogsAction.ts` | "Export debug logs" developer action. |
| `openSessionEventsFileActions.ts` | "Open Copilot CLI State File" — Sessions-app variant resolving the session via `ISessionsManagementService.activeSession`. |
| `mobile/` | Phone-layout variants: `mobileAgentHostModePicker.ts`, `mobileChatInputConfigPicker.ts`, `mobileChatPhoneInputPresenter.ts`. |

Skill buttons and the `openSessionEventsFile` action are gated on `IsAgentHostSession` (and `ChatContextKeys.enabled`).

## Settings

Two synthetic filesystem providers expose JSONC settings editors:

| Scheme | URI shape | Scope |
|--------|-----------|-------|
| `agent-host-settings` | `agent-host-settings://{providerId}/settings.jsonc` | Host-wide settings for a provider (`agentHostSettingsFileSystemProvider.ts`, registered by `agentHostSettings.contribution.ts`). |
| `agent-session-settings` | `agent-session-settings://{providerId}/{resourceScheme}{path}.jsonc` | Per-session settings, parseable back to a `sessionId` (`agentSessionSettingsFileSystemProvider.ts`, registered by `agentSessionSettings.contribution.ts`). |

`agentHostSettingsShared.ts` provides the shared schema/serialization helpers (`buildAgentHostConfigJsonSchema`, `convertPropertySchema`, `serializeAgentHostConfigDocument`) used by both providers.

## Local vs Remote Differences

| Aspect | Local (`LocalAgentHostSessionsProvider`) | Remote (`RemoteAgentHostSessionsProvider`) |
|--------|------------------------------------------|--------------------------------------------|
| Connection | In-process `IAgentHostService` (always present) | One live `IAgentConnection` per remote host |
| Instances | One | One per connection (created/disposed dynamically) |
| Resource scheme | `agent-host-${sessionType.id}` | `remote-${authority}-${agent.provider}` |
| Browse actions | none | host-filesystem "Folders" picker |
| Diff URIs | `toAgentHostUri(uri, 'local')` | host-scoped mapper |
| Extra interface members | — | `connectionStatus`, `remoteAddress`, `connect`/`disconnect` |

## Tests

`test/browser/` covers the provider and its pickers: `localAgentHostSessionsProvider.test.ts`, `agentHostAgentPicker.test.ts`, `agentHostAgents.test.ts`, `agentHostModelPicker.test.ts`, `agentHostClaudePermissionModePicker.test.ts`, `agentHostSkillButtons.test.ts`, `agentSessionSettingsFileSystemProvider.test.ts`, `openSessionEventsFile.test.ts`, and `agentHost/agentHostPermissionPickerDelegate.test.ts`.
