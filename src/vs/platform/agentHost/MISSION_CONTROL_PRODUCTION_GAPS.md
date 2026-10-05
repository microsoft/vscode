# Mission Control remaining gaps

Only outstanding work and intentionally deferred limitations belong here. [Security requirement coverage](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) provides the implementation and test references; [operation and configuration](./MISSION_CONTROL.md) describes usage.

## Validation and release gaps

| Remaining gap | Completion criterion | Help needed from the maintainer |
| --- | --- | --- |
| Signed/release cryptography and packaged opt-in | Verify registration, withdrawal and recipient sealing in current signed/notarized/ASAR-packaged builds on the intended platforms. | A current release-candidate artifact/path or build run when available. |
| Managed-sandbox live compatibility | Verify WPS root refresh and ticket renewal against a reachable existing managed sandbox, without provisioning replacement compute. | A reachable sandbox environment or an already-connected window. Do not paste credentials into chat. |
| Enterprise proxy/custom-certificate deployment | Verify HTTP, identity validation, registration and recovery in the intended enterprise/network configuration. | Access to the target test environment and its supported endpoint configuration. |
| Real-service soak and token renewal | Verify real WPS expiry, repeated recovery, extended idle/active operation, load shedding and supported client combinations. | No immediate action. An authenticated test setup is needed; flag a specific sign-in/environment blocker when encountered. |
| Copilot app compatibility and disconnect diagnosis | Verify a protocol-compatible app and establish the cause of unexpected disconnections or process exits from correlated client/host evidence. The app's known AHP 0.9/host 0.10 mismatch must not be concealed by a permanent protocol downgrade. | A compatible Copilot app build for the client-specific exercise. |
| Production privacy/release approval | Confirm opt-in disclosure, owner access, MC conversation storage/retention and service-side handling are approved for the intended audience. | The responsible product/privacy/security review or its existing approval. |
| Current-head CI | Complete the relevant build/test/security workflows on the current PR head before merge. | None. Requires committing/pushing the pending changes while preserving normal review requirements. |

No code-design decision from the maintainer is currently blocking these items. Missing deployment evidence must not be replaced with fake-backed success.

## Environment-management UX

First-class discovery and management alongside SSH/dev tunnels remains in the next stacked PR: retained host inventory before connection, offline-host management, refresh, reconnect, local naming, and hide/restore behavior.

## Accepted deferrals

These limitations remain intentionally outside this increment rather than prerequisites for completing the agreed scope.

| Deferred gap | Current limitation | Reference |
| --- | --- | --- |
| Mandatory connection binding | Default mode accepts unbound sealed tokens, which remain replayable. Omitted MCP resource context can permit retargeting within a purpose. | [Authentication](./node/missionControl/missionControlAuthentication.ts), security S16. |
| Credential sponsorship | Credentials are not isolated or pinned by client/generation/session driver; shared provider credentials are not revoked merely because a relay lane disconnects. | [Native store](./node/agentHostAuthenticationService.ts), security S17/S18/S24. |
| OS containment/general native hardening | No claim of OS confinement, atomic filesystem isolation, or comprehensive native provider/logging/export credential isolation. | [Relay authorization](./node/protocolServerHandler.ts), security S23/S24. |
| Durable AHP restart/history baseline | AHP stream epochs/counters/spools and a complete pre-registration history baseline are not durable across process restart. | [Mirror](./node/missionControl/missionControlSessionMirror.ts), [SDK source](./node/missionControl/missionControlSdkEventSource.ts), security S28. |
| Response-part ID continuity | Reconstructed Copilot markdown/reasoning IDs can differ from live IDs, causing a client to reject a recovery snapshot as omitting displayed content. | [History mapping](./node/copilot/mapSessionEvents.ts), security S30. |
