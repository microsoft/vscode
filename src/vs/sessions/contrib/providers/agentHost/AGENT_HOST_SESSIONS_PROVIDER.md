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
- configuration mutation and completion APIs;
- optional local-draft Dev Container availability and selection.

Consumers use the extended type guard rather than matching provider IDs. Provider-neutral features continue to depend on `ISessionsProvider`.

## Dev Container handoff

The desktop-only Dev Container target is local draft state rather than host-declared session configuration. Before the first request, the local provider starts or reuses the container Agent Host, trusts the mapped workspace only after the source folder passes trust, and replaces the local draft with an equivalent draft owned by the dynamic remote provider. Compatible configuration, model, and custom-agent selections transfer to the replacement.

## Registration

`LocalAgentHostContribution` registers the local provider only when the Agent Host runtime is available for the current environment. Agent discovery populates session types dynamically from host root state.

The contribution also registers the content and working-directory adapters needed by advertised session types. Runtime startup and shutdown rebind or dispose connection-scoped listeners; consumers must not assume registration means the backend has finished discovery.

## Automations

Agent Host providers expose Automations through the singleton `ahp-automations://catalog` catalogue when the negotiated host capabilities include `automations`. `AgentHostAutomationStore` projects that authoritative AHP state onto the Sessions automation model; it does not persist definitions or execute a fallback scheduler. `ReconnectableAgentHostAutomationStore` keeps that projection stable across local and remote connection changes and falls back to the legacy store only while the feature is disabled, the host lacks the capability, or migration has not completed.

Migration imports each legacy definition with canonical `automation/createRequested` actions and waits for authoritative `automation/set` state. Imported definitions identify their initial prompt with `MessageKind.Automation`, preserving automation provenance instead of representing host-triggered execution as a user message. Editor-qualified language-model identifiers are converted to provider-native `ModelSelection.id` values at the AHP boundary while VS Code projection metadata preserves the editor identifier. The host withholds the per-automation `run` operation and rejects execution until every expected resource is present and the durable completion marker is written. Import retries are idempotent and concurrent edits are reconciled before source removal. Failures before a verified item transfer leave its legacy authority intact; failures after transfer retain the durable host definition and archived history for retry. Historical legacy runs are copied to an atomic, read-only local archive before guarded ledger removal because AHP deliberately has no run-history import command.

After migration, the Agent Host owns manual execution, schedule evaluation, misfire handling, run/session linkage, cancellation, and lifecycle persistence. Run summaries carry host session resources; the provider projection converts them to the local or remote Sessions resource scheme before exposing them to history UI. The browser scheduler consults `isSchedulingOwnedByHost` for each Automation, and the browser runner treats a host-dispatched manual run as started without creating a duplicate session. Connection startup waits for capability negotiation instead of treating an initializing host as a migration failure. The existing `chat.automations.enabled` and `chat.automations.runTimeoutMinutes` settings are mirrored to host root config; disabling Automations removes the `run` operation and stops new schedule claims while leaving durable definitions and already-running sessions intact.

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
normalizes all data before canonical serialization and hashing.

The row has two different ownership contracts. Registry identity and provenance
(`session_uri`, provider, start time, external state, and registration source)
remain authoritative. The list payload is a derived, rebuildable aggregate:
central session/chat identity, provider state, and member-chat metadata can
reproduce its canonical bytes and hash. Ordinary session-list reads use this
stored aggregate rather than opening every member-chat database.

Peer-chat membership and routing data are authoritative in the central
`session_chat_catalogs` and `session_chats` tables. The default chat is implicit
in session identity; ordered peer rows retain their URI, provider backing,
origin, and inherited-turn identity. A chat database owns its conversation
content and chat-local metadata, including its durable provider backing and
title. Central chat rows and the list payload retain only the copies needed to
enumerate, route, and present the containing session.

During the downgrade-compatibility window, a revisioned participant mirrors
central peer membership into the legacy `peerChats` session-metadata value.
Current runtime reads remain central. A startup/restore importer may read that
legacy value to incorporate chats created by an older build; after import,
central membership wins and the compatibility mirror is regenerated. Failed
mirror writes do not roll back central authority and remain unacknowledged for
retry.

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
