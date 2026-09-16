# RemoteAgent roadmap

Tracking issue: [#336199](https://github.com/microsoft/vscode/issues/336199)

Status: prototype steps 0-7 and brokered delegation steps 11-12 implemented.
This document describes the target architecture and release gates; it does not
define a public API.

For the one-page coworker handoff and ownership split, start with
[REMOTE_AGENT_WORK_SPLIT.md](./REMOTE_AGENT_WORK_SPLIT.md).

Person 1's focused implementation sequence is in
[REMOTE_AGENT_CONNECTIVITY_ROADMAP.md](./REMOTE_AGENT_CONNECTIVITY_ROADMAP.md).

## Outcome

An Agent Host can act as an AHP client to other Agent Hosts and contribute
remote providers as ordinary `IAgent` implementations.

When A brokers a request from B to create work on C:

1. B invokes `create_remote_session`, contributed by A as an AHP client tool.
2. A resolves a model-visible target handle to an admitted provider on C.
3. A creates a normal session through its `RemoteAgent` for C.
4. C starts the initial prompt.
5. A returns its session/chat handle and open link to B.

The session is owned and cataloged by A. B does not need C's address or
credentials, and C remains authoritative for its provider execution.

## Existing seams

| Surface | Reuse and limitation |
| --- | --- |
| [`IAgent` and `IAgentChats`](./common/agent.ts) | The provider seam is already chat-addressed and supports opaque backing, progress, history, interactions, and capabilities. It does not represent a whole remote host. |
| [`IAgentHostProviderService`](./node/agentHostProviderService.ts) | Provides the normal provider catalog, lifetime-owned registration handles, default-provider eligibility, and session association. Withdrawal retains associations so a provider with the same identity can restore later. |
| [`AgentHostProtocolClientCore`](./common/agentHostProtocolClient.ts) and [`AgentHostProtocolClient`](./browser/agentHostProtocolClient.ts) | The headless core implements AHP initialization, requests, subscriptions, actions, versioning, and reconnect behavior. The browser adapter retains workbench configuration, trust, telemetry, and resource integration. |
| [`IRemoteAgentHostConnectionFactory`](./common/remoteAgentHostService.ts) | Useful prior art for target entries, factories, connection ownership, and observable availability. The current target-kind union is closed over built-ins. |
| [Tunnel discovery](./node/tunnelAgentHostService.ts) | Existing tunnel enumeration and relay machinery should be reused rather than reimplemented inside `RemoteAgent`. |
| [Optional AHP protected resources](./common/state/protocol/common/state.ts) | `required: false` already models optional tunnel authentication. Host-feature credential routing and the correct client sign-in path are still needed. |
| [Client-tool protocol tests](./test/node/protocol/clientTools.integrationTest.ts) | A can advertise a client tool on B, receive its invocation under A's client identity, and complete it without a new AHP command. |
| [Session creation](./node/agentService.ts) | A must reuse normal session creation, prompt dispatch, provenance, and session links through a narrow typed seam. |

## Architecture

```text
Host-level master gate
  |
  +-- Explicit target contribution
  +-- Tunnel target contribution -- independently gated discovery
  +-- Future SSH / Dev Container contributions
                |
        Target catalog and authorization
                |
        Contributed connection factory
                |
        Transport-neutral AHP client
                |
        RemoteAgent per endpoint/provider pair
                |
        Existing provider and session catalogs
```

Proposed responsibilities:

| Component | Responsibility |
| --- | --- |
| `RemoteAgentContribution` | Own master lifecycle, admitted targets, connection/provider registration, and cleanup. |
| Target contribution | Supply stable target entries plus connector-owned validation, auth, discovery, and transport bootstrap. |
| `RemoteHostConnection` | Own one initialized AHP client, negotiated capabilities, catalog subscription, status, and lifetime. |
| `RemoteAgent` | Adapt one remote provider to `IAgent`; translate identities, chat operations, progress, and resources. |
| `RemoteSessionClientTools` | Advertise and execute A-owned client tools, including `create_remote_session`, through normal A session APIs. |

Discovery and connection remain separate. Disabling a discovery source must not
prevent an explicit target from using the same transport.

## Host controls

Final keys and policy placement must be reconciled with the existing
`chat.remoteAgentHostsEnabled` and `chat.remoteAgentHostsAutoConnect` client
settings. The behavior is host-owned and must be enforced inside headless Agent
Hosts, not only hidden in UI.

Recommended experimental defaults: both controls off.

Use distinct persisted Agent Host runtime keys under a remote-agents namespace,
edited through AHP root configuration. A runtime managed setting can force the
master feature off; tunnel discovery inherits that effective state.

| Remote hosts | Tunnel discovery | Behavior |
| --- | --- | --- |
| Off | Either | No outbound discovery, connection, reconnect, provider admission, or remote-session tool execution. Inbound AHP and local providers remain available. |
| On | Off | Explicitly configured/admitted targets can connect. No tunnel enumeration or discovery-driven admission. |
| On | On | Request optional tunnel auth when needed, discover authorized targets, connect automatically, and contribute providers. |

Runtime rules:

- Master disable cancels A-owned attempts/timers, fences late async results,
  closes outbound transports, withdraws remote providers from new-session
  selection, and rejects new remote-session tool calls.
- Master disable does not abort, delete, or shut down sessions/hosts on B/C.
  Existing local records remain unavailable but restorable.
- Re-enable reconciles targets and backings without duplicate providers or
  sessions.
- Discovery disable stops enumeration and new discovery-driven admission. It
  does not ban explicit tunnel connections or tear down established ones while
  the master control remains enabled.
- Each host owns its own controls. Do not propagate A's settings to B/C.
- Runtime-owned security/permission decisions remain in the runtime managed
  settings model. Do not add a new editor setting merely to mirror an SDK
  policy.
- Activate the feature through one shared path used by both the normal Agent
  Host process and the standalone server.

## Tunnel authentication

Follow VS Code's existing tunnel-client behavior:

1. Read scopes from product tunnel configuration.
2. Reuse existing sessions silently, preferring exact scopes and then the
   narrowest sufficient superset.
3. Keep interactive sign-in in the client and behind an explicit user action.
4. Pass token plus issuer/provider identity to the Node tunnel layer.
5. Treat tunnel authentication, target authorization, and downstream provider
   authentication as separate boundaries.

Proposed AHP flow:

```text
A: remote hosts + tunnel discovery enabled
  |
  +-- usable credential --------------------> discover and connect
  |
  +-- credential missing or expired
        |
        +--> client: optional auth/required on ahp-root://
        |            tunnel resource + issuer + scopes
        |
        +<-- client: authenticate(resource, scopes, token, expiry?)
        |
        +--> tunnel credential consumer
        +--> discovery resumes
```

`required: false` means optional for using A, not permission to run tunnel
discovery without a credential. Declining leaves discovery in a needs-auth state
without blocking local providers.

Required auth work:

- Add a lifetime-owned host-feature protected-resource/credential-consumer seam.
  Do not create a fake `IAgent` to receive a tunnel token.
- Advertise separate GitHub and Microsoft protected-resource IDs so the resource
  identifies the issuer without extending `authenticate`.
- Ensure active requirements are visible to late and reconnecting clients.
- Re-emit the optional requirement after initialize/reconnect because the
  protocol notification is not replayed.
- Reuse tunnel sign-in, not the Copilot onboarding fallback.
- Cover both the workbench and Agents Window AHP client integrations.
- Handle expiry, sign-out, empty-token revocation, disablement, stale completion,
  dismissal, and deduplicated retry.

The MVP supports one active issuer/account. A new token for the same issuer
replaces the old token without account-identity lookup; a second issuer is
rejected until the first is cleared. The accepted token is host-owned in memory
until expiry, revocation, disablement, or process exit, even if its supplying
client disconnects. Expiry or revocation closes dependent connections.

Credentials must not appear in target descriptors, provider data, prompts,
tool results, or logs, and must not be forwarded automatically to B/C.

## Tunnel discovery behavior

Follow the current VS Code client:

- Enumerate account-associated tunnels with the `vscode-server-launcher` label,
  supported protocol version, and connect-scoped access.
- Cache and auto-connect every eligible non-dismissed tunnel when enabled; do
  not add a separate allowlist.
- Preserve dismissal and auto-connect suppression.
- Suppress the Agent Host's own hosted tunnel using identity supplied at
  bootstrap.
- Refresh on startup, auth changes, relevant setting changes, and an explicit
  generic AHP root refresh request. Do not poll periodically.
- Remove a target and its providers/catalog entries immediately when a
  successful refresh no longer returns it.
- Keep fixed WebSocket endpoints as test/developer scaffolding only.

The stable target identity is the tunnel address, not a gateway endpoint
instance. Persist the current `editor`/`dedicated` preference per tunnel. Ask the
connected client when that choice is required, and allow background dedicated
host creation where the current client does.

## Shared connection contract

The two workstreams agree on this boundary before parallel implementation.

Person 1 supplies:

- stable target and connector identities;
- a random AHP client identity persisted per target across A restarts;
- negotiated capabilities and root/provider catalog state;
- requests, subscriptions, actions, and notifications;
- observable connecting/connected/reconnecting/closed state;
- explicit lifetime and transport ownership.

Person 2 consumes that surface without tunnel SDK types, credential storage,
discovery state, renderer services, or transport-specific branches.

Start from the existing `IAgentConnection` and
`IRemoteAgentHostProtocolClient` contracts. Extract only what the Node client
and adapter actually need. Transport replay belongs to the connection layer;
durable session/tool deduplication belongs to the adapter/delegation layer.

## Backing and authority

The adapter cannot blindly relay all action envelopes. A's provider seam is
chat-addressed, while the downstream AHP server owns sessions.

Initial mapping:

- One exact A chat maps to one downstream session/default-chat backing.
- Persist a versioned opaque record with connector identity, target identity,
  downstream provider identity, downstream session URI, and downstream chat URI.
- Do not derive downstream identity by parsing A's session URI.
- A owns local catalog entries and handles.
- The downstream host owns execution and provider history.
- Project each downstream `AgentInfo` and its models into A's provider/model
  catalog, and translate supported chat progress into local provider signals.
- Do not mirror downstream session or chat catalogs into A. Only A-created
  chats with an explicit opaque downstream binding enter A's session catalog.
- Namespace endpoint/provider, session, chat, turn, tool-call, and resource
  identities.
- Build the local provider ID with
  `remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([connectorId, targetId])), downstreamProvider)`.
  Remote providers are never implicit defaults; callers select them explicitly
  or resolve them through a retained session association.
- Advertise only the intersection of downstream capabilities and adapter
  support.

Initial constraints:

- Admitted configured targets and authorized tunnel-discovered targets only.
- No arbitrary model-supplied URLs.
- Fixed endpoints are test-only; tunnels are the first user-facing source.
- Sessions created through A only; no bulk import of downstream sessions.
- Workspace-less single-chat sessions for the first vertical slice.
- No transparent co-authoring, peer/fork parity, or arbitrary IDE-tool
  forwarding.
- Disposing A's binding never shuts down an entire downstream host.

## Ordered roadmap

Each item has an independently testable outcome.

### 0. Jointly lock the boundary

Agree on target identity, connection lifetime, provider availability/withdrawal,
capability/auth metadata, file ownership, and disconnect/delete semantics.

**Done when:** Person 2 can implement against a fake connection without importing
transport or tunnel code.

### 1. Host controls and feature lifetime - Person 1

Introduce the master/discovery controls and a feature-lifecycle owner with
cancellation or generation fencing.

**Done when:** master off prevents every outbound discovery/network/tool side
effect; live disable stops owned work and ignores late results while local
providers and inbound AHP remain available.

The normal Agent Host process and standalone server use one shared activation
path.

### 2. Headless AHP client core - Person 1

Separate protocol initialization, requests, subscriptions, action delivery, and
reconnect mechanics from renderer/workbench concerns.

**Done when:** existing renderer tests still pass and a Node caller can construct
the core without browser or workbench services.

### 3. Open target contribution boundary - Person 1

Adapt existing target-entry/factory patterns into an extensible, lifetime-owned
headless contribution. Prove it with explicit targets plus a second fake target
kind rather than implementing SSH.

**Done when:** adding/removing a target kind requires no `RemoteAgent` changes and
no new central transport branch.

The fixed WebSocket target used here is test/developer scaffolding, not a public
runtime setting.

### 4. Fixed Node endpoint - Person 1

Create a Node transport over the headless client and connect to a scripted AHP
server.

**Done when:** the caller initializes, reads the provider/model catalog,
disconnects, and reports auth/version failures explicitly.

### 5. Remote provider catalog - Person 2

Using a fake connection, contribute one adapter per target/provider pair and
define unavailable/withdrawn behavior.

**Done when:** local `copilot`, B's `copilot`, and C's `copilot` remain distinct;
enable/discovery transitions do not duplicate providers; a tunnel removed by a
successful discovery refresh removes its target and provider catalog entries.

**Prototype status:** complete. Remote providers use the stable connector/target
identity, remain registered but unavailable during transient disconnect, and
withdraw with their target or authoritative downstream catalog entry.

### 6. One remote-backed chat - Person 2

Implement create, send, ordered streaming progress, terminal errors, abort, and
history for a conservative capability subset.

**Done when:** an ordinary A session talks to the scripted B exactly once and
unrelated B sessions never appear in A.

**Prototype status:** complete for one workspace-less default chat. The adapter
supports opaque backing restore, ordered progress, terminal errors, abort,
history, release, and explicit disposal; later interaction and tool routing
remain deferred.

### 7. Fixed-endpoint integration - Joint

Connect Person 1's real client to Person 2's adapter.

**Done when:** a two-host chat works with no transport-specific code in
`RemoteAgent`.

**Prototype status:** complete against the fixed Node WebSocket target.

### 8. Optional host and client tunnel auth - Person 1

Add feature-scoped host auth registration and the correct VS Code cached-session
and optional sign-in path.

**Done when:** cached credentials avoid prompts; signed-out users can sign in or
decline; late clients, disablement, expiry, revocation, and concurrent
challenges behave correctly.

Use issuer-specific resources, one active issuer/account, same-issuer token
replacement, and in-memory-only credential retention. Re-emit the optional
requirement to each new or reconnected client.

### 9. Tunnel discovery and automatic connection - Person 1

Use existing tunnel enumeration/relay machinery behind the discovery control.
Missing auth pauses discovery rather than looking like an empty catalog.

**Done when:** an authorized scripted tunnel contributes providers; discovery
disable stops future admission without breaking explicit targets; master disable
closes A's connections.

Discovery runs on startup, auth/settings changes, and an explicit generic AHP
root refresh command, not on a timer. Match current client behavior for
dismissal, self-host suppression, tunnel identity, location preference, and
background dedicated-host creation.

### 10. Persist backing and relay interactions - Person 2

Persist opaque backing through provider data, restore the same conversation, and
route permission/user-input requests with exact ownership.

**Done when:** restart restores the same downstream conversation; release does
not delete it; approve/deny/cancel reaches the right request once.

### 11. Client-tool callback - Person 2 (implemented)

Register a diagnostic client tool on B under A's actual initialized client
identity. Execute only calls assigned to A and complete them through normal AHP.

**Done when:** B invokes the tool, A executes it once, B receives the result, and
another client cannot complete A's call.

### 12. `create_remote_session` - Person 2 (implemented)

Replace the stub with a tool that resolves an allowed target handle, creates a
normal session through A's RemoteAgent for C, dispatches the initial prompt, and
returns A's handles/link with honest creation/start status.

Enforce the master control, target admission, delegation limits, provenance, and
invocation deduplication immediately before side effects.

**Done when:** scripted B invokes the tool, C starts exactly one conversation, A
shows one normal session, and replaying the invocation creates no duplicate.

The implementation uses the downstream session's `toolClientExecution` state
callback, persists invocation and result records in A's source-session database,
and refuses to retry a claimed invocation whose durable result is missing.

### 13. Recovery - Joint

Exercise disconnects before/after create and result delivery, downstream restart,
disable/re-enable, and ambiguous outcomes.

**Done when:** history has no duplicate turns or tools, ambiguous creation is not
blindly retried, pending work terminates, and reconnect does not create a new
conversation.

### 14. Workspace authority - Joint follow-up

Define the execution location for paths, worktrees, terminals, attachments,
customizations, checkpoints, and host prompt additions. Start with one
pre-existing remote folder.

**Done when:** edits run in C's intended folder and A neither edits its own
filesystem for C nor duplicates downstream isolation/setup.

## Release gates

- Enforce controls at startup, on change, before connect/reconnect, and
  immediately before tool/session side effects.
- Keep endpoint credentials, provider credentials, and delegation authorization
  separate and explicitly scoped.
- Do not widen trust: B cannot choose arbitrary destinations or local paths,
  inherit all of A's tools, or bypass C's runtime permissions.
- Do not synchronize all settings, customizations, filesystem access, or prompt
  instructions across hosts.
- Do not perform workspace orchestration in both A and C.
- Do not auto-re-export proxies or allow unbounded federation loops.
- Fail explicitly for unavailable providers and unsupported capabilities.

## Test strategy

Use deterministic scripted endpoints before live credentials or models.

Add focused coverage with each slice:

- setting combinations and runtime enable/disable;
- stale discovery/connection/auth completion;
- target identity stability and contribution disposal;
- provider-name collisions;
- streaming, errors, abort, and history;
- backing restore and teardown;
- interaction ownership;
- client-tool ownership and deduplication;
- three-host creation and ambiguous outcomes;
- reconnect/replay without duplicate turns or sessions;
- credential isolation, scopes, issuer, expiry, revocation, and optional decline.

Reuse [server integration helpers](./test/node/serverIntegrationTestHelpers.ts),
[client-tool tests](./test/node/protocol/clientTools.integrationTest.ts), and the
[AHP auth tests](../../workbench/contrib/chat/test/browser/agentSessions/agentHostAuth.test.ts).

## Deferred intentionally

- SSH, Dev Container, and other target implementations.
- Public plugin manifest/loader or extension API.
- Importing existing downstream sessions.
- Peer/fork/subagent parity and multi-client co-authoring.
- Arbitrary upstream tool/customization forwarding.
- General cyclic topology.
- Rich workspace/resource support beyond the first explicit authority contract.
