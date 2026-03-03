# Agent host process architecture

> **Keep this document in sync with the code.** If you change the IPC contract, add new event types, modify the process lifecycle, or restructure files, update this document as part of the same change.

For design decisions, see [design.md](design.md). For the task backlog, see [backlog.md](backlog.md). For chat session wiring, see [sessions.md](sessions.md).

## Overview

The agent host is a dedicated Electron **utility process** that runs the [Copilot SDK](https://github.com/github/copilot-sdk) (`@github/copilot-sdk`) and the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) (`@anthropic-ai/claude-agent-sdk`) in isolation. It follows the same pattern as the **pty host** (`src/vs/platform/terminal/`), communicating over **MessagePort** via the standard `ProxyChannel` IPC infrastructure.

The renderer connects **directly** to the utility process via MessagePort (bypassing the main process for all agent service calls). Each agent provider (Copilot, Claude) has its own independent workbench contribution that registers a dynamic chat agent, session item controller, session content provider, and language model provider.

The entire feature is gated behind the `chat.agentHost.enabled` setting (default `false`). When disabled, the process is not spawned and no agents are registered.

## Process Model

```
+--------------------------------------------------------------+
|  Renderer Window                                              |
|                                                               |
|  CopilotAgentHostContribution    ClaudeAgentHostContribution  |
|    +-- AgentHostSessionHandler     +-- AgentHostSessionHandler |
|    +-- AgentHostSessionListCtrl    +-- AgentHostSessionListCtrl|
|    +-- AgentHostLMProvider         +-- AgentHostLMProvider     |
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
|    +-- ClaudeAgent  (id='claude')                             |
|          +-- ClaudeSession (@anthropic-ai/claude-agent-sdk)   |
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
    +-- claude/
        +-- claudeAgent.ts        # ClaudeAgent: IAgent backed by Claude Agent SDK
        +-- claudeSession.ts      # Claude SDK session wrapper
        +-- claudeToolDisplay.ts  # Claude-specific tool display mapping

src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/
+-- agentHostChatContribution.ts      # CopilotAgentHostContribution + ClaudeAgentHostContribution
+-- agentHostConstants.ts             # Session type, agent ID, model vendor constants
+-- agentHostLanguageModelProvider.ts # ILanguageModelChatProvider for SDK models
+-- agentHostSessionHandler.ts        # AgentHostSessionHandler: generic, config-driven
+-- agentHostSessionListController.ts # Lists persisted sessions from agent host

src/vs/workbench/contrib/chat/electron-browser/
+-- chat.contribution.ts      # Desktop-only: registers both contributions
```

## Session URIs

Sessions are identified by URIs where the **scheme is the provider name** and the **path is the raw session ID**: `copilot:/<uuid>` or `claude:/<uuid>`. Helper functions in the `AgentSession` namespace:

| Helper | Purpose |
|---|---|
| `AgentSession.uri(provider, rawId)` | Create a session URI |
| `AgentSession.id(session)` | Extract raw session ID from URI |
| `AgentSession.provider(session)` | Extract provider name from URI scheme |

The renderer uses UI resource schemes (`agent-host`, `agent-host-claude`) for session resources. The `AgentHostSessionHandler` converts these to provider URIs before IPC calls.

## IPC Contract (`IAgentService`)

Methods proxied across MessagePort via `ProxyChannel`. URI arguments are auto-marshalled; event payload URIs require manual `URI.revive()` on the renderer side.

| Method | Description |
|---|---|
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
- **Contributions** (`CopilotAgentHostContribution`, `ClaudeAgentHostContribution`): return early without registering

### Startup (lazy)

1. `ElectronAgentHostStarter` is created in `app.ts` (if setting enabled) and handed to `AgentHostProcessManager`.
2. The utility process is **not** spawned until the first window requests a MessagePort connection.
3. On start, the starter spawns the utility process with entry point `vs/platform/agent/node/agentHostMain`.
4. Each renderer window gets its own MessagePort via `acquirePort('vscode:createAgentHostMessageChannel', ...)`.

### Per-Provider Contributions

Each provider has its own independent contribution class:

| Contribution | Provider | Registers |
|---|---|---|
| `CopilotAgentHostContribution` | `copilot` | Session handler, list controller, model provider, auth token push |
| `ClaudeAgentHostContribution` | `claude` | Session handler, list controller, model provider |

The `AgentHostSessionHandler` is generic: it receives all provider-specific details via `IAgentHostSessionHandlerConfig` (`provider`, `agentId`, `sessionType`, `fullName`, `description`). No provider-specific branching in the handler.

### Auth Token Flow

Only `CopilotAgentHostContribution` handles auth (Claude uses its own API key):
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
