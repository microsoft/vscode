# Remote Agent Host sessions provider

> **Specification change gate:** Do not update this document for connection bug fixes, retries, telemetry, or transport algorithms. Update it only when connection ownership, routing identity, or provider lifecycle changes.

## Scope

`RemoteAgentHostSessionsProvider` specializes the shared Agent Host provider for one remote connection. A connection may advertise multiple agents and session types.

Shared Agent Host adaptation is specified in [AGENT_HOST_SESSIONS_PROVIDER.md](../agentHost/AGENT_HOST_SESSIONS_PROVIDER.md).

## Registration

`RemoteAgentHostContribution` observes `IRemoteAgentHostService` connections. It creates and registers one provider per connection and disposes the provider when that connection is removed.

Agent discovery is dynamic. Changes to a host's advertised agents update the provider's session types without recreating the provider.

## Identity

Remote sessions use separate logical and routing identities:

| Identity | Purpose |
|----------|---------|
| Provider ID | Identifies the remote connection's provider instance |
| `ISession.sessionType` | Logical type used by Sessions UI and capabilities |
| Session resource scheme | Routes content and operations to the exact host and agent |
| Model target/vendor | Routes language models to the exact host and agent |

Copilot agents may share a logical session type with local and cloud Copilot providers while retaining a connection-specific resource scheme. Other agents use a connection-specific logical type.

Never use the logical session type where host-specific routing is required. Resource schemes and provider IDs are created through the shared Agent Host identifier helpers rather than hand-built strings.

## Host groups

By default one provider is one entry in the host filter. A provider whose config carries `hostGroup` (`IAgentHostGroup`) instead declares itself a member of a larger user-facing host: every provider sharing a `hostGroup.id` folds into one `IAgentHostFilterEntry` whose `providerIds` covers all of them, and whose `status` is the most alive status among its members. Members keep their own connection, address and session-type authority.

Cloud sandboxes are the only group today. `CloudSandboxAgentHostContribution` registers one provider per sandbox environment and gives each the `githubsandbox` group (`order: 1`, `connectable: false`), so a user with many Mission Control tasks sees a single "GitHub Sandboxes" entry rather than one entry per task.

A group can also be **declared** independently of its members via `IAgentHostFilterService.registerHostGroup`. A declared group always has an entry — with an empty `providerIds` until members register — so the place stays visible and selectable before the user has anything in it. The sandbox contribution declares its group for as long as both `CloudSandboxEnabledSettingId` and `RemoteAgentHostsEnabledSettingId` are on, so enabling the feature surfaces "GitHub Sandboxes" immediately rather than only once discovery finds an environment. Selecting an entry whose `providerIds` is empty scopes the sessions list to nothing.

Grouping changes these behaviors:

- The host filter's default selection prefers the first **connectable** entry. A selection chosen by that fallback is provisional and is replaced when a connectable entry registers later; an explicit user selection is kept and is the only kind persisted. An empty declared group is therefore never the automatic selection.
- Non-connectable entries hide the connect/disconnect control, the "(disconnected)" menu suffix, and the mobile status dot, since their members connect when one of their sessions is opened.
- Grouped members are excluded from `Manage Remote Agent Hosts…`, and a grouped entry offers no "Select Folder…" in the workspace picker because it has no single machine to browse.
- The picker's re-discovery affordance keys off "no **connectable** host" rather than "no hosts", so a user whose only entry is a sandbox group can still re-run discovery to find their own machines.

## Connection ownership

The remote contribution owns:

- connect, disconnect, and reconnect policy;
- authentication and interactive connection prompts;
- remote filesystem browsing;
- transport diagnostics and connection status;
- connection-scoped listener disposal.

The provider exposes connection state through `IAgentHostSessionsProvider` and delegates protocol operations to the live connection. Disconnecting clears live state without manufacturing successful operation results.

## Session lifecycle

Drafts expose the shared untitled `ISession` contract and use remote workspace metadata. First send commits through the shared Agent Host lifecycle. Existing sessions use the shared adapter and cache.

Remote session and chat resources preserve connection-specific routing identity through creation, hydration, and replacement. Backend session identifiers are translated only inside the provider.

## Authentication and recovery

Authentication challenges, credential refresh, and transport retries remain connection policy. The request that encountered a challenge observes its actual success, cancellation, or failure; provider operations do not silently convert authentication failures into availability results.

Concurrent prompts use the shared setup operation where credentials are shared. Connection-specific recovery state remains isolated per remote host.

## Preferred run location

The remote Agent Host services may remember a user's preferred run location. The owning location-preference service defines its persistence key and selection policy. Providers consume the resolved location; they do not duplicate preference state in session metadata.

Transport-specific fallback and retry algorithms belong in the owning SSH, tunnel, or remote-host service and its tests.

## Testing

Focused tests live beside the remote provider and remote-host services. Tests own connection races, authentication paths, routing identifiers, fallback, and regressions.

## Dev Container connections

`DevContainerAgentHostService` provides the desktop-only connection boundary for an Agent Host running inside a Dev Container. VS Code bundles `@devcontainers/cli` and runs that pinned version through its Electron-as-Node runtime; Docker and related tools are still resolved from the user's shell environment. The desktop connector runs `devcontainer up` for the selected local workspace, installs the matching VS Code remote CLI inside the container, and reuses or launches a dedicated standalone Agent Host. A shared-process relay carries the Agent Host WebSocket protocol over `devcontainer exec` standard input/output.

The service registers the connected client as a runtime-only `DevContainer` managed remote connection and creates a `RemoteAgentHostSessionsProvider` around it. The shared remote Agent Host contribution observes the managed connection and supplies connection-level filesystem, model, terminal, and log integration. Dev Container CLI output is streamed into one stable `Dev Container (<workspace>)` Output channel per source workspace, which is reused across connection attempts.

## Change policy

Update this specification only when connection/provider ownership, routing identity, or the shared Agent Host lifecycle boundary changes. Do not append transport algorithms, telemetry schemas, retry narratives, or incident history.
