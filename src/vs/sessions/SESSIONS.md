# Sessions architecture

## Purpose

The Sessions subsystem provides a provider-neutral model for agent work in the
Agents Window. Providers own backend-specific session and chat behavior.
Sessions services aggregate those providers, expose observable domain objects,
and coordinate the views that present them.

This document defines the stable model, service ownership, provider contract,
and principal lifecycle. UI layout, list presentation, and provider
implementations are documented separately in [README.md](README.md).

## Architecture

```text
Sessions UI and contributions
        |
        v
ISessionsService -------------------- view state
        |
        v
ISessionsManagementService ---------- model orchestration
        |
        v
ISessionsProvidersService ----------- provider registry
        |
        +--> ISessionsProvider (Copilot Chat)
        +--> ISessionsProvider (Agent Host)
        +--> ISessionsProvider (Remote Agent Host)
```

The implementation follows the internal import hierarchy in
[LAYERS.md](LAYERS.md). Shared Sessions code must remain provider-agnostic.
Provider implementations may consume shared Sessions contracts; shared code must
not reach into provider internals.

## Service ownership

### `ISessionsProvidersService`

The provider registry is defined in
`services/sessions/browser/sessionsProvidersService.ts`.

It:

- registers and unregisters `ISessionsProvider` instances;
- exposes providers in stable provider order;
- looks up providers by ID;
- announces provider registration changes.

It does not aggregate session state, choose providers for operations, or own UI
state.

### `ISessionsManagementService`

The model orchestration service is defined in
`services/sessions/common/sessionsManagement.ts` and implemented under
`services/sessions/browser/`.

It:

- aggregates sessions and session types from registered providers;
- resolves workspaces and chooses a provider for new sessions;
- owns pending workspace-session, quick-chat, and Automation drafts;
- routes send, model, archive, delete, rename, read-state, and chat operations to
  the owning provider;
- exposes lookup and recency APIs;
- emits lifecycle notifications for operations initiated through the service.

It does not own the active session, visible-session arrangement, focus, or
layout.

### `ISessionsService`

The view service is defined and implemented in
`services/sessions/browser/sessionsService.ts`.

It:

- owns the canonical active session as the active visible slot;
- owns the visible-session arrangement, order, and stickiness;
- opens sessions and chats;
- presents the new-session and new-chat-in-session composers;
- owns session navigation, focus, and visible-session restoration.

It delegates model lifecycle operations to `ISessionsManagementService`.

### Scoped session context

Surfaces that can represent a session other than the window-global active
session use `ISessionContext`. Commands, menus, and picker actions resolve their
session through that scope. This prevents concurrently visible session surfaces
from acting on the wrong session.

## Domain model

The provider-neutral interfaces live in
`services/sessions/common/session.ts`.

### Identity

An `ISession` has:

- a provider-owned `resource` URI;
- a `providerId`;
- a `sessionType`;
- a globally unique `sessionId`, constructed with `toSessionId(providerId,
  resource)`.

An `IChat` has its own provider-owned `resource` URI. Consumers use resource
identity rather than parsing provider URI formats.

### Observable state

An `ISession` and its `IChat` objects are stable facades whose changing state is
exposed through `IObservable`.

Session observables include:

- title, update time, status, loading, description, and last-turn end;
- workspace and quick-chat identity;
- chats and main chat;
- selected model and mode;
- archive and read state;
- changes, changesets, external changes, and summaries;
- capabilities.

Chat observables include:

- title, update time, status, description, and last-turn end;
- selected model and mode;
- archive and read state;
- cumulative and last-turn changes;
- checkpoints;
- interactivity and capabilities.

Consumers derive UI from these observables. Provider change events announce
catalog membership changes; they are not a parallel store for mutable session
state.

### Sessions and chats

A session groups one or more chats and exposes a `mainChat`. A provider that
supports multiple chats advertises that through observable session
capabilities. Consumers must gate multi-chat, fork, and side-chat affordances on
capabilities instead of provider IDs.

Chat origin records how a chat was created, such as a user-created peer chat,
fork, side chat, or tool-created worker chat. Chat interactivity determines
whether a chat is fully interactive, read-only, or hidden. Presentation code
uses these contracts rather than inferring behavior from URI shape or provider
identity.

### Workspaces and quick chats

`ISession.workspace` describes the workspace a session operates on, including
its folders and provider presentation metadata.

A quick chat is workspace-less by product intent. Providers that support quick
chats advertise the capability and create a draft through `createQuickChat`.
Consumers identify quick chats through `ISession.isQuickChat`, not by treating
an unresolved or absent workspace as proof of quick-chat identity.

### Capabilities

Session and chat capabilities describe operations supported by the backing
provider. They are observable where provider state may hydrate or change after
the facade is created.

UI and shared services must consult these capabilities before offering an
operation. Provider-specific checks belong in the provider, not in shared
Sessions code.

### Changes

Sessions and chats expose provider-neutral file changes and changesets. A
changeset is a named group of file changes and may expose review state where the
provider supports it.

Turn-level file changes open through `IChatResponseFileChangesService`. The
Editor workbench opens a standalone multi-diff, while the Agents Window selects
the canonical Changes editor. The active-turn pill selects the provider's moving
Last Turn Changes changeset, which follows the active turn and then remains on
that turn after completion. Historical turns and completed chats that are no
longer the session's most recent use transient selections backed by their exact
per-turn changes.

Presentation and layout of changes are documented in [LAYOUT.md](LAYOUT.md).
Provider translation and transport details belong in the relevant provider
specification.

## Provider contract

`ISessionsProvider` is defined in
`services/sessions/common/sessionsProvider.ts`. A provider represents one compute
environment. One provider may advertise multiple session types, and multiple
providers may advertise the same session type.

### Discovery and catalog

A provider exposes:

- stable identity, label, icon, and ordering;
- supported session types and session-type changes;
- current sessions and catalog change events;
- workspace browse actions and workspace resolution;
- provider capabilities such as local-workspace and quick-chat support.

Session catalog events distinguish added, removed, and changed facades. Durable
mutable fields remain observable on each facade.

### Draft creation

`createNewSession` and `createQuickChat` return untitled drafts. A draft is not
part of the provider's committed session catalog until its first request
is sent. `deleteNewSession` disposes an abandoned draft.

The management service owns which draft is currently presented for each
workflow. Providers own the backend resources behind those drafts.

### Operations

Providers implement the operations surfaced by their advertised contracts,
including:

- session and chat creation;
- sending requests;
- model enumeration, presentation, and selection;
- session and chat rename;
- archive, unarchive, read state, and deletion;
- peer-chat creation, fork, and side-chat behavior when supported.

Capability checks happen before an operation reaches a provider. Once invoked,
an operation returns a result or rejects; callers should not treat `undefined`
as a silent unsupported result unless the interface explicitly defines that
outcome.

### Provider ownership

Backend-specific state, transport, URI formats, and recovery logic stay inside
the provider contribution. A provider adapts them into `ISession`, `IChat`, and
the shared provider operations.

Provider implementation details are documented in:

- [Copilot Chat provider](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md)
- [Agent Host provider](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md)
- [Remote Agent Host provider](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md)

## Principal lifecycle

### Provider registration

```text
provider contribution loads
    -> registerProvider(provider)
    -> management service subscribes to provider catalog/capability changes
    -> aggregated session types and sessions become available
    -> views react through services and observables
```

Provider registration alone does not imply backend readiness. A provider
publishes usable session types and capabilities when its backend is ready.
Consumers that can operate with partial provider data should create the best
available model and upgrade or replace it when the provider advertises the
missing capability. Do not block creation behind a guessed timeout or a
one-time readiness snapshot.

### Workspace session creation

```text
user selects workspace and session type
    -> ISessionsService.openNewSession(...)
    -> workspace trust is resolved before draft creation
    -> ISessionsManagementService resolves the target provider
    -> provider.createNewSession(...)
    -> management service owns the pending draft
    -> view service presents the draft
```

The view service owns presentation and focus. The management service owns the
draft lifecycle and provider selection. The provider owns backend preparation.

The new-session input keeps nonessential notices out of the first-use flow.
Notifications marked `deferForNewUsers` remain hidden until the existing
Agents-window usage threshold is reached; the input derives this eligibility
directly from the persisted usage counter rather than a context-key mirror.

### First send and commit

```text
user submits the draft
    -> management service asks the provider to create/select the chat
    -> provider.sendRequest(...)
    -> provider commits the session
    -> provider catalog and session observables update
    -> management lifecycle notifications fire
    -> view service follows the committed session/chat
```

Some providers preserve the draft facade while others replace it with a
committed facade. Consumers use the management service's replacement lifecycle
rather than depending on one provider's strategy.

### Existing-session send

```text
user submits in an existing chat
    -> ISessionsManagementService.sendRequest(session, chat, options)
    -> request routes to session.providerId
    -> provider updates chat/session observables
    -> lifecycle notifications allow the view to follow foreground sends
```

Background sends do not implicitly steal active view or focus.

### Multi-chat lifecycle

```text
user creates or forks a peer chat
    -> capability is checked
    -> management operation routes to the owning provider
    -> provider returns an IChat and updates session.chats
    -> ISessionsService chooses whether and where to present it

user opens an existing peer chat
    -> ISessionsService.openChat activates the owning session
    -> the chat is resolved from session.chats after the session loads
    -> the service opens the chat in the visibility model and makes it active
```

User-created peer chats participate in normal chat navigation. Hidden
tool-origin chats remain provider-neutral domain objects but are excluded from
ordinary presentation by their interactivity/origin contracts.

### Model selection

The Agents Window does not have its own model-selection policy. It reuses
Workbench chat's `ChatInputModelSelectionController`, so the two windows cannot
disagree about which model a chat opens on.

```text
active session + provider
    -> SessionModelSelection builds an IChatInputModelSelectionRuntime
    -> ChatInputModelSelectionController decides the model
    -> SessionModelSelection writes it back via ISessionsProvider.setModel
```

`SessionModelSelection` (`contrib/chat/browser/sessionModelSelection.ts`) is the
adapter: it turns `IActiveSession` and `ISessionsProvider` into the runtime the
controller expects, and turns the controller's answer into a provider write plus
picker state. Presentation lives in `sessionModelPickerState.ts`.

Precedence — configured default vs. remembered preference vs. the chat's own
model — belongs to the controller. The adapter only decides two things the
controller cannot know: when a chat has been seeded, and when to wait for a model
the provider has not published yet instead of writing a stand-in to a backend.

Three rules follow:

- **A chat's model is its own or it was carried over.** `IChat.modelSource` says
  which, so nothing has to guess. `chat.defaultModel` may seed a chat that only
  carried a model over (a new peer chat, an automatic pick) but never one that
  chose its own. `setModel` makes callers state this; `undefined` is read as the
  chat's own, since the alternative is overwriting a model the user picked.
- **State is per chat, keyed by chat resource** — the intended model, whether it
  has been seeded, and where its model came from. One chat's choice is therefore
  unreachable from another by construction.
- **A chat that has already run is never given a model.** Its own model may not
  have arrived yet (an agent-host session hydrates it from the persisted draft),
  and writing a profile-wide preference would change what it runs on. It may show
  one so the picker is not blank. A pick the user makes still applies.

Both surfaces run the conformance matrix in
`vs/workbench/contrib/chat/test/browser/widget/input/modelSelectionConformance.ts`,
which fences settled-catalog precedence. It is not a parity proof: publication
lifecycle is excluded, since Workbench shows a stand-in while a model is pending
and Sessions waits instead.

Remembered selections use the shared `chat.currentLanguageModel.*` keys, scoped
by model target. The legacy `sessions.modelPicker.*` key is read once and
migrated forward.

## State propagation

Use the narrowest mechanism that represents the change:

- `IObservable` for mutable session or chat state;
- provider catalog events for sessions entering, leaving, or being replaced in
  the catalog;
- management lifecycle events for completed operations initiated through the
  management service;
- direct service calls for orchestration and control flow.

Do not add an event that mirrors an observable value. Do not use storage keys or
provider internals as a side channel between components.

## Agents Window telemetry

On the first Agents-window handoff, `SelectAgentsFolderContribution` immediately
emits `agents/windowSessionStart` once with the entry `source` and
`hasPreviouslyStartedSession`, a non-PII boolean measurement derived from
whether the application-scoped `TOTAL_SESSIONS_KEY` counter is nonzero. Together
with the standard numeric `common.isAgentsWindow` property, this is the general
Agents-window opened/session-start signal for device-day retention and provides
a clean initial cohort (`hasPreviouslyStartedSession: false`); it is independent
of selecting or creating an agent session.

The contribution starts `SessionsWindowOpenTelemetry` only for that initial
cohort. The delayed `agents/firstTimeWindowOpen` event captures initial setup
and workspace state, and its categorical `emissionReason` identifies whether it
was sent by the timer, a close, quit, reload, or another shutdown. A close or
quit within three minutes includes `windowCloseDurationMs`; other emission paths
leave that field undefined.

When an onboarding presentation renders its first visible element, the shared
onboarding engine emits `onboarding.scenarioShown`. For the V2 new-session-view
experiment this is the dedicated rendered-tour impression:
`scenarioId` is `sessions.onboarding.newSessionViewV2`, and
`experimentAssignmentContextId` contains the existing bounded `onb-new-btn-*`
treatment/control assignment identifier only when its valid experiment is
active. The event is emitted after the spotlight is mounted, never on assignment
or trigger eligibility; in the Agents window it carries the standard
`common.isAgentsWindow` property.

## Adding or changing a provider

1. Implement `ISessionsProvider` under
   `contrib/providers/<provider>/browser/`.
2. Adapt backend state into stable `ISession` and `IChat` facades.
3. Advertise session types and capabilities truthfully and reactively.
4. Register the provider from the appropriate `sessions.*.main.ts` entry point.
5. Keep shared contracts provider-neutral; do not add provider-ID branches to
   shared UI.
6. Add focused tests for catalog, lifecycle, capabilities, and failure behavior.
7. Update this document only when the shared contract changes. Document
   provider-specific architecture in the provider's local specification.

## Related specifications

- [Documentation index](README.md)
- [Layer rules](LAYERS.md)
- [Layout](LAYOUT.md)
- [Layout controller](LAYOUT_CONTROLLER.md)
- [Sessions list](SESSIONS_LIST.md)
- [Mobile](MOBILE.md)
