# Native Agent Loop -- Implementation Status

> **Keep this file up-to-date** with each piece of work. Check off items as they are implemented and tested.

## P0 -- Core Loop Mechanics

### Phase 1: Core Types & Conversation Format
- [x] `conversation.ts` -- Provider-neutral message types (IModelIdentity, ISystemMessage, IUserMessage, IAssistantMessage, IToolResultMessage, content parts)
- [x] `events.ts` -- AgentLoopEvent discriminated union (11 event types + IAgentLoopEventMap)
- [x] `modelProvider.ts` -- IModelProvider interface, ModelResponseChunk types, IModelInfo, IModelRequestConfig
- [x] `tools.ts` -- IAgentTool, IAgentToolDefinition, IToolContext, IToolResult
- [x] `middleware.ts` -- IMiddleware interface with pre/post hooks, composed runner functions
- [x] Unit tests for conversation types and middleware runners (27 tests)

### Phase 2: Core Agent Loop
- [x] `agentLoop.ts` -- stateless runAgentLoop() with model call / tool execution / re-sample cycle
- [x] Parallel execution for read-only tools, sequential for mutating tools
- [x] Full middleware integration (pre-request, post-response, pre-tool, post-tool)
- [x] Cancellation via CancellationToken at every step
- [x] Max iteration safety limit with error event
- [x] Tool argument parsing with graceful fallback for malformed JSON
- [x] Unit tests (19 tests: text-only, tool calls, parallel tools, abort, errors, middleware, event ordering)

### Phase 3: Anthropic Messages API Provider
- [x] `copilotToken.ts` -- CAPI token exchange (GitHub token -> Copilot JWT) with caching, auto-refresh, concurrent request deduplication
- [x] `anthropicProvider.ts` -- AnthropicModelProvider (SSE streaming, message translation, thinking blocks, tool_use blocks, usage tracking, cancellation)
- [ ] Full model discovery (GET /models) -- currently returns configured model only
- [x] Unit tests for Anthropic provider (12 tests: SSE parsing, message translation, auth headers, cancellation)
- [x] Unit tests for token service (8 tests: exchange, cache, refresh, dedup, errors)

### Phase 4: Basic Tools
- [x] `readFileTool.ts` -- Read file tool (line ranges, path traversal protection, size limits, UTF-8)
- [x] `bashTool.ts` -- Bash shell tool (timeout, cancellation via SIGTERM/SIGKILL, stderr capture, exit codes)
- [x] Unit tests for tools (18 tests)

### Phase 5: Wire Up as IAgent Provider
- [x] `nativeAgent.ts` -- NativeAgent IAgent implementation (session CRUD, event translation, tool tracking)
- [x] `nativeToolDisplay.ts` -- Tool display mapping (display names, invocation/past-tense messages, tool kind, language)
- [x] Register NativeAgent in agentHostMain.ts alongside CopilotAgent
- [x] Add 'native' to AgentProvider type, update AgentSession.provider()
- [x] Unit tests for NativeAgent (10 tests)

### Phase 6: Integration Test
- [ ] Integration test with real CAPI calls (gated on GITHUB_TOKEN env var)

## P1 -- Essential Infrastructure

- [ ] Context window management middleware (token monitoring, compaction, truncation)
- [ ] Permission system middleware (allow/deny/ask per tool, suspend loop for user approval)
- [ ] Tool output truncation middleware
- [ ] Sub-agent invocation tool
- [ ] Custom instructions injection (caller-provided content into system prompt)
- [ ] Dynamic tool management (add/remove tools mid-loop)
- [x] Turn tracking (turn numbers on all events) -- implemented in Phase 2
- [x] Usage metrics (per-model-call token counts) -- implemented in Phase 3
- [x] Reasoning/thinking support (first-class events, thinking parts, signature preservation) -- implemented in Phase 2-3
- [ ] Tool call validation against JSON Schema
- [x] Configurable tool parallelism (read-safe vs exclusive) -- implemented in Phase 2

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
| ce00a59 | Phase 1: Core types, conversation format, events, tools, middleware |
| 1683dae | Phase 2: Core agent loop and tests |
| 5d0e33d | Phase 3: CAPI token service and Anthropic Messages API provider |
| a653bb9 | Phase 4: readFile and bash tools |
| a0b6b26 | Phase 5: NativeAgent IAgent implementation and registration |

## Test Summary

**94 tests total, all passing**
- Conversation types: 14 tests
- Middleware runners: 11 tests
- Agent loop: 19 tests
- Anthropic provider: 12 tests
- Copilot token service: 8 tests
- ReadFileTool: 8 tests
- BashTool: 8 tests
- NativeAgent: 10 tests
- Other: 4 tests (clean state checks)
