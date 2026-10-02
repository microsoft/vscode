# Production gaps for a user-local Mission Control environment

This is the production-readiness checklist for the [development prototype](./MISSION_CONTROL_PROTOTYPE.md). It covers security, lifecycle, protocol compatibility, distribution, and validation. "Current" describes this TypeScript implementation, not capabilities implemented by a different host or a guarantee about every deployed Mission Control client.

> [!WARNING]
> Live mode currently grants the authenticated environment owner trusted-host access, comparable to a dev tunnel. It is not project-scoped access, a per-session credential boundary, an OS sandbox, or end-to-end encryption of the conversation. The security checks already implemented below do not establish those missing properties.

## Trust boundaries

- **Control plane:** the trusted local workbench supplies the registration credential over management IPC. Mission Control is a peer, not an authority to replace local policy, credentials, configuration, or executable code.
- **Transport:** a Web PubSub JWT authorizes specific transport lanes. It does not establish the GitHub principal or credential that sponsors agent work.
- **Agent identity:** a separately presented GitHub credential must resolve to the registered canonical owner. Same owner does not mean same permissions: two devices can hold differently scoped tokens.
- **Key discovery:** authenticated HTTPS or trusted local bootstrap establishes the host's sealing key. A key received only over the relay cannot authenticate the endpoint presenting it.
- **Agent execution:** tool approval, filesystem authorization, OS confinement, and credential isolation are separate controls. Passing one must not bypass another.

## Security checklist

### 1. Seal credentials before publishing them

- **Current:** [missionControlAuthentication.ts](./node/missionControlAuthentication.ts) opens sealed GitHub and MCP credentials with separate purpose keys and verifies the inner purpose/resource context. Raw relay `authenticate` tokens are rejected. Direct/local authentication is a separate compatibility surface. The [client transport](./browser/webPubSubRelayTransport.ts) has an optional plaintext-auth refusal guard; the existing sandbox client requires a pre-sealed token.
- **Before shipping:** make refusal to publish plaintext mandatory in every relay client path, including token refresh and MCP authentication. Host rejection after receipt cannot undo disclosure to Azure. Define supported algorithms and key rotation/overlap; implement HPKE if required by the supported client matrix rather than assuming sealed-box support everywhere. Keep private keys host-local.

### 2. Authenticate the host's advertised key

- **Current:** [missionControlEnvironment.ts](./node/missionControlEnvironment.ts) publishes public keys through registration/heartbeat as well as AHP root state. Independent-client tests used the authenticated MC HTTPS copy. No dedicated trusted local endpoint-record advertisement of these sealing keys is implemented by this prototype.
- **Before shipping:** require clients to obtain and authenticate an out-of-band key bound to the intended owner/environment, compare it with the handshake advertisement, and handle restarts/key changes without silently trusting a relay replacement. For direct connections, use an authenticated launcher/IPC or endpoint-record equivalent; a same-user file is not protection against an unconfined process running as that user. Never place credentials in a discovery record.

### 3. Require connection-bound, replay-resistant credentials

- **Current:** a handshake challenge, nonce/timestamp validation, and bounded replay ledger exist. `requireConnectionBinding` is optional and defaults to false; an unbound sealed credential can still be replayed. MC token resealing is implemented and pre-sealed authentication worked in live tests, but that is not evidence of connection binding or adoption by every deployed client. Connect/reconnect can omit a sealed token when no usable key is available.
- **Before shipping:** complete the native/web client and service flow needed to bind credentials to the current handshake generation, then require binding across the supported fleet. Test stale challenges, nonce reuse, clock skew, reconnect, and rotation. Missing keys or sealed tokens must fail closed with an actionable error, never a plaintext fallback. Validate token audience, resource, repository scope, and compatibility of any MC-minted credential.

### 4. Separate connection access, session authorization, and the driving credential

- **Current:** signed spawn, publisher-owner checks, and lane/client-ID binding constrain relay ingress; presented GitHub identity tokens are validated against the canonical owner. This is not per-session credential sponsorship. [agentHostAuthenticationService.ts](./node/agentHostAuthenticationService.ts) stores credentials by protected resource/scopes and replays them to providers, not by client and connection generation. [protocolServerHandler.ts](./node/protocolServerHandler.ts) reuses native session/resource handlers; its `resourceRequest` still grants access without enforcing per-resource grants.
- **Before shipping:** authorize create, observe, steer, filesystem access, reverse requests, and client-contributed resources against the acting connection and session. Verify minted WPS JWT roles only allow the intended owner/environment/client lanes, and scope data-plane/mirror publication to its owning environment/session. Bind credential records to client plus generation, capture the creating credential, and re-pin agent/host-side API work to an authorized driver on handoff. Never union scopes, retain a broader previous credential, or use registration/ambient/local-provider authentication as implicit authority for a remote client. Define sponsorship lifetime on disconnect and reject stale in-flight authentication results. Preserve passive/read-only enforcement and keep VS Code host-management extension methods unavailable over WPS.

### 5. Protect credentials throughout their lifetime

- **Current:** private sealing keys and opened plaintext byte arrays are scrubbed. This does not zeroize immutable JavaScript token strings or provider-retained copies. The native auth service uses the client's `expiresIn` hint; this is not an authoritative GitHub expiry check. There is no demonstrated end-to-end guarantee covering diagnostic transcripts, SDK output, crash reports, or all credential disposal paths.
- **Before shipping:** redact raw and sealed credentials before any wire/runtime logging, telemetry, debug-log export, persistence, or mirroring; audit [ahpJsonlLogger.ts](./common/ahpJsonlLogger.ts) and its callers rather than assuming protocol logs are safe. Minimize secret copies/retention, clear references and scrub owned buffers on replacement, revocation, sign-out, session end, and shutdown. Use authoritative expiry/revocation and bounded credential age, not a client assertion. Refresh the MC credential only from the trusted local authentication lifecycle and validate each replacement against the pinned identity; do not add an MC-pushed credential or daemon-style token-file requirement to the workbench.

### 6. Authenticate every control-plane command

- **Current:** [missionControlControl.ts](./node/missionControlControl.ts) verifies ES256 spawn signatures, freshness, nonce replay, environment/owner binding, and signed/outer field equality before opening a lane. A spawn opens a transport lane, not an agent session. Backfill control is not implemented, and signing-key refresh is incomplete.
- **Before shipping:** establish an independently trusted MC signing-key source, rotation/revocation policy, and bounded replay handling across reconnects. Treat control-group membership as insufficient. Keep acted-on fields bound to the verified payload. Any future backfill handler needs the same verification, session-owner authorization, and resource limits; unsupported/unsigned commands must never acquire a fallback action path.

### 7. Enforce local consent, policy, and limits even if MC is compromised

- **Current:** the device's canonical `remoteControl` policy is read before live registration; an initial read failure does not silently register as unrestricted. Passive lanes and a fixed 32-lane implementation cap exist. They are not a complete local authorization policy, configurable active-session cap, or lane-opening rate limit.
- **Before shipping:** make operator/user-owned policy authoritative, compose enterprise/account/device restrictions fail closed, and revoke already connected clients when policy or consent changes. Define explicit project/resource grants, allowed session providers and repositories, any runtime slash-command restrictions, active-agent-session limits, and a rate limit on new relay-lane openings with intentional safe defaults. A slash-command policy is not an OS shell sandbox. MC must not override these controls, install binaries, mutate local configuration, or broaden grants through signed commands.

### 8. Define user-local versus managed-compute security boundaries

- **Current:** registration accepts a canonical user-local owner, not organization/application runtime principals. Live control-plane HTTP requires an HTTPS origin and rejects redirects; the fake endpoint is loopback-only. Identity validation currently uses the configured MC origin too, so HTTPS alone is not proof that a custom origin is a trusted GitHub identity authority.
- **Before shipping:** separate trusted GitHub/enterprise identity authorities from custom MC origins and bound bearer destinations; validate WPS bootstrap destinations and proxy/certificate behavior. Keep organization/application principal and provisioning/attestation capabilities absent from the general user-local build, not merely disabled by a setting; a managed variant requires a separately reviewed deployment/build boundary. Any managed variant needs independent principal attestation, per-environment/VM-scoped credentials, and cloud-specific isolation: block IMDS, constrain egress, and define mandatory privacy-reviewed session/audit mirroring where it is a compensating control.

## Agent containment and content privacy

- **OS enforcement is still open:** define workspace/network isolation and explicit, auditable capabilities for access outside the workspace, credential stores, internal networks, or privileged sockets. Do not launch elevated/root agents; isolate the host's config, credentials, and registration state from agent code. Require reliable process-tree cleanup, including on disconnect/session shutdown and crashes. Tools cannot grant themselves capabilities. Approval tiers alone are not confinement.
- **Encryption scope is limited:** sealing protects selected credential fields from the relay, not prompts, tool results, files, or the full AHP stream. MC pre-sealing also does not hide the input credential from MC itself. Define exactly what the relay and MC can observe, what mirroring uploads, its retention/access controls and consent, and whether any additional content encryption is required.
- **Distribution needs validation, not a blanket claim of being unsigned:** preserve VS Code's existing signing/notarization and update-verification guarantees, and verify the new crypto dependency in release bundles on every platform (license, embedded WASM/loading, ASAR, and runtime availability). No independent MC-triggered updater is required or permitted. Keep network destinations documented for operators.

## Remaining product and reliability work

| Area | Required work / decision |
| --- | --- |
| WPS lifecycle | Reliable output ordering and bounded acknowledgement waits exist. Finish token renewal, generation-aware lane replacement, keepalive/closed notices, client recovery, idle cleanup, signing-key refresh, and overload/backpressure behavior. Duplicate-spawn rejection and reconnect on a still-attached lane failed in the two-window exercise; fresh manual connections recovered it. |
| Control-plane scheduling | `Retry-After` is honored on successful/error heartbeat responses, including long waits. Define retry/backoff, outage recovery, and status/TTL semantics during prolonged service-requested pauses; do not bypass load shedding with recovery heartbeats. |
| Identity and multi-window lifecycle | First account/default directory are pinned, configuration is serialized, and random identity persists per user-data directory. Define sign-out/last-window/shutdown ownership, profile and Stable/Insiders identity boundaries, copied-profile collisions, and safe credential refresh/revocation. |
| Session continuity and MC catalog | Direct AHP attachment lists local sessions without mirroring. Implement any required central catalog/history association, ordered publication, bounded buffering, snapshots/backfill, retention, and restart recovery without adding a second session-state writer or leaking credentials. |
| Native client UX | Add general environment discovery/connect/reconnect with accurate availability, passive-state UX, and useful errors. The current live UI test reused sandbox infrastructure with a test-only native-provider adapter; it is not the production discovery implementation. |
| Protocol and persisted-state compatibility | Keep the request-form `dispatchAction` workaround explicit and tested without changing standard notification behavior. Resolve the native session URI/provider contract and migrate persisted UI/host state safely rather than shipping the temporary scheme change without compatibility handling. |
| Operational visibility | Provide content-free connection/session/turn correlation, paired failure/recovery logs, actionable policy/auth errors, and bounded diagnostics. Observability must not undermine credential or conversation privacy. |

## Evidence required before production enablement

The current tests and live exercises establish a functional relay, not completion of this checklist. A release decision needs:

- Cross-client conformance for sealing algorithms, authenticated key discovery, missing-key refusal, mandatory binding, MCP credentials, and no plaintext publication or secret-bearing logs.
- Deterministic multi-client tests for differently scoped same-owner tokens, driver handoff, passive mutation rejection, unauthorized observation/resources, generation changes, revocation/expiry, and isolation from the local/control-plane credential.
- Forged/unsigned/stale/replayed control tests, malicious signed-but-policy-disallowed requests, bounded lane/session/resource pressure, and key rotation.
- Host/client restart, lost sockets with live relay connectivity, repeated spawns, expired WPS tokens, service failures/`Retry-After`, and reconciliation tests that prove recovery without duplicate state application.
- Cross-platform OS containment/process cleanup and signed release-package/crypto-loading checks, plus enterprise/custom-origin/proxy/certificate coverage.
- Explicit decisions and responsible components for every remaining boundary above. User-local enablement must not implicitly enable managed-compute principals or claim protections supplied only by a different host.
