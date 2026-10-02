# Experimental Mission Control ingress

This development-only prototype attaches a Web PubSub virtual protocol server to the **existing VS Code Agent Host utility process**, without a separate daemon. Both modes use the existing multi-client AHP handler. Built products never activate the environment service.

```text
Local VS Code ------ local IPC ------+
                                    +--- one native Agent Host and session state
Other clients ----- MC / WPS --------+
```

Enabling registration does not create a relay client in VS Code, change the local session provider, or send local customization synchronization through Azure. The local and relay handlers share the same `AgentService` and `AgentHostStateManager`. A local session is therefore available to remote AHP `listSessions` and subscriptions without recreating it remotely.

**URI migration is deferred:** The shared `AgentSession` helpers currently create Copilot CLI session URIs as `ahp-session:/<id>` and route that scheme back to the `copilotcli` provider. This is a native scheme change, not a relay compatibility layer. Existing stored session identifiers and URI-keyed UI state are not migrated. The current development experiment does not establish release compatibility for this transition.

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

Environment discovery and session discovery are separate: an MC client must attach to this environment and issue AHP `listSessions` to see the host's available sessions. The development client offers **Connect to Mission Control Environment...** in the command palette and Agents host-management menu. It lists existing user-local environments, excludes its own host, checks current availability before connecting, and never provisions replacement compute. User-local connections use the generic native Sessions provider; sandbox connections retain their own checkout/history behavior.

Live registration also publishes native authoritative AHP envelopes as MC `sessionEvents` through a bounded, process-owned mirror. Durable acknowledgements free its spool; signed backfill replays retained frames exactly. The mirror does not publish a fabricated raw SDK stream, and process-restart epochs and a complete pre-attachment history baseline are not implemented. The live two-window evidence below predates this mirror/discovery integration; real MC catalog/history and picker behavior still require validation. Token sealing does not encrypt mirrored conversation content.

**Trust boundary:** Live mode exposes native sessions to the authenticated environment owner. MC filesystem calls are limited to the initially exposed and locally known session workspaces; session content storage is readable, not writable through that grant. Local/direct filesystem behavior is unchanged. This is not OS confinement or a per-session credential boundary. Control signatures, environment/owner binding, WPS publisher identity, lane/client-ID binding, and passive action rejection remain enforced. Remote GitHub credentials must open to the canonical registered owner.

The [production-readiness checklist](./MISSION_CONTROL_PRODUCTION_GAPS.md) is the consolidated security and rollout reference. Canonical-owner validation does not yet isolate credentials by client/generation or re-pin agent work to a session's driver: authentication still uses the native shared provider store. Tool approval does not supply OS confinement, and credential sealing does not encrypt the conversation or mirrored content.

Host-wide configuration is not exposed through MC root snapshots or host configuration updates, including after authentication: it can contain MCP credentials and proxy secrets. Session-specific configuration remains a separate AHP surface. Local/direct root behavior is unchanged.

The host advertises NaCl `x25519-sealedbox` keys for identity and MCP credentials through MC registration and AHP root metadata. An independent native client seals its own credential to a public key obtained through authenticated MC HTTPS; a web client may instead use MC's pre-sealed token. Private keys remain in the host. Each live lane must authenticate the canonical owner against the native GitHub identity authority before accessing sessions or sending actions; a new handshake or close clears lane authorization and invalidates pending identity checks. Passive identity checks do not replace provider credentials. Concurrent MCP restoration waits for the pending same-handshake owner check; a supplied resource context must match. The pre-authentication root is minimal, and the native WPS client refreshes its root subscription after authentication rather than retaining an incomplete baseline. `chat.agentHost.experimentalMissionControl.requireConnectionBinding` defaults to `false` for compatibility with pre-sealed clients. Supplied bindings are always verified for challenge, age, and replay; setting it to `true` requires binding-aware clients. Unbound sealed envelopes remain replayable, and optional MCP resource context can leave a token retargetable: these are explicit non-production limitations.

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

B connects through **Connect to Mission Control Environment...**; enabling host registration in B instead exposes a second host, not a connection to A. The command and connection service reject self-relay. Local sessions in A continue using IPC. The recorded exercises below use the earlier test-only connector, so they remain evidence of the transport/session behavior rather than validation of the new picker.

### Verified live two-window exercise

The 2026-09-30 exercise used two actual Agents windows from a full `npm run compile` build, with distinct copied profiles and registration disabled in B. A registered environment `55019ce8-c2fb-494d-8177-1b01678852f3`; its normal local UI created `ahp-session:/41bf0cd1-8b06-41bd-97de-568a37e337b0` and received `MC_LOCAL_A_READY`.

B connected to that exact environment using the existing MC connect service, WPS transport, and protocol client, with MC's pre-sealed token. A renderer-only test setup instantiated the generic remote sessions provider with the native `copilotcli` provider mapped to the experiment's `ahp-session` scheme. The stock sandbox adapter assumes provider `copilot`, whereas A advertises `copilotcli`; using it unchanged listed the session but left its content waiting for an unregistered session type. Cached rows from that initial attempt also retained the wrong immutable provider, so the test rebuilt its cached row. This is test setup, not a production discovery UI or a server-side URI compatibility layer.

B opened A's original conversation, saw `MC_LOCAL_A_READY`, and sent a turn requesting `pwd` plus harmless start/end markers around an eight-second sleep. Its tool ran in A's isolated workspace, returned `MC_RELAY_B_TOOL_START` and `MC_RELAY_B_TOOL_DONE`, and the response was `MC_RELAY_B_DONE`. Both windows displayed that turn. The local IPC trace and B's WPS trace received 62 matching authoritative action sequences, including the same turn ID, tool start/output/completion, streamed response deltas, and turn completion. B's sending transport was `webpubsub`; A's was `local`. No second session or daemon produced the response.

The current receiver treats fresh signed retries for an existing lane idempotently and replaces the virtual transport on a new handshake, rather than rejecting duplicate spawns or routing reconnect into an already initialized handler. The baseline exercise does not establish reliable automatic reconnect or credential renewal. Generic discovery, correct provider/URI handling, and full generation-aware recovery remain separate follow-up work. The exercise uses the development-only unbound sealed-token transition mode, not production-strength mandatory connection binding. Screenshots and a credential-free protocol summary are saved locally; the throwaway instances are stopped and MC reports A offline after registration is disabled.

### Hardened remote edit and permission preview

The 2026-10-02 exercise uses isolated native host A and remote client B, with B's registration disabled. A exposes `ahp-session:/cfc6f40e-7add-4d16-89ad-69e6467f1bd7` through environment `4c72c7d4-409f-4916-8c0d-f3f922adc0d7`. B opens that same locally created session and resumes it after utility-host restarts. An A-workspace read succeeds; a read of B's ungranted workspace is refused with `PermissionDenied`.

B submits an `Update File` edit of a single harmless test file and receives a write-permission request. The proposed content is fetched through the real relay as `pending-edit-content:` and verified exactly before approval. Normal allow-once confirmation writes `MC_HARDENED_RELAY_EDIT_OK\n` in A's workspace. The authoritative tool result succeeds, the turn completes, and both windows display the assistant's `MC_HARDENED_RELAY_DONE` response. Local IPC and WPS traces contain 23 identical authoritative action envelopes for this turn. B's completed diff opens with the real before/after contents fetched through `session-db:`; this exercise does not validate the separate `git-blob:` path.

The initial model proposal uses a delete/add patch. Its deletion preview is declined through normal permissions; no approval, policy, or file-read guard is bypassed. The exercise exposes and repairs pending-preview authorization, including session/chat-bound references and exact published-reference checks against authoritative pending tools. Deterministic tests additionally cover side chats, worker chats, forged session authorities, unknown references, writes, and retired previews.

Screenshots and credential-free protocol evidence are saved locally. Registration is disabled through the trusted local configuration service, MC reports the environment offline, B's temporary connection is removed, and both isolated applications are stopped. The exercise verifies the bounded edit/preview/diff flow, not long-running token renewal or production readiness.

## Local fake mode

Leave live mode disabled and set `chat.agentHost.experimentalMissionControlFakeEndpoint` to a loopback HTTP URL. Its fake must implement registration, heartbeat, JWKS, and reliable-JSON WPS joins, acknowledgements, sequence acknowledgements, and group fanout. Only loopback HTTP/WS endpoints are accepted. Fake mode retains the original initialize/list/create-only restrictions and explicitly granted project roots; it is distinct from trusted-owner live mode.

## Validation

The focused suites cover sealed-box conformance, owner and challenge binding, plaintext rejection, signed control and replay, acknowledgement ordering, lifecycle teardown, identity reuse across windows/restarts, empty-window registration, local-to-relay session visibility, streaming, tool calls, and approval actions:

```sh
npm run transpile-client
npm run test-node -- --run src/vs/platform/agentHost/test/node/missionControlAuthentication.test.ts --run src/vs/platform/agentHost/test/node/missionControlProtocolServer.test.ts --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --run src/vs/platform/agentHost/test/browser/webPubSubRelayTransport.test.ts --run src/vs/platform/agentHost/test/common/pendingEditContentUri.test.ts
```

The host-only scenario was exercised against real MC and Azure WPS with a standalone Node client: a session was created and sent a message through the native local socket, then appeared in the independent relay client's session list. That client used its own GitHub credential and a connection-bound sealed envelope, created another session, received tool-call actions and response deltas, and completed a turn with `MC_INDEPENDENT_OK`. No host-side self-connect or sealing management helper was used. Additional client implementations, especially web clients with different credential audiences or sealing capabilities, still require their own interoperability validation.

See [production gaps and open questions](./MISSION_CONTROL_PRODUCTION_GAPS.md). Session mirroring/backfill is separate from the direct AHP path, observes `AgentHostStateManager.onDidEmitEnvelope`, and does not derive another authoritative state projection.

## Changed files

- Environment, security, and ingress: [missionControlEnvironment.ts](./node/missionControlEnvironment.ts), [missionControlControl.ts](./node/missionControlControl.ts), [missionControlAuthentication.ts](./node/missionControlAuthentication.ts), [missionControlProtocolServer.ts](./node/missionControlProtocolServer.ts), [agentHostMain.ts](./node/agentHostMain.ts), [protocolServerHandler.ts](./node/protocolServerHandler.ts), [agentService.ts](./node/agentService.ts).
- Typed management and runtime policy: [agent.ts](./common/agent.ts), [agentService.ts](./common/agentService.ts), [sessionTransport.ts](./common/state/sessionTransport.ts), [agentHostManagementService.ts](./node/agentHostManagementService.ts), [localAgentHostService.ts](./electron-browser/localAgentHostService.ts), [copilotAgent.ts](./node/copilot/copilotAgent.ts).
- Workbench registration and client credential guard: [remoteAgentHost.contribution.ts](../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHost.contribution.ts), [webPubSubRelayTransport.ts](./browser/webPubSubRelayTransport.ts).
- Tests: [missionControlAuthentication.test.ts](./test/node/missionControlAuthentication.test.ts), [missionControlProtocolServer.test.ts](./test/node/missionControlProtocolServer.test.ts), [protocolServerHandler.test.ts](./test/node/protocolServerHandler.test.ts), [webPubSubRelayTransport.test.ts](./test/browser/webPubSubRelayTransport.test.ts).
- Dependencies, import rules, and documentation: [package.json](../../../../package.json), [package-lock.json](../../../../package-lock.json), [eslint.config.js](../../../../eslint.config.js), this document, and [MISSION_CONTROL_PRODUCTION_GAPS.md](./MISSION_CONTROL_PRODUCTION_GAPS.md).
