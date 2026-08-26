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
