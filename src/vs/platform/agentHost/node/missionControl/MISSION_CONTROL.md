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
2. Enable `chat.agentHost.experimentalMissionControl.enabled`.
3. Wait for `Mission Control ready; environmentId=...` in the Agent Host log.
4. Create/use native sessions normally. From another compatible MC client, discover the environment, connect, authenticate with a sealed credential, and use standard AHP session operations.

Registration uses `https://api.github.com`. An empty window can register the host without advertising a home-directory default. Disable the registration setting to withdraw remote access. Withdrawal disconnects relay ingress immediately; it does not delete native sessions, conversations or checkouts.

### Local integration testing

Backend tests supply `IMissionControlOptions` directly to `MissionControlEnvironment.configure`, with a loopback HTTP `baseUrl` and `live` omitted or false. Test credentials and injected HTTP/relay implementations keep registration and authentication tests independent of the real service.

The registration setting's experimental name and feature tags do not restrict availability to development builds.

## Environment identity, name and ownership

The registered name is `VS Code`, `VS Code Insiders`, or `VS Code OSS`; other product variants use their product short name. The same host-owned name is sent on registration and every heartbeat. This display label is not identity.

A random stable compute UUID is persisted in `agent-host-mission-control-id` under the user-data directory. It is not derived from hardware. The versioned record retains its canonical directory only locally, so a migrated profile copied to another directory receives a different identity without changing the original. Legacy plain UUIDs migrate in place; copies made before migration remain an explicit edge case. Restarting the same profile reuses its identity. Separate user-data directories intentionally represent separate hosts and may have identical display names.

The first accepted account owns the shared utility process until restart. Same-owner windows may refresh the credential and contribute canonical workspace roots, without rebinding the active registration's default directory. Foreign-account configuration/withdrawal is refused. Genuine withdrawal clears the active grants/default; a later same-owner registration establishes new ones. Identity-authority changes withdraw access rather than silently rebinding the host.

## Discover and connect

Enable `chat.remoteAgentHostsEnabled` and invoke **Connect to Mission Control Environment...** from the Command Palette or Agents Window workspace-management menu. The picker lists your account's existing user-local environments, shows cached results immediately, and refreshes in the background without clearing the search. It excludes the native host's own environment so the owning window stays on local IPC.

Selection revalidates availability. An offline user-local host is not woken or replaced; start its owning application before connecting. Discovery itself does not provision compute or create sessions. Connected user-local hosts use the generic native Sessions provider, not the managed-sandbox task/history/checkout adapter. The fuller retained-host/management UX is a separate increment.

New native allocations negotiate standard `ahp-session` resources with a separate provider. Existing legacy and standard session/chat resources, SDK backings, and storage remain immutable. The client consumes exact advertised resources; MC does not impose a global Copilot alias. See the [identity contract](../../../../sessions/contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md#identity).

## Security and data handling

The [security requirements matrix](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) links each requirement to implementation and tests. The supported boundary includes canonical-owner sealed authentication, signed control requests, lane/client-ID binding, passive mutation refusal, locally known workspace/resource grants, minimal pre-authentication state, and host-wide root-configuration exclusion. Remote windows cannot overwrite the owning machine's root settings or managed permissions.

Remote owner access includes native sessions, tools, and granted workspace resources. Credentials are sealed before WPS publication using either NaCl sealed boxes or HPKE (X25519 / HKDF-SHA256 / AES-256-GCM). The host advertises independent keys for each algorithm and for each of the `auth-token` and `mcp-auth-token` purposes, allowing clients such as iOS to use HPKE while sealed-box clients remain compatible. Recipient keys come from authenticated MC HTTPS rather than being trusted solely because they appeared in the relay. Private sealing keys stay host-local. This does not provide per-client/session credential sponsorship, OS confinement, or conversation end-to-end encryption.

Both algorithms use the same `copilot-sealed.v1` envelope and purpose/resource checks. MC registration/heartbeat keys and AHP root metadata identify the same recipients. Unknown or wrong-purpose key IDs return `CONFLICT` so clients can refresh trusted keys, repeat the handshake, and seal again; malformed, undecryptable, or context-mismatched values return `INVALID_PARAMS`. Private key bytes and owned plaintext buffers are scrubbed on disposal or after use. HPKE opening uses non-extractable WebCrypto private keys; their native storage is managed by the runtime and has no explicit zeroization API.

Native authoritative AHP actions and selected genuine SDK metadata are mirrored to MC for history and task title/activity. Approval/input metadata may contain commands, diffs, plans and questions. The SDK adapter excludes assistant/system messages, auth/configuration, subagents, per-token deltas and routine backing shutdown events; AHP mirroring still carries authoritative conversation content.

Registration accepts unbound sealed tokens for compatibility with deployed pre-sealed clients. Supplied bindings are verified; unbound envelopes remain replayable. Backend tests can require binding through `IMissionControlOptions.requireConnectionBinding`. Optional MCP resource context and the shared native provider credential store have the limitations described in the matrix. Do not infer stronger guarantees from successful transport authentication.

The SDK's canonical device `remoteControl` branch is read before registration and forwarded to MC for enforcement. Failed initial reads do not register as unrestricted. The host does not introduce a second enterprise-policy parser or claim local enforcement of every predicate against a compromised MC signer.

## Lifecycle and mirroring

The host uses proxy-aware bounded HTTP, a normal heartbeat cadence, and service-requested `Retry-After` waits. Recovery does not bypass those waits; disabling closes ingress even when its offline heartbeat must be delayed. WPS bootstrap/key refresh and relay keep-alive are independent of ordinary inbound traffic.

Host-wide diagnostic log channels are not advertised on Mission Control ingress. Diagnostic logs remain available locally; they do not share the relay's bounded publisher with session operations. This does not change provider-native OTel export.

A single ordered publisher and bounded reassembly/queue/lane limits preserve live protocol ordering. Replacement connections have distinct generations; stale predecessor frames/closures are fenced. Request-form compatibility for `dispatchAction` and `unsubscribe` shares the native notification path and does not make arbitrary notifications successful requests.

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
