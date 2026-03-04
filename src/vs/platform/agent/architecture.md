# Agent host process architecture

> **Keep this document in sync with the code.** If you change the IPC contract, add new event types, modify the process lifecycle, or restructure files, update this document as part of the same change.

For design decisions, see [design.md](design.md). For the task backlog, see [backlog.md](backlog.md). For chat session wiring, see [sessions.md](sessions.md).

## Overview

The agent host is a dedicated Electron **utility process** that runs the [Copilot SDK](https://github.com/github/copilot-sdk) (`@github/copilot-sdk`) in isolation. It follows the same pattern as the **pty host** (`src/vs/platform/terminal/`), communicating over **MessagePort** via the standard `ProxyChannel` IPC infrastructure.

The renderer connects **directly** to the utility process via MessagePort (bypassing the main process for all agent service calls). A single workbench contribution (`AgentHostContribution`) discovers available agents from the agent host via `listAgents()` and dynamically registers each one as a chat session type with its own handler, list controller, and model provider.

The entire feature is gated behind the `chat.agentHost.enabled` setting (default `false`). When disabled, the process is not spawned and no agents are registered.

## Process Model

```
+--------------------------------------------------------------+
|  Renderer Window                                              |
|                                                               |
|  AgentHostContribution (discovers agents via listAgents())    |
|    +-- per agent: SessionHandler, ListCtrl, LMProvider        |
|                                                               |
|  AgentHostServiceClient (IAgentHostService singleton)         |
|    +-- ProxyChannel over delayed MessagePort                  |
|        (URI.revive() applied to event payloads)               |
+---------------- MessagePort (direct) -------------------------+
|  Agent Host Utility Process (agentHostMain.ts)                |
|                                                               |
|  AgentService (IAgentService)                                 |
|    +-- CopilotAgent (id='copilot')                            |
|    |     +-- CopilotClient (@github/copilot-sdk)              |
|                                                               |
|  Exposed via ProxyChannel on AgentHostIpcChannels.AgentHost   |
+---------------- UtilityProcess lifecycle ---------------------+
|  Main Process                                                 |
|                                                               |
|  ElectronAgentHostStarter (IAgentHostStarter)                 |
|    +-- Spawns utility process, brokers MessagePort to windows |
|  AgentHostProcessManager                                      |
|    +-- Lazy start on first window connection, crash recovery  |
+---------------------------------------------------------------+
```

## File Layout

```
src/vs/platform/agent/
+-- common/
|   +-- agent.ts              # IAgentHostStarter, IAgentHostConnection (starter contract)
|   +-- agentService.ts       # IAgent, IAgentService, IAgentHostService interfaces,
|                              # IPC data types, AgentSession namespace (URI helpers),
|                              # AgentHostEnabledSettingId
+-- electron-browser/
|   +-- agentHostService.ts   # AgentHostServiceClient (renderer singleton, direct MessagePort)
+-- electron-main/
|   +-- electronAgentHostStarter.ts  # Spawns utility process, brokers MessagePort connections
+-- node/
    +-- agentHostMain.ts      # Entry point inside the utility process
    +-- agentService.ts       # AgentService: dispatches to registered IAgent providers
    +-- agentHostService.ts   # AgentHostProcessManager: lifecycle, crash recovery
    +-- copilot/
    |   +-- copilotAgent.ts       # CopilotAgent: IAgent backed by Copilot SDK
    |   +-- copilotSessionWrapper.ts
    |   +-- copilotToolDisplay.ts # Copilot-specific tool name -> display string mapping

src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/
+-- agentHostChatContribution.ts      # AgentHostContribution: discovers agents, registers dynamically
+-- agentHostLanguageModelProvider.ts # ILanguageModelChatProvider for SDK models
+-- agentHostSessionHandler.ts        # AgentHostSessionHandler: generic, config-driven
+-- agentHostSessionListController.ts # Lists persisted sessions from agent host

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

## IPC Contract (`IAgentService`)

Methods proxied across MessagePort via `ProxyChannel`. URI arguments are auto-marshalled; event payload URIs require manual `URI.revive()` on the renderer side.

| Method | Description |
|---|---|
| `listAgents()` | Discover available agent backends (returns `IAgentDescriptor[]`) |
| `setAuthToken(token)` | Push GitHub OAuth token for Copilot SDK auth |
| `listModels()` | List available models from all providers |
| `listSessions()` | List all persisted sessions from all providers |
| `createSession(config?)` | Create a new session (returns session URI) |
| `sendMessage(session, prompt)` | Send a user message into a session |
| `getSessionMessages(session)` | Get session history for reconstruction |
| `disposeSession(session)` | Dispose a session and free resources |
| `shutdown()` | Gracefully shut down all sessions |

Events:
- `onDidSessionProgress`: streaming progress (`delta`, `message`, `idle`, `tool_start`, `tool_complete`). Each event carries a `session: URI`.

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
