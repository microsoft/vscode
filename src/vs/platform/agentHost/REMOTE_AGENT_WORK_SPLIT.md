# RemoteAgent two-person work split

Tracking issue: [#336199](https://github.com/microsoft/vscode/issues/336199)

Planning branch:
[tyler/remote-agent-hosts](https://github.com/microsoft/vscode/tree/tyler/remote-agent-hosts)

Start here. The detailed design and acceptance criteria are in
[REMOTE_AGENT_ROADMAP.md](./REMOTE_AGENT_ROADMAP.md).

Person 1's focused implementation sequence is in
[REMOTE_AGENT_CONNECTIVITY_ROADMAP.md](./REMOTE_AGENT_CONNECTIVITY_ROADMAP.md).

## Goal

Make an Agent Host act as an AHP client to other Agent Hosts and contribute each
admitted endpoint/provider pair as an ordinary `IAgent`.

```text
VS Code or another AHP client
              |
              v
Host A: normal provider and session catalogs
  - local providers
  - RemoteAgent(B, provider P) ---- AHP ----> Host B
  - RemoteAgent(C, provider Q) ---- AHP ----> Host C
              ^
              |
Host B calls create_remote_session, contributed by A as a client tool.
A authorizes C, creates a normal A session backed by C, starts the prompt,
and returns A's session/chat handle and open link to B.
```

The new session belongs in A's normal catalog. B does not need C's address or
credentials.

## Confirmed decisions

- The Agent Host has a master control for outbound remote-host functionality.
- Tunnel discovery has a separate control.
- Enabled tunnel discovery automatically connects authorized discovered targets
  and contributes their agents.
- Disabling the master control immediately closes A-owned outbound transports.
  It does not delete or cancel sessions on B/C.
- Tunnel authentication follows VS Code's existing tunnel-client behavior:
  product-defined scopes, cached-session reuse, optional explicit sign-in, and
  preserved issuer identity.
- Tunnel authentication is optional for using A, but required for authenticated
  tunnel discovery. Declining it must not block local providers.
- Tunnels are the first target contribution. SSH, Dev Containers, and future
  transports must be addable without changing `RemoteAgent`.
- Remote proxies are not automatically re-exported.

## Person 1: connectivity, discovery, and authentication

Own the path from a target description to an authenticated, initialized AHP
connection.

- [Person 1 mini-roadmap](./REMOTE_AGENT_CONNECTIVITY_ROADMAP.md)
- Host controls and activation/deactivation lifetime.
- Headless AHP client extraction.
- Node transport and fixed-endpoint connection.
- Open target-contribution/connection-factory boundary.
- Optional host-feature authentication.
- VS Code tunnel credential reuse and optional sign-in.
- Tunnel discovery, automatic connection, and transport reconnection.

Independent demo:

```text
enable feature
  -> satisfy optional tunnel authentication
  -> discover an authorized target
  -> initialize AHP
  -> read the provider/model catalog
```

Person 1 owns transport replay and reconnect state. This work must not depend on
`RemoteAgent`.

Likely primary files:

- [common/agentHostProtocolClient.ts](./common/agentHostProtocolClient.ts)
- [browser/agentHostProtocolClient.ts](./browser/agentHostProtocolClient.ts)
- [common/remoteAgentHostService.ts](./common/remoteAgentHostService.ts)
- [node/tunnelAgentHostService.ts](./node/tunnelAgentHostService.ts)
- [node/agentHostAuthenticationService.ts](./node/agentHostAuthenticationService.ts)
- [workbench Agent Host authentication](../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.ts)
- [Agents Window tunnel authentication](../../sessions/contrib/providers/remoteAgentHost/electron-browser/tunnelAgentHostServiceImpl.ts)

## Person 2: RemoteAgent and delegation

Own the path from an initialized connection to normal providers, sessions, and
tools in A.

- Remote provider registration and withdrawal/availability behavior.
- `RemoteAgent` implementation with conservative capability mapping.
- Chat/session identity mapping.
- Streaming, cancellation, errors, and history.
- Persisted backing and restoration.
- Permission and user-input routing.
- Client-tool execution.
- `create_remote_session`.
- Durable session-creation and tool-execution deduplication.

Independent demo:

```text
fake initialized connection or scripted AHP server
  -> contribute a normal provider
  -> create and complete a remote-backed chat
  -> execute and complete a client-tool callback
```

Person 2 must not know whether the connection uses a tunnel, SSH, a Dev
Container, or a test transport.

Likely primary files:

- [common/agent.ts](./common/agent.ts)
- [node/agentHostProviderService.ts](./node/agentHostProviderService.ts)
- New adapter files under `node/remoteAgent/`
- [node/agentService.ts](./node/agentService.ts)
- [node/shared/sessionServerTools.ts](./node/shared/sessionServerTools.ts)
- Protocol and provider tests under [test/](./test)

## Shared contract to settle before parallel coding

Person 1 delivers one lifetime-owned connection per admitted target:

```text
stable target identity
stable connector identity
stable AHP client identity
initialized protocol capabilities
requests, subscriptions, actions, and notifications
observable connection/reconnection state
explicit disposal ownership
```

Person 2 consumes only that contract. It must not depend on tunnel SDK types,
credential storage, discovery state, or renderer services.

Agree on these details together:

1. Target and endpoint identity formats.
2. Connection ownership and disposal.
3. Provider withdrawal versus temporary unavailability.
4. Capability and authentication metadata passed to the adapter.
5. Which bootstrap/interface files each person owns.
6. Disconnect, deletion, and remote-session release semantics.

Use the existing `IAgentConnection` and `IRemoteAgentHostProtocolClient` surfaces
as starting points. Do not add a second request/subscription abstraction unless
the headless extraction proves one is required.

## Integration checkpoints

1. **Fixed endpoint:** connect the real Person 1 client to Person 2's
   `RemoteAgent`; complete one two-host chat.
2. **Tunnel:** replace the fixed transport with an authenticated tunnel without
   changing `RemoteAgent`.
3. **Delegation:** B calls A's `create_remote_session`; C starts exactly one
   conversation represented by a normal session in A.
4. **Recovery:** jointly test disconnects, disablement, and ambiguous creation
   outcomes without duplicate sessions, turns, or tool execution.
5. **Workspace authority:** jointly define execution-location ownership before
   enabling real workspace-backed edits.

## Suggested first week

1. Jointly agree on the connection contract and file ownership.
2. Person 1 extracts the headless client seam and proves a fixed Node endpoint.
3. Person 2 builds a fake implementation of the contract and contributes a
   remote provider with a single workspace-less chat.
4. Integrate the fixed-endpoint two-host chat.
5. Person 1 proceeds to optional tunnel auth and discovery while Person 2
   proceeds to persistence, interactions, and the stub client tool.

## Initial non-goals

- Public extension API or external plugin loader.
- SSH or Dev Container implementations.
- Importing all existing sessions from B/C.
- Peer, fork, or subagent parity.
- Forwarding arbitrary upstream tools, customizations, or credentials.
- General cyclic federation.
- Real workspace-backed editing before the authority contract is settled.
