# Agent host design decisions

> **Keep this document in sync with the code.** Any change to the agent-host protocol, tool rendering approach, or architectural boundaries must be reflected here. If you add a new `toolKind`, change how tool-specific data is populated, or modify the separation between agent-specific and generic code, update this document as part of the same change.

Design decisions and principles for the agent-host feature. For process architecture and IPC details, see [architecture.md](architecture.md). For the task backlog, see [backlog.md](backlog.md).

## Agent-agnostic protocol

**The IPC protocol between the agent-host process and the renderer must remain agent-agnostic.** This is a hard rule.

The renderer-side code (contributions in `agentHost/` and the `AgentHostSessionHandler`) must never contain knowledge of specific agent tool names, parameter shapes, or SDK-specific behavior. It consumes display-ready fields from the protocol and renders them generically.

All agent-specific logic -- translating tool names like `shell`/`view`/`grep` into display strings, extracting command lines from tool parameters, determining rendering hints like `toolKind: 'terminal'` -- lives exclusively in the agent-host process layer (`src/vs/platform/agent/node/`), specifically in `copilotToolDisplay.ts` (for Copilot) and `claudeToolDisplay.ts` (for Claude).

What this means concretely:

- `IAgentToolStartEvent` carries `displayName`, `invocationMessage`, `toolInput`, and `toolKind` -- all computed by the agent-host from SDK-specific data.
- `IAgentToolCompleteEvent` carries `pastTenseMessage` and `toolOutput` -- also computed agent-side.
- The renderer creates `ChatToolInvocation` objects and `toolSpecificData` (e.g., `IChatTerminalToolInvocationData`) purely from these protocol fields.
- If we add a new agent provider, only the agent-host process code needs to change. The renderer and the protocol shape stay the same.

## Provider-agnostic renderer contributions

The renderer contributions (`AgentHostSessionHandler`, `AgentHostSessionListController`, `AgentHostLanguageModelProvider`) are **completely generic**. They receive all provider-specific details via `IAgentHostSessionHandlerConfig`:

```typescript
interface IAgentHostSessionHandlerConfig {
    readonly provider: AgentProvider;    // 'copilot' | 'claude'
    readonly agentId: string;            // e.g. 'agent-host'
    readonly sessionType: string;        // e.g. 'agent-host'
    readonly fullName: string;           // e.g. 'Agent Host - Copilot'
    readonly description: string;
}
```

Adding a new provider means adding a new `IAgent` implementation in the utility process and a new contribution class in the renderer that creates an `AgentHostSessionHandler` with the right config. No changes needed to the handler, list controller, or model provider.

## Tool rendering

Tools from the agent-host render using the same UI components as VS Code's native chat agent. The protocol carries enough information for the renderer to choose the right rendering without knowing tool names:

- **Shell commands** (`toolKind: 'terminal'`): Rendered as `IChatTerminalToolInvocationData` with the command in a syntax-highlighted code block, output displayed below, and exit code for success/failure styling. The renderer checks `toolKind === 'terminal'` and `toolInput` to decide this -- it never checks the tool name.
- **Everything else**: Rendered via `ChatToolProgressSubPart` using `invocationMessage` (while running) and `pastTenseMessage` (when complete). No `toolSpecificData` is set -- the standard progress/completion UI handles it.

## Copilot SDK tool name mapping

The Copilot CLI uses these built-in tools. Tool names and parameter shapes are not typed in the SDK (`toolName` is `string`) -- they come from the CLI server. The interfaces in `copilotToolDisplay.ts` are derived from observing actual CLI events.

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

## Model ownership -- open question

When using the agent-host, do we need VS Code's own Copilot model access at all, or does everything flow through the SDK? Key questions:

- **Does VS Code need independent model access?** The SDK makes its own LM requests using the GitHub token. If all agent-host interactions go through the SDK, VS Code never directly calls a model.
- **Can the model lists diverge?** The SDK's available models depend on the CLI version and server-side configuration.
- **What about BYOK?** The SDK doesn't support custom endpoints. Agent-host sessions should only show SDK models, not BYOK models.
- **Current approach:** Each provider contribution registers an `AgentHostLanguageModelProvider` that exposes SDK models in the picker. The selected model ID is passed to `createSession({ model })`. The `sendChatRequest` method throws -- agent-host models aren't usable for direct LM calls, only for the agent loop.

## Setting gate

The entire feature is controlled by `chat.agentHost.enabled` (default `false`), defined as `AgentHostEnabledSettingId` in `agentService.ts`. When disabled:
- The main process does not spawn the agent host utility process
- The renderer does not connect via MessagePort
- No agents, sessions, or model providers are registered
- No agent-host entries appear in the UI

## Separate contributions per provider

Each agent provider (Copilot, Claude) has its own independent workbench contribution class (`CopilotAgentHostContribution`, `ClaudeAgentHostContribution`). This ensures providers can be added, removed, or modified independently without affecting each other.
