# Agent Host sessions provider

> **Specification change gate:** Do not update this document for provider bug
> fixes, metadata additions, races, or transport behavior. Update it only when
> provider ownership, identity, or the shared Agent Host lifecycle changes.

## Scope

The Agent Host provider family adapts Agent Host Protocol sessions into the
provider-neutral Sessions model. The shared implementation supports local and
remote hosts; this document covers the shared base and local registration.

Remote connection-specific behavior is specified in
[REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md](../remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md).

## Implementations

| Implementation | Responsibility |
|----------------|----------------|
| `BaseAgentHostSessionsProvider` | Shared `ISessionsProvider` adaptation over an `IAgentConnection` |
| `LocalAgentHostSessionsProvider` | Local provider backed by `IAgentHostService` |
| `RemoteAgentHostSessionsProvider` | Per-connection remote specialization |

The shared base owns session adaptation, draft creation, catalog publication,
request routing, and provider operations. Concrete providers own connection
lifetime and environment-specific capabilities.

## Extended contract

Agent Host providers implement `IAgentHostSessionsProvider`, which extends
`ISessionsProvider` with:

- optional remote connection state and connect/disconnect operations;
- observable host-declared session configuration;
- configuration mutation and completion APIs.

Consumers use the extended type guard rather than matching provider IDs.
Provider-neutral features continue to depend on `ISessionsProvider`.

## Registration

`LocalAgentHostContribution` registers the local provider only when the Agent
Host runtime is available for the current environment. Agent discovery
populates session types dynamically from host root state.

The contribution also registers the content and working-directory adapters
needed by advertised session types. Runtime startup and shutdown rebind or
dispose connection-scoped listeners; consumers must not assume registration
means the backend has finished discovery.

## Identity

The local provider uses:

| Property | Contract |
|----------|----------|
| Provider ID | `local-agent-host` |
| Workspace support | Local workspaces |
| Quick chats | Supported while the provider is available |
| Session types | Dynamically derived from advertised agents |

Agent provider names form logical session-type identifiers. Resource URI
schemes remain the routing identity for content and model providers. Consumers
must not derive one identifier by parsing another.

## Session adaptation

`AgentHostSessionAdapter` is the stable `ISession` facade for a committed Agent
Host session. It:

- preserves provider resource identity;
- projects host metadata into observables;
- exposes chats through stable `IChat` facades;
- derives capabilities from the advertised agent and live host state;
- updates observable state without replacing the facade when identity is stable.

The provider cache owns adapter identity. Catalog notifications describe
membership; adapter observables describe mutable state.

Provider-specific metadata such as pull-request provenance, changesets, agent
configuration, and external visibility is translated inside this provider.
Shared Sessions code consumes only provider-neutral fields and capabilities.

Agent-recorded artifacts are persisted with the session and projected through
`ISession.artifacts`. Pull request and issue artifacts that shared GitHub
surfaces can represent are promoted into the existing GitHub metadata without
duplicating them. Customizations used or read by the agent are derived per chat
and projected through `IChat.customizations`.

## Draft and send lifecycle

`NewSession` represents an untitled draft before the backend session is
committed.

```text
create draft
    -> resolve host configuration
    -> create or select the chat
    -> send through the owning agent connection
    -> publish or replace the committed session facade
```

The first send waits for tracked draft configuration. Cancellation disposes the
draft. Later configuration changes are scoped to the committed session and do
not recreate the entire facade.

Existing-session requests route by the provider resource and chat resource.
Host notifications update adapters and catalog membership reactively.

## Persistence and discovery

Startup metadata may seed lightweight session facades before a live connection
finishes discovery. Live host state remains authoritative and upgrades or
replaces cached state through the normal catalog lifecycle.

External sessions remain provider-owned domain objects. Visibility and
interactivity fields determine whether shared Sessions surfaces present them;
shared code does not infer visibility from Agent Host URI formats.

Host-owned background activities remain independent of client visibility. Agent
Merge monitoring prevents an enabled session from idle eviction while work is
active, resumes eligible sessions after host startup, and releases that
retention when monitoring ends.

## Local and remote boundary

The local provider owns local runtime availability and local workspace access.
Remote providers own:

- connection establishment and recovery;
- remote filesystem browsing;
- remote authentication transport;
- per-host routing identity.

Behavior shared by both belongs in the base provider. Connection policy stays
in the remote contribution.

## Testing

Focused tests live under `test/browser/*.test.ts` beside this provider. Tests
own concrete behavior, hydration races, metadata translation, and regressions;
this document owns only stable provider boundaries.

## Change policy

Update this specification only when provider ownership, the extended contract,
identity rules, or the draft/catalog lifecycle changes. Do not append feature
walkthroughs, race analyses, test-file inventories, or incident narratives.
