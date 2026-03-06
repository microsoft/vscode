# Native Agent Loop -- Implementation Status

> **Keep this file up-to-date** with each piece of work. Check off items as they are implemented and tested.

## P0 -- Core Loop Mechanics

### Phase 1: Core Types & Conversation Format
- [ ] `conversation.ts` -- Provider-neutral message types (AgentMessage, roles, parts)
- [ ] `events.ts` -- AgentLoopEvent discriminated union
- [ ] `modelProvider.ts` -- IModelProvider interface, ModelResponseChunk types
- [ ] `tools.ts` -- IAgentTool interface, ToolContext, ToolResult
- [ ] Unit tests for conversation types

### Phase 2: Core Agent Loop
- [ ] `agentLoop.ts` -- Core loop function (model call / tool execution / re-sample)
- [ ] `middleware.ts` -- IMiddleware interface with pre/post hooks
- [ ] Tool call validation against JSON Schema
- [ ] Unit tests for core loop (text-only, tool calls, parallel tools, abort, errors, middleware)

### Phase 3: Anthropic Messages API Provider
- [ ] `copilotToken.ts` -- CAPI token exchange (GitHub token to Copilot JWT)
- [ ] `anthropicProvider.ts` -- AnthropicModelProvider (SSE streaming, message translation)
- [ ] Model discovery (GET /models)
- [ ] Unit tests for Anthropic provider (message translation, SSE parsing, retry, abort)
- [ ] Unit tests for token service (exchange, cache, refresh)

### Phase 4: Basic Tools
- [ ] `readFileTool.ts` -- Read file tool
- [ ] `bashTool.ts` -- Bash shell tool
- [ ] Unit tests for tools

### Phase 5: Wire Up as IAgent Provider
- [ ] `nativeAgent.ts` -- NativeAgent IAgent implementation
- [ ] `nativeToolDisplay.ts` -- Tool display mapping
- [ ] Register NativeAgent in agentHostMain.ts
- [ ] Add 'native' to AgentProvider type
- [ ] Unit tests for NativeAgent

### Phase 6: Integration Test
- [ ] Integration test with real CAPI calls (gated on GITHUB_TOKEN env var)

## P1 -- Essential Infrastructure

- [ ] Context window management middleware (token monitoring, compaction, truncation)
- [ ] Permission system middleware (allow/deny/ask per tool)
- [ ] Tool output truncation middleware
- [ ] Sub-agent invocation tool
- [ ] Custom instructions injection
- [ ] Dynamic tool management (add/remove tools mid-loop)
- [ ] Turn tracking (turn numbers on events)
- [ ] Usage metrics (per-model-call token counts)
- [ ] Reasoning/thinking support (first-class events, conversation format, provider metadata)
- [ ] Tool call validation against JSON Schema
- [ ] Configurable tool parallelism (read-safe vs exclusive)

## P2 -- Production-Grade Features

- [ ] Workspace snapshots (shadow git)
- [ ] Edit tracking (baselines, diffs)
- [ ] Rate limit awareness
- [ ] Streaming intent extraction middleware
- [ ] Public-facing hooks (external extension points)

## P3 -- Advanced / Future

- [ ] Concurrent sub-agents
- [ ] Agent roles / specializations
- [ ] Context forking
- [ ] Agent resume
- [ ] Sandbox enforcement
- [ ] Server-side session support

---

## Commit Log

| Commit | Description |
|--------|-------------|
| (pending) | Phase 1: Core types and conversation format |
