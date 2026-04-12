# Agent host design decisions

> **Keep this document in sync with the code.** Any change to the agent-host protocol, tool rendering approach, or architectural boundaries must be reflected here. If you add a new `toolKind`, change how tool-specific data is populated, or modify the separation between agent-specific and generic code, update this document as part of the same change.

Design decisions and principles for the agent-host feature. For process architecture and IPC details, see [architecture.md](architecture.md). For the client-server state protocol, see [protocol.md](protocol.md).

## Agent-agnostic protocol

**The protocol between the agent-host process and clients must remain agent-agnostic.** This is a hard rule.

There are two protocol layers:

1. **`IAgent` interface** (`common/agentService.ts`) - the internal interface that each agent backend (CopilotAgent, MockAgent) implements. It fires `IAgentProgressEvent`s (raw SDK events: `delta`, `tool_start`, `tool_complete`, etc.). This layer is agent-specific.

2. **Sessions state protocol** (`common/state/`) - the client-facing protocol. The server maps raw `IAgentProgressEvent`s into state actions (`session/delta`, `session/toolStart`, etc.) via `agentEventMapper.ts`. Clients receive immutable state snapshots and action streams via JSON-RPC over WebSocket or MessagePort. **This layer is agent-agnostic.**

All agent-specific logic -- translating tool names like `bash`/`view`/`grep` into display strings, extracting command lines from tool parameters, determining rendering hints like `toolKind: 'terminal'` -- lives in `copilotToolDisplay.ts` inside the agent-host process. These display-ready fields are carried on `IAgentToolStartEvent`/`IAgentToolCompleteEvent`, which `agentEventMapper.ts` then maps into `session/toolStart` and `session/toolComplete` state actions.

Clients (renderers) never see agent-specific tool names. They consume `IToolCallState` and `ICompletedToolCall` from the session state tree, which carry generic display-ready fields (`displayName`, `invocationMessage`, `toolKind`, etc.).

## Provider-agnostic renderer contributions

The renderer contributions (`AgentHostSessionHandler`, `AgentHostSessionListController`, `AgentHostLanguageModelProvider`) are **completely generic**. They receive all provider-specific details via `IAgentHostSessionHandlerConfig`:

```typescript
interface IAgentHostSessionHandlerConfig {
    readonly provider: AgentProvider;    // 'copilot'
    readonly agentId: string;            // e.g. 'agent-host'
    readonly sessionType: string;        // e.g. 'agent-host'
    readonly fullName: string;           // e.g. 'Agent Host - Copilot'
    readonly description: string;
}
```

A single `AgentHostContribution` discovers agents via `listAgents()` and dynamically registers each one. Adding a new provider means adding a new `IAgent` implementation in the server process. No changes needed to the handler, list controller, or model provider.

## State-based rendering

The renderer subscribes to session state via `SessionClientState` (write-ahead reconciliation) and converts immutable state changes to `IChatProgress[]` via `stateToProgressAdapter.ts`. This adapter is the only place that inspects protocol state fields like `toolKind`:

- **Shell commands** (`toolKind: 'terminal'`): Converted to `IChatTerminalToolInvocationData` with the command in a syntax-highlighted code block, output displayed below, and exit code for success/failure styling.
- **Everything else**: Converted to `ChatToolInvocation` using `invocationMessage` (while running) and `pastTenseMessage` (when complete).

The adapter never checks tool names - it operates purely on the generic state fields.

## Copilot SDK tool name mapping

The Copilot CLI uses built-in tools. Tool names and parameter shapes are not typed in the SDK (`toolName` is `string`) - they come from the CLI server. The interfaces in `copilotToolDisplay.ts` are derived from observing actual CLI events.

| SDK tool name | Display name | Rendering |
|---|---|---|
| `bash` | Bash | Terminal (`toolKind: 'terminal'`, language `shellscript`) |
| `powershell` | PowerShell | Terminal (`toolKind: 'terminal'`, language `powershell`) |
| `view` | View File | Progress message |
| `edit` | Edit File | Progress message |
| `write` | Write File | Progress message |
| `grep` | Search | Progress message |
| `glob` | Find Files | Progress message |
| `web_search` | Web Search | Progress message |

This mapping lives in `copilotToolDisplay.ts` and is the only place that knows about Copilot-specific tool names.

## Model ownership

The SDK makes its own LM requests using the GitHub token. VS Code does not make direct LM calls for agent-host sessions.

Each agent's models are published to root state via the `root/agentsChanged` action. The renderer's `AgentHostLanguageModelProvider` exposes these in the model picker. The selected model ID is passed to `createSession({ model })`. The `sendChatRequest` method throws - agent-host models aren't usable for direct LM calls, only for the agent loop.

## Setting gate

The entire feature is controlled by `chat.agentHost.enabled` (default `false`), defined as `AgentHostEnabledSettingId` in `agentService.ts`. When disabled:
- The main process does not spawn the agent host utility process
- The renderer does not connect via MessagePort
- No agents, sessions, or model providers are registered
- No agent-host entries appear in the UI

## Multi-client state synchronization

The sessions process uses a redux-like state model where all mutations flow through a discriminated union of actions processed by pure reducer functions. This design supports multiple connected clients seeing a synchronized view:

- **Server-authoritative state**: The server holds the canonical state tree. Clients receive snapshots and incremental actions.
- **Write-ahead with reconciliation**: Clients optimistically apply their own actions locally (e.g., approving a permission, sending a message) and reconcile when the server echoes them back. Actions carry `(clientId, clientSeq)` tags for echo matching.
- **Lazy loading**: Clients connect with lightweight session metadata (enough for a sidebar list) and subscribe to full session state on demand. Large content (images, tool outputs) uses `ContentRef` placeholders fetched separately.
- **Forward-compatible versioning**: A single protocol version number maps to a `ProtocolCapabilities` object. Newer clients check capabilities before using features unavailable on older servers.

Details and type definitions are in [protocol.md](protocol.md) and `common/state/`.
