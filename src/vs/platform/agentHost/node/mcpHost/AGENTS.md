# MCP host (`src/vs/platform/agentHost/node/mcpHost/`)

This folder implements the agent-host's MCP gateway. It owns one
lightweight HTTP proxy per MCP server that the host exposes to the
agent SDK (Copilot CLI today; Claude in the future). Every byte the
SDK exchanges with an MCP server flows through code in this folder.

## What lives here

- **`mcpProxy.ts`** — public façade and `IMcpProxyFactory`. Owns the
  shared HTTP listener; creates one `McpProxyRoute` per advertised
  server.
- **`mcpProxyHttpListener.ts`** — single shared `127.0.0.1:0`
  HTTP server. Routes are registered at randomized
  `/mcp/<uuid>/message` paths. Loopback-only by design.
- **`mcpProxyRoute.ts`** — per-server JSON-RPC bridge. Blind
  pass-through with three taps:
    1. `IInitializeInjector` — adds extension capabilities to
       client-→upstream `initialize` requests (e.g. MCP Apps).
    2. `onUpstreamRequest(method, params)` — invoked for every
       JSON-RPC **request** the upstream emits. Returns a
       `Promise<IUpstreamRequestOutcome>` whose result or error is
       written back to the upstream as a JSON-RPC response using the
       original request id.
    3. `onUpstreamNotification(method, params)` — invoked for every
       JSON-RPC **notification** the upstream emits. Fire-and-forget.
- **`mcpUpstream.ts`** — `IMcpUpstream` abstraction. Implementations:
    - `mcpStdioUpstream.ts` — spawns a child process on demand
      (lazy spawn — see plan §3.4).
    - `mcpHttpUpstream.ts` — HTTP discovery handshake; parses
      `WWW-Authenticate` for RFC 9728 / RFC 6750 challenges.
- **`mcpStdioStateHandler.ts`** — graceful shutdown for stdio
  children (stdin.end → SIGTERM → SIGKILL). Inlined copy of the
  workbench helper to avoid a layer-violating import.
- **`mcpAuthChallengeParser.ts`** — defensive `WWW-Authenticate`
  parser; turns 401/403 + RFC 9728 metadata into an
  `McpServerStatusAuthRequired`.
- **`mcpInitializeInjector.ts`** — `McpAppsInitializeInjector` adds
  the MCP Apps extension capability to the SDK→upstream `initialize`
  request while preserving everything else. Independent of AHP
  capability negotiation; the upstream MCP server decides whether
  it speaks Apps based on this extension.
- **`mcpHostServiceImpl.ts`** — node-side `IMcpHostService`. Owns
  the per-(session, server) registry, drives `IMcpProxy` lifetimes,
  dispatches `session/mcpServer*` actions through
  `AgentHostStateManager`, routes `mcpMethodCall` and
  `mcpNotification` traffic, and forwards upstream-originated MCP
  requests and notifications to whichever AHP client owns the
  session via `IMcpHostUpstreamDelegate`.

## How it fits into AHP

1. A provider (e.g. `CopilotAgent`) advertises its MCP servers via
   `IAgent.getMcpServersForSession()` and fires
   `onDidMcpServersChange` whenever they change.
2. `AgentService` watches the provider event and calls
   `IMcpHostService.setSessionServers(session, defs)`.
3. The host service diffs against the live registry. For added
   servers it dispatches `session/mcpServerAdded` (status `Starting`)
   immediately and kicks off async proxy creation. For removed ones
   it dispatches `session/mcpServerRemoved` and disposes the proxy.
4. Once the proxy is bound, the host service hands its endpoint URI
   to the SDK via `toSdkMcpServers(...)` (in
   [../copilot/copilotPluginConverters.ts](../copilot/copilotPluginConverters.ts)).
   The SDK now connects over loopback HTTP.
5. JSON-RPC traffic now flows directly through the bidirectional
   `mcpMethodCall` / `mcpNotification` methods on the AHP wire — there
   is no per-server state mailbox. Upstream-originated requests are
   round-tripped via the host service's installed
   `IMcpHostUpstreamDelegate` (typically `ProtocolServerHandler`),
   which issues a reverse `mcpMethodCall` to the AHP client and
   writes the client's result back as the upstream JSON-RPC response.
   Upstream-originated notifications are likewise forwarded via the
   delegate's `handleUpstreamNotification`, which sends an outbound
   `mcpNotification` to the AHP client.

## Authentication

- HTTP MCP servers may return 401/403 with a `WWW-Authenticate`
  Bearer challenge. `mcpHttpUpstream.ts` handles the discovery.
- The proxy publishes `McpServerStatusAuthRequired` to AHP; clients
  push tokens via `authenticate({ resource, token, server })` (see
  protocol §4.5 + Phase 4d).
- Per-server scoping: tokens are stored only on the named handle;
  other servers sharing the same `resource` URL keep separate state.

## Lifecycle constraints

- **Lazy stdio spawn.** Children are not spawned until the SDK
  POSTs to the proxy endpoint. Spawn failure surfaces as
  `McpServerStatusKind.Error`.
- **HTTP probe is real.** `McpHttpUpstream.start()` sends a real
  `initialize` to the upstream during discovery. Server-bearing
  servers will see the probe; this is acceptable per MCP.
- **First-message race.** The first SDK config after session
  materialization may have an empty `mcpServers` list because proxy
  endpoints bind asynchronously. The next plugins-change cycle
  picks up the endpoints. See [MCP_AHP_PLAN](../../../../../../MCP_AHP_PLAN.md) §4c.
- **No SSE today.** Upstream-originated messages on HTTP are
  recorded in AHP state but not pushed back to the SDK. Real
  bidirectional flow is a Phase 6 follow-up.

## Known gaps tracked for follow-up

- **Telemetry.** `ITelemetryService` is not wired into the agent
  host process. Plan §6.2 sketches events; implementation requires
  a separate-process telemetry channel and is deferred.
- **Sandboxing parity.** Stdio children spawn unsandboxed; matches
  the existing workbench gateway. See the TODO comment in
  [mcpStdioUpstream.ts](mcpStdioUpstream.ts) and plan §6.3.
- **Per-tool MCP App capability negotiation.** MCP App support is
  now negotiated per tool call via `_meta.uiHostCapabilities` on tool
  call states (see `AhpMcpUiHostCapabilities` in the protocol).
  CopilotAgent does not yet surface MCP App tool calls; when it
  does, the producer must populate `_meta.ui` and
  `_meta.uiHostCapabilities` with the subset of capabilities the
  host actually proxies.

## Tests

- [../../test/node/mcpHost/](../../test/node/mcpHost/) — unit tests for each module.
- [../../test/node/mcpHost/mcpProxy.integrationTest.ts](../../test/node/mcpHost/mcpProxy.integrationTest.ts) — end-to-end through the real listener.
- [../../test/node/mcpHost/mcpAppsRoundTrip.integrationTest.ts](../../test/node/mcpHost/mcpAppsRoundTrip.integrationTest.ts) — full MCP Apps lifecycle (initialize → notifications → upstream request → client response).
