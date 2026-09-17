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
- observable Agent Merge state for committed sessions;
- configuration mutation and completion APIs;
- optional local-draft Dev Container availability and selection.

Consumers use the extended type guard rather than matching provider IDs. Provider-neutral features continue to depend on `ISessionsProvider`.

## Dev Container handoff

The desktop-only Dev Container target is local draft state rather than host-declared session configuration. Before the first request, the local provider starts or reuses the container Agent Host, trusts the mapped workspace only after the source folder passes trust, and replaces the local draft with an equivalent draft owned by the dynamic remote provider. Compatible configuration, model, and custom-agent selections transfer to the replacement.

## Registration

`LocalAgentHostContribution` registers the local provider only when the Agent Host runtime is available for the current environment. Agent discovery populates session types dynamically from host root state.

The contribution also registers the content and working-directory adapters needed by advertised session types. Runtime startup and shutdown rebind or dispose connection-scoped listeners; consumers must not assume registration means the backend has finished discovery.

## Automations

The cross-provider ownership, routing, migration, persistence, and run-lifecycle contract is specified in [AUTOMATIONS.md](../../../AUTOMATIONS.md).

Within that contract, Agent Host providers expose the host's `ahp-automations://` channel when negotiated capabilities include Automations. `AgentHostAutomationStore` projects AHP state and maps host session resources into the local or remote Sessions resource scheme. `ReconnectableAgentHostAutomationStore` owns connection and compatibility transitions. After durable activation, the Agent Host owns execution and scheduling; this provider owns only adaptation and connection-specific identity.

Imported prompts retain Automation provenance through `MessageKind.Automation`. The projection converts editor-qualified model identifiers to provider-native `ModelSelection.id` values at the AHP boundary while preserving the editor identity exposed to Sessions. The provider also mirrors `chat.automations.enabled` and `chat.automations.runTimeoutMinutes` into host configuration; disabling Automations removes new run authority without deleting definitions or terminating sessions already running.

`AutomationDefinition.session` is authoritative for host-owned model, custom-agent, and provider configuration. The projection removes target-owned working directory, isolation, and branch values from the editor-facing template and restores them only at the AHP boundary. Unknown provider values remain opaque and survive same-target edits.

The browser fallback and host-owned executor both create sessions from this template. A draft restores it before the first `resolveSessionConfig` call and captures the provider-resolved state when saved. Initial values that are unavailable or policy-clamped remain saved preferences until the user explicitly changes them; the effective draft and every run still use current schema and managed-policy enforcement.

## Workflows

`AgentHostWorkflowRuntime` adapts the shared workflow runtime to the owning `IAgentConnection`. Workflow execution requires support from both the host's initialization metadata and the selected agent's `AgentInfo` metadata; root support alone is insufficient. Support is never inferred from a provider name or registration. The Agent Host owns run snapshots, proof validation, continuation, durable waits, and recovery; the provider maps identity and presentation and publishes client-owned rollout enablement.

The provider mirrors the workflow rollout and AI-disable settings to its owning connection only after that host advertises the root-config key. It republishes after reconnection and enqueues the current value before explicit start or continuation requests. Disabling pauses execution; re-enabling does not resume it. This transient mirror is neither a permission grant nor a substitute for runtime-managed settings. Inspection remains available while execution is disabled.

The shared extension-source projection uses normal extension enablement decisions. The adapter publishes complete source snapshots before enabling workflow execution, serializes later source changes, and rejects stale connection results. Absent extension IDs are unavailable, including packages removed while disconnected. Source publication failures disable new workflow execution and surface diagnostics; explicit start/resume must reconcile successfully. Pause and cancel never wait for source discovery. Source re-enablement does not resume paused runs.

Lightweight progress arrives with session metadata. Full records are read on demand and observed only while a workflow view holds a reference-counted watch. Reconnection waits for capability negotiation before refreshing those watches. Display resource URIs are mapped to the client, while canonical proof and validator output remain host-native.

An initial workflow uses `IAgentHostChatSession.prepareMessageContext` to reuse normal trust, authentication, model configuration, attachments, active-client setup, and server-initiated turn observation without creating a synthetic chat request. The provider submits that context with the immutable workflow snapshot and waits for durable acceptance. A first checkpoint that waits still commits the session without needing a model turn. Host-assigned turn IDs remain the chat request IDs used by checkpoint navigation.

Once a workflow start is issued, abandoning its composer draft must not delete potentially accepted host work. An unconfirmed response is not evidence that nothing started; durable host state must be inspected before retrying. This exception changes backend ownership, not normal permissions or the user's stopping point.

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

The first send waits for tracked draft configuration. Cancelling an unsubmitted draft disposes it; submitted workflow ownership follows the contract above. Later configuration changes are scoped to the committed session and do not recreate the entire facade.

Automation drafts use the same `NewSession` implementation but are tracked separately by the management service. Agent Host providers advertise Automation configuration support, restore the initial template before configuration resolution, and capture it asynchronously after pending resolution. Capture rechecks draft identity, omits transient, permission-grant, target-owned, and host-owned values, preserves untouched opaque preferences, and rejects superseded drafts.

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
