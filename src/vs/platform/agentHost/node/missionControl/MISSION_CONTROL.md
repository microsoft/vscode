# Mission Control environments

Mission Control exposes VS Code's existing native Agent Host utility process as a user-local environment over Azure Web PubSub. Local sessions continue using local IPC; remote clients use the same authoritative session state and protocol handler, not a separate daemon.

```text
Local VS Code ------ local IPC ------+
                                    +--- one native Agent Host and session state
Other clients ----- MC / WPS --------+
```

Registration is opt-in and default-off. The activation path is available to built desktop products as well as source builds; unsupported host variants do not acquire it merely because an AHP client requests a connection. The feature remains tagged experimental. [Readiness and remaining validation](./MISSION_CONTROL_PRODUCTION_GAPS.md) must not be confused with a guarantee about every release artifact or deployed client.

## Enable the real service

1. Sign in to GitHub in the owning VS Code window.
2. Set `chat.agentHost.remoteConnections` to `githubEnvironment` (the default is `devTunnel`).
3. Enable **Allow Remote Connections** in the Agents Window title bar or the local Agent Host chat toolbar. Selecting GitHub environment in settings does not register the environment.
4. Wait for `Mission Control ready; environmentId=...` in the Agent Host log.
5. Create/use native sessions normally. From another compatible MC client, discover the environment, connect, authenticate with a sealed credential, and use standard AHP session operations.

Registration uses `https://api.github.com`. An empty window can register the host without advertising a home-directory default. Disable **Allow Remote Connections** to withdraw remote access. The sharing choice is remembered locally across restarts, not synchronized to other machines. Changing the backend turns sharing off until explicitly enabled again. Withdrawal disconnects relay ingress immediately; it does not delete native sessions, conversations or checkouts.

Registration and heartbeat `capabilities.current_sessions` count durable session-registry identities, independently of sidebar filters and provider availability. Counting does not load provider metadata or session transcripts. Metadata reads have a 60-second budget; a failed or timed-out device remote-control policy read prevents registration unless the explicit local policy override below is enabled.

### Local integration testing

Backend tests supply `IMissionControlOptions` directly to `MissionControlEnvironment.configure`, with a loopback HTTP `baseUrl` and `live` omitted or false. Test credentials and injected HTTP/relay implementations keep registration and authentication tests independent of the real service.

The backend setting's experimental feature tag does not restrict availability to development builds.

## Environment identity, name and ownership

The registered name is `VS Code`, `VS Code Insiders`, or `VS Code OSS`; other product variants use their product short name. The same host-owned name is sent on registration and every heartbeat. This display label is not identity.

A random stable compute UUID is persisted in `agent-host-mission-control-id` under the user-data directory. It is not derived from hardware. The versioned record retains its canonical directory only locally, so a migrated profile copied to another directory receives a different identity without changing the original. Legacy plain UUIDs migrate in place; copies made before migration remain an explicit edge case. Restarting the same profile reuses its identity. Separate user-data directories intentionally represent separate hosts and may have identical display names.

The first accepted account owns the shared utility process until restart. Same-owner windows may refresh the credential and contribute canonical workspace roots, without rebinding the active registration's default directory. Foreign-account configuration/withdrawal is refused. Genuine withdrawal clears the active grants/default; a later same-owner registration establishes new ones. Identity-authority changes withdraw access rather than silently rebinding the host.

## Discover and connect

Enable `chat.remoteAgentHostsEnabled` and invoke **Connect to Mission Control Environment...** from the Command Palette or Agents Window workspace-management menu. The picker lists your account's existing user-local environments, shows cached results immediately, and refreshes in the background without clearing the search. It excludes the native host's own environment so the owning window stays on local IPC.

Selection revalidates availability. An offline user-local host is not woken or replaced; start its owning application before connecting. Discovery itself does not provision compute or create sessions. Connected user-local hosts use the generic native Sessions provider, not the managed-sandbox task/history/checkout adapter. The fuller retained-host/management UX is a separate increment.

New native allocations negotiate standard `ahp-session` resources with a separate provider. Existing legacy and standard session/chat resources, SDK backings, and storage remain immutable. The client consumes exact advertised resources; MC does not impose a global Copilot alias. See the [identity contract](../../../../sessions/contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md#identity).

### Web PubSub receive capabilities

VS Code clients publish the transport control `{"kind":"capabilities","accepts":["batch"]}` to the configured `to_host` group after joining their receive groups, and wait for its relay acknowledgement before initializing AHP. The socket/group-join timeout ends when the joins complete; capability publication then has its own 30-second acknowledgement deadline. They re-advertise after each successful AHP initialization or reconnect response, before delivering that response to the protocol client, so a replacement host lane can establish receive support. Rejected, timed-out, or unwritable capability publications fail the connection through normal relay error handling.

The declaration permits a supporting peer to send bounded, ordered transport batches toward VS Code; it does not enable client outbound batching or prove that the peer has processed the declaration. Individual messages and chunks remain supported. These controls are not AHP messages or JSON-RPC batches and are not emitted on direct WebSocket or local IPC connections.

### Model advertisements

Mission Control connections advertise model lists only for the native Copilot agent (`copilotcli`). Other agents remain advertised with their identities, capabilities and protected resources, but with empty model lists. This is an interoperability workaround for mobile clients that combine every agent's models into the picker for an existing Copilot session without switching that session's agent. Initial and subscribed root snapshots, reconnect snapshots/replay and live agent updates use the same projection; the host's authoritative catalog and local, SSH and tunnel connections remain unchanged.

Existing sessions for other agents remain accessible and retain their model selection. This limits model discovery, not which agents can execute work; it does not correct a credential-specific empty Copilot catalog.

## Security and data handling

The [security requirements matrix](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) links each requirement to implementation and tests. The supported boundary includes canonical-owner sealed authentication, signed control requests, lane/client-ID binding, passive mutation refusal, locally known workspace/resource grants, minimal pre-authentication state, and host-wide root-configuration exclusion. Remote windows cannot overwrite the owning machine's root settings or managed permissions.

Live relay identity expires at the deadline returned by GitHub in `GitHub-Authentication-Token-Expiration`, not a client-supplied timeout. Supported deadlines are calendar-valid UTC timestamps in GitHub's `YYYY-MM-DD HH:MM:SS UTC` format or ISO `YYYY-MM-DDTHH:MM:SS[.sss]Z` format with up to three fractional digits. Invalid or elapsed deadlines fail authentication; an absent header does not create a deadline. Expiry stops observation and new protected work, removes subscriptions, releases active-client/tool ownership not retained by another live connection's subscriptions, and sends one lane-targeted `auth/required` notification with `reason: expired`. The client must renew its credential and subscribe again. Awaited requests cannot return protected results under an expired or replaced credential. Work already started in a provider is not rolled back, and shared provider credential sponsorship/retention remains a separate limitation.

Remote owner access includes native sessions, tools, and granted workspace resources. Credentials are sealed before WPS publication using either NaCl sealed boxes or HPKE (X25519 / HKDF-SHA256 / AES-256-GCM). The host advertises independent keys for each algorithm and for each of the `auth-token` and `mcp-auth-token` purposes, allowing clients such as iOS to use HPKE while sealed-box clients remain compatible. Recipient keys come from authenticated MC HTTPS rather than being trusted solely because they appeared in the relay. Private sealing keys stay host-local. This does not provide per-client/session credential sponsorship, OS confinement, or conversation end-to-end encryption.

Clients must authenticate the relay identity after each initialization before requesting session access, independently of agent-provider authentication. Unauthenticated requests return `AuthRequired` with standard `data.resources` identifying the configured GitHub identity authority, including hosts without a Copilot provider. Owner-validated identity authentication succeeds even if no agent provider accepts that resource; credentials are still forwarded to providers, and other provider/MCP resources require provider acceptance.

Both algorithms use the same `copilot-sealed.v1` envelope and purpose/resource checks. MC registration/heartbeat keys and AHP root metadata identify the same recipients. Unknown or wrong-purpose key IDs return `CONFLICT` so clients can refresh trusted keys, repeat the handshake, and seal again; malformed, undecryptable, or context-mismatched values return `INVALID_PARAMS`. Private key bytes and owned plaintext buffers are scrubbed on disposal or after use. HPKE opening uses non-extractable WebCrypto private keys; their native storage is managed by the runtime and has no explicit zeroization API.

Native authoritative AHP actions and selected genuine SDK metadata are mirrored to MC for history and task title/activity. Approval/input metadata may contain commands, diffs, plans and questions. The SDK adapter excludes assistant/system messages, auth/configuration, subagents, per-token deltas and routine backing shutdown events; AHP mirroring still carries authoritative conversation content.

Registration accepts unbound sealed tokens for compatibility with deployed pre-sealed clients. Supplied bindings are verified; unbound envelopes remain replayable. Backend tests can require binding through `IMissionControlOptions.requireConnectionBinding`. Optional MCP resource context and the shared native provider credential store have the limitations described in the matrix. Do not infer stronger guarantees from successful transport authentication.

By default, the SDK's canonical device `remoteControl` branch is read before registration and forwarded to MC for enforcement. Failed initial reads do not register as unrestricted. The host does not introduce a second enterprise-policy parser or claim local enforcement of every predicate against a compromised MC signer.

### Explicit local remote-control policy override

The unregistered, default-off `chat.agentHost.experimentalMissionControl.ignoreRemoteControlPolicy` setting is a testing override available in built products. Set it to `true` in the host owner's **local User settings** to skip the device `remoteControl` policy read and omit that branch from Mission Control registration, allowing active connections despite device enterprise restrictions on creating sessions or sending messages. Application user settings also apply; workspace, workspace-folder, remote-user, and default values cannot enable it. The setting is absent from the Settings UI and schema.

```json
"chat.agentHost.experimentalMissionControl.ignoreRemoteControlPolicy": true
```

This bypasses the entire device `remoteControl` branch, not other runtime managed settings, tool permissions, authentication, or workspace grants. Mission Control can still issue signed passive connections, which remain read-only. Changing the setting closes existing relay lanes and reconfigures registration; reconnect the remote client afterward. Remove the setting or set it to `false` to restore device policy reporting and its failed-read gate.

### Explicit local credential delegation

The unregistered `chat.agentHost.experimentalMissionControl.useLocalCredentials` setting is a default-off testing override available in built products, including Insiders. Set it to `true` in the host owner's **local User settings** to authorize same-owner remote clients to use the desktop GitHub credential for the host's GitHub Copilot protected resource. Application user settings also apply; workspace, workspace-folder, remote-user, and default values cannot enable it. The setting is intentionally absent from the Settings UI and schema.

```json
"chat.agentHost.experimentalMissionControl.useLocalCredentials": true
```

Remote credentials are still required, decrypted, checked for purpose/resource and any supplied connection binding, and validated directly with GitHub against the registered owner. For the exact Copilot resource, the host also validates the current local credential and forwards it internally without the remote token's scopes or expiry. The local credential is never sent to the mobile client or published on the relay. Repository-specific and MCP credentials are not substituted. All providers sharing the Copilot protected resource can receive the local credential, and SDK agent work can use its broader GitHub permissions; this is not an inference-only grant.

Delegation does not extend the remote lane's identity deadline. The forwarded local credential uses its own GitHub-reported expiration, when present.

Changing this setting, rotating the local registration credential, signing out, or withdrawing registration closes the affected relay lanes. Reconnect the mobile client after changes. A missing, rejected, foreign-owner, or concurrently changed local credential fails authentication instead of borrowing a previous credential. Ongoing provider credential retention and per-session sponsorship remain subject to S03's shared-store limitations.

This explicit host-owner delegation is a VS Code testing exception to the user-local sponsorship and control-plane separation contract (S03/S05), not the normal client-token mode or a managed-sandbox principal. Existing enterprise remote-control checks, workspace grants, and tool permissions still apply. Remove the setting or set it to `false` to restore client credentials.

## Lifecycle and mirroring

The host uses proxy-aware bounded HTTP, a normal heartbeat cadence, and service-requested `Retry-After` waits. Recovery does not bypass those waits; disabling closes ingress even when its offline heartbeat must be delayed. WPS bootstrap/key refresh and relay keep-alive are independent of ordinary inbound traffic.

Host-wide diagnostic log channels are not advertised on Mission Control ingress. Diagnostic logs remain available locally; they do not share the relay's bounded publisher with session operations. This does not change provider-native OTel export.

A single ordered publisher and bounded reassembly/queue/lane limits preserve live protocol ordering. Replacement connections have distinct generations; stale predecessor frames/closures are fenced. Request-form compatibility for `dispatchAction` and `unsubscribe` shares the native notification path and does not make arbitrary notifications successful requests.

Clients can advertise receive support with `{ "kind": "capabilities", "accepts": ["batch"] }` on their configured per-client `to-host` group. The host accepts this framing control only from the registered WPS owner on an existing client lane; it is not an AHP request and does not authenticate session access. Support is scoped to that lane and resets on lane replacement or host relay recovery. Clients should advertise after joining their receive groups and re-advertise after each successful initialize/reconnect response. An updated `accepts` list replaces the previous list.

For supporting clients, the ordered publisher packs adjacent already-queued raw AHP messages with the same destination group and host generation into `{ "kind": "batch", "items": [...], "generation": ... }`, with at most 256 items and 900 KiB of serialized envelope bytes. It adds no batching delay. Single messages and oversized payloads retain the message/chunk framing, and closures and mirror events remain ordering barriers. Each published batch uses one WPS acknowledgement; queue limits still account for the original queued frames and bytes.

Independent AHP/SDK spools use durable ingest acknowledgements and bounded failure/truncation signals. Signed backfill replays retained AHP frames exactly. SDK sequence ranges are reserved durably before publication; native journal cursors advance only after durable SDK acknowledgement. AHP process-restart epochs/spool durability and complete pre-registration history remain deferred. Native titles are synchronized through the runtime naming API, not fabricated SDK events.

## Diagnostics and telemetry

Host registration, relay readiness/recovery, unexpected relay losses and failures are recorded locally in the **Agent Host** log (`agenthost.log`). Client connection milestones and failures use the window log (`renderer.log`). HTTP failures include status and, when available, a request ID and a bounded, credential-redacted server message. WPS rejections and acknowledgement timeouts are also logged. Routine successful heartbeats and individual frames are not logged.

Usage telemetry uses the existing telemetry service and consent:

- `agentHost.missionControlOperation` reports host configuration, registration, token/key refresh and relay outcomes, plus failed heartbeats/check-ins. `relayDisconnected` reports only unexpected loss of a ready relay, with its ready duration; explicit withdrawal and credential rotation are excluded. Operation failures at different boundaries may describe the same underlying failure and must not be summed as distinct outages.
- `missionControlConnectionAttempt` reports user-local connection success, failure, caller cancellation and timeout across inventory validation and relay establishment. This distinguishes the retained-host service's end-to-end deadline from the cancellation it sends to the shared relay service.
- `cloudSandboxConnectionOutcome`, `cloudSandboxFirstSessionRequest` and `cloudSandboxConnectionHealth` distinguish `environmentKind=user-local` from `cloud`. Outcomes cover logical connects and recovery, including failure and cancellation. Health aggregates ready connection time and unexpected disconnects separately for each kind, excluding initial retries and intentional teardown.
- `agentHost.clientConnection`, `agentHost.sessionCreated` and existing action/turn events identify user-local relay traffic with the bounded connection kind `mission_control`, alongside `ssh` and `dev_tunnel`. The host knows its relay route even when another conforming client omits VS Code metadata. Session creation is counted after successful AHP allocation, not discovery or restoration.

No server messages, response bodies, credentials, environment names or addresses are added to these telemetry events. Server error messages remain local. Host-wide logs are not exposed over Mission Control ingress.

## Implementation ownership

Source files live alongside these documents. [MissionControlHost](./missionControlHost.ts) is an entry-owned DI adapter for native services, handler lifetime and authoritative mirror wiring. [MissionControlEnvironment](./missionControlEnvironment.ts) owns registration/recovery through a named host-options contract; it has no second runtime service graph.

Registration and heartbeat request construction are separate methods. Local management IPC is distinct from AHP; host-management extension methods remain unavailable to relay clients. The same `ProtocolServerHandler` owns session operations on both local and relay transports.

## Validation boundaries

Tests cover built-product adapter construction without pre-opt-in traffic, product names, registration/heartbeat consistency, owner/lane/passive/resource guards, sealed vectors, stale generations, bounded mirrors and recovery. Current release artifact/network/client evidence and the explicitly agreed deferrals are listed in [remaining work](./MISSION_CONTROL_PRODUCTION_GAPS.md). Qualification of an earlier artifact is not evidence for a later revision.

(Written by Copilot)
