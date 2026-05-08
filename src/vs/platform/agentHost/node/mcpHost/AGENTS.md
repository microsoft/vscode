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
    2. `onUpstreamMessage` — records every server-→client message
       (notification or request) into AHP state.
    3. `setUpstreamCapabilities` — captures the upstream's
       `initialize` response capabilities so the host service can
       gate `ui/*` calls.
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
  the MCP Apps extension capability to client `initialize` requests
  while preserving everything else.
- **`mcpRpcEnvelope.ts`** — JSON-RPC ↔ `McpRpcMessage` adapters.
- **`mcpHostServiceImpl.ts`** — node-side `IMcpHostService`. Owns
  the per-(session, server) registry, drives `IMcpProxy` lifetimes,
  dispatches `mcp/*` actions through `AgentHostStateManager`, and
  routes `mcpMessage` calls.

## How it fits into AHP

1. A provider (e.g. `CopilotAgent`) advertises its MCP servers via
   `IAgent.getMcpServersForSession()` and fires
   `onDidMcpServersChange` whenever they change.
2. `AgentService` watches the provider event and calls
   `IMcpHostService.setSessionServers(session, defs)`.
3. The host service diffs against the live registry. For added
   servers it dispatches `mcp/serverAdded` (status `Starting`)
   immediately and kicks off async proxy creation. For removed ones
   it dispatches `mcp/serverRemoved` and disposes the proxy.
4. Once the proxy is bound, the host service hands its endpoint URI
   to the SDK via `toSdkMcpServers(...)` (in
   [../copilot/copilotPluginConverters.ts](../copilot/copilotPluginConverters.ts)).
   The SDK now connects over loopback HTTP.
5. Server-pushed messages flow `upstream → route → host service →
   AgentHostStateManager → ActionEnvelope → AHP client`. Client
   responses to upstream-originated requests come back via
   `dispatchAction({type: McpMessageResponded})`.

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
- **Method gating.** A method allowlist briefly existed in Phase 5a
  but was removed because traffic from the local AHP client to the
  host is trusted; gating is the SDK's responsibility upstream.
  `ui/*` is still gated by both client `mcp.apps` capability AND
  upstream advertising the `io.modelcontextprotocol/ui` extension.

## Tests

- [../../test/node/mcpHost/](../../test/node/mcpHost/) — unit tests for each module.
- [../../test/node/mcpHost/mcpProxy.integrationTest.ts](../../test/node/mcpHost/mcpProxy.integrationTest.ts) — end-to-end through the real listener.
- [../../test/node/mcpHost/mcpAppsRoundTrip.integrationTest.ts](../../test/node/mcpHost/mcpAppsRoundTrip.integrationTest.ts) — full MCP Apps lifecycle (initialize → notifications → upstream request → client response).
