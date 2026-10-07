# Mission Control remaining gaps

Only outstanding work and intentionally deferred limitations belong here. [Security requirement coverage](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) provides the implementation and test references; [operation and configuration](./MISSION_CONTROL.md) describes usage.

## Validation and release gaps

| Remaining gap | Completion criterion | Help needed from the maintainer |
| --- | --- | --- |
| Final-head packaged qualification and remaining platforms | Qualify signed-product registration, remote discovery/execution and consent withdrawal on the final code revision and intended Windows/Linux packages. | None immediately. Use isolated authenticated profiles with Settings Sync explicitly disabled; never launch a copied authenticated profile with sync enabled. |
| Extended relay reliability and load qualification | Correlate spontaneous transport closures; qualify longer idle/active runs, simultaneous-client pressure, load shedding and prolonged outages against the real service. | No immediate action. Flag a specific service or sign-in blocker when encountered. |
| Current-head CI | Complete the relevant build/test/security workflows on the current PR head before merge. | None immediately. The prerequisite has merged and this PR now targets `main`; qualify the updated head using the automatic PR workflows. Preserve normal review requirements. |

No code-design decision from the maintainer is currently blocking these items. Missing deployment evidence must not be replaced with fake-backed success.

## Security-contract gaps

| Remaining gap | Current limitation | Help needed from the maintainer |
| --- | --- | --- |
| Authoritative credential expiry and live authorization lapse | GitHub's expiration header is not consumed; authenticated lanes do not lose observation/steering/MCP authorization at that deadline, and no integrated targeted lapse notification exists. Caller-provided expiry and relay-ticket renewal are not substitutes. | Scope decision: whether this is required for the continuing-development merge or explicitly deferred with the shared credential work. Security S04. |
| Durable per-session mirror opt-out | Sharing is enabled for the entire host; there is no persisted per-session choice suppressing AHP/SDK/lifecycle publication after cold resume. | Product decision: whether host-wide consent is sufficient for this increment or per-session opt-out must precede merge. Security S30. |
| Enterprise endpoint coherence and disclosure | MC independently defaults to dotcom rather than the configured GitHub identity origin; deliberate cross-host content residency and identity provenance are not explicitly surfaced. | Scope decision on enterprise support for this increment; supported topology/endpoint access is needed for deployment validation. Security S15. |
| Independent host-local policy and quotas | Fixed transport bounds do not enforce operator-owned session/repository restrictions or configurable active-session/spawn quotas. Reporting device policy to MC does not provide independent enforcement against a compromised MC signer. | Applicability decision for this user-local increment. Security S17/S28. |

## Deferred validation

These qualification items are not part of the current continuing-development merge decision.

| Remaining gap | Completion criterion | Help needed when resumed |
| --- | --- | --- |
| Enterprise proxy/custom-certificate deployment | Verify HTTP, identity validation, registration and recovery in the intended enterprise/network configuration. | Access to the target test environment and its supported endpoint configuration. |
| Copilot app compatibility and disconnect diagnosis | Verify a protocol-compatible app and establish unexpected disconnect/process-exit causes from correlated client/host evidence. The known AHP 0.9/host 0.10 mismatch must not be concealed by a permanent protocol downgrade. | A compatible Copilot app build for the client-specific exercise. |
| Production privacy/release approval | Confirm opt-in disclosure, owner access, MC conversation storage/retention and service-side handling are approved for the intended audience. | The responsible product/privacy/security review or its existing approval. |

## Environment-management UX

First-class discovery and management alongside SSH/dev tunnels remains in the next stacked PR: retained host inventory before connection, offline-host management, refresh, reconnect, local naming, and hide/restore behavior.

## Accepted deferrals

These limitations remain intentionally outside this increment rather than prerequisites for completing the agreed scope.

| Deferred gap | Current limitation | Reference |
| --- | --- | --- |
| Mandatory connection binding | Default mode accepts unbound sealed tokens, which remain replayable. Omitted MCP resource context can permit retargeting within a purpose. | [Authentication](./missionControlAuthentication.ts), security S08. |
| Credential sponsorship | Credentials are shared by resource/scopes rather than pinned to client/generation/session drivers; lineage-aware sign-out, lease expiry and driver handoff are not enforced. Ordinary transport disconnect alone need not revoke a valid session lease. | [Native store](../agentHostAuthenticationService.ts), security S01/S03/S09. |
| OS containment/general native hardening | No claim of OS confinement, atomic filesystem isolation, or comprehensive native provider/logging/export credential isolation. Runtime secret-filter readiness and catch-up are not established. | [Relay authorization](../protocolServerHandler.ts), security S09/S21. |
| Durable AHP restart/history baseline | AHP stream epochs/counters/spools and a complete pre-registration history baseline are not durable across process restart. | [Mirror](./missionControlSessionMirror.ts), [SDK source](./missionControlSdkEventSource.ts), security S31. |
| Response-part ID continuity | Reconstructed Copilot markdown/reasoning IDs can differ from live IDs, causing a client to reject a recovery snapshot as omitting displayed content. | [History mapping](../copilot/mapSessionEvents.ts), security S33. |

(Written by Copilot)
