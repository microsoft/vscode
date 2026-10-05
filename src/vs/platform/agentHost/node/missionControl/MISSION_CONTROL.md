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
2. Leave `chat.agentHost.experimentalMissionControlFakeEndpoint` empty.
3. Enable `chat.agentHost.experimentalMissionControl.enabled`.
4. Keep the default `chat.agentHost.experimentalMissionControl.endpoint` (`https://api.github.com`) unless an explicitly trusted environment requires a different HTTPS API origin. The local registration credential is sent to this origin; redirects and credential-bearing/unsafe origin shapes are refused.
5. Wait for `Mission Control ready; environmentId=...` in the Agent Host log.
6. Create/use native sessions normally. From another compatible MC client, discover the environment, connect, authenticate with a sealed credential, and use standard AHP session operations.

An empty window can register the host without advertising a home-directory default. Disable the registration setting to withdraw remote access. Withdrawal disconnects relay ingress immediately; it does not delete native sessions, conversations or checkouts.

### The local test-endpoint setting

`chat.agentHost.experimentalMissionControlFakeEndpoint` selects a **loopback HTTP integration-test server**, not Azure or a production MC server. It is retained for deterministic registration/relay tests. The local GitHub credential is sent to that endpoint, so use only a test server you trust. It must be empty for real-service registration; enabling real MC while it is set is refused. Ordinary users do not need to configure it.

The existing setting keys are retained so current opt-in continues working. Classes and local management methods use ordinary Mission Control names; the setting keys and experimental feature tags are not a second runtime or a build restriction.

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

Remote owner access includes native sessions, tools, and granted workspace resources. Credentials are purpose-separated sealed-box values before WPS publication; recipient keys come from authenticated MC HTTPS rather than being trusted solely because they appeared in the relay. Private sealing keys stay host-local. This does not provide per-client/session credential sponsorship, OS confinement, or conversation end-to-end encryption.

Native authoritative AHP actions and selected genuine SDK metadata are mirrored to MC for history and task title/activity. Approval/input metadata may contain commands, diffs, plans and questions. The SDK adapter excludes assistant/system messages, auth/configuration, subagents, per-token deltas and routine backing shutdown events; AHP mirroring still carries authoritative conversation content.

`chat.agentHost.experimentalMissionControl.requireConnectionBinding` defaults to false for compatibility with deployed pre-sealed tokens. Supplied bindings are verified; unbound envelopes remain replayable. Optional MCP resource context and the shared native provider credential store have the limitations described in the matrix. Do not infer stronger guarantees from successful transport authentication.

The SDK's canonical device `remoteControl` branch is read before registration and forwarded to MC for enforcement. Failed initial reads do not register as unrestricted. The host does not introduce a second enterprise-policy parser or claim local enforcement of every predicate against a compromised MC signer.

## Lifecycle and mirroring

The host uses proxy-aware bounded HTTP, a normal heartbeat cadence, and service-requested `Retry-After` waits. Recovery does not bypass those waits; disabling closes ingress even when its offline heartbeat must be delayed. WPS bootstrap/key refresh and relay keep-alive are independent of ordinary inbound traffic.

Host-wide diagnostic log channels are not advertised on Mission Control ingress. Diagnostic logs remain available locally; they do not share the relay's bounded publisher with session operations. This does not change provider-native OTel export.

A single ordered publisher and bounded reassembly/queue/lane limits preserve live protocol ordering. Replacement connections have distinct generations; stale predecessor frames/closures are fenced. Request-form compatibility for `dispatchAction` and `unsubscribe` shares the native notification path and does not make arbitrary notifications successful requests.

Independent AHP/SDK spools use durable ingest acknowledgements and bounded failure/truncation signals. Signed backfill replays retained AHP frames exactly. SDK sequence ranges are reserved durably before publication; native journal cursors advance only after durable SDK acknowledgement. AHP process-restart epochs/spool durability and complete pre-registration history remain deferred. Native titles are synchronized through the runtime naming API, not fabricated SDK events.

## Implementation ownership

Source files live alongside these documents. [MissionControlHost](./missionControlHost.ts) is an entry-owned DI adapter for native services, handler lifetime and authoritative mirror wiring. [MissionControlEnvironment](./missionControlEnvironment.ts) owns registration/recovery through a named host-options contract; it has no second runtime service graph.

Registration and heartbeat request construction are separate methods. Local management IPC is distinct from AHP; host-management extension methods remain unavailable to relay clients. The same `ProtocolServerHandler` owns session operations on both local and relay transports.

## Validation boundaries

Tests cover built-product adapter construction without pre-opt-in traffic, product names, registration/heartbeat consistency, owner/lane/passive/resource guards, sealed vectors, stale generations, bounded mirrors and recovery. Current release artifact/network/client evidence and the explicitly agreed deferrals are listed in [remaining work](./MISSION_CONTROL_PRODUCTION_GAPS.md). Qualification of an earlier artifact is not evidence for a later revision.

(Written by Copilot)
