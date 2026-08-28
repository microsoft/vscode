# Sessions architecture

> **Specification change gate:** Do not update this document for bug fixes, implementation details, telemetry, or UI behavior. Update it only when the shared service ownership, domain contract, or lifecycle intentionally changes.

## Scope

The Sessions subsystem provides the provider-neutral model used by the Agents Window. Providers adapt backend-specific sessions and chats into shared domain objects. Sessions services aggregate those providers and own model and presentation orchestration.

This specification covers stable service ownership, domain contracts, and lifecycles. Layout, list presentation, and provider implementations have separate owning specifications in [README.md](README.md).

## Architecture

```text
Sessions UI and contributions
        |
        v
ISessionsService -------------------- visible and active state
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

The implementation follows [LAYERS.md](LAYERS.md). Shared Sessions code remains provider-neutral: provider implementations may consume shared contracts, but shared services and contributions must not depend on provider internals.

## Service ownership

### `ISessionsProvidersService`

The registry:

- registers and unregisters providers;
- exposes providers in stable order;
- resolves providers by identifier;
- announces registration changes.

It does not aggregate sessions, choose a provider for an operation, or own UI state.

### `ISessionsManagementService`

The model-orchestration service:

- aggregates sessions and session types;
- resolves workspaces and selects providers for new sessions;
- owns pending workspace-session, quick-chat, and automation drafts;
- routes model and lifecycle operations to the owning provider;
- exposes provider-neutral lookup and recency APIs;
- emits lifecycle notifications for operations initiated through the service.

It does not own active or visible session state, focus, or layout.

### `ISessionsService`

The view service:

- owns the active session and visible-session arrangement;
- opens sessions and chats;
- presents new-session and peer-chat composers;
- owns session navigation, focus, and visible-session restoration.

It delegates model lifecycle operations to `ISessionsManagementService`.

### Scoped session context

Surfaces that can represent a session other than the window-global active session use `ISessionContext`. Commands and menus resolve their target through that scope rather than assuming the active session.

## Domain model

Provider-neutral interfaces live in `services/sessions/common/session.ts`.

### Identity

An `ISession` has a provider-owned resource URI, provider identifier, session type, and globally unique session identifier. An `IChat` has its own provider-owned resource URI. Consumers compare resource identity and do not parse provider URI formats.

### Observable state

`ISession` and `IChat` are stable facades. Mutable state is exposed through `IObservable`, including status, title, workspace, chats, model, changes, archive state, and capabilities.

Consumers derive state from those observables. Provider events announce catalog membership changes; they are not a parallel state store.

Providers may expose immutable creation provenance when a session was created by
another session. `createdBySession` identifies the creating session and may also
identify its chat and turn. The reference is observable so list presentation can
keep related sessions together when creation metadata arrives after discovery.
Creation paths that know the reference include it in the initial session
publication.

### Sessions and chats

A session groups one or more chats and exposes a main chat. Providers advertise multi-chat, fork, side-chat, and other operations through observable capabilities. Shared code gates affordances on those capabilities rather than provider identifiers.

Chat origin and interactivity describe whether a chat is user-created, tool-created, interactive, read-only, or hidden. Presentation code uses those contracts instead of inferring behavior from resource shape.

### Workspaces and quick chats

`ISession.workspace` describes the workspace in which a session operates. A quick chat is workspace-less by product intent and is identified through `ISession.isQuickChat`. An absent workspace alone does not prove that a session is a quick chat because workspace state may still be hydrating.

### Capabilities

Capabilities describe operations supported by the backing provider and remain observable when support may change during hydration. Provider-specific checks belong in the provider; shared services and UI consume the capability contract.

### Changes

Sessions and chats expose provider-neutral file changes and changesets. Transport, reconciliation, and backend metadata stay in the provider. Presentation stays in the owning changes and layout contributions.

Turn-level file changes route through `IChatResponseFileChangesService`. The editor workbench opens its standard multi-diff presentation; the Agents Window registers `SessionsChatResponseFileChangesService` to select its canonical Changes editor. Providers expose the data but do not choose the presentation.

### Artifacts, references, and customizations

Sessions may expose the artifacts and references recorded by the agent. Both share one session-scoped observable and are told apart by `isArtifact`: an artifact is something the session produced that is not an ordinary workspace edit, while a reference is something it only points the user at. Consumers that surface one category must filter on that field rather than assuming the observable holds artifacts alone. Chats may expose the customizations used or read during their turns; these are chat-scoped. Providers that cannot determine either may omit the corresponding observable.

## Provider contract

`ISessionsProvider` is defined in `services/sessions/common/sessionsProvider.ts`. A provider represents one compute environment. A provider may advertise multiple session types, and multiple providers may advertise the same logical type.

### Discovery and catalog

A provider exposes:

- stable identity and presentation metadata;
- supported session types and their changes;
- the current session catalog and catalog changes;
- workspace browsing and resolution;
- provider capabilities.

Catalog events distinguish added, removed, and changed facades. Facade replacement is a separate `onDidReplaceSession` lifecycle notification; the management service also translates it into an ordinary catalog refresh. Mutable fields on a facade remain observable.

A provider that supersedes sessions from another provider may implement `resolveSessionResource`. Open paths use this hook to redirect persisted or linked resources before lookup. Providers decline unfamiliar resources, in which case callers retain the original resource.

### Drafts

`createNewSession` and `createQuickChat` return untitled drafts. A draft remains `Untitled` while its first request is prepared; `isNewSessionRequestInProgress` separately lets the UI present that activity without treating the session as committed. A draft enters the committed catalog when its first request is sent. The management service owns the currently presented draft; the provider owns its backend resources. `deleteNewSession` disposes an abandoned draft.

### Operations

Providers implement only operations advertised by their contracts, including request sending, model selection, rename, archive, read state, deletion, and chat creation. Capability checks happen before invocation. Once invoked, an operation returns a defined result or rejects; unsupported behavior must not be reported as a success-shaped fallback.

### Provider ownership

Backend state, transport, URI formats, recovery, and authentication remain inside provider contributions. Providers adapt those details into `ISession`, `IChat`, and shared operations.

Provider-specific contracts are documented in:

- [Copilot Chat provider](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md)
- [Agent Host provider](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md)
- [Remote Agent Host provider](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md)

## Principal lifecycle

### Registration

```text
provider contribution loads
    -> registerProvider(provider)
    -> management subscribes to provider state
    -> aggregated types and sessions update
    -> consumers react through services and observables
```

Registration does not imply backend readiness. Providers publish usable types and capabilities as their backend becomes ready. Consumers that support partial state create the best available model and react to later capability changes.

### New session

```text
user chooses a workspace and session type
    -> ISessionsService presents the flow
    -> ISessionsManagementService resolves trust and provider
    -> provider creates a draft
    -> management owns the pending draft
    -> view service presents it
```

On first send, the provider creates or selects the chat, sends the request, and commits the session. Providers may preserve the draft facade or notify the management service through the separate replacement lifecycle. Consumers follow that lifecycle rather than assuming one strategy or a replacement field on a catalog event.

### Existing session

Requests route through `ISessionsManagementService` to the provider identified by the session. Providers update chat and session observables. Foreground sends may update view state through lifecycle notifications; background sends do not implicitly steal focus.

### Multiple chats

Creating or forking a chat is a capability-gated provider operation routed by the management service. Opening an existing chat is view orchestration: `ISessionsService` activates the session, resolves the chat from `session.chats`, and updates visible and active state.

## State propagation

Use the narrowest mechanism that represents a change:

- observables for mutable session or chat state;
- provider events for catalog membership;
- management events for operation lifecycle notifications;
- direct service calls for orchestration and control flow.

Do not mirror observable state with events or use storage and provider internals as side channels between components.

## Provider checklist

1. Implement `ISessionsProvider` under `contrib/providers/<provider>/browser/`.
2. Adapt backend state into stable `ISession` and `IChat` facades.
3. Advertise types and capabilities truthfully and reactively.
4. Register through the appropriate `sessions.*.main.ts` entry point.
5. Keep shared contracts provider-neutral.
6. Add focused lifecycle and failure tests.
7. Update this specification only when the shared contract or ownership model changes.

## Related specifications

- [Documentation index](README.md)
- [Layer rules](LAYERS.md)
- [Layout](LAYOUT.md)
- [Layout controller](LAYOUT_CONTROLLER.md)
- [Sessions list](SESSIONS_LIST.md)
- [Mobile](MOBILE.md)
