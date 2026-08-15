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
- **Dynamic session config**: `onDidChangeSessionConfig`, `getSessionConfig`, `isSessionConfigResolving`, `setSessionConfigValue`, `replaceSessionConfig`, `getSessionConfigCompletions`. These power the per-session configuration picker (isolation, branch, and other host-declared properties resolved live from the backend schema). A draft's initial config resolution owns `session.loading`; later picker mutations use `isSessionConfigResolving` without putting the whole composer back into loading, and Send waits for the tracked resolution (or draft cancellation) before reading the final config values. The desktop Worktree checkbox keeps its DOM node and focus across these updates, while resolving controls retain their normal visual weight and expose `aria-disabled`. When the host reports only read-only `folder` isolation because the workspace has no usable Git repository, the picker omits the isolation control rather than showing a disabled `Folder` label. This availability filter runs before presentation-specific `_shouldRenderProperty` overrides so the mobile-aware picker cannot reintroduce the unavailable control on desktop.

`isAgentHostProvider(provider: ISessionsProvider)` (same file) is a type guard returning `true` for the local and remote agent host providers; `isAgentHostProviderId(providerId: string)` is the id-only variant, `true` for `local-agent-host` and any `agenthost-*` (remote) provider id.

## Registration

Registered by `LocalAgentHostContribution` in `browser/localAgentHost.contribution.ts`:

- **Gated on Agent Host runtime availability.** If the runtime is unavailable, the contribution registers nothing.
- The local provider rebinds its root/action/notification listeners on the initial `onAgentHostStart`. `LocalAgentHostServiceClient` exposes no-op getters before its protocol client exists, so rebinding is required when the service was instantiated while Agent Host was disabled and started later.
- In web, Agent Host enablement additionally requires a remote authority. Web windows with a remote extension host use that server's Agent Host; serverless web keeps Agent Host disabled.
- Claude is surfaced whenever the local Agent Host advertises it; there is no extension-host Claude provider or per-window implementation preference.
- The local Codex session type is additionally gated directly on `chat.agentHost.codexAgent.enabled`. The Agents window does not register the OpenAI extension's Codex session type, so it has no separate Codex `preferAgentHost` setting.
- The enablement bit is read once through the sessions-layer `AgentHostEnablementService`; the contribution does not subscribe to config changes.
- Creates `LocalAgentHostSessionsProvider` via `IInstantiationService` and registers it through `ISessionsProvidersService.registerProvider`.
- Registers a per-session-type **working-directory resolver** (`IAgentHostSessionWorkingDirectoryResolver`) for each `agent-host-${sessionType.id}` scheme, refreshed on `onDidChangeSessionTypes`.
- The same module also wires the heavy lifting from the workbench chat layer at `WorkbenchPhase.AfterRestored`:
  - `AgentHostContribution` — agent discovery, session-handler registration, language-model providers, customization harness (via `IChatSessionsService`).
  - `AgentHostTerminalContribution` — terminal integration for agent host sessions.
  - The classic chat sidebar item controller is registered separately in the editor window only; the Agents window does not load or register `AgentHostSessionListController`.

The Electron-only `electron-browser/agentHost.contribution.ts` adds desktop-only Agent Host developer commands, including debugging, profiling, and restarting the local Agent Host process.

## Identity

`LocalAgentHostSessionsProvider`:

| Property | Value |
|----------|-------|
| `id` | `'local-agent-host'` (`LOCAL_AGENT_HOST_PROVIDER_ID`) |
| `label` | `"Local Agent Host"` |
| `icon` | `Codicon.vm` |
| `supportsLocalWorkspaces` | `true` |
| `supportsQuickChats` | always `true`; the provider itself is registered only when Agent Host is available |
| `browseActions` | `[]` (local folders are browsed through the shared workspace picker) |
| `order` | `-1` (sorts before all other providers) |
| `sessionTypes` | Dynamically populated from the local agent host's `rootState.agents`; the type label is the agent's unadorned `displayName` (e.g. `"Copilot"`), the type **id** is the agent provider name (e.g. `copilotcli`) so the same agent shares one session type across local and remote hosts |

These session-type icons are specific to the Agents window provider. In the editor window, `agentSessions.ts` maps local Agent Host Copilot to the Local harness's `Codicon.vm` picker icon, while `agentSessionsViewer.ts` uses the same session-list status dot as the Local harness.

## Pull Request Provenance

Agent Host metadata keeps the complete pull-request history discovered for a checkout so branch operations can detect an existing PR. Folder-isolated sessions additionally persist `initialPullRequestUrls`; the provider filters those pre-existing PRs from session presentation and `withPullRequest` queries.

A baseline PR becomes session-related when the user references it in a message or deliberately invokes a create-PR operation that resolves to it. Explicit references are stored separately from checkout PRs and only surface after checkout discovery confirms the same PR, so an unrelated mention cannot change branch operations or session presentation. Pull requests created after the session began are related automatically. Worktree and legacy sessions have no baseline and retain the complete discovered history.

Pull-request identity uses the Agent Host's configured GitHub host. Never canonicalize references to `github.com`: Enterprise checkout URLs and explicit references must remain comparable by host, owner, repository, and number.

## Changeset Operations

The Agent Host advertises host-executed changeset operations for commit, merge, pull requests, sync, and discard. `Merge Changes` is available on the Branch Changes changeset only for a ready worktree session with no pull request and with committed or uncommitted branch work. Native worktree isolation is identified by session config; adopted linked worktrees retain `isolation: folder` and are identified by their repository project differing from the working directory. Pull-request operations are registered before merge, so Create PR leads when both workflows are eligible; the Changes view filters merge from its canonical visible-operation observable when the resource-scoped `git.branchProtection` setting marks the base branch as protected. Local and remote providers recompute cached workspaces when that setting changes so an open session updates immediately. Merge/PR availability prefers `git.hasBaseBranchChanges` (divergence from the local merge target, falling back to `origin/<base>` only when no local base branch exists) over upstream divergence, so a branch already merged locally is not offered again merely because it remains ahead of its remote tracking branch. The base-divergence probe runs alongside the existing push-remote lookup; branches with an upstream use `rev-list --max-count=1`, while only the existing no-upstream fallback computes a full count for `outgoingChanges`.

The effective base branch is one host-owned value: worktree `SessionConfigKey.Branch`, then persisted `agentHost.diffBaseBranch` metadata for adopted/restored worktrees, then the last-known/repository default. Legacy persisted `origin/<branch>` and `refs/remotes/origin/<branch>` forms are normalized to the plain branch name. Git divergence, `ISessionGitRepository.baseBranchName`, branch-protection matching, Branch Changes, PR creation, and Merge all consume that value; never recompute one of those surfaces directly from `origin/HEAD`.

Merge execution resolves the worktree's primary checkout, requires that checkout to be clean and on the selected base branch, commits uncommitted worktree changes, and merges the worktree branch there. The selected session branch is authoritative; restored sessions can fall back to the persisted Branch Changes baseline, normalizing `origin/<branch>` to the local target. A failed Git merge is aborted only when this invocation created the merge state; a pre-existing merge is rejected and preserved. A commit that succeeded before a later failure still refreshes the session's Git state.

Changeset operations are advertised state, not authorization. The merge handler revalidates current pull-request metadata immediately before committing the worktree and again before mutating the parent checkout. GitHub-state changes also trigger an operation recompute so stale Merge UI disappears without waiting for another Git refresh.

After a successful merge, the host requires and stores the resulting target `HEAD` under durable source-control provenance before marking merge as the latest outcome. The marker survives list/restore through `agentHost.sourceControl`. When a session later acquires a related pull request, the PR becomes the latest outcome without deleting the historical merge commit. `AgentHostSessionAdapter.completedStateIcon` maps the latest outcome to either the purple `git-merge` icon or the PR's live state icon; the sessions list and picker consume that provider-owned observable.

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

`getModelsSnapshot(sessionId, desiredModelId)` returns the current models for `session.resource.scheme` and reports that scheme as the snapshot's `modelTarget`, which keys the shared remembered-model preference. Its `desiredModelResolution` field reports whether the desired identifier is pending, available, or unavailable based on that scheme's language-model vendor readiness; it reports `notRequested` when no identifier is supplied. For compatibility with automations saved before the exact model target was preserved, an identifier from the matching logical session type (for example, `copilotcli/gpt-5.6-sol`) is resolved into this provider's concrete namespace (`agent-host-copilotcli:gpt-5.6-sol`) by the model's metadata id; identifiers for unrelated session types remain unavailable. `getModelPickerOptions` returns grouped/featured models and whether Auto is supported. Desktop and phone picker surfaces both consume these provider APIs.

## Architecture

- **`AgentHostSessionAdapter`** (`baseAgentHostSessionsProvider.ts`) is the `ISession` implementation. It wraps an `IAgentSessionMetadata` from the backend and exposes the observable session surface (`status`, `title`, `workspace`, `mainChat`, `mode`, …). The base provider keeps a `_sessionCache` of adapters keyed by `rawId`. Adapter capabilities derive from a shared provider-to-capabilities lookup, so one root-state event listener and one catalog scan serve the entire cache; root-state errors and disconnects clear the lookup so stale capabilities are not retained.
- **`NewSession`** is a disposable draft (pre-creation) session. Several can be in flight simultaneously; the management layer tears down superseded drafts via `deleteNewSession`. A draft eagerly creates its backend session once authentication settles, then **graduates** into a committed `AgentHostSessionAdapter` on first send.
- The base provider is abstract; concrete providers supply: `connection`, `authenticationPending`, `resourceSchemeForProvider`, `_formatSessionTypeLabel`, `_adapterOptions` (workspace builder), `resolveWorkspace`, and optionally `_diffUriMapper`.

`notify/sessionAdded` is an authoritative upsert rather than create-only. An active provisional session can already have entered `_sessionCache` through `listSessions()` with its original checkout; when materialization publishes the final project and worktree working directory, the provider updates that adapter in place and reports it as changed.

### Startup session caching (persistence)

To avoid an empty list on window startup — before the agent host has started, authentication has settled, and the first `listSessions()` round-trip returns — the base provider persists a lightweight snapshot of each session summary to `IStorageService` and re-hydrates it on the next launch. This machinery lives in `BaseAgentHostSessionsProvider` and is **shared by both the local and remote providers**:

- A subclass opts in by calling `_enableSessionCachePersistence(storageKey)` at the end of its constructor (once the identity fields that `createAdapter` depends on are set). This hydrates persisted summaries into `_sessionCache` immediately, so `getSessions()` returns cached sessions before any live list.
- `createAdapter`/`updateAdapter` capture the source `IAgentSessionMetadata` in `_metaByRawId`; `onWillSaveState` lazily serializes the cache (overlaying mutable fields — title, `updatedAt`, `isRead`, `isArchived` — read from each adapter's observables), capped at the 100 most-recently-modified entries under `StorageScope.APPLICATION`.
- Multi-root Editor sessions carry their originating workspace provenance in `_meta.multiRoot` as `{ workspaceFile }`. `workspaceFile` is the complete workspace configuration URI string; the Agent Host persists the validated object as JSON under the `multiRoot` session-database key, reconstructs it during listing/restoration, and the startup cache preserves it before the first live listing. The Editor session list matches this URI directly against `IWorkspace.configuration`; metadata-less sessions use current-folder containment without a separate workspace membership memento.
- Multi-root new-session **Folder-picker** decisions are provider-owned and carried in `_meta` under the `vscode.folderPicker` key as `{ hidden, primary? }`. The owning agent computes it (`IAgent.computeFolderPickerDecision`) from the ordered working-directory set when a fresh (non-fork, non-import) multi-root session is created; `AgentService` seeds it into the session `_meta`, persists the validated object as JSON under the `vscode.folderPicker` session-database key, and reconstructs it during listing/restoration so the decision is a frozen creation-time fact (hidden stays hidden on reopen, shown stays shown). The client keeps the picker hidden by default and reveals it only when `hidden` is `false`, auto-selecting `primary` (a working-directory URI string, valid only on a hidden, pinned decision) before the session starts. A provider that expresses no opinion returns `undefined`, so nothing is seeded and the picker stays hidden.
- Hydrated entries are reconciled against the authoritative `listSessions()` on the first successful `_refreshSessions()`: stale sessions that no longer exist are pruned.
- `_shouldTrackSessionCacheChanges()` is a hook (default `true`) the remote provider overrides to suspend dirty-tracking while its sessions are unpublished (offline), so the on-disk snapshot survives an unreachable host.

The **only** per-provider difference is the storage key: local uses the fixed `localAgentHost.cachedSessions` (single machine-wide host); remote uses `remoteAgentHost.cachedSessions.${authority}` (one key per connection).

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
   `targetChatSessionType` = the same resource scheme so
   `BaseAgentHostSessionsProvider.getModelsSnapshot` resolves the right models.

End-to-end in the Agents window:

- **List** — `getSessions()` reads from the agent host connection. *(no widget, no item controller)*
- **Open / load content** — `ChatView.setChat(chat)` → `IChatService.acquireOrLoadSession(chat.resource, …)` → `ChatWidget.setModel(ref.object)`. `IChatService` routes the resource scheme to `AgentHostSessionHandler.provideChatSessionContent()`. `ChatView` first **locks** the widget to the contributed chat session type so follow-up turns keep routing to the same handler.
- **Send** — `ISessionsManagementService.sendNewChatRequest` → `provider.createNewChat()` → `provider.sendRequest()` → `IChatService.sendRequest(chatResource, …)`, which the bound `AgentHostSessionHandler` forwards to the backend over the agent host protocol.

Codex messages created by another thread remain in independent sessions, including when the source and destination use different workspaces. The Codex mapper removes the private transport envelope from visible text and records the source thread as typed message metadata. `AgentHostSessionHandler` converts that metadata into a per-request source resource; the generic request renderer exposes a source-chat affordance, and the Agents window opens it through the normal session service. In the source session, persisted create-thread and send-message calls may be absent from `thread/read`, so `codexRolloutMetadata` recovers their completed targets from the rollout and `codexReplayMapper` emits standard session-coordination tool parts. The existing result renderer turns those parts into target-chat buttons and consumes a matching `::created-thread` directive instead of displaying it as markdown.

When an existing Agent Host session becomes active, `BaseAgentHostSessionsProvider` publishes the current Agents-window client through `session/activeClientSet`. This lets the host include the window's current customizations and tool definitions before a request is sent; the chat handler continues to update that active-client entry as customizations or tools change.

The Agents window thus depends on the classic `ChatWidget` for rendering and on
the `IChatSessionContentProvider` for content/send, but **not** on
`IChatSessionItemController` — that API exists only to feed the classic chat
sidebar list.

User-input requests are unresolved `InputRequest` response parts on the active
turn, not a separate chat-level queue. `AgentHostSessionHandler` renders and
settles the question, plan-review, or URL elicitation directly from that part as
its `response` and `request.answers` change. Replacing an unresolved request with
the same id recreates the UI when its structure changes; completed turns restore
the settled interaction and answers at the part's original stream position.
Agent implementations decline or cancel requests raised without an active turn
because there is no response stream in which to represent them.

## New Session Flow

`createNewSession(workspaceUri, sessionTypeId)`:

1. Resolves the `ISessionType` and validates the workspace (`resolveWorkspace`).
2. Constructs a `NewSession` draft, stores it in `_newSessions`, and fires `onDidChangeSessionConfig`. New-session model/mode selection is seeded by the existing model/agent pickers and sent on the first message.
3. If a connection exists and authentication is **not** pending, eagerly starts the backend session and resolves its dynamic config in parallel. While auth is pending the draft waits; `_resumeNewSessionAfterAuthenticationSettles` (driven by the `authenticationPending` observable going false) starts the backend for all pending drafts.

Portable string config picks are remembered in profile storage and seed later drafts. `branch` is deliberately excluded because it is repository-scoped; each new workspace instead gets the default branch for worktree isolation or the current branch for folder isolation from the host's Git-backed config resolution. Branch config and completions use local names such as `main`; when that local name denotes the repository default, worktree creation still uses its remote-tracking ref such as `origin/main` as the start point.

The eager session-state subscription does not compute Git metadata while the host session lifecycle is `Creating`: its initial working directory is the selected checkout, not the final isolated worktree. Materialization publishes the resolved working directory through `notify/sessionAdded` and starts the first Git-state refresh against that path; the later `session/metaChanged` / `notify/sessionSummaryChanged` updates rebuild the adapter workspace with the resolved branch.

**Create Session from Pull Request** uses the standard `createAndSendNewChatRequest` flow with `worktreeBranchTrack` enabled, so the generated agent branch tracks the selected remote PR branch. The provider applies isolation, tracking, and branch as one config resolution; worktree creation fetches a missing PR branch into `origin/<branch>` before checkout. The provisional session is activated immediately while this setup and the bootstrap request continue. The bootstrap request is read-only and carries `hideFromTranscript`; the workbench hides its request/response pair immediately, and the Agent Host stores a durable hidden-message marker in `Message._meta` plus the persisted prompt prefix so restore keeps the turn hidden. `SessionGitHubInfoResolver` uses the upstream branch (without its remote-name prefix) for PR lookup instead of the generated local branch, so the session is associated with the selected pull request and excluded from later picker invocations.

`createQuickChat(sessionTypeId)` is the **workspace-less** counterpart of `createNewSession` (declared via `supportsQuickChats`). It reuses the same `ISessionType` as a normal session — a quick chat is "identical minus exclusions", not a separate stack — but skips `resolveWorkspace` and builds the `NewSession` draft with `workspace === undefined` and `quickChat === true`. Both paths funnel through the shared `_createDraftSession` helper, so tracking, eager backend creation, and config resolution are otherwise identical. The draft's `session.workspace` resolves to `undefined`, and its eager `connection.createSession` call simply **omits `workingDirectory`** — there is no explicit quick-chat input flag on the wire. The agent host **infers workspace-less at create from the absent `workingDirectory`**, tags the session (`_meta.workspaceless` + the persisted `agentHost.workspaceless` session-database key) and runs it in a stable per-session scratch cwd, with a **repo-less system prompt** (`COPILOT_AGENT_HOST_QUICK_CHAT_INSTRUCTIONS` appended) that tells the agent its cwd is a throwaway scratch directory, to stay read-only on real repos, and to delegate code changes to a dedicated session. The workspace-trust gate in `_startNewSessionBackend` is naturally skipped because a workspace-less draft has no folder to trust. Forks are **excluded** from this inference: `isWorkspaceless = !sessionConfig.fork && !sessionConfig.workingDirectory`, so a fork without an explicit `workingDirectory` inherits the source session's context rather than being tagged workspace-less.

**Restore (persistence).** Quick chats survive reloads via the normal catalog round-trip: `listSessions()` re-advertises them with the `_meta.workspaceless` tag (carried on the session summary) — but also with the throwaway scratch cwd the host assigned. `AgentHostSessionAdapter` **seeds** its session-kind at construction from `readSessionWorkspaceless(metadata._meta)` (`QuickChatSessionKind` vs `WorkspaceSessionKind`); `_computeWorkspace()` delegates to that kind, so a quick chat returns `undefined` regardless of the scratch working directory, and `ISession.isQuickChat` mirrors it. The kind is **monotonically promotable**: `_promoteToQuickChatIfWorkspaceless` (called from both `update()` and `setMeta()`) flips a session to a quick chat the first time an authoritative `_meta` reports it workspace-less, and never demotes it back — an absent marker means "not included", never "cleared". So a session born mis-classified (stale persisted cache, an older host that dropped `_meta` from its listing) heals as soon as any `_meta`-bearing metadata arrives, rather than leaking the scratch dir as a workspace forever. The tag should still ride on **every** adapter-construction path — `_refreshSessions()`/`listSessions` **and** the live `_handleSessionAdded(summary)` notification (which carries `summary._meta`) — because promotion only removes the *permanence* of the mis-classification, not the transient wrong grouping before the first heal. `_persistCache` overlays the adapter's live quick-chat state onto the serialized snapshot so a healed kind survives a reload instead of being resurrected from a stale `_metaByRawId` entry. On the host side, `AgentService.listSessions()` overlays `_meta.workspaceless` onto the provider listing from the persisted `agentHost.workspaceless` session-database key (`AH_META_WORKSPACELESS_DB_KEY`) (the providers themselves, e.g. `CopilotAgent.listSessions()`, do not emit it) so restored sessions carry the tag even after the state manager's live summary is gone. `restoreVisibleSessions` itself is workspace-agnostic — it resolves persisted slots by `sessionResource`, so a quick chat re-hydrates like any other session once the provider re-lists it.

Codex Desktop also persists chats created without a selected folder using a generated `Documents/Codex/<date>/<slug>` working directory. The Codex provider recognizes that canonical directory together with the rollout header's `Codex Desktop` originator and adds `_meta.workspaceless` while retaining the generated cwd for the runtime. Desktop chats created with an explicitly selected project keep their normal workspace identity.

Restored sessions with a working directory but no Agent Host-owned `configValues` are external folder sessions, so the host resolves them with `isolation: folder` instead of applying the new-session default (`worktree`). For Codex Desktop sessions, restore streams the rollout's model provenance: `session_meta.model_provider` plus each turn's `turn_context.model`. The latest selection seeds the default chat draft, each restored turn carries its own request/usage model for response labels, and live usage reports the selected model too. The Desktop rollout is authoritative over a stale Agent Host overlay: if an earlier VS Code build mapped the session URI to a replacement proxy thread, restore probes the original URI-backed Desktop thread, heals `codex.threadId`/`codex.model`, and resumes that original thread/provider. Continuing in VS Code therefore keeps the ChatGPT-visible history and appends new turns to the same rollout instead of creating an unsynchronized proxy thread.

An external folder session whose working directory is already a linked Git worktree keeps `isolation: folder` because the Agent Host does not own that checkout and must not create, archive, recreate, or delete it. Restore records only its primary repository identity (plus the diff base), so `project.uri` differs from the working directory and the workspace model exposes `workTreeUri`; this produces worktree presentation while leaving lifecycle ownership with the creating app. Workspace-less sessions skip this probe, and a primary checkout resolves to itself and remains an ordinary folder session.

A quick chat is a **single-chat session** (`supportsMultipleChats: false`, forced by the `QuickChatSessionKind`), so it has no peer chats; `applyChatCatalog` collapses any state-advertised chats to the default chat. The agents-window core consumes `ISession.isQuickChat` (via `isQuickChatSession(session)`) for list grouping and context keys, rather than inferring quick-chat from `workspace === undefined`. A later `SessionState._meta` **can** promote the kind (and `setMeta` reports the change so the list regroups even when the workspace was already `undefined`), and the host guarantees the tag rides on **both** the summary `_meta` and the subscribed `SessionState._meta` (`createSessionState(summary)` copies `summary._meta` onto the restored state), keeping the two channels consistent.

`createNewChat(chatId)` creates the chat session model (`IChatSessionsService.getOrCreateChatSession`) so the management service can open the widget, and returns the draft's main chat. For a committed multi-chat session, it asks the host to add a peer chat, waits for that chat to surface in the catalog, seeds its input state, and presents it as `Untitled` until its first request is sent.

## Send Flow

`sendRequest(chatId, chatResource, options)` for a draft session:

1. Requires the draft and an active connection.
2. Waits for any tracked dynamic-config resolution so a picker change cannot race the config captured for the first request.
3. Waits for the tracked eager-creation attempt, including workspace-trust resolution, `createSession`, and the provider-held subscription. If that attempt was skipped or failed and produced no backend state, `AgentHostSessionHandler` uses its legacy create-then-subscribe fallback during dispatch. Waiting here prevents chat hydration from subscribing to the final session URI before the backend session exists.
4. Builds `IChatSendRequestOptions` (agent mode from the selected custom agent or the built-in agent, selected model, attached context, and `agentHostSessionConfig` from `getCreateSessionConfig`).
5. Loads the chat model and seeds the selected model / custom agent into the input state so the pickers reflect the choice immediately.
6. Snapshots existing cache keys, then `IChatService.sendRequest` (which the registered `AgentHostSessionHandler` routes to the backend).
7. Publishes a skeleton session (title seeded from the first line of the query) via `onDidChangeSessions` as `_pendingSession`.
8. Waits for the committed backend session (`_waitForNewSession`); on arrival the draft **graduates** (releases its eager subscription without firing `disposeSession`), config is preserved, `_pendingSession` is cleared, and `onDidReplaceSession` fires from skeleton → committed session. If commit detection times out or the connection is lost, the provisional skeleton is cleaned up and `sendRequest` rejects rather than returning an `InProgress` session that has no remaining lifecycle owner.

For an already-committed session (including a newly-created peer chat), `sendRequest` loads and holds the target chat model through `IChatService.sendRequest`, applies the cached model/agent input state before dispatch, clears the draft afterwards, then clears the provider-side "new chat" flag so status returns to the host-reported value. Holding the model reference is required for peer chats opened by the lightweight new-chat composer, because no `ChatWidget` owns that model while the first message is dispatched.

Running-chat `setModel` / `setAgent` calls update the active chat's cached selection and the loaded chat model's input state. `AgentHostSessionHandler` debounces `IChatModel.inputModel.state` changes back into `chat/draftChanged`, so text/attachment/model/mode drafts survive reloads and restore from `ChatState.draft` when the chat is re-opened. The agent host persists drafts in the per-session database's `chat_drafts` table, keyed by chat URI.

When restoring Copilot SDK history, `mapSessionEvents` best-effort reconstructs each user message's model, launch/resume custom-agent fallback, and SDK-persisted attachments. Model selection is inferred from `session/model_change` events plus the launch fallback; SDK `subagent.selected` agent names are not treated as AHP agent URIs. Attachments come from the SDK `user.message` attachment payload.

The Agents-window subagent transcript pill surfaces the child turn's current model as quiet inline metadata and shows only the newest child tool on an attached single-line row. Terminal tools prefer `ToolCallBase.intention` over the raw invocation message/command; other tools use the SDK/provider-authored invocation message with the display name as fallback. The view uses shared chat markdown/file-widget rendering for editor-quality file chips and inline commands, animates replacements with the rotating-placeholder wipe/shimmer, and snaps immediately for reduced motion.

## CRUD & Stubbed Operations

- `archiveSession` / `unarchiveSession` / `deleteSession` — round-trip to the backend. `deleteSessions` is the batch variant (used when multiple sessions are selected): it disposes each backend session and emits a single removal change event. Sessions advertise `capabilities.supportsDelete`, so the shared sessions-list "Delete..." action (contributed by the sessions workbench, gated on `SessionSupportsDeleteContext`) confirms and invokes deletion — there is no provider-specific delete action.
- `renameChat` — renames a single chat independently of the session title. For an additional peer chat it dispatches `SessionTitleChanged` on that chat's channel; for the default/main chat it dispatches on the default chat channel (`setDefaultChatTitle`). The host persists the new title under `customChatTitle:<chatUri>` and re-applies it on restore — the default chat's title is seeded back through `restoreSession`/`_ensureDefaultChat`, peer chats through `_restorePeerChats` — so an independently-renamed main/peer chat survives a process restart or idle eviction instead of reverting to the session title.
- `renameSession` — updates the session-level title.
- `deleteChat` — no-op (agent host sessions don't model individually deletable chats).
- `forkChat(sessionId, sourceChat, turnId)` — multi-chat only. Mints a peer chat URI and calls `connection.createChat(sessionUri, chatUri, { fork: { source, turnId } })`, where `source` is the backend chat URI (a `chatId` fragment addresses a peer chat, otherwise the session's default chat). The host seeds the new chat with the forked history; the provider waits for it to surface in `cached.chats` and returns it. Routed from the **Fork Conversation** gesture via `ISessionsManagementService.forkChatInSession`; single-chat sessions instead fork into a new session (the workbench `AgentHostSessionHandler.forkSession`).
- `createSideChat(sessionId, sourceChat, turnId)` — gated on `capabilities.supportsSideChat` (currently Claude and Copilot), mirroring `forkChat`'s multi-chat gating and backend-URI resolution. Calls `connection.createChat(sessionUri, chatUri, { model, sideChat: { source, turnId } })`. The anchor may be the source chat's completed or active turn. The node host validates and persists the `SideChat` origin, then passes the source handle to the provider. Claude/Copilot use their SDK fork primitives for hidden context, locking creation on the new chat so they can snapshot provider context accumulated during an active source turn, and filter the inherited prefix from restored turns. The provider wraps the first SDK prompt with a private instruction to prefer explanation over action and to avoid doing work unless explicitly requested. When the active turn has streamed user-visible markdown that the native fork has not persisted, a bounded snapshot is included in the same wrapper. Provider reconstruction strips the wrapper from visible history. The source chat's model/agent selection is re-applied to the new chat once it surfaces, after which the Agents window treats it like any other user-created peer chat tab/menu entry; only tool-origin subagents remain hidden by default.

## Picker & Action Contributions

The provider ships a rich set of session-scoped UI in `browser/`:

| File | Responsibility |
|------|----------------|
| `agentHostSessionConfigPicker.ts` | The per-session config picker (isolation, branch, and host-declared dynamic properties) backed by the dynamic-session-config API; includes `media/agentHostSessionConfigPicker.css`. On desktop the `isolation` property renders as a "Worktree" checkbox (checked = worktree, unchecked = folder) instead of a dropdown; the phone layout keeps the chip so it can route to the unified repo sheet. |
| `agentHostAgentPicker.ts` | Custom-agent picker for a session. |
| `agentHostModePicker.ts` | Agent mode enum picker (extends a shared `AgentHostSessionEnumPicker`), rendered immediately before approvals in the secondary toolbar for new and active sessions. |
| `agentHostClaudePermissionModePicker.ts` | Claude-specific permission-mode picker. |
| `agentHostCodexApprovalsPicker.ts` | Codex-specific permissions-preset picker with Default Permissions, Auto-Review, and Full Access choices. Its bounded, wrapped action-list layout is shared with the editor composer through `vs/platform/agentHost/browser/codexApprovalsPicker.ts`. |
| `agentHostPermissionPickerActionItem.ts` / `agentHostPermissionPickerDelegate.ts` | Toolbar action item + delegate for the permission picker. |
| `agentHostSkillButtons.ts` | Defines the `sessions.isAgentHostSession` (`IsAgentHostSession`) context key and retains the disabled legacy skill-button registrations superseded by host-executed changeset operations. |
| `agentHostSessionChangesets.ts` / `agentHostDiffs.ts` | Changeset model, operation mapping/invocation, and diff conversion (`mapProtocolStatus` maps the protocol status bitset → `SessionStatus`). |
| `agentHostSessionBranchActions.ts` | Branch-related session actions. |
| `exportDebugLogsAction.ts` | "Export debug logs" developer action. |
| `openSessionEventsFileActions.ts` | "Open Copilot CLI State File" — Sessions-app variant resolving the session via `ISessionsManagementService.activeSession`. |
| `mobile/` | Phone-layout variants: `mobileAgentHostModePicker.ts`, the scoped-model-backed `mobileChatInputConfigPicker.ts`, and the provider-backed `mobileChatPhoneInputPresenter.ts`. |

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
| Startup session cache | Shared base persistence; fixed key `localAgentHost.cachedSessions` | Shared base persistence; key `remoteAgentHost.cachedSessions.${authority}` + `unpublishCachedSessions()` offline gate |
| Extra interface members | — | `connectionStatus`, `remoteAddress`, `connect`/`disconnect` |

## Tests

`test/browser/` covers the provider and its pickers: `localAgentHostSessionsProvider.test.ts`, `agentHostAgentPicker.test.ts`, `agentHostAgents.test.ts`, `mobileChatPhoneInputTarget.test.ts`, `agentHostClaudePermissionModePicker.test.ts`, `agentHostSkillButtons.test.ts`, `agentSessionSettingsFileSystemProvider.test.ts`, `openSessionEventsFile.test.ts`, and `agentHost/agentHostPermissionPickerDelegate.test.ts`.
