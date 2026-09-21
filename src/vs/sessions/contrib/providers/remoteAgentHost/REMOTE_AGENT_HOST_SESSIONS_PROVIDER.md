# Remote Agent Host sessions provider

> **Specification change gate:** Do not update this document for connection bug fixes, retries, telemetry, or transport algorithms. Update it only when connection ownership, routing identity, or provider lifecycle changes.

## Scope

`RemoteAgentHostSessionsProvider` specializes the shared Agent Host provider for one remote connection. A connection may advertise multiple agents and session types.

Shared Agent Host adaptation is specified in [AGENT_HOST_SESSIONS_PROVIDER.md](../agentHost/AGENT_HOST_SESSIONS_PROVIDER.md).

## Registration

Kind-specific contributions create and register one provider for each remote host they own, disposing it when that host is removed. `RemoteAgentHostContribution` observes connections for shared filesystem, agent-discovery, model, terminal, and authentication wiring.

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

The remote Agent Host service owns protocol connection construction, handshake classification, status, retry, and disposal.

`RemoteAgentHostContribution` owns the workbench integration for a live connection: remote filesystem browsing, agent and model discovery, terminals, authentication, and connection-scoped listener disposal.

Transport-specific callers own discovery, on-demand staging, credentials, and connection leases. They stage
their context by address, request an explicit reconnect, and wait for the service to report the connection.

The provider exposes connection state through `IAgentHostSessionsProvider` and delegates protocol operations to the live connection. Disconnecting clears live state without manufacturing successful operation results.

Providers may expose `showConnectionLog` for the connection recovery surface. The provider owns log routing, so restored Dev Container providers can open their source workspace's output channel before a live connection exists.

On web, an intentional tunnel disconnect keeps the host cached and selectable while suppressing automatic reconnect. Reconnecting explicitly clears that suppression. Picker dismissal remains a separate persistent Hide operation and must have an explicit Restore path.

## Session lifecycle

Drafts expose the shared untitled `ISession` contract and use remote workspace metadata. First send commits through the shared Agent Host lifecycle. Existing sessions use the shared adapter and cache.

Remote session and chat resources preserve connection-specific routing identity through creation, hydration, and replacement. Backend session identifiers are translated only inside the provider.

## Authentication and recovery

Authentication challenges, credential refresh, and transport retries remain connection policy. The request that encountered a challenge observes its actual success, cancellation, or failure; provider operations do not silently convert authentication failures into availability results.

Concurrent prompts use the shared setup operation where credentials are shared. Connection-specific recovery state remains isolated per remote host.

## Preferred run location

The remote Agent Host services may remember a user's preferred run location. The owning location-preference service defines its persistence key and selection policy. Providers consume the resolved location; they do not duplicate preference state in session metadata.

Transport-specific fallback and retry algorithms belong in the owning SSH, tunnel, or remote-host service and its tests.
Tunnel discovery persists picker dismissals independently from auto-connect suppression; only an explicit user connection clears a dismissal.

## Connection information

The remote-host contribution owns the web connection-information UI. Host summaries and their connection controls use live state; expanded diagnostic details and exports use the captured snapshot. Hidden-host recovery clears dismissal and reruns discovery without promising a connection; it does not clear system-imposed auto-connect suppression. Explicit removal remains in host management. Actions read current provider, picker, connection, and tunnel-visibility state again when invoked. The service builds a client-local diagnostics snapshot of discovery results, cached and configured hosts, picker visibility, and observed connection activity. It presents recorded facts rather than inferred root causes or recovery recommendations. Background and interactive enumeration use the same diagnostics wrapper, which preserves the operation's result or rejection. Discovery records include hosts excluded from the picker, so diagnostics remain useful when no selectable host exists. The service reads dismissal and auto-connect suppression through the tunnel service rather than accessing its storage keys.

Showing, copying, or downloading diagnostics does not probe a remote, re-run discovery, or change connection policy. Refresh explicitly re-runs registered host discovery before capturing a new local snapshot. The displayed snapshot, copied text, and downloaded text file represent the same evidence, including the client information collapsed at the end of the report. Downloads are user-initiated and do not upload anything; host names, addresses, and messages should be reviewed before sharing. Activity is bounded to the current window lifetime; missing earlier history or a completion event must not be presented as proof that an attempt never occurred or is still running.

The remote connection service owns a bounded in-memory history of factory setup and protocol lifecycle events, including attempts before a connection entry exists. Transport factories and protocol clients report stages at their owning boundaries without changing results, errors, authentication, or retry policy. Diagnostics capture combines that history with discovery stages and a bounded, redacted excerpt of the current local Window log; log collection failures appear in the snapshot. Copy and Download reuse captured evidence without collecting new logs. These records are client observations, not remote logs or telemetry.

## Testing

Focused tests live beside the remote provider and remote-host services. Tests own connection races, authentication paths, routing identifiers, fallback, and regressions.

## Dev Container connections

`DevContainerAgentHostService` provides the desktop connection boundary for an Agent Host running inside a Dev Container. Source workspaces may be local files or belong to an SSH, Tunnel, or WSL host. The source URI, including its remote authority, owns the container connection identity, so identical paths on different hosts or WSL distributions remain distinct.

VS Code bundles `@devcontainers/cli`; the workspace's host runs that pinned version, resolves Docker and related tools from its own environment, and owns the CLI processes and relays. For local workspaces this runs in the desktop shared process. For SSH, Tunnel, and WSL workspaces it runs in the connected source Agent Host through a capability-gated VS Code protocol extension. Older hosts do not offer container execution. WSL sources require Docker inside the selected distribution, for example through Docker Desktop's WSL integration. The connector runs `devcontainer up`, installs the matching VS Code remote CLI inside the container, and reuses or launches a dedicated standalone Agent Host. Its WebSocket protocol is relayed over `devcontainer exec` standard input/output and, for remote workspaces, over the existing source-host connection.

Container entries retain the source host's VS Code authority and native workspace path. Open in VS Code encodes SSH and Tunnel sources with a parent authority; WSL sources instead encode the distribution and path as a Windows WSL UNC host path, as required by the Dev Containers extension. Container execution and detached-worktree operations continue to use the source distribution's Linux paths.

The service persists the source-workspace identity once the connected provider publishes a session and keeps that `RemoteAgentHostSessionsProvider` registered independently of its live transport. On startup it reconstructs providers for persisted workspaces so their cached sessions remain visible; opening one of those sessions, using the provider's connect action, or another operation that requires the remote host starts the Dev Container and restores the transport on demand. The connection factory's `DevContainer` entry remains runtime-only because it carries the live connector and transport state. The shared remote Agent Host contribution observes connected transports and supplies connection-level filesystem, model, terminal, and log integration. Dev Container CLI output is streamed into one stable `Dev Container (<workspace>)` Output channel per source workspace, which is reused across connection attempts.

When both worktree isolation and Dev Container execution are selected, the source Agent Host creates the worktree before the container starts. The connector opens the Dev Container on that host worktree, and the container-backed session uses folder isolation so it does not create a second worktree inside the container. The container session stores only an opaque worktree handle in its metadata; authoritative host paths stay in the source host's detached-worktree record. Archive, unarchive, delete, and reconciliation resolve that handle through the source Agent Host, reconnecting it on demand for remote sources. Cleanup and recreation match ordinary worktree sessions without retaining a hidden source session; cleanup removes only clean worktrees and preserves dirty work.

## Change policy

Update this specification only when connection/provider ownership, routing identity, or the shared Agent Host lifecycle boundary changes. Do not append transport algorithms, telemetry schemas, retry narratives, or incident history.
