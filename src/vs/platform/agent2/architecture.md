# Native Agent Loop - Architecture

> **Keep this document in sync with the code.** If you change the conversation format, add event types, modify the loop mechanics, or restructure files, update this document as part of the same change.

For the high-level spec, see [agent-loop-spec.md](agent-loop-spec.md). For implementation status, see [status.md](status.md).

## Overview

The native agent loop is a stateless function that implements the model-call / tool-execution / re-sample cycle directly, without relying on an external SDK. It makes direct HTTP calls to the GitHub Copilot API (CAPI), owns the conversation format, and emits typed events for the caller to react to.

The loop lives in `src/vs/platform/agent2/` and integrates into the existing agent host process architecture by implementing the `IAgent` interface (defined in `src/vs/platform/agent/common/agentService.ts`). The workbench UI consumes events through the same `IAgentProgressEvent` protocol as the Copilot SDK-backed agent - the renderer doesn't know which agent backend it's talking to.

## Core Concepts

### The Loop is a Pure Function

```
runAgentLoop(conversation, config) → AsyncGenerator<AgentLoopEvent>
```

The loop receives a conversation (messages), tools, model configuration, and middleware. It yields events as it processes. **The loop does not own state** - conversation history, session persistence, and UI updates are the caller's responsibility.

### Provider-Neutral Conversation Format

Messages use an internal format that is independent of any model provider's wire format. Each message carries:

- **Role**: `system`, `user`, `assistant`, or `tool-result`
- **Model identity**: which model (provider + ID) produced this message (for assistant messages)
- **Provider metadata**: an opaque bag (`Record<string, unknown>`) that the provider populates on responses and replays on subsequent requests. The loop passes it through without inspection.

Translation to/from wire formats (Anthropic Messages API, OpenAI Responses API, etc.) happens in the model provider layer, not in the core loop.

### Typed Event Stream

Every loop action produces a typed `AgentLoopEvent`. Events are the only output channel:

| Event | Description |
|---|---|
| `model-call-start` | Model request initiated |
| `model-call-complete` | Model request finished (with usage) |
| `assistant-delta` | Streaming text chunk from model |
| `assistant-message` | Complete assistant message |
| `reasoning-delta` | Streaming reasoning/thinking chunk |
| `tool-start` | Tool execution beginning |
| `tool-complete` | Tool execution finished |
| `usage` | Token usage info |
| `error` | Error (retryable or fatal) |
| `turn-boundary` | Marks the end of a complete turn |

### Middleware

Composable interception points that allow features to observe and transform data flowing through the loop without modifying the core:

- **Pre-request**: runs before each model call, can modify messages and tools
- **Post-response**: runs after each model response, can inspect or request a retry
- **Pre-tool**: runs before each tool call, can modify args, skip, or deny
- **Post-tool**: runs after each tool call, can modify the result

This is how cross-cutting concerns are implemented: context compaction, permissions, telemetry, content filtering - all as independent middleware units.

### Model Providers

A model provider translates between the internal conversation format and a specific wire API. The provider interface:

```
sendRequest(system, messages, tools, config, signal) → AsyncIterable<ModelResponseChunk>
```

Providers handle auth, serialization, streaming, and retry. The loop doesn't know which API it's talking to.

Currently implemented:
- **Anthropic Messages API** (`AnthropicModelProvider`) - via CAPI, using SSE streaming

### Tools

A tool has a name, description, JSON Schema for parameters, and an execute function. Tools don't know about the loop or conversation - they receive input and return output. The loop orchestrates calling them.

Tool parallelism: tools declare `readOnly` to indicate they're safe to run concurrently. The loop runs read-only tools in parallel and serializes mutating tools.

## File Layout

```
src/vs/platform/agent2/
├── common/
│   ├── agentLoop.ts          # Core loop function + AgentLoopConfig
│   ├── conversation.ts       # Provider-neutral message types
│   ├── events.ts             # AgentLoopEvent types
│   ├── middleware.ts          # IMiddleware interface
│   ├── modelProvider.ts       # IModelProvider interface + ModelResponseChunk types
│   └── tools.ts              # IAgentTool interface, ToolContext, ToolResult
├── node/
│   ├── anthropicProvider.ts   # Anthropic Messages API provider
│   ├── copilotToken.ts        # CAPI token exchange (GitHub token → Copilot JWT)
│   ├── nativeAgent.ts         # NativeAgent: IAgent implementation wrapping the loop
│   ├── nativeToolDisplay.ts   # Tool name → display string mapping
│   └── tools/
│       ├── bashTool.ts        # Bash shell tool
│       └── readFileTool.ts    # Read file tool
├── test/
│   ├── common/
│   │   ├── agentLoop.test.ts
│   │   └── conversation.test.ts
│   └── node/
│       ├── anthropicProvider.test.ts
│       ├── copilotToken.test.ts
│       ├── nativeAgent.test.ts
│       ├── agentLoop.integrationTest.ts
│       └── tools/
│           ├── bashTool.test.ts
│           └── readFileTool.test.ts
├── agent-loop-spec.md         # High-level spec
├── architecture.md            # This file
└── status.md                  # Implementation status tracker
```

## Integration with Agent Host

The `NativeAgent` class implements the `IAgent` interface and wraps the core loop:

```
NativeAgent (IAgent implementation)
  ├── Creates sessions with conversation state
  ├── On sendMessage(): builds conversation, runs loop, translates events
  ├── Fires IAgentProgressEvent for each AgentLoopEvent
  └── Delegates to CopilotTokenService for auth

Registered in AgentService alongside CopilotAgent
  ├── Provider ID: 'native'
  ├── Session URIs: native:/<uuid>
  └── Discovered via listAgents()
```

The workbench contribution (`AgentHostContribution`) discovers the native agent via `listAgents()` and registers it as a chat session type - same mechanism as the Copilot SDK agent.

## Auth Flow

```
Renderer (workbench)
  → pushAuthToken() sends GitHub OAuth token via IAgentHostService.setAuthToken()
    → IPC to agent host process
      → NativeAgent.setAuthToken(githubToken)
        → CopilotTokenService.setGitHubToken(githubToken)
          → Exchanges for Copilot JWT via GET {capiBaseUrl}/copilot_internal/v2/token
          → Caches JWT, auto-refreshes when expired
          → JWT used as Bearer token for all model requests
```

## Design Decisions

1. **Direct CAPI calls, no SDK dependency.** We talk to the GitHub Copilot API directly via HTTP, giving us full control over the request/response cycle, streaming, and retry behavior.

2. **Provider-neutral conversation format.** Internal message types don't leak provider-specific concepts. `providerMetadata` bags enable lossless round-trip translation without coupling the core to any specific API.

3. **Stateless loop.** The loop is a pure function. Session management, persistence, and UI are the caller's responsibility. This makes the loop testable in isolation and reusable across different hosting contexts.

4. **Middleware over monolith.** Cross-cutting concerns (compaction, permissions, telemetry) are implemented as independent middleware units, not baked into the loop. The core loop is ~100 lines of straightforward orchestration.

5. **Existing SSEParser.** We reuse `src/vs/base/common/sseParser.ts` for SSE stream parsing rather than bringing in a new dependency.
