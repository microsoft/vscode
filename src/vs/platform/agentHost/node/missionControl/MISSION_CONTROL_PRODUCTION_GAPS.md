# Mission Control remaining gaps

Only outstanding work and intentionally deferred limitations belong here. [Security requirement coverage](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) provides the implementation and test references; [operation and configuration](./MISSION_CONTROL.md) describes usage. [Gaps, explained](./MISSION_CONTROL_GAPS_EXPLAINED.md) describes each open item in plain language and compares it with Copilot Host and the Copilot app.

## Validation and release gaps

| Remaining gap | Completion criterion | Help needed from the maintainer |
| --- | --- | --- |
| Final-head packaged/Azure qualification and remaining platforms | Final scoped-path Azure/cross-platform, signed-product and real-service qualification is not done. Qualify registration, independent multi-client credential execution, safe-boundary resume, sign-out, recovery and consent withdrawal on the final revision and intended Windows/Linux/macOS packages. | Intended platform/service environments. Use isolated authenticated profiles with Settings Sync explicitly disabled; never launch a copied authenticated profile with sync enabled. |
| Extended relay reliability and load qualification | Correlate spontaneous transport closures; qualify longer idle/active runs, simultaneous-client pressure, load shedding and prolonged outages against the real service. | No immediate action. Flag a specific service or sign-in blocker when encountered. |
| Current-head CI | Complete the relevant build/test/security workflows on the current PR head before merge. | None immediately. The prerequisite has merged and this PR now targets `main`; qualify the updated head using the automatic PR workflows. Preserve normal review requirements. |

No code-design decision from the maintainer is currently blocking these items. Missing deployment evidence must not be replaced with fake-backed success.

## Security-contract gaps

| Remaining gap | Current limitation | Help needed from the maintainer |
| --- | --- | --- |
| Durable per-session mirror opt-out | Sharing is enabled for the entire host; there is no persisted per-session choice suppressing AHP/SDK/lifecycle publication after cold resume. | Product decision: whether host-wide consent is sufficient for this increment or per-session opt-out must precede merge. Security S30. |
| Enterprise endpoint coherence and disclosure | MC independently defaults to dotcom rather than the configured GitHub identity origin; deliberate cross-host content residency and identity provenance are not explicitly surfaced. | Scope decision on enterprise support for this increment; supported topology/endpoint access is needed for deployment validation. Security S15. |
| Independent host-local policy and quotas | Fixed transport bounds do not enforce operator-owned session/repository restrictions or configurable active-session/spawn quotas. Reporting device policy to MC does not provide independent enforcement against a compromised MC signer. | Applicability decision for this user-local increment. Security S17/S28. |
| Credential sponsorship residuals (S03) | Copilot-only scoped protected execution is active, with no shared/desktop fallback. Other providers fail the capability gate; MCP-App and concurrent same-resource OAuth requester correlation remain open. Captured execution leases survive ordinary generation disconnect/rotation until known expiry or observed revocation; remote unobserved sign-out/revocation and no-deadline credentials remain limitations. | Qualify the bounded path on the final packaged/Azure/service head; broader provider and MCP coverage is not implied by local tests. [Credential evidence and boundaries](./MISSION_CONTROL.md#scoped-credential-evidence-and-remaining-qualification). |

## Deferred validation

These qualification items are not part of the current continuing-development merge decision.

| Remaining gap | Completion criterion | Help needed when resumed |
| --- | --- | --- |
| Enterprise proxy/custom-certificate deployment | Verify HTTP, identity validation, registration and recovery in the intended enterprise/network configuration. | Access to the target test environment and its supported endpoint configuration. |
| Copilot app compatibility and disconnect diagnosis | Verify a protocol-compatible app and establish unexpected disconnect/process-exit causes from correlated client/host evidence. The known AHP 0.9/host 0.10 mismatch must not be concealed by a permanent protocol downgrade. | A compatible Copilot app build for the client-specific exercise. |
| Production privacy/release approval | Confirm opt-in disclosure, owner access, MC conversation storage/retention and service-side handling are approved for the intended audience. | The responsible product/privacy/security review or its existing approval. |

## Environment-management UX

First-class discovery and management alongside SSH/dev tunnels remains in the next stacked PR: retained host inventory before connection, offline-host management, refresh, reconnect, local naming, and hide/restore behavior.

## Credential sponsorship (S03): bounded implementation, qualification incomplete

[`MissionControlHost._attachRelay`](./missionControlHost.ts) enables connection-owned credentials on Mission Control only. One current slot per protected resource supplies new work; admitted operations retain a snapshot rather than following token rotation. Isolated session principals persist without secrets, explicit local continuation validates the persisted owner, and scoped protected execution requires `supportsScopedCredentials` without a shared/desktop fallback. Copilot-only model advertisements are the intentional client workaround; Copilot-only protected execution is independently enforced by the capability gate.

[The bundled SDK synthetic-auth test](../../test/node/providerIntegration/copilotCredentialSponsorship.integrationTest.ts), `distinct captured credentials reach the bundled runtime and remain stable across rotation until resume`, passed local exact-token HTTP assertions for independent sources, frozen authentication after rotation and resumed authentication. [Named unit evidence](./MISSION_CONTROL.md#scoped-credential-evidence-and-remaining-qualification) covers scope/controller/routing, persisted principals, runtime profiles and native captures. These checks do not qualify final signed products, real GitHub/MC service behavior or Azure/cross-platform deployment; those exercises are not done for this scoped path.

Implementation priority is **high**; exploit risk is **conditional/medium**, not evidence of equivalent permissions merely because all clients have the same owner. Universal S03/all-provider completion is not claimed. Full MCP isolation remains open for MCP-App authentication and concurrent OAuth requester/token correlation at the same resource. Scoped project cloning isolates ambient Git configuration/credentials, but arbitrary Git commands executed by tools and OS containment are outside the native GitHub API capture guarantee. Mission Control automation execution remains unavailable until it can retain explicit sponsorship.

## Accepted deferrals

These limitations remain intentionally outside this increment rather than prerequisites for completing the agreed scope.

| Deferred gap | Current limitation | Reference |
| --- | --- | --- |
| Mandatory connection binding | Default mode accepts unbound sealed tokens, which remain replayable. Omitted MCP resource context can permit retargeting within a purpose. | [Authentication](./missionControlAuthentication.ts), security S08. |
| OS containment/general native hardening | No claim of OS confinement, atomic filesystem isolation, or comprehensive native provider/logging/export credential isolation. Runtime secret-filter readiness and catch-up are not established. | [Relay authorization](../protocolServerHandler.ts), security S09/S21. |
| Durable AHP restart/history baseline | AHP stream epochs/counters/spools and a complete pre-registration history baseline are not durable across process restart. | [Mirror](./missionControlSessionMirror.ts), [SDK source](./missionControlSdkEventSource.ts), security S31. |
| Response-part ID continuity | Reconstructed Copilot markdown/reasoning IDs can differ from live IDs, causing a client to reject a recovery snapshot as omitting displayed content. | [History mapping](../copilot/mapSessionEvents.ts), security S33. |

(Written by Copilot)
