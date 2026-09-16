# RemoteAgent connectivity mini-roadmap

Tracking issue: [#336199](https://github.com/microsoft/vscode/issues/336199)

Owner: Person 1

Related documents:

- [Two-person work split](./REMOTE_AGENT_WORK_SPLIT.md)
- [Full RemoteAgent roadmap](./REMOTE_AGENT_ROADMAP.md)

## Deliverable

Provide Person 2 with an authenticated, initialized, lifetime-owned AHP
connection for every admitted tunnel target.

Person 2 must be able to build `RemoteAgent`, session mapping, and client tools
without importing tunnel SDK types, credential storage, discovery state,
renderer services, or transport-specific code.

## Locked decisions

### Controls

- Use two distinct Agent Host runtime settings under a remote-agents namespace:
  `remoteAgents.enabled` as the master switch and
  `remoteAgents.tunnelDiscovery.enabled` as the tunnel-discovery switch.
- Persist both settings per Agent Host. Their defaults are off until configured.
- Connected clients present and edit the settings through AHP's existing
  client-dispatchable root configuration.
- Use the runtime managed setting `remoteAgents.enabled` to gate the persisted
  master setting. The host remains disabled until a connected client supplies
  its managed-policy snapshot, and any connected client's managed `false`
  forces the feature off. Tunnel discovery inherits the effective master state.
- Activate the feature from one shared path used by both the normal Agent Host
  process and the standalone server.

### Authentication

- Use existing AHP `auth/required` and `authenticate` messages. Do not add a
  second authentication protocol.
- VS Code clients additionally receive an internal, credential-free snapshot of
  all active host-feature requirements so removals, including an empty list,
  synchronize across connected clients without changing the AHP auth flow.
- Add a small internal host-feature auth registry because tunnel discovery needs
  to advertise and consume auth before any remote `IAgent` exists.
- Advertise separate protected-resource identifiers for GitHub and Microsoft so
  the resource unambiguously identifies the tunnel authentication issuer.
- Re-emit the optional auth requirement to each newly initialized or reconnected
  client while tunnel discovery needs credentials.
- Support one active issuer/account at a time for the MVP.
- A new token for the active issuer replaces the previous token and reconciles
  discovery. Do not add account-identity lookup plumbing in the MVP.
- Reject a credential for the other issuer until the active credential is
  revoked, expires, or the feature is disabled.
- Keep the accepted credential only in memory. It may outlive the client
  connection that supplied it, but never an Agent Host restart or token expiry.
- Expiry or revocation immediately closes dependent outbound connections and
  returns discovery to a needs-auth state.
- Keep internal credential and target keys account-aware so later multi-account
  support does not require changing `RemoteAgent`.

The host-owned credential lifetime is an intentional MVP choice even though AHP
authentication is normally per connection. Keep it explicit and isolated in the
feature-auth registry rather than silently sharing the general provider token
cache.

### Discovery and target identity

- Follow the current VS Code tunnel-client model rather than adding a separate
  allowlist.
- Enumerate account-associated tunnels carrying the `vscode-server-launcher`
  label and a supported protocol version, with connect-scoped access.
- Cache every non-dismissed eligible result and auto-connect when both effective
  runtime settings allow it.
- Preserve current dismissal and auto-connect-suppression behavior.
- Pass the Agent Host's own hosted tunnel identity into bootstrap and suppress
  it before connection, preventing self-connections.
- Refresh on startup, auth changes, relevant setting changes, and an explicit
  client request. Do not add a background polling timer.
- Add a generic AHP root refresh/discovery command for the explicit request.
- If a successful refresh no longer returns a tunnel, remove its target,
  providers, and local catalog entries immediately, matching the current client.
- Fixed WebSocket endpoints are test/developer scaffolding only. Tunnels are the
  first user-facing target source.

The stable target identity is the tunnel, not a concrete gateway endpoint. Store
the user's `editor` or `dedicated` preference per tunnel, matching the current
client. A reconnect may select a different concrete endpoint while retaining the
same tunnel identity.

For compatibility with the current client, expose a tunnel target as
`tunnel:<tunnelId>`. Use a separate account-aware internal key for ownership and
deduplication so future multi-account support does not change the external
target identity.

### Gateway selection and connection

- When a protocol-v6 tunnel needs an `editor` versus `dedicated` decision, ask
  the connected client to show the same choice as VS Code and persist the
  preference.
- First determine whether existing AHP interaction machinery can represent this
  pre-session choice. If not, add the smallest typed root-level interaction
  rather than silently choosing a different location.
- Match current client behavior and allow background auto-connect to create a
  dedicated Agent Host when the gateway selection rules call for one.
- Persist a random outbound AHP client ID per tunnel target across Agent Host
  restarts. Never share one client ID across all downstream hosts.
- Reuse the existing reconnect/replay implementation. Do not create a second AHP
  protocol stack.

### Connection handoff

- Publish one stable target handle as soon as a target is admitted.
- Person 1's connectivity service owns the handle, protocol client, transport,
  reconnect behavior, and disposal. Person 2 only borrows the handle.
- Keep the handle stable across reconnects and atomically replace its current
  `IAgentConnection` after a newly created client initializes.
- Leave the current connection empty until initialization and the authoritative
  root provider/model catalog are ready. Person 2 registers providers only from
  that initialized catalog.
- Retain the handle and its providers as unavailable during transient
  disconnects and reconnects. Operations attempted without a current connection
  fail immediately with a typed unavailable error; Person 2 does not retry.
- Dispose the handle when the target is authoritatively removed, explicitly
  removed, or the master feature is disabled. Disposal withdraws providers and
  connectivity but does not delete or cancel local or downstream sessions.
- Do not expose `AgentHostProtocolClientCore`, transport types, tunnel SDK
  objects, credentials, gateway addresses, or discovery internals through the
  handoff.

## Pull request sequence

Each change should remain independently reviewable and testable.

Current prototype status:

- [x] PR 1: headless AHP client core.
- [x] PR 2: runtime controls and shared activation.
- [x] PR 3: target contribution boundary and complete Person 2 handoff (pending
  review).
- [x] PR 4: host-feature authentication.
- [x] PR 5: headless tunnel discovery, authoritative refresh, and target
  admission. The service exposes the explicit-refresh seam for the separately
  owned root-command wiring.
- [x] PR 6 (headless connection scope): deterministic background gateway
  selection and relay reconnect. Interactive client selection remains with the
  client interaction work.

Person 2 can consume
[`IAgentHostRemoteTargetHandle`](./common/agentHostRemoteAgents.ts) and the
reusable test connector without depending directly on
`AgentHostProtocolClientCore`. The handoff is implemented locally and becomes
available on the shared branch after review and push.

### PR 1: Extract the headless AHP client core - complete

Move transport-neutral initialization, request/response correlation,
subscriptions, action delivery, capabilities, and reconnect bookkeeping out of
the browser-owned client.

Keep browser/workbench configuration, trust, UI, and resource integration in a
thin adapter.

**Done when:**

- Existing `AgentHostProtocolClient` behavior and tests remain unchanged.
- A Node test can construct the core with a test transport and initialize
  against a scripted server.
- The core has no browser, workbench, sessions, or tunnel dependencies.

### PR 2: Add runtime controls and shared activation

Define the two persisted root-config values and the managed master override.
Add a feature-lifecycle owner with cancellation or generation fencing, then
activate it from the shared Agent Host contribution path.

**Done when:**

- Both Agent Host entry points use the same activation code.
- Effective master-off prevents all outbound discovery, connection, reconnect,
  and remote-session side effects.
- Live disable closes A-owned transports and ignores stale async completions
  without affecting inbound AHP or local providers.
- Re-enable starts from persisted settings without duplicating work.

### PR 3: Add the target contribution boundary

Adapt the existing target-entry and connection-factory pattern into a headless,
lifetime-owned contribution boundary. Keep target validation and connection
bootstrap in the contribution; keep AHP initialization in the shared client.

Provide two fake contribution kinds plus a test-only fixed WebSocket target.

**Done when:**

- A new target kind can be registered and disposed without editing the
  connection core or `RemoteAgent`.
- Target and connector IDs are stable and labels are never used as identities.
- Each target owns a persisted random AHP client ID.
- Late discovery/connection results cannot resurrect a disposed target.
- A Node caller can read the root provider/model catalog from a scripted host.

**Handoff checkpoint:** Person 2 receives the connection interface and fake
implementation here.

### PR 4: Add host-feature authentication - complete

Back the existing AHP auth flow with the internal host-feature resource registry.
Register issuer-specific optional tunnel resources only while the effective
feature state needs them.

**Done when:**

- A client can satisfy the GitHub or Microsoft tunnel resource through normal
  `authenticate`.
- The host rejects unknown resources, wrong-issuer credentials, and a concurrent
  second issuer.
- Same-issuer token replacement reconciles discovery.
- New and reconnected clients receive the active optional requirement.
- Credential expiry, revocation, and feature disable close dependent transports.
- Tokens never enter logs, target descriptors, provider data, prompts, or tool
  results.

### PR 5: Add tunnel discovery and explicit refresh

Reuse current tunnel scope resolution, management-client enumeration, labels,
protocol filtering, dismissal, suppression, and self-host avoidance.

Add the generic root refresh/discovery command to AHP and route the client
"Re-discover hosts" action through it.

**Done when:**

- Startup/auth/settings/explicit refresh produce the same eligible tunnel set as
  the current client.
- There is no periodic polling.
- Discovery without a credential reports needs-auth rather than an empty
  successful catalog.
- All eligible non-dismissed targets auto-connect when enabled.
- A missing tunnel is removed immediately with its providers/catalog entries.
- The Agent Host never connects to its own hosted tunnel.

**Prototype status:** complete for the headless connector and lifecycle. Tunnel
enumeration is connect-scoped and authoritative only on success; cached targets,
dismissals, suppressions, auth loss, and self-host exclusion are reconciled
without polling. `AgentHostRemoteAgentsService.refreshTunnelDiscovery()` is the
service seam consumed by the separately owned AHP root refresh command.

### PR 6: Add gateway selection and resilient tunnel transport

Move or reuse the current gateway-selection logic so the headless host retains
tunnel identity while selecting an editor or dedicated endpoint.

Provide the client-side picker bridge, persisted location preference, background
dedicated-host creation, relay transport, and existing reconnect policy.

**Done when:**

- A saved preference reconnects without prompting.
- A missing preference with a live editor asks the connected client and persists
  the answer.
- Background selection may create a dedicated host exactly where the current
  client does.
- Transport reconnect uses the target's stable client ID and does not duplicate
  subscriptions or requests.
- Auth loss and master disable terminate reconnect attempts immediately.

**Prototype status:** complete for automatic headless connections. The
connector reuses the protocol-neutral gateway selection helpers and the shared
reconnecting relay transport while retaining the tunnel target handle and AHP
client identity. Interactive editor/dedicated prompting remains in the client
interaction work.

### Integration checkpoint with Person 2

Connect this real tunnel-backed implementation to Person 2's `RemoteAgent`.

**Done when:**

- A two-host chat works first over the test endpoint and then over a tunnel.
- Swapping transports does not change `RemoteAgent`.
- Provider identities remain distinct when multiple hosts advertise the same
  provider ID.
- Disconnect, target removal, and reconnect surface honest availability.

## Connection interface promised to Person 2

The exact names remain an implementation detail, but the boundary provides:

```text
target:
  stable connector ID
  stable target ID
  display metadata

connection:
  stable persisted AHP client ID
  initialized capabilities
  root/provider catalog subscription
  request, subscription, action, and notification APIs
  connecting/connected/reconnecting/closed state
  explicit disposal
```

Transport replay is owned here. Durable session creation and client-tool
deduplication remain Person 2's responsibility.

## Focused test matrix

- Both controls off/on in every combination.
- Managed master-off overrides user configuration.
- Runtime disable during discovery, auth, connection, and reconnect.
- Stale async completions after disable or contributor disposal.
- Settings persistence across Agent Host restart.
- Test-only fixed endpoint initialization and version/auth failure.
- Stable per-target client identity across restart.
- GitHub and Microsoft resource routing.
- Same-issuer refresh, conflicting issuer rejection, expiry, and revocation.
- Auth requirement delivery to late and reconnecting clients.
- Discovery filters, dismissal, suppression, self-host exclusion, and removal.
- No polling outside the approved triggers.
- Client-driven refresh.
- Editor/dedicated selection and persisted preference.
- Background dedicated-host creation.
- Relay reconnect without duplicate protocol delivery.

## Explicitly deferred

- Multiple simultaneous tunnel accounts.
- User-configurable arbitrary WebSocket targets.
- SSH and Dev Container target implementations.
- Public extension/plugin loading.
- `RemoteAgent`, session mapping, and client tools owned by Person 2.
- Workspace execution-location semantics owned by the later joint milestone.
