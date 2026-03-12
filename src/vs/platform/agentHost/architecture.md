# Agent host process architecture

> **Keep this document in sync with the code.** If you change the IPC contract, add new event types, modify the process lifecycle, or restructure files, update this document as part of the same change.

For design decisions, see [design.md](design.md). For the client-server state protocol, see [protocol.md](protocol.md). For chat session wiring, see [sessions.md](sessions.md).

## Overview

The agent host runs as either an Electron **utility process** (desktop) or a **standalone WebSocket server** (headless / development). It hosts agent backends (CopilotAgent, MockAgent) and exposes session state to clients through two communication layers:

1. **MessagePort / ProxyChannel** (desktop only) -- the renderer connects directly to the utility process via MessagePort. `AgentHostServiceClient` proxies `IAgentService` methods and forwards action/notification events.
2. **WebSocket / JSON-RPC protocol** (standalone server) -- multiple clients connect over WebSocket. Session state is synchronized via actions, subscriptions, and write-ahead reconciliation. See [protocol.md](protocol.md) for the full specification.

In both modes, the server holds an authoritative state tree (`SessionStateManager`) mutated by actions flowing through pure reducers. Raw `IAgentProgressEvent`s from agent backends are mapped to state actions via `agentEventMapper.ts`.

The entire feature is gated behind the `chat.agentHost.enabled` setting (default `false`). When disabled, the process is not spawned and no agents are registered.

## Process Model

```
+--------------------------------------------------------------+
|  Renderer Window (Desktop)                                    |
|                                                               |
|  AgentHostContribution (discovers agents via listAgents())    |
|    +-- per agent: SessionHandler, ListCtrl, LMProvider        |
|    +-- SessionClientState (write-ahead reconciliation)        |
|    +-- stateToProgressAdapter (state -> IChatProgress[])      |
|                                                               |
|  AgentHostServiceClient (IAgentHostService singleton)         |
|    +-- ProxyChannel over delayed MessagePort                  |
|        (revive() applied to event payloads)                   |
+---------------- MessagePort (direct) -------------------------+
|  Agent Host Utility Process (agentHostMain.ts)                |
|  -- or --                                                     |
|  Standalone Server (agentHostServerMain.ts)                   |
|                                                               |
|  SessionStateManager (server-authoritative state tree)        |
|    +-- rootReducer / sessionReducer                           |
|    +-- action envelope sequencing                             |
|                                                               |
|  ProtocolServerHandler (JSON-RPC routing, broadcasts)         |
|    +-- per-client subscriptions, replay buffer                |
|                                                               |
|  Agent registry (Map<AgentProvider, IAgent>)                  |
|    +-- CopilotAgent (id='copilot')                            |
|    |     +-- CopilotClient (@github/copilot-sdk)              |
|    +-- ScriptedMockAgent (id='mock', opt-in via flag)         |
|                                                               |
|  agentEventMapper.ts                                          |
|    +-- IAgentProgressEvent -> ISessionAction mapping          |
+---------------- UtilityProcess lifecycle ---------------------+
|  Main Process (Desktop only)                                  |
|                                                               |
|  ElectronAgentHostStarter (IAgentHostStarter)                 |
|    +-- Spawns utility process, brokers MessagePort to windows |
|  AgentHostProcessManager                                      |
|    +-- Lazy start on first window connection, crash recovery  |
+---------------------------------------------------------------+
```

## File Layout

```
src/vs/platform/agentHost/
+-- common/
|   +-- agent.ts              # IAgentHostStarter, IAgentHostConnection (starter contract)
|   +-- agentService.ts       # IAgent, IAgentService, IAgentHostService interfaces,
|                              # IPC data types, IAgentProgressEvent union,
|                              # AgentSession namespace (URI helpers),
|                              # AgentHostEnabledSettingId
|   +-- state/
|       +-- sessionState.ts        # Immutable state types (RootState, SessionState, Turn, etc.)
|       +-- sessionActions.ts      # Action discriminated union + ActionEnvelope + Notifications
|       +-- sessionReducers.ts     # Pure reducer functions (rootReducer, sessionReducer)
|       +-- sessionProtocol.ts     # JSON-RPC message types, request params/results
|       +-- sessionCapabilities.ts # Version constants + ProtocolCapabilities
|       +-- sessionClientState.ts  # Client-side state manager with write-ahead reconciliation
|       +-- sessionTransport.ts    # IProtocolTransport / IProtocolServer abstractions
|       +-- versions/
|           +-- v1.ts              # v1 wire format types (tip -- editable, compiler-enforced compat)
|           +-- versionRegistry.ts # Compile-time compat checks + runtime action->version map
+-- electron-browser/
|   +-- agentHostService.ts   # AgentHostServiceClient (renderer singleton, direct MessagePort)
+-- electron-main/
|   +-- electronAgentHostStarter.ts  # Spawns utility process, brokers MessagePort connections
+-- node/
|   +-- agentHostMain.ts      # Entry point inside the Electron utility process
|   +-- agentHostServerMain.ts # Entry point for standalone WebSocket server
|   +-- agentService.ts       # AgentService: dispatches to registered IAgent providers
|   +-- agentHostService.ts   # AgentHostProcessManager: lifecycle, crash recovery
|   +-- agentEventMapper.ts   # Maps IAgentProgressEvent -> ISessionAction
|   +-- sessionStateManager.ts # Server-authoritative state tree + reducer dispatch
|   +-- protocolServerHandler.ts # JSON-RPC routing, client subscriptions, action broadcast
|   +-- webSocketTransport.ts # WebSocket IProtocolTransport + IProtocolServer impl
|   +-- nodeAgentHostStarter.ts # Node.js (non-Electron) starter
|   +-- copilot/
|       +-- copilotAgent.ts       # CopilotAgent: IAgent backed by Copilot SDK
|       +-- copilotSessionWrapper.ts
|       +-- copilotToolDisplay.ts # Copilot-specific tool name -> display string mapping
+-- test/
    +-- (test files)

src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/
+-- agentHostChatContribution.ts      # AgentHostContribution: discovers agents, registers dynamically
+-- agentHostLanguageModelProvider.ts # ILanguageModelChatProvider for SDK models
+-- agentHostSessionHandler.ts        # AgentHostSessionHandler: generic, config-driven
+-- agentHostSessionListController.ts # Lists persisted sessions from agent host
+-- stateToProgressAdapter.ts         # Converts protocol state -> IChatProgress[] for chat UI

src/vs/workbench/contrib/chat/electron-browser/
+-- chat.contribution.ts      # Desktop-only: registers AgentHostContribution
```

## Session URIs

Sessions are identified by URIs where the **scheme is the provider name** and the **path is the raw session ID**: `copilot:/<uuid>`. Helper functions in the `AgentSession` namespace:

| Helper | Purpose |
|---|---|
| `AgentSession.uri(provider, rawId)` | Create a session URI |
| `AgentSession.id(session)` | Extract raw session ID from URI |
| `AgentSession.provider(session)` | Extract provider name from URI scheme |

The renderer uses UI resource schemes (`agent-host-copilot`) for session resources. The `AgentHostSessionHandler` converts these to provider URIs before IPC calls.

## Communication Layers

### Layer 1: IAgent interface (internal)

The `IAgent` interface in `agentService.ts` is what each agent backend implements. It fires `IAgentProgressEvent`s (raw SDK events) and exposes methods for session management:

| Method | Description |
|---|---|
| `createSession(config?)` | Create a new session (returns session URI) |
| `sendMessage(session, prompt, attachments?)` | Send a user message |
| `abortSession(session)` | Abort the current turn |
| `respondToPermissionRequest(requestId, approved)` | Grant/deny a permission |
| `getDescriptor()` | Return agent metadata |
| `listModels()` | List available models |
| `listSessions()` | List persisted sessions |
| `setAuthToken(token)` | Set auth credentials |
| `changeModel?(session, model)` | Change model for a session |

### Layer 2: Sessions state protocol (client-facing)

The server maps raw `IAgentProgressEvent`s to state actions via `agentEventMapper.ts`, dispatches them through `SessionStateManager`, and broadcasts to subscribed clients. See [protocol.md](protocol.md) for the full JSON-RPC specification, action types, state model, and versioning.

### Layer 3: MessagePort relay (desktop renderer)

`AgentHostServiceClient` in `electron-browser/agentHostService.ts` connects to the utility process via MessagePort and proxies `IAgentService` methods. It also forwards action envelopes and notifications as events so the renderer can feed them into `SessionClientState`.

## How It Works

### Setting Gate

The `chat.agentHost.enabled` setting (default `false`) controls the entire feature:
- **Main process** (`app.ts`): skips creating `ElectronAgentHostStarter` + `AgentHostProcessManager`
- **Renderer proxy** (`AgentHostServiceClient`): skips MessagePort connection
- **Contribution** (`AgentHostContribution`): returns early without discovering or registering agents

### Startup (lazy)

1. `ElectronAgentHostStarter` is created in `app.ts` (if setting enabled) and handed to `AgentHostProcessManager`.
2. The utility process is **not** spawned until the first window requests a MessagePort connection.
3. On start, the starter spawns the utility process with entry point `vs/platform/agent/node/agentHostMain`.
4. Each renderer window gets its own MessagePort via `acquirePort('vscode:createAgentHostMessageChannel', ...)`.

### Standalone Server Mode

The agent host can also run as a standalone WebSocket server (`agentHostServerMain.ts`):

```bash
node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--enable-mock-agent]
```

This mode creates a `WebSocketProtocolServer` and `ProtocolServerHandler` directly without Electron. Useful for development and headless scenarios.

### Dynamic Agent Discovery

On startup (if the setting is enabled), `AgentHostContribution` calls `listAgents()` to discover available backends from the agent host process. Each returned `IAgentDescriptor` contains:

| Field | Purpose |
|---|---|
| `provider` | Agent provider ID (`'copilot'`) |
| `displayName` | Human-readable name for UI |
| `description` | Description string |
| `requiresAuth` | Whether the renderer should push a GitHub auth token |

For each descriptor, the contribution dynamically registers:
- Chat session contribution (type = `agent-host-{provider}`)
- `AgentHostSessionHandler` configured with the descriptor's metadata
- `AgentHostSessionListController` for the session sidebar
- `AgentHostLanguageModelProvider` for the model picker
- Auth token wiring (only if `requiresAuth` is true)

### Auth Token Flow

Only agents with `requiresAuth: true` (currently Copilot) get auth wiring:
1. On startup and on account/session changes, retrieves the GitHub OAuth token
2. Pushes it to the agent host via `IAgentHostService.setAuthToken(token)`
3. `CopilotAgent` passes it to `CopilotClient({ githubToken })` on next client creation

### Crash Recovery

`AgentHostProcessManager` monitors the utility process exit. On unexpected termination, it automatically restarts (up to 5 times).

## Build / Packaging

| File | Purpose |
|---|---|
| `build/next/index.ts` | Agent host entry point in esbuild config |
| `build/buildfile.ts` | Agent host entry point in legacy bundler config |
| `build/gulpfile.vscode.ts` | Strip wrong-arch copilot packages; ASAR unpack copilot binaries |
| `build/.moduleignore` | Strip unnecessary copilot prebuilds/ripgrep/clipboard |
| `build/darwin/create-universal-app.ts` | macOS universal binary support for copilot CLI |
| `build/darwin/verify-macho.ts` | Skip copilot binaries in Mach-O verification |

## Closest Analogs

| Component | Pattern | Key Difference |
|---|---|---|
| **Pty Host** | Singleton utility process, MessagePort, lazy start, crash recovery | Also has heartbeat monitoring and reconnect logic |
| **Shared Process** | Singleton utility process, MessagePort | Much heavier, hosts many services |
| **Extension Host** | Per-window utility process, custom `RPCProtocol` | Uses custom RPC, not standard channels |
