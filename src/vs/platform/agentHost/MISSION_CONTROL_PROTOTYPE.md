# Experimental Mission Control ingress

This development-only prototype attaches a Web PubSub virtual protocol server to the **existing VS Code Agent Host utility process**, without a separate daemon. Both modes use the existing multi-client AHP handler. Built products never activate the environment service.

```text
Local VS Code ------ local IPC ------+
                                    +--- one native Agent Host and session state
Other clients ----- MC / WPS --------+
```

Enabling registration does not create a relay client in VS Code, change the local session provider, or send local customization synchronization through Azure. The local and relay handlers share the same `AgentService` and `AgentHostStateManager`. A local session is therefore available to remote AHP `listSessions` and subscriptions without recreating it remotely.

**Temporary one-shot test:** The shared `AgentSession` helpers currently create Copilot CLI session URIs as `ahp-session:/<id>` and route that scheme back to the `copilotcli` provider. This is a native scheme change, not a relay compatibility layer. Restart this prototype build and create a fresh local Copilot session for the desktop-app test. Existing stored session identifiers are not migrated. Revert these two helper changes after the experiment; accepting arbitrary host-advertised URIs remains the proper client fix.

## Real service experiment

1. Build with `npm run compile`, start a development desktop window, and sign in with one matching GitHub authentication session. An empty window can also register the host.
2. Clear `chat.agentHost.experimentalMissionControlFakeEndpoint` and enable `chat.agentHost.experimentalMissionControl.enabled`. The endpoint defaults to `https://api.github.com`; the environment API prefix is `/cmc_internal/api/agents/environments`. An override must be a trusted HTTPS GitHub API origin serving Mission Control and `/user`, without credentials, a path, query, or fragment.
3. Wait for `Experimental Mission Control ready; environmentId=...` in the Agent Host log. Registration forwards the SDK's canonical device `remoteControl` branch, advertises the public sealing keys, connects to the returned WPS bootstrap, and reports online only after the control group is joined.
4. Create and use sessions normally in local VS Code. No special host picker or self-connect command is required.
5. In another MC-capable client, discover and select the environment with that exact ID. The client obtains its own `/connect` credentials, initializes using MC's `client_id`, authenticates with a sealed token, and lists/subscribes to sessions through ordinary AHP. Clients may also create sessions and perform normal interactive operations.
6. Verify a locally created session is listed by the other client, and a remotely created session and its activity are available to the local host.

The first successfully configured account and optional default directory own the shared utility process until restart. Same-owner windows may refresh the credential, but cannot replace that default directory. If registration starts in an empty window, no home-directory default is advertised. Clear the enabled setting to disconnect.

Heartbeat responses may postpone subsequent heartbeats with `Retry-After` (integer seconds or an HTTP-date), including on HTTP errors. The host waits at least that long and otherwise uses its 60-second cadence. Invalid values are logged and use the default cadence. Long waits do not overflow the timer; relay recovery and disable/re-enable do not bypass the wait. Disabling still closes the local relay immediately, but skips its offline heartbeat while the service-requested wait is active.

## Environment identity and discovery

The random compute identity is stored once in `agent-host-mission-control-id` under the running instance's user-data directory; it is not regenerated for each window or process restart and is not derived from hardware. Configuration requests from multiple windows are serialized, so simultaneous enablement registers one process-owned environment. MC maps that persisted compute ID to its environment ID.

Separate user-data directories represent separate hosts. For example, a throwaway launch profile and the normal dev profile can both register, producing two environments with the same human-readable label. Restarting either profile reuses its own identity. Use one intended profile for this experiment; stop extra test hosts instead of sharing an identity between concurrently running processes. Stopped environments may remain listed as offline until MC removes their registry records.

Environment discovery and session discovery are separate: an MC client must attach to this environment and issue AHP `listSessions` to see the host's available sessions. The prototype does not publish into MC's central session/task catalog or persist session history there. That catalog/mirroring path is not required for the direct-connect scenario above, and merely being signed into MC does not attach a client to every environment.

**Trust boundary:** Live mode deliberately grants the authenticated environment owner trusted-host access, comparable to a dev tunnel, including local resources and sessions outside the initially opened project. It is not project-scoped remote access. Control signatures, environment/owner binding, WPS publisher identity, lane/client-ID binding, and passive mutation rejection remain enforced. Remote GitHub credentials must open to the canonical registered owner.

The [production-readiness checklist](./MISSION_CONTROL_PRODUCTION_GAPS.md) is the consolidated security and rollout reference. Canonical-owner validation does not yet isolate credentials by client/generation or re-pin agent work to a session's driver: authentication still uses the native shared provider store. Tool approval does not supply OS confinement, and credential sealing does not encrypt the conversation or mirrored content.

The host advertises NaCl `x25519-sealedbox` keys for identity and MCP credentials through MC registration and AHP root metadata. An independent native client seals its own credential to a public key obtained through authenticated MC HTTPS; a web client may instead use MC's pre-sealed token. Private keys remain in the host. `chat.agentHost.experimentalMissionControl.requireConnectionBinding` defaults to `false` for compatibility with pre-sealed clients. Supplied bindings are always verified for challenge, age, and replay; setting it to `true` requires binding-aware clients. Unbound sealed envelopes remain replayable: this is an explicit non-production limitation.

The real service delivers signed spawn payloads directly in control-group messages. The receiver also supports chunk-envelope-wrapped control, and verifies both through the same verifier. A single bounded publisher awaits each acknowledgement before sending the next frame, preserving AHP order across response and broadcast groups.

## Request-form action compatibility

The prototype accepts `dispatchAction` and `unsubscribe` as either JSON-RPC requests or notifications. Both dispatch forms use the same native action-processing path. Request-form dispatch returns `{ serverSeq }` for the authoritative applied or rejected action; acceptance is determined by the echoed action envelope and its optional `rejectionReason`, not by JSON-RPC success alone. A missing resource returns `{ serverSeq: -1 }`. Queued dispatches are awaited, and acknowledgement waits are cancelled on disconnect and bounded to 30 seconds. Request-form unsubscribe returns `null`. Arbitrary notification names are not promoted to successful requests.

This is an explicit native-server compatibility workaround for existing clients that incorrectly send these AHP notifications as requests. It remains outside the generated AHP protocol types, shares the notification path's validation and state application, and does not alter notification-form behavior. Other notification names remain unsupported as requests.

## Two Code OSS instances

A two-instance relay test can isolate host behavior from other client implementations:

1. Use distinct user-data, extensions, shared-data directories, and debug ports for instances A and B.
2. Enable MC registration only in A. Create a session in A through its normal local connection.
3. In B, obtain a fresh MC client connection for A's exact environment ID, use MC's pre-sealed GitHub token or seal B's credential to A's HTTPS-advertised public key, and construct the existing WPS transport and AHP protocol client.
4. List and subscribe to A's session from B; send a harmless turn and verify both windows observe the same response/tool state.

B needs a test-only MC connection entry/harness because generic MC environment discovery is not implemented in the native UI. Enabling host registration in B is not a substitute: that would expose a second host rather than attach B to A. Keep the connector separate from A's host-registration setting; local sessions in A must never be rerouted through its relay. No session mirroring or additional daemon is required.

### Verified live two-window exercise

The 2026-09-30 exercise used two actual Agents windows from a full `npm run compile` build, with distinct copied profiles and registration disabled in B. A registered environment `55019ce8-c2fb-494d-8177-1b01678852f3`; its normal local UI created `ahp-session:/41bf0cd1-8b06-41bd-97de-568a37e337b0` and received `MC_LOCAL_A_READY`.

B connected to that exact environment using the existing MC connect service, WPS transport, and protocol client, with MC's pre-sealed token. A renderer-only test setup instantiated the generic remote sessions provider with the native `copilotcli` provider mapped to the experiment's `ahp-session` scheme. The stock sandbox adapter assumes provider `copilot`, whereas A advertises `copilotcli`; using it unchanged listed the session but left its content waiting for an unregistered session type. Cached rows from that initial attempt also retained the wrong immutable provider, so the test rebuilt its cached row. This is test setup, not a production discovery UI or a server-side URI compatibility layer.

B opened A's original conversation, saw `MC_LOCAL_A_READY`, and sent a turn requesting `pwd` plus harmless start/end markers around an eight-second sleep. Its tool ran in A's isolated workspace, returned `MC_RELAY_B_TOOL_START` and `MC_RELAY_B_TOOL_DONE`, and the response was `MC_RELAY_B_DONE`. Both windows displayed that turn. The local IPC trace and B's WPS trace received 62 matching authoritative action sequences, including the same turn ID, tool start/output/completion, streamed response deltas, and turn completion. B's sending transport was `webpubsub`; A's was `local`. No second session or daemon produced the response.

The exercise also exposed unresolved recovery behavior: repeated signed spawns for an existing client lane are rejected, and reconnect on a still-attached virtual lane returns `Method not found: reconnect`. A later transport recovery attempt reported a WPS connection error. Fresh manual MC connections recovered the UI; this run is not evidence of reliable automatic reconnect, credential renewal, or host-restart continuity. Generic discovery, correct provider/URI handling, and generation-aware recovery remain separate follow-up work. The exercise used the development-only unbound sealed-token transition mode, not production-strength mandatory connection binding. Screenshots and a credential-free protocol summary were saved locally before closing both throwaway instances; MC reported A offline after registration was disabled.

## Local fake mode

Leave live mode disabled and set `chat.agentHost.experimentalMissionControlFakeEndpoint` to a loopback HTTP URL. Its fake must implement registration, heartbeat, JWKS, and reliable-JSON WPS joins, acknowledgements, sequence acknowledgements, and group fanout. Only loopback HTTP/WS endpoints are accepted. Fake mode retains the original initialize/list/create-only restrictions and explicitly granted project roots; it is distinct from trusted-owner live mode.

## Validation

The focused suites cover sealed-box conformance, owner and challenge binding, plaintext rejection, signed control and replay, acknowledgement ordering, lifecycle teardown, identity reuse across windows/restarts, empty-window registration, local-to-relay session visibility, streaming, tool calls, and approval actions:

```sh
npm run transpile-client
npm run test-node -- --run src/vs/platform/agentHost/test/node/missionControlAuthentication.test.ts --run src/vs/platform/agentHost/test/node/missionControlProtocolServer.test.ts --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --run src/vs/platform/agentHost/test/browser/webPubSubRelayTransport.test.ts
```

The host-only scenario was exercised against real MC and Azure WPS with a standalone Node client: a session was created and sent a message through the native local socket, then appeared in the independent relay client's session list. That client used its own GitHub credential and a connection-bound sealed envelope, created another session, received tool-call actions and response deltas, and completed a turn with `MC_INDEPENDENT_OK`. No host-side self-connect or sealing management helper was used. Additional client implementations, especially web clients with different credential audiences or sealing capabilities, still require their own interoperability validation.

See [production gaps and open questions](./MISSION_CONTROL_PRODUCTION_GAPS.md). Session mirroring/backfill remains separate from the working live AHP path; `AgentHostStateManager.onDidEmitEnvelope` is its ordered seam.

## Changed files

- Environment, security, and ingress: [missionControlEnvironment.ts](./node/missionControlEnvironment.ts), [missionControlControl.ts](./node/missionControlControl.ts), [missionControlAuthentication.ts](./node/missionControlAuthentication.ts), [missionControlProtocolServer.ts](./node/missionControlProtocolServer.ts), [agentHostMain.ts](./node/agentHostMain.ts), [protocolServerHandler.ts](./node/protocolServerHandler.ts), [agentService.ts](./node/agentService.ts).
- Typed management and runtime policy: [agent.ts](./common/agent.ts), [agentService.ts](./common/agentService.ts), [sessionTransport.ts](./common/state/sessionTransport.ts), [agentHostManagementService.ts](./node/agentHostManagementService.ts), [localAgentHostService.ts](./electron-browser/localAgentHostService.ts), [copilotAgent.ts](./node/copilot/copilotAgent.ts).
- Workbench registration and client credential guard: [remoteAgentHost.contribution.ts](../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHost.contribution.ts), [webPubSubRelayTransport.ts](./browser/webPubSubRelayTransport.ts).
- Tests: [missionControlAuthentication.test.ts](./test/node/missionControlAuthentication.test.ts), [missionControlProtocolServer.test.ts](./test/node/missionControlProtocolServer.test.ts), [protocolServerHandler.test.ts](./test/node/protocolServerHandler.test.ts), [webPubSubRelayTransport.test.ts](./test/browser/webPubSubRelayTransport.test.ts).
- Dependencies, import rules, and documentation: [package.json](../../../../package.json), [package-lock.json](../../../../package-lock.json), [eslint.config.js](../../../../eslint.config.js), this document, and [MISSION_CONTROL_PRODUCTION_GAPS.md](./MISSION_CONTROL_PRODUCTION_GAPS.md).
