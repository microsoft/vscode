# Mission Control remaining gaps

Only outstanding work and intentionally deferred limitations belong here. [Security requirement coverage](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md) provides the implementation and test references; [operation and configuration](./MISSION_CONTROL.md) describes usage.

## Validation and release gaps

| Remaining gap | Completion criterion | Help needed from the maintainer |
| --- | --- | --- |
| Signed/release cryptography and packaged opt-in | Verify registration, withdrawal and recipient sealing in signed/notarized/ASAR-packaged builds on the intended platforms. | None immediately. Artifact validation build [480503](https://dev.azure.com/monacotools/Monaco/_build/results?buildId=480503) is running with publishing and release disabled. |
| Extended relay reliability and load qualification | Correlate spontaneous transport closures; qualify longer idle/active runs, simultaneous-client pressure, load shedding and prolonged outages against the real service. | No immediate action. Flag a specific service or sign-in blocker when encountered. |
| Current-head CI | Complete the relevant build/test/security workflows on the current PR head before merge. | None immediately. GitHub's automatic PR workflows target `main`/`release/*`, not the current stack base; full automatic CI must run after the prerequisite merges and this PR targets `main`. Preserve normal review requirements. |

No code-design decision from the maintainer is currently blocking these items. Missing deployment evidence must not be replaced with fake-backed success.

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
| Mandatory connection binding | Default mode accepts unbound sealed tokens, which remain replayable. Omitted MCP resource context can permit retargeting within a purpose. | [Authentication](./node/missionControl/missionControlAuthentication.ts), security S16. |
| Credential sponsorship | Credentials are not isolated or pinned by client/generation/session driver; shared provider credentials are not revoked merely because a relay lane disconnects. | [Native store](./node/agentHostAuthenticationService.ts), security S17/S18/S24. |
| OS containment/general native hardening | No claim of OS confinement, atomic filesystem isolation, or comprehensive native provider/logging/export credential isolation. | [Relay authorization](./node/protocolServerHandler.ts), security S23/S24. |
| Durable AHP restart/history baseline | AHP stream epochs/counters/spools and a complete pre-registration history baseline are not durable across process restart. | [Mirror](./node/missionControl/missionControlSessionMirror.ts), [SDK source](./node/missionControl/missionControlSdkEventSource.ts), security S28. |
| Response-part ID continuity | Reconstructed Copilot markdown/reasoning IDs can differ from live IDs, causing a client to reject a recovery snapshot as omitting displayed content. | [History mapping](./node/copilot/mapSessionEvents.ts), security S30. |
