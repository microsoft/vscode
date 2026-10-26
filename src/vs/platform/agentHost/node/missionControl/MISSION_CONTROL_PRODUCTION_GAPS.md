# Mission Control remaining gaps

This document records release validation requirements, outstanding work and intentionally deferred limitations. [Security requirement coverage](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) provides the implementation and test references; [operation and configuration](./MISSION_CONTROL.md) describes usage. [Gaps, explained](./MISSION_CONTROL_GAPS_EXPLAINED.md) describes each item in plain language and compares it with Copilot Host and the Copilot app.

## Validation and release requirements

| Remaining gap | Completion criterion | Help needed from the maintainer |
| --- | --- | --- |
| Packaged and real-service release validation | Validate registration, independent multi-client credential execution, safe-boundary resume, sign-out, recovery and consent withdrawal in the intended Windows/Linux/macOS packages, alongside platform integration tests. | Intended platform/service environments. Use isolated authenticated profiles with Settings Sync explicitly disabled; never launch a copied authenticated profile with sync enabled. |
| Extended relay reliability and load qualification | Correlate spontaneous transport closures; qualify longer idle/active runs, simultaneous-client pressure, load shedding and prolonged outages against the real service. | No immediate action. Flag a specific service or sign-in blocker when encountered. |

No code-design decision from the maintainer is currently blocking these items. Missing deployment evidence must not be replaced with fake-backed success.

## Security-contract gaps

| Remaining gap | Current limitation | Help needed from the maintainer |
| --- | --- | --- |
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

## Credential sponsorship (S03): implemented scope and accepted limits

[`MissionControlHost._attachRelay`](./missionControlHost.ts) enables connection-owned credentials on Mission Control only. One current slot per protected resource supplies new work; admitted operations retain a snapshot rather than following token rotation. Isolated session principals persist without secrets, explicit local continuation validates the persisted owner, and scoped protected execution requires `supportsScopedCredentials` without a shared/desktop fallback. Copilot-only model advertisements are the intentional client workaround; Copilot-only protected execution is independently enforced by the capability gate.

[The bundled SDK integration test](../../test/node/providerIntegration/copilotCredentialSponsorship.integrationTest.ts), `real Agent startup preserves coding tools and separates A, B and legacy credentials through idle rotation`, checks exact A/B/legacy-L HTTP credentials, idle rotation/configuration replacement and coding-tool compatibility. [Named unit evidence](./MISSION_CONTROL.md#scoped-credential-boundaries-and-verification) covers scope/controller/routing, frozen captures, persisted principals, runtime profiles and native operations. Release validation complements these contracts with signed products and real-service behavior.

Implementation priority is **high**; exploit risk is **conditional/medium**, not evidence of equivalent permissions merely because all clients have the same owner. New Copilot turns and covered native GitHub operations do not select another client's or desktop credential from the shared authentication store. Runtime features and BYOK follow existing VS Code settings. MCP retains the documented upstream limitations listed below. Captured execution leases survive ordinary disconnect/rotation until known expiry or observed revocation; remote unobserved sign-out/revocation and credentials without a reported deadline cannot be inferred by the host. Project cloning uses the caller's API token while preserving ordinary Git/proxy/certificate configuration; machine-owned Git authentication, arbitrary tool commands and OS containment are outside the native GitHub API capture guarantee. Mission Control automation execution remains unavailable until it can retain explicit sponsorship.

Same-owner steering follows Copilot Host: it changes a running turn under that turn's existing credential, not the steering device's credential. New turns and queued messages use their own caller's credential. This is an accepted compatibility boundary, not complete permission isolation between devices belonging to the same user.

## Accepted deferrals

These limitations remain intentionally outside this increment rather than prerequisites for completing the agreed scope.

| Deferred gap | Current limitation | Reference |
| --- | --- | --- |
| Same-owner steering authority (S03) | Another authenticated device belonging to the same GitHub owner can steer a running turn under that turn's existing credential, even if the steering device has fewer permissions. | [Upstream steering implementation](https://github.com/github/copilot-host/blob/db3e5df9d3f3c5581d0a5ce96bdbe864ce1ac518/crates/copilot-ahp-host/src/backend/session_pump.rs#L816), [scoped execution boundaries](./MISSION_CONTROL.md#scoped-credential-boundaries-and-verification). |
| MCP credential attribution (S03) | MCP-App tool calls and sampling use the session's current credential rather than a per-request caller credential. OAuth completions are correlated by protected resource rather than the initiating request. | [Documented upstream limitations](https://github.com/github/copilot-host/blob/db3e5df9d3f3c5581d0a5ce96bdbe864ce1ac518/docs/architecture/authentication.md#evolving-areas-tracked-not-yet-changed), [scoped execution boundaries](./MISSION_CONTROL.md#scoped-credential-boundaries-and-verification). |
| Mandatory connection binding | Default mode accepts unbound sealed tokens, which remain replayable. Omitted MCP resource context can permit retargeting within a purpose. | [Authentication](./missionControlAuthentication.ts), security S08. |
| OS containment/general native hardening | No claim of OS confinement, atomic filesystem isolation, or comprehensive native provider/logging/export credential isolation. Runtime secret-filter readiness and catch-up are not established. | [Relay authorization](../protocolServerHandler.ts), security S09/S21. |
| Durable AHP restart/history baseline | AHP stream epochs/counters/spools and a complete pre-registration history baseline are not durable across process restart. | [Mirror](./missionControlSessionMirror.ts), [SDK source](./missionControlSdkEventSource.ts), security S31. |
| Response-part ID continuity | Reconstructed Copilot markdown/reasoning IDs can differ from live IDs, causing a client to reject a recovery snapshot as omitting displayed content. | [History mapping](../copilot/mapSessionEvents.ts), security S33. |

(Written by Copilot)
