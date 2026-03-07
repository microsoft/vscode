# Native Agent Loop -- Implementation Status

> **Keep this file up-to-date** with each piece of work. Check off items as they are implemented and tested.

## P0 -- Core Loop Mechanics (COMPLETE)

### Phase 1: Core Types & Conversation Format
- [x] `conversation.ts` -- Provider-neutral message types, content parts, helpers
- [x] `events.ts` -- AgentLoopEvent discriminated union (11 event types + IAgentLoopEventMap)
- [x] `modelProvider.ts` -- IModelProvider interface, ModelResponseChunk types
- [x] `tools.ts` -- IAgentTool, IAgentToolDefinition, IToolContext, IToolResult
- [x] `middleware.ts` -- IMiddleware interface with pre/post hooks, composed runner functions
- [x] Unit tests (27 tests)

### Phase 2: Core Agent Loop
- [x] `agentLoop.ts` -- stateless runAgentLoop() with model call / tool execution / re-sample cycle
- [x] Order-preserving tool parallelism (contiguous read-only batches)
- [x] Full middleware integration (pre-request, post-response, pre-tool, post-tool)
- [x] Cancellation, max iteration safety, retry event buffering, session-scoped scratchpad
- [x] Unit tests (19 tests)

### Phase 3: Anthropic Messages API Provider
- [x] `copilotToken.ts` -- CAPI token exchange with caching, auto-refresh, deduplication
- [x] `anthropicProvider.ts` -- AnthropicModelProvider (SSE streaming, message translation, thinking, tool_use, cancellation)
- [x] Unit tests (20 tests)

### Phase 4: Basic Tools
- [x] `readFileTool.ts` -- segment-safe path traversal guard, cross-platform sep, line ranges, size limits
- [x] `bashTool.ts` -- timeout, cancellation via disposableTimeout, stderr capture
- [x] Unit tests (18 tests)

### Phase 5: Wire Up as IAgent Provider
- [x] `nativeAgent.ts` -- session CRUD, event translation, per-session tool tracking, correlated delta message IDs
- [x] `nativeToolDisplay.ts` -- tool display mapping
- [x] Register NativeAgent in agentHostMain.ts alongside CopilotAgent
- [x] Add 'native' to AgentProvider type, update AgentSession.provider()
- [x] Register 'agent-host-native' as session type in chat UI (agentSessions.ts, sessionTargetPicker.ts, chat.contribution.ts)
- [x] Unit tests (10 tests)

### Phase 6: Integration Test
- [x] Integration test harness with real CAPI calls (gated on GITHUB_TOKEN env var)

## P1 -- Essential Infrastructure (MOSTLY COMPLETE)

- [x] Context window management middleware -- token estimation, old tool output pruning
- [x] Permission system middleware -- allow/deny/ask per tool, IPermissionPolicy, AllowAllPolicy, DefaultPermissionPolicy
- [x] Tool output truncation middleware -- configurable max length (default 50K chars)
- [x] Sub-agent invocation tool -- nested loop with isolated conversation, configurable tools/system prompt
- [x] Custom instructions injection -- IInstructionProvider interface, pre-request middleware
- [x] Dynamic tool management -- tools config accepts `() => IAgentTool[]`, resolved per iteration
- [x] Turn tracking (turn numbers on all events) -- built into event types
- [x] Usage metrics (per-model-call token counts with correct model identity) -- usage events
- [x] Reasoning/thinking support (first-class events, thinking parts, signature preservation)
- [x] Tool call validation against JSON Schema -- `schemaValidation.ts`, integrated into loop
- [x] Configurable tool parallelism (read-safe vs exclusive, order-preserving batches)
- [ ] Wire permission middleware to IAgentPermissionRequestEvent IPC flow (ask mode in UI)

## Assorted issues
- [x] Refactor CopilotApiService as injectable service with ICopilotApiService interface and createDecorator
	- LocalAgent now accepts ICopilotApiService via constructor injection
	- Model provider factories and providers use the interface
- [x] Sessions not showing up in the sessions list
	- AgentHostSessionListController now subscribes to onDidSessionProgress idle events and auto-refreshes
- [x] Upgrade BashTool to persistent shell sessions
	- Shell process persisted in session scratchpad across invocations
	- Preserves cwd, environment variables, shell state between commands
- [x] Persist sessions to jsonl files on disk
	- Append-only JSONL under `<userDataPath>/agentSessions/<workspaceKeyHash>/`
	- SessionStorage: create, append events, list, restore, delete
	- LocalAgent wires up persistence for session creation, messages, tool events, modified timestamps
	- Sessions survive process restarts and show up in `listSessions`
	- 10 dedicated SessionStorage tests
- Hook up vscode terminal tool (IPC bridge to workbench terminal service)
- Expand the tool set. How much do we copy from current vscode tools or start from scratch?
	- Must support model-specific tools
- Bring over real model-specific prompts from the extension
	- Use prompt-tsx, we still use shared components and dynamic tweaks. ONLY for rendering the system prompt though, with none of the advanced features

## P2 -- Production-Grade Features

- [ ] Workspace snapshots (shadow git)
- [ ] Edit tracking (baselines, diffs)
- [ ] Rate limit awareness (429 handling with retry-after headers)
- [ ] Streaming intent extraction middleware
- [ ] Public-facing hooks (external extension points)
- [ ] Full model discovery (GET /models endpoint)
- [ ] Provider metadata passthrough (accumulate provider-metadata chunks)

## P2a -- CAPI Parity (from code review)

These items bring the local agent's API usage in line with the copilot-chat extension's
CAPI integration. Required for production correctness and server feature utilization.

### Messages API (Anthropic)
- [ ] Deferred tool loading and tool search tool support (CAPI server feature)
- [ ] Context editing / cache-control semantics on tool results and content blocks
- [ ] Trailing-assistant-prefill guard (prevent invalid trailing assistant messages)
- [ ] Handle server tool search result events in SSE stream parser

### Responses API (OpenAI)
- [ ] Stateful conversation via `previous_response_id` chaining (avoid rebuilding every turn)
- [ ] Context management compaction (server-side, with `compact_threshold`)
- [ ] Truncation control (`truncation: 'auto' | 'disabled'`)
- [ ] Reasoning settings (`reasoning.effort`, `reasoning.summary`)
- [ ] Encrypted reasoning inclusion (`include: reasoning.encrypted_content`)
- [ ] Round-trip opaque Responses state through `providerMetadata` (phase, compaction items, stateful markers)
- [ ] Handle finalized output-item-done events and stateful markers from `response.completed`

### Endpoint Selection
- [ ] Select endpoint based on model metadata `supported_endpoints` instead of name prefixes
- [ ] Respect `model_picker_enabled` and model capabilities from the CAPI `/models` response

### Domain / Enterprise
- [ ] Propagate enterprise URL through CAPIClient `updateDomains`
- [ ] Keep CAPI domains synchronized with config state changes (not just initial token exchange)

### Debug / Observability
- [ ] Expose model request/response data in VS Code's Agent Debug Panel via IPC

## P3 -- Advanced / Future

- [ ] Concurrent sub-agents
- [ ] Agent roles / specializations
- [ ] Context forking
- [ ] Agent resume
- [ ] Sandbox enforcement
- [ ] Server-side session support
- [ ] Come up with a solution for logging/tracing runs. Opentelemetry or vscode's agent debug panel?

---

## Commit Log

| Commit | Description |
|--------|-------------|
| ce00a59 | Phase 1: Core types, conversation format, events, tools, middleware |
| 1683dae | Phase 2: Core agent loop and tests |
| 5d0e33d | Phase 3: CAPI token service and Anthropic Messages API provider |
| a653bb9 | Phase 4: readFile and bash tools |
| a0b6b26 | Phase 5: NativeAgent IAgent implementation and registration |
| 3f566ea | P1 middleware: tool output truncation, permissions, custom instructions |
| 903eb4a | Code review fixes round 1 |
| ece4c1f | P1: Context window management middleware |
| 5127a00 | P1: Dynamic tool management, doc updates |
| 5162f6d | Code review fixes round 2: path safety, cross-platform sep, disposableTimeout |
| 3e041f7 | Register native agent as session type in chat UI |
| f9efef2 | P1: Schema validation, sub-agent tool, integration test harness |

## Test Summary

**125 tests total, all passing**
- Conversation types: 14 tests
- Middleware runners: 11 tests
- Schema validation: 14 tests
- Agent loop: 19 tests
- Anthropic provider: 12 tests
- Copilot token service: 8 tests
- Context window middleware: 5 tests
- Tool output truncation: 4 tests
- Permission middleware: 5 tests
- Custom instructions: 3 tests
- ReadFileTool: 8 tests
- BashTool: 8 tests
- NativeAgent: 10 tests
- Other: 4 tests

## End-to-End Verification

Verified working in Code OSS:
- Agent host process starts and registers both 'copilot' and 'native' providers
- "Native Agent" appears in the session target picker
- Selecting Native Agent creates a session with correct model configuration
- Sending a message creates a session and runs the agent loop
- Error handling works correctly (tested auth error path)
- Auth token flow: setAuthToken broadcasts to all providers including NativeAgent
