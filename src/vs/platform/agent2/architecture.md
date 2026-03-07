# Native Agent Loop - Architecture

> **Keep this document in sync with the code.** If you change the conversation format, add event types, modify the loop mechanics, or restructure files, update this document as part of the same change.

For the high-level spec, see [agent-loop-spec.md](agent-loop-spec.md). For implementation status, see [status.md](status.md).

## Values

1. **Simplicity above all.** The code should be as clean and simple as possible. Prefer small files, clear interfaces, and obvious data flow. Resist the urge to over-abstract or pre-optimize.

2. **Simple core, extensible surface.** The agent loop itself is a tight, stateless function (~100 lines). All feature complexity lives in middleware, tools, and providers -- independent units that plug in without modifying the core. This separation is the foundation of the architecture.

3. **Single source of truth.** Every piece of state has exactly one owner. Session entries are the canonical model -- conversation messages, IPC events, and persisted JSONL are all derived from entries, never maintained in parallel.

4. **Independent contribution.** The middleware + tools + providers architecture exists so that many developers can work on features independently without stepping on each other. Adding a new tool, a new middleware, or a new model provider should never require changing the loop.

5. **Testability is non-negotiable.** Every component must be exercisable through unit tests that are easy to write and easy to read. The stateless loop, typed events, and clean interfaces exist specifically to make testing straightforward. Integration tests with real model calls validate the full stack end-to-end.

6. **No leaky abstractions.** Session state doesn't know about IPC event types. The loop doesn't know about model wire formats. Providers don't know about sessions. Each layer has a clean boundary and translates at its edges.

7. **Append-only persistence.** Session history is stored as append-only JSONL files. Each entry is self-describing with a version field. Files are never modified after writing -- only appended to. This makes the format simple, crash-safe, and easy to debug.

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

- **Pre-request**: runs before each model call, can modify the system prompt, messages, and tools
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
- **Anthropic Messages API** (`AnthropicModelProvider`) -- via CAPI, using SSE streaming
- **OpenAI Responses API** (`OpenAIResponsesProvider`) -- via CAPI, using SSE streaming

### Tools

A tool has a name, description, JSON Schema for parameters, and an execute function. Tools don't know about the loop or conversation -- they receive input and return output. The loop orchestrates calling them.

Tool parallelism: tools declare `readOnly` to indicate they're safe to run concurrently. The loop batches contiguous read-only tools for parallel execution and serializes mutating tools, preserving the original order from the model.

Dynamic tool management: the `tools` field in `IAgentLoopConfig` can be a static array or a function `() => IAgentTool[]`. When a function, it is called before each model request, allowing the caller to add/remove tools mid-loop.

Currently implemented tools:
- **ReadFileTool** (`read_file`) -- reads file contents with optional line range
- **BashTool** (`bash`) -- persistent shell session with state preserved across invocations

### Middleware Implementations

The following middleware are implemented and active:

| Middleware | Hook | Description |
|---|---|---|
| `ContextWindowMiddleware` | `preRequest` | Estimates token usage, prunes old tool outputs when approaching context limit |
| `PermissionMiddleware` | `preTool` | Checks tool calls against a policy (allow/deny/ask). Currently uses `AllowAllPolicy`. |
| `ToolOutputTruncationMiddleware` | `postTool` | Truncates large tool outputs (default 50K chars) |
| `CustomInstructionsMiddleware` | `preRequest` | Appends caller-provided instruction content to the system prompt |

## File Layout

```
src/vs/platform/agent2/
├── common/
│   ├── agentLoop.ts          # Core loop function + AgentLoopConfig
│   ├── conversation.ts       # Provider-neutral message types
│   ├── events.ts             # AgentLoopEvent types
│   ├── middleware.ts          # IMiddleware interface
│   ├── modelProvider.ts       # IModelProvider interface + ModelResponseChunk types
│   ├── schemaValidation.ts    # JSON Schema validator for tool arguments
│   ├── sessionTypes.ts        # Session entry types (shared data model for memory + JSONL)
│   └── tools.ts              # IAgentTool interface, ToolContext, ToolResult
├── node/
│   ├── anthropicProvider.ts   # Anthropic Messages API provider
│   ├── openaiResponsesProvider.ts # OpenAI Responses API provider
│   ├── copilotToken.ts        # ICopilotApiService: CAPI token exchange + authenticated requests
│   ├── modelProviderService.ts # Maps model IDs to providers (factory pattern)
│   ├── localAgent.ts          # LocalAgent: IAgent implementation wrapping the loop
│   ├── localSession.ts        # LocalSession: per-session state + persistence
│   ├── sessionStorage.ts      # SessionWriter (per-session JSONL writer) + SessionStorage (read-only listing/restore)
│   ├── localToolDisplay.ts    # Tool name -> display string mapping
│   ├── middleware/
│   │   ├── contextWindow.ts       # Context window management (tool output pruning)
│   │   ├── customInstructions.ts  # Custom instruction injection
│   │   ├── permissionMiddleware.ts # Permission system (allow/deny/ask)
│   │   └── toolOutputTruncation.ts # Large output truncation
│   └── tools/
│       ├── bashTool.ts        # Persistent bash shell tool
│       ├── readFileTool.ts    # Read file tool
│       └── subAgentTool.ts    # Sub-agent invocation (nested loop)
├── test/
│   ├── common/
│   └── node/
├── agent-loop-spec.md         # High-level spec
├── architecture.md            # This file
└── status.md                  # Implementation status tracker
```

## Integration with Agent Host

The `LocalAgent` class implements the `IAgent` interface and wraps the core loop:

```
LocalAgent (IAgent implementation)
  ├── Creates LocalSession instances with per-session SessionWriter
  ├── On sendMessage(): builds conversation from entries, runs loop, translates events
  ├── Fires IAgentProgressEvent for each AgentLoopEvent
  └── Delegates to ICopilotApiService for auth

Registered in AgentService via InstantiationService
  ├── Provider ID: 'local'
  ├── Session URIs: local:/<uuid>
  └── Discovered via listAgents()
```

The workbench contribution (`AgentHostContribution`) discovers the agent via `listAgents()` and registers it as a chat session type.

## Auth Flow

```
Renderer (workbench)
  → pushAuthToken() sends GitHub OAuth token via IAgentHostService.setAuthToken()
    → IPC to agent host process
      → LocalAgent.setAuthToken(githubToken)
        → ICopilotApiService.setGitHubToken(githubToken)
          → CAPIClient exchanges for Copilot JWT
          → CAPIClient.updateDomains() updates URL routing from token endpoints
          → Caches JWT, auto-refreshes when expired
          → JWT used as Bearer token for all model requests
```

## Design Decisions

1. **CAPIClient for API routing.** We use the `@vscode/copilot-api` CAPIClient for URL routing, header injection, and token exchange -- the same module used by the copilot-chat extension. This ensures correct endpoint resolution, standard header management (session ID, machine ID, integration ID), and domain updates from token endpoints. No hardcoded API URLs.

2. **Provider-neutral conversation format.** Internal message types don't leak provider-specific concepts. `providerMetadata` bags enable lossless round-trip translation without coupling the core to any specific API.

3. **Stateless loop.** The loop is a pure function. Session management, persistence, and UI are the caller's responsibility. This makes the loop testable in isolation and reusable across different hosting contexts.

4. **Middleware over monolith.** Cross-cutting concerns (compaction, permissions, telemetry) are implemented as independent middleware units, not baked into the loop. The core loop is ~100 lines of straightforward orchestration.

5. **Existing SSEParser.** We reuse `src/vs/base/common/sseParser.ts` for SSE stream parsing rather than bringing in a new dependency.
