# Agent Host sessions provider

> **Specification change gate:** Do not update this document for provider bug fixes, metadata additions, races, or transport behavior. Update it only when provider ownership, identity, or the shared Agent Host lifecycle changes.

## Scope

The Agent Host provider family adapts Agent Host Protocol sessions into the provider-neutral Sessions model. The shared implementation supports local and remote hosts; this document covers the shared base and local registration.

Remote connection-specific behavior is specified in [REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md](../remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md).

## Implementations

| Implementation | Responsibility |
|----------------|----------------|
| `BaseAgentHostSessionsProvider` | Shared `ISessionsProvider` adaptation over an `IAgentConnection` |
| `LocalAgentHostSessionsProvider` | Local provider backed by `IAgentHostService` |
| `RemoteAgentHostSessionsProvider` | Per-connection remote specialization |

The shared base owns session adaptation, draft creation, catalog publication, request routing, and provider operations. Concrete providers own connection lifetime and environment-specific capabilities.

## Extended contract

Agent Host providers implement `IAgentHostSessionsProvider`, which extends `ISessionsProvider` with:

- optional remote connection state and connect/disconnect operations;
- observable host-declared session configuration;
- configuration mutation and completion APIs.

Consumers use the extended type guard rather than matching provider IDs. Provider-neutral features continue to depend on `ISessionsProvider`.

## Registration

`LocalAgentHostContribution` registers the local provider only when the Agent Host runtime is available for the current environment. Agent discovery populates session types dynamically from host root state.

The contribution also registers the content and working-directory adapters needed by advertised session types. Runtime startup and shutdown rebind or dispose connection-scoped listeners; consumers must not assume registration means the backend has finished discovery.

## Identity

The local provider uses:

| Property | Contract |
|----------|----------|
| Provider ID | `local-agent-host` |
| Workspace support | Local workspaces |
| Quick chats | Supported while the provider is available |
| Session types | Dynamically derived from advertised agents |

Agent provider names form logical session-type identifiers. Resource URI schemes remain the routing identity for content and model providers. Consumers must not derive one identifier by parsing another.

## Session adaptation

`AgentHostSessionAdapter` is the stable `ISession` facade for a committed Agent Host session. It:

- preserves provider resource identity;
- projects host metadata into observables;
- exposes chats through stable `IChat` facades;
- derives capabilities from the advertised agent and live host state;
- updates observable state without replacing the facade when identity is stable.

The provider cache owns adapter identity. Catalog notifications describe membership; adapter observables describe mutable state.

Provider-specific metadata such as pull-request provenance, changesets, agent configuration, and external visibility is translated inside this provider. Shared Sessions code consumes only provider-neutral fields and capabilities.

Agent-recorded artifacts and references are persisted with the session and projected together through `ISession.artifacts`, where `isArtifact` distinguishes them. Only artifacts are promoted into the existing GitHub metadata, so a pull request or issue the session produced is polled and shown on the shared GitHub surfaces rather than duplicated; a reference keeps its link identity so anything those surfaces already show is offered exactly once. Customizations used or read by the agent are derived per chat and projected through `IChat.customizations`.

## Draft and send lifecycle

`NewSession` represents an untitled draft before the backend session is committed.

```text
create draft
    -> resolve host configuration
    -> create or select the chat
    -> send through the owning agent connection
    -> publish or replace the committed session facade
```

The first send waits for tracked draft configuration. Cancellation disposes the draft. Later configuration changes are scoped to the committed session and do not recreate the entire facade.

Existing-session requests route by the provider resource and chat resource. Host notifications update adapters and catalog membership reactively.

## Persistence and discovery

Startup metadata may seed lightweight session facades before a live connection finishes discovery. Live host state remains authoritative and upgrades or replaces cached state through the normal catalog lifecycle.

External sessions remain provider-owned domain objects. Visibility and interactivity fields determine whether shared Sessions surfaces present them; shared code does not infer visibility from Agent Host URI formats.

Host-owned background activities remain independent of client visibility. Agent Merge monitoring prevents an enabled session from idle eviction while work is active, resumes eligible sessions after host startup, and releases that retention when monitoring ends.

### Host session catalog

The local Agent Host maintains a host-wide `sessions_v2` SQLite registry and
catalog. Each row contains a small indexed registry and synchronization envelope
plus one bounded, versioned payload for list-visible session and chat metadata.
The payload's structural validator is also its TypeScript type authority and
normalizes all data before canonical serialization and hashing. Per-session
databases continue to own turns, drafts, annotations, detailed changesets, and
opaque provider backing required when a session or chat is opened.

The row has two different ownership contracts. Registry identity and provenance
(`session_uri`, provider, start time, external state, and registration source)
remain authoritative. The list payload is a derived, rebuildable cache: provider
state plus per-session metadata can reproduce its canonical bytes and hash.

Catalog persistence is legacy-first during the compatibility window: one
per-session transaction updates downgrade-compatible metadata and a durable
pending catalog snapshot before the host-wide catalog is updated. Catalog
updates are serialized per session, guarded by session incarnation and source
revision, and acknowledged only after the central transaction succeeds.
Background reconciliation replays interrupted writes and detects metadata
written by older builds. A central monotonic dirty marker lets periodic passes
skip clean rows before opening their per-session databases. The first pass after
host startup marks every payload dirty once so writes made by older builds,
which do not know about the marker, are still rechecked. Repair clears only the
marker it observed; a concurrent mutation leaves the row dirty for another pass.
Because provider state has no complete change signal, an infrequent safety sweep
marks clean rows dirty after the normal dirty queue drains; ordinary periodic
passes remain central-only.

The per-session snapshot retains the canonical payload only while the central
write is pending. Exact acknowledgement promotes its hash to the compact receipt
and clears the pending payload/hash, so synchronized sessions do not permanently
store a third copy of their list metadata.

`sessions_v2` is independent of the predecessor `sessions` registry. The
current-version importer unions existing v2 identities, optional predecessor
registry rows, and provider discovery by session URI, then writes complete rows
directly to v2. Payload-versioned per-provider markers record successful
current enumeration without changing predecessor migration markers. Partial
imports resume per session; durable exclusions make permanently ineligible
candidates terminal and revivable by later discovery.

Normal current-runtime mutations are authoritative in v2 and atomically mirror
identity/provenance into `sessions` during the compatibility window so an
intermediate build can see newly-created sessions. Direct migration remains
v2-only. On returning from an intermediate build, the importer reconciles
legacy-only additions and resolved legacy identity changes; legacy-row absence
alone is never interpreted as deletion. Shared tombstones are the durable
cross-version delete signal.

An upsert atomically replaces the verified payload and its synchronization
envelope while preserving the registered identity. It is guarded by the session
incarnation and source revision. Concurrent first writers converge on the
winning incarnation through a serialized retry. Older builds continue to read
the mirrored predecessor metadata; no retained central generation is required.

The indexed envelope also carries payload-derived top-level eligibility.
Chat-backing sessions therefore remain hidden after restart without decoding
their payload or opening their per-session database. For worktree sessions,
both legacy metadata and the central payload derive the displayed project from
the persisted repository root rather than the worktree checkout.

Session listing resolves each registered session independently from its verified
current-version payload. A missing, outdated, or malformed payload falls back to
the legacy/provider source for that row and schedules reconciliation. A valid
chat-backing envelope remains authoritative and never falls back into the
top-level session list.

## Local and remote boundary

The local provider owns local runtime availability and local workspace access. Remote providers own:

- connection establishment and recovery;
- remote filesystem browsing;
- remote authentication transport;
- per-host routing identity.

Behavior shared by both belongs in the base provider. Connection policy stays in the remote contribution.

## Testing

Focused tests live under `test/browser/*.test.ts` beside this provider. Tests own concrete behavior, hydration races, metadata translation, and regressions; this document owns only stable provider boundaries.

## Change policy

Update this specification only when provider ownership, the extended contract, identity rules, or the draft/catalog lifecycle changes. Do not append feature walkthroughs, race analyses, test-file inventories, or incident narratives.
