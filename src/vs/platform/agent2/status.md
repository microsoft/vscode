# Native Agent Loop -- Implementation Status

> **Keep this file up-to-date** with each piece of work. Check off items as they are implemented and tested.
>
> This document is the authoritative gap analysis between `agent2` and the
> `vscode-copilot-chat` extension. Every feature, detail, and behaviour
> present in the extension that is **not yet** replicated in agent2 is
> listed here, including fine-grained sub-items inside features that are
> partially implemented.

---

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
- [x] `localAgent.ts` -- session CRUD, event translation, per-session tool tracking, correlated delta message IDs
- [x] `localToolDisplay.ts` -- tool display mapping
- [x] Register LocalAgent in agentHostMain.ts
- [x] Add 'local' to AgentProvider type, update AgentSession.provider()
- [x] Register 'agent-host-local' as session type in chat UI
- [x] Unit tests (10 tests)

### Phase 6: Integration Test
- [x] Integration test harness with real CAPI calls (gated on GITHUB_TOKEN env var)

---

## P1 -- Essential Infrastructure (MOSTLY COMPLETE)

- [x] Context window management middleware -- token estimation, old tool output pruning (wired in LocalAgent)
- [x] Permission system middleware -- allow/deny/ask per tool, IPermissionPolicy, AllowAllPolicy, DefaultPermissionPolicy (wired with AllowAllPolicy -- effectively permits all tools; approval flow not yet connected)
- [x] Tool output truncation middleware -- configurable max length (default 50K chars) (wired in LocalAgent)
- [x] Sub-agent invocation tool -- nested loop with isolated conversation, configurable tools/system prompt (**not wired** in LocalAgent tool set -- implemented in isolation)
- [x] Custom instructions injection -- IInstructionProvider interface, pre-request middleware that appends to system prompt (**not wired** in LocalAgent middleware chain -- implemented in isolation)
- [x] Dynamic tool management -- tools config accepts `() => IAgentTool[]`, resolved per iteration
- [x] Turn tracking (turn numbers on all events) -- built into event types
- [x] Usage metrics (per-model-call token counts with correct model identity) -- usage events
- [x] Reasoning/thinking support (first-class events, thinking parts, signature preservation)
- [x] Tool call validation against JSON Schema -- `schemaValidation.ts`, integrated into loop
- [x] Configurable tool parallelism (read-safe vs exclusive, order-preserving batches)
- [ ] Wire permission middleware to IAgentPermissionRequestEvent IPC flow (ask mode in UI)

### Remaining P1 gaps vs extension
- [ ] **Wire sub-agent tool** into LocalAgent's tool set
- [ ] **Wire custom instructions middleware** into LocalAgent's middleware chain
- [ ] **Attachment support**: extension parses `IAgentAttachment[]` (images, files, selections) - agent2's `sendMessage` ignores the `_attachments` parameter entirely
- [ ] **Vision/image support**: extension sends `image_url` content parts in messages; agent2 user messages are text-only

---

## Assorted issues
- [x] Refactor CopilotApiService as injectable service with ICopilotApiService interface and createDecorator
	- LocalAgent now accepts ICopilotApiService via constructor injection
	- Model provider factories and providers use the interface
- [x] Sessions not showing up in the sessions list
	- AgentHostSessionListController now subscribes to onDidSessionProgress idle events and auto-refreshes
- [x] Upgrade BashTool to persistent shell sessions
	- Shell process persisted in session-scoped scratchpad across turns
	- Scratchpad owned by LocalSession, passed to AgentLoop via config
	- Preserves cwd, environment variables, shell state between commands
- [x] Persist sessions to jsonl files on disk
	- Append-only JSONL under `<userDataPath>/agentSessions/<workspaceKeyHash>/`
	- SessionStorage: create, append events, list, restore, delete
	- LocalAgent wires up persistence for session creation, messages, tool events, modified timestamps
	- Sessions survive process restarts and show up in `listSessions`
	- Sessions are resumable: `sendMessage` restores from storage when session is not in memory
	- 10 dedicated SessionStorage tests
- Hook up vscode terminal tool (IPC bridge to workbench terminal service)
- Expand the tool set. How much do we copy from current vscode tools or start from scratch?
	- Must support model-specific tools
- Bring over real model-specific prompts from the extension
	- Use prompt-tsx, we still use shared components and dynamic tweaks. ONLY for rendering the system prompt though, with none of the advanced features

---

## TOOL SET -- Comprehensive Gap Analysis

The extension has 50+ tools. Agent2 has 2 (read_file, bash). Every tool listed
below is missing from agent2. Tools are grouped by priority.

### Critical Tools (required for basic agent functionality)

| Tool | Extension Name | Type | Notes |
|------|---------------|------|-------|
| `create_file` | CreateFile | Mutating | Create files with content |
| `replace_string_in_file` | ReplaceString | Mutating | Primary edit tool for Anthropic models. Multi-strategy matching: exact → whitespace-flexible → fuzzy regex → similarity sliding window |
| `multi_replace_string_in_file` | MultiReplaceString | Mutating | Batch replacements with conflict detection across edits in the same file |
| `apply_patch` | ApplyPatch | Mutating | Primary edit tool for GPT models. Structured diff format with context matching, `@@` scope headers, fuzzy edit distance |
| `insert_edit_into_file` | EditFile | Mutating | Whole-code-region edit via CodeMapper. Fallback for when replace_string fails |
| `list_dir` | ListDirectory | Read-only | List directory contents |
| `file_search` | FindFiles | Read-only | Find files by glob pattern |
| `grep_search` | FindTextInFiles | Read-only | Search file contents by text or regex, with includePattern and includeIgnoredFiles |
| `semantic_search` | Codebase | Read-only | Embedding-based code search across workspace |
| `get_errors` | GetErrors | Read-only | Get compile/lint diagnostics for files |
| `run_in_terminal` | CoreRunInTerminal | Mutating | VS Code integrated terminal (not raw bash) with UI display |
| `get_terminal_output` | CoreGetTerminalOutput | Read-only | Read output from a previously started terminal |

### Missing Edit Tool Details (even if we implement the basic tools)
- [ ] **Edit healing** (`editFileHealing.tsx`): When `replace_string` fails to match, the extension tries: 1) whitespace-flexible matching, 2) fuzzy regex, 3) Levenshtein similarity at 0.95 threshold, 4) LLM-based correction - calls a model to fix the snippet. Agent2's tools have none of this.
- [ ] **Post-edit diagnostics**: After each edit, the extension waits for language service diagnostics to settle, diffs against pre-edit errors, and reports new errors/warnings in the tool result. This nudges the model to fix introduced issues.
- [ ] **Edit tool learning**: `EditToolLearningService` tracks per-model success/failure rates over a rolling window and dynamically selects which edit tools to offer each model (state machine with transitions based on success %).
- [ ] **Per-model edit tool selection**: Different models get different edit tools. Anthropic gets `replace_string`/`multi_replace_string`. GPT-5+ gets `apply_patch`. Gemini gets `replace_string`. Extension has a detailed mapping table per model family.
- [ ] **BYOK edit tool remapping**: When extension-contributed (BYOK) model endpoints report `supportedEditTools` in their metadata, names like `find-replace`, `multi-find-replace`, `apply-patch`, `code-rewrite` are mapped to internal tool names. See `byokEditToolNamesToToolNames` in `src/extension/tools/common/toolNames.ts` and `EditToolLearningService.getPreferredEndpointEditTool()` in `editToolLearningService.ts`.
- [ ] **Notebook editing**: Edit tools handle notebook files specially, delegating to a notebook content editing service.

### Important Tools (expected for a complete agent experience)

| Tool | Extension Name | Type | Notes |
|------|---------------|------|-------|
| `create_directory` | CreateDirectory | Mutating | |
| `get_changed_files` | GetScmChanges | Read-only | SCM diffs (git status/diff), limits diff output for large changesets |
| `manage_todo_list` | CoreManageTodoList | Mutating | Structured plan tracking. VS Code core tool. Heavy prompt guidance to use it frequently. |
| `runSubagent` | CoreRunSubagent | Mutating | Full sub-agent with isolated context window. Filters out recursive tools. |
| `search_subagent` | SearchSubagent | Read-only | Dedicated read-only code search sub-agent with limited tool budget and specialized prompt |
| `runTests` | CoreRunTest | Mutating | VS Code test framework integration. Modes: run, coverage. |
| `test_failure` | TestFailure | Read-only | Gathers all test failures, ranks by proximity to active editors and SCM changes |
| `test_search` | FindTestFiles | Read-only | Finds related test files for source files using parser analysis |
| `task_complete` | CoreTaskComplete | Mutating | Signals agent completion in autopilot mode. Required for autopilot flow. |
| `fetch_webpage` | FetchWebPage | Read-only | HTTP fetch + semantic chunking via embeddings for relevant extraction |
| `memory` | Memory | Both | Three-scope memory system (user/session/repo) with CRUD commands |
| `switch_agent` | SwitchAgent | Mutating | Switch to Plan agent mode mid-session |
| `tool_search` | ToolSearch | Read-only | Model-specific (Claude 4.5+ only). Embedding-based search for deferred tools |

### VS Code Integration Tools (require IPC bridge to workbench)

| Tool | Extension Name | Type | Notes |
|------|---------------|------|-------|
| `terminal_selection` | CoreTerminalSelection | Read-only | Read current terminal selection |
| `terminal_last_command` | CoreTerminalLastCommand | Read-only | Get last terminal command and output |
| `create_and_run_task` | CoreCreateAndRunTask | Mutating | Create and run VS Code tasks |
| `run_task` | CoreRunTask | Mutating | Run existing VS Code tasks |
| `get_task_output` | CoreGetTaskOutput | Read-only | Read output from a running task |
| `vscode_askQuestions` | CoreAskQuestions | Mutating | Multi-question interactive UI in chat |
| `vscode_get_confirmation` | CoreConfirmationTool | Mutating | Confirmation dialog before tool execution |
| `get_vscode_api` | VSCodeAPI | Read-only | Search VS Code API documentation |
| `search_workspace_symbols` | SearchWorkspaceSymbols | Read-only | Language-aware symbol search |
| `install_extension` | InstallExtension | Mutating | Install VS Code extensions |
| `create_new_workspace` | CreateNewWorkspace | Mutating | Create new workspace folders |
| `run_vscode_command` | RunVscodeCmd | Mutating | Execute arbitrary VS Code commands |
| `get_search_view_results` | SearchViewResults | Read-only | Get results from the Search view |
| `copilot_listCodeUsages` | ListCodeUsages | Read-only | Find all references/usages of a symbol |
| `copilot_renameSymbol` | RenameSymbol | Mutating | Language-aware symbol rename |

### Notebook Tools

| Tool | Extension Name | Type | Notes |
|------|---------------|------|-------|
| `edit_notebook_file` | EditNotebook | Mutating | Insert/delete/edit notebook cells |
| `run_notebook_cell` | RunNotebookCell | Mutating | Execute notebook cells |
| `copilot_getNotebookSummary` | GetNotebookSummary | Read-only | Notebook cell listing with metadata |
| `read_notebook_cell_output` | ReadCellOutput | Read-only | Read cell execution output |
| `create_new_jupyter_notebook` | CreateNewJupyterNotebook | Mutating | Create new notebooks |

### Specialized Tools

| Tool | Extension Name | Type | Notes |
|------|---------------|------|-------|
| `github_repo` | GithubRepo | Read-only | Search code in remote GitHub repos via embeddings |
| `read_project_structure` | ReadProjectStructure | Read-only | Full workspace file tree |
| `edit_files` | EditFilesPlaceholder | - | Placeholder that maps to the correct edit tool per model |

### Virtual Tool Grouping
- [ ] When > 64 tools exist, the extension groups them into "virtual tools" by category, uses embeddings to match user queries, and expands groups on demand. Agent2 has no tool grouping or limit management.

### Tool Result Formatting
- [ ] Extension tool results are often rendered via **prompt-tsx** components (e.g., `EditFileResult`, `TestFailureResult`) that produce rich, structured output. Agent2 returns plain strings.
- [ ] Tool confirmation messages: Many tools return `confirmationMessages` from `prepareInvocation` to trigger user approval before executing.

---

## SYSTEM PROMPT -- Comprehensive Gap Analysis

Agent2 uses a single hardcoded `DEFAULT_SYSTEM_PROMPT` string. The extension
builds a multi-layered prompt using prompt-tsx with per-model customization.

### Prompt Structure (extension)
The extension assembles the system prompt from these layers (agent2 has none of them):

1. [ ] **Base identity**: "You are an expert AI programming assistant, working with a user in the VS Code editor."
2. [ ] **CopilotIdentityRules**: Establishes identity as "GitHub Copilot", model name disclosure rules. GPT-5 has a variant.
3. [ ] **SafetyRules**: Microsoft content policies, copyright avoidance, harmful content refusal. Three variants depending on model family.
4. [ ] **Model-specific system prompt** (resolved via PromptRegistry - see below)
5. [ ] **Memory instructions**: How to use the persistent memory tool system (user/session/repo scopes)
6. [ ] **Custom instructions**: User-provided `.github/copilot-instructions.md`, `.instructions.md` files, extension-contributed instructions, mode instructions
7. [ ] **Autopilot instructions**: When in autopilot mode, adds `task_complete` tool requirements and continuation nudge behavior
8. [ ] **Global agent context** (agent2 sends none of this):
	- User OS
	- VS Code tasks (workspace task definitions)
	- Workspace folder hints
	- Workspace structure tree (BFS-expanded file tree, max 2000 tokens, excludes dotfiles/node_modules/.git)
	- User preferences
	- Memory context (auto-loaded user memory files, first 200 lines each)
	- Cache breakpoint markers for prompt caching
9. [ ] **Conversation history** - either summarized (when context is tight) or full history with proper role alternation
10. [ ] **User message** with structured context:
	- Current date
	- Edited file events since last turn
	- Notebook summary changes
	- Terminal state
	- Todo list state
	- Additional hook-provided context
	- Currently focused editor/file
11. [ ] **Reminder instructions** repeated with each message (editing tool preferences, notebook reminders, todo list guidance)
12. [ ] **Tool call rounds**: Historical tool calls and results from previous iterations, token-budgeted (50% cap on tool results)
13. [ ] **File linkification instructions**: Detailed rules for outputting file references as markdown links with workspace-relative paths, line numbers, and range anchors
14. [ ] **Response translation rules**: Locale-aware instructions when VS Code is in a non-English language (15+ locales)

### Model-Specific Prompts (PromptRegistry)
The extension has a `PromptRegistry` singleton that resolves per-model prompt customizations. Each registration can override `SystemPrompt`, `ReminderInstructions`, `ToolReferencesHint`, `CopilotIdentityRules`, `SafetyRules`, and `userQueryTagName`. Registered models:

- [ ] **Anthropic** (`DefaultAnthropicAgentPrompt`): Tool search/deferred tool instructions, context editing, file linkification, math integration rules, MCP tool instructions
- [ ] **Gemini** (`DefaultGeminiAgentPrompt`): Stronger instructions to actually invoke tools rather than describe them, `modelNeedsStrongReplaceStringHint`
- [ ] **OpenAI family**: `defaultOpenAIPrompt`, `gpt5Prompt`, `gpt51Prompt`, `gpt51CodexPrompt`, `gpt52Prompt`, `gpt53CodexPrompt`, `gpt5CodexPrompt`, `hiddenModelJPrompt`
- [ ] **xAI/Grok**, **Minimax**, **zAI**: Separate prompt registrations
- [ ] **Hidden/preview models**: Identified by SHA-256 hash, with dedicated prompt tuning

### Prompt Caching
- [ ] Cache breakpoints (`copilot_cache_control: { type: 'ephemeral' }`) are placed at strategic points in the prompt - after global context, after each historical message, after the current user message. Agent2 sends no cache control hints.
- [ ] **Frozen content**: Historical user messages are cached on Turn metadata so re-rendering doesn't change content (which would invalidate prompt caches).

### Workspace Structure in Prompt
- [ ] `visualFileTree()` - BFS expansion of workspace tree with character budget (1000 chars per folder), `shouldAlwaysIgnoreFile()` exclusions, truncation markers. Agent2 sends no workspace structure.

### User Query Wrapping
- [ ] User queries are wrapped in configurable XML tags (default `<userRequest>`, some models use `<user_query>`). Agent2 sends raw text.

---

## NETWORKING & API -- Comprehensive Gap Analysis

### Request Construction

#### Headers (agent2 sends only basic auth)
- [ ] `X-Request-Id` - Per-request UUID for correlation (agent2 may send this via CAPIClient, but doesn't set explicitly)
- [ ] `OpenAI-Intent` - Intent string derived from ChatLocation (e.g., `conversation-agent`, `summarize`)
- [ ] `X-GitHub-Api-Version: 2025-05-01` - API version pin
- [ ] `X-Interaction-Type` - `conversation-subagent`, `conversation-background`, or the intent
- [ ] `X-Agent-Task-Id` - Same as request ID
- [ ] `User-Agent: GitHubCopilotChat/<version>` - Proper user agent identification
- [ ] `X-VSCode-User-Agent-Library-Version` - Fetcher library identifier
- [ ] `Copilot-Integration-Id: vscode-chat` - Integration identification
- [ ] `X-Interaction-Id` - Session-scoped interaction ID
- [ ] `X-Initiator` - `user` or `agent` to indicate who started the request
- [ ] `Copilot-Vision-Request: true` - When images are present
- [ ] `anthropic-beta` - Feature flags (`interleaved-thinking-2025-05-14`, `context-management-2025-06-27`, `advanced-tool-use-2025-11-20`)
- [ ] `X-Model-Provider-Preference` - Optional model provider preference
- [ ] Per-model `requestHeaders` from CAPI model catalog response
- [ ] `VScode-ABExpContext` - A/B experimentation context

#### Fetcher System
- [ ] **Multi-fetcher fallback**: Extension has ElectronFetcher, NodeFetchFetcher, NodeFetcher with automatic failover. Agent2 uses bare `fetch()` via CAPIClient.
- [ ] **Network process crash detection**: If Electron's network process crashes, the fetcher is permanently demoted.
- [ ] **FetchEvent tracking**: Each fetch records phase (requestResponse/responseStreaming) and outcome for diagnostics.

### Error Handling

#### HTTP Status → Error Classification
Agent2 has basic retry on 429/500/502/503/529. The extension has a detailed mapping:

- [ ] `400 + off_topic` → OffTopic (content refusal)
- [ ] `400 + previous_response_not_found` → InvalidPreviousResponseId (retry without marker)
- [ ] `401, 403` → Token expired, triggers token reset and re-fetch
- [ ] `402` → Quota exceeded, refreshes copilot token, extracts `retry-after` date
- [ ] `404` → Model not found
- [ ] `422` → Content filtered by RAI service
- [ ] `424` → Agent failed dependency
- [ ] `429` → Rate limited (with `retry-after`, `x-ratelimit-exceeded`, `agent_mode_limit_exceeded`, `upstream_provider_rate_limit` code parsing)
- [ ] `466` → Client not supported (version too old)
- [ ] `499` → Server-side cancellation
- [ ] `5xx` → Server error with retry

#### Retry Logic Differences
- [ ] **Content filter retry**: When response is filtered, retry with `retryReason` signal and modified user message asking for different response. Agent2 doesn't handle content filtering.
- [ ] **Network connectivity check**: On network error, performs connectivity checks with configurable delays ([1s, 10s, 10s]) before retrying. Agent2 just does exponential backoff.
- [ ] **Auto-retry in autopilot**: Up to 3 retries on transient errors (excludes rate limit, quota, cancellation, off-topic). Agent2 has no autopilot mode.
- [ ] **Invalid stateful marker retry**: Retry without the `previous_response_id` marker if it's rejected.
- [ ] **Retry-After header parsing**: Agent2 parses this ✓, but the extension also handles `x-ratelimit-exceeded` and rate limit key parsing (`global-user-tps` patterns) with human-readable time display.

### Quota System
- [ ] `IChatQuotaService` processes quota headers from responses: tracks `quotaExhausted`, `overagesEnabled`
- [ ] Per-plan messaging (free, individual, individual_pro, organization)
- [ ] Quota exhaustion detection: auto-switch to base model when quota is exhausted
- [ ] Codes: `free_quota_exceeded`, `overage_limit_reached`

### Rate Limiting UI
- [ ] Human-readable rate limit display (e.g., "Please wait 30 seconds")
- [ ] `hideRateLimitTimeEstimate` option
- [ ] Distinguish between `agent_mode_limit_exceeded` and general rate limits

### WebSocket Transport
- [ ] Persistent WebSocket connections scoped to `(conversationId, turnId)`, with connection reuse within a turn and close on new turn
- [ ] Auto-disable: After 3 consecutive WebSocket failures with successful HTTP fallback, WebSocket is disabled
- [ ] Telemetry on connect duration, sent/received message counts, close codes, errors
- [ ] Fallback from WebSocket to HTTP on server errors

---

## MESSAGES API (Anthropic) -- Detailed Gap Analysis

Agent2's `AnthropicModelProvider` is a basic implementation. The extension has many
additional features:

### Request Body
- [x] Basic message translation (user/assistant/tool-result)
- [x] System prompt in separate `system` field
- [x] Tool definitions translated to Anthropic format
- [x] Thinking config with budget_tokens
- [x] Streaming
- [ ] **Adaptive thinking**: Extension supports `thinking.type: 'adaptive'` (model decides whether to think). Agent2 only supports `'enabled'`.
- [ ] **Thinking effort**: Extension sends `output_config.effort` (`low`/`medium`/`high`) alongside thinking. Agent2 only maps effort to budget_tokens.
- [ ] **Thinking budget normalization**: Extension normalizes budget to `[min_thinking_budget, min(max_thinking_budget, maxOutputTokens - 1, 32000)]` based on model metadata. Agent2 uses hardcoded budget map.
- [ ] **Disable thinking on continuation**: Extension disables thinking when continuing from tool calls if previous messages don't contain thinking data.
- [ ] **Cache control on content blocks**: Extension sets `cache_control: { type: 'ephemeral' }` on content blocks at cache breakpoints. Agent2 sends no cache hints.
- [ ] **Context editing**: `context_management` field with `clear_thinking_20251015` and `clear_tool_uses_20250919` edit types. Enabled via beta header.
- [ ] **Interleaved thinking**: Separate beta header `interleaved-thinking-2025-05-14` for models that support thinking interleaved with content. Agent2 sends this header but doesn't handle the response events differently.
- [ ] **Trailing assistant guard**: Extension appends "Please continue." if the last message is assistant-role (Anthropic rejects prefill). Agent2 doesn't guard.
- [ ] **Image support**: Extension handles `image_url` content parts (base64 data URLs and https URLs) with `media_type` mapping. Agent2 is text-only.

### SSE Response Parsing
- [x] Basic content_block_start/delta/stop for text and tool_use
- [x] Thinking block support
- [x] Usage extraction from message_start and message_delta
- [ ] **Context management response**: Extension parses `applied_edits` with `cleared_thinking_turns`, `cleared_tool_uses`, `cleared_input_tokens`. Agent2 doesn't handle.
- [ ] **Server tool calls**: Extension parses server-side tool calls (tool_search results) from the stream - logs them but doesn't execute. Agent2 doesn't handle.
- [ ] **IP code citations**: Extension extracts `copilot_annotations.IPCodeCitations` from deltas and deduplicates by URL. Agent2 doesn't handle.
- [ ] **Code vulnerability annotations**: Extension tracks security vulnerability detection in code blocks. Agent2 doesn't handle.
- [ ] **Content filter detection**: Extension detects `finish_reason: content_filter` and handles appropriately. Agent2 doesn't check finish reason.

### Deferred Tool Loading (CAPI Feature)
- [ ] Non-essential tools marked `defer_loading: true` - not sent initially, model must search first
- [ ] `tool_search_tool_regex` - CAPI server-side regex search for tools
- [ ] Client-side `tool_search` - embedding-based tool search alternative
- [ ] Instructions in system prompt for how to discover and use deferred tools

---

## RESPONSES API (OpenAI) -- Detailed Gap Analysis

Agent2's `OpenAIResponsesProvider` is a basic implementation.

### Request Body
- [x] Basic message translation
- [x] Function tools
- [x] Streaming
- [ ] **`previous_response_id`**: Extension extracts stateful markers from conversation history and sends only messages after the marker. Agent2 rebuilds full context every turn.
- [ ] **Compaction data round-trip**: Extension injects `{ type: 'compaction', id, encrypted_content }` items from previous responses. Agent2 doesn't handle.
- [ ] **Reasoning data round-trip**: Extension injects `{ type: 'reasoning', id, encrypted_content, summary }` items. Agent2 doesn't handle.
- [x] **`store: false`**
- [ ] **`reasoning.effort`**: Configurable (`low`/`medium`/`high`), default from experiment flag. Agent2 doesn't send.
- [ ] **`reasoning.summary`**: Configurable, disabled for codex-spark models. Agent2 doesn't send.
- [ ] **`include: ['reasoning.encrypted_content']`**: Always requested for reasoning round-tripping. Agent2 doesn't send.
- [ ] **`context_management`**: `compact_threshold` set to 90% of model max tokens for server-side compaction. Agent2 doesn't send.
- [ ] **`truncation`**: `'auto'` or `'disabled'` configurable. Agent2 doesn't send.
- [ ] **`text.verbosity`**: GPT-5.1, GPT-5-mini → `'low'`. Agent2 doesn't send.
- [ ] **Prediction (speculative decoding)**: `prediction: { type: 'content', content }` for predicted outputs. Agent2 doesn't support.

### SSE Response Parsing
- [x] Basic text deltas
- [x] Function call start/delta/complete
- [ ] **Compaction events**: `response.output_item.done` with `type: 'compaction'` - stored as `OpenAIContextManagementResponse` for next request. Agent2 doesn't handle.
- [ ] **Reasoning summary events**: `response.reasoning_summary_text.delta` → extracted for stateful markers. Agent2 doesn't handle.
- [ ] **Stateful markers**: Returned in finalized responses, stored on rounds, sent as `previous_response_id` on next request. Agent2 doesn't handle.
- [ ] **Phase events**: Agent phase transitions (e.g., planning → executing). Agent2 doesn't handle.
- [ ] **Logprobs**: Extension passes through logprob data. Agent2 doesn't handle.
- [ ] **Error events**: Structured `{ code, message }` error events in stream. Agent2 may not handle gracefully.

---

## AUTHENTICATION -- Gap Analysis

Agent2 receives a GitHub token via `setAuthToken()` and exchanges it for a CAPI token. The extension has much more:

- [ ] **Multi-scope auth tiers**: Minimal (`user:email`), Legacy (`read:user`), Permissive (`read:user`, `user:email`, `repo`, `workflow`). Agent2 just uses whatever token is given.
- [ ] **Permissive auth upgrade prompts**: When workspace operations need broader GitHub access, extension shows modal dialogs or in-chat upgrade prompts. Agent2 has no upgrade flow.
- [ ] **"Never Ask Again" preference**: `AuthPermissionMode.Minimal` config to suppress auth upgrade prompts.
- [ ] **Token metadata extraction**: Extension extracts SKU, organization_list, endpoints, quota info, feature flags from the copilot token. Agent2 only extracts the JWT.
- [ ] **Copilot token refresh logic**: Extension adjusts `expires_at` to `now + refresh_in + 60s` for clock skew. It also fires `onDidCopilotTokenRefresh` events. Agent2's refresh is simpler.
- [ ] **Token reset on 401/403**: Extension calls `resetCopilotToken(httpError)` to force re-exchange when API returns 401/403. Agent2 just throws.
- [ ] **Enterprise auth**: Enterprise users identified by `enterpriseList`, internal org detection via hash matching.
- [ ] **No-auth flow**: Device-ID-based token for `no_auth_limited_copilot` SKU users.
- [ ] **Feature flag extraction from token**: `code_quote_enabled`, `copilotignore_enabled`, `mcp`, `fcv1`, `sn` flags.

---

## HOOK SYSTEM -- Gap Analysis

The extension has a comprehensive hook system for extensibility. Agent2 has no
hook mechanism at all.

### Hook Types
- [ ] **SessionStart**: On new session, provides additional context
- [ ] **SessionEnd**: On session end
- [ ] **SubagentStart**: On sub-agent creation, provides context
- [ ] **UserPromptSubmit**: Before processing user prompt, can block or add context
- [ ] **Stop**: Before agent stops, can block stopping (forces continuation)
- [ ] **SubagentStop**: Before sub-agent stops, can block
- [ ] **PreToolUse**: Before tool execution - allow/deny/ask decision, input modification, additional context injection
- [ ] **PostToolUse**: After tool execution - can block result with reason
- [ ] **PreCompact**: Before conversation summarization
- [ ] **ErrorOccurred**: On errors

### Hook Implementation Details
- [ ] Hooks are user-configured shell commands receiving JSON input on stdin
- [ ] Exit code semantics: 0=success, 2=blocking error, other=non-blocking warning
- [ ] Session transcript flushed to disk before hook execution so scripts see current state
- [ ] Multiple hooks collapsed: PreToolUse uses most restrictive (deny > ask > allow)
- [ ] Stop hook blocking injects the reason as the next user query
- [ ] Hook configuration wizard (slash command `/hooks`)

---

## CUSTOM INSTRUCTIONS -- Gap Analysis

Agent2 has an `IInstructionProvider` interface (not wired). The extension has a
full instruction discovery and rendering pipeline.

### Instruction Sources
- [ ] **`.github/copilot-instructions.md`**: Per-workspace instructions file, discovered automatically
- [ ] **`.instructions.md` files**: Discovered via config globs, extension contributions, and skill folders. Support YAML frontmatter with `applyTo` patterns for file-scoped instructions.
- [ ] **User settings instructions**: `CodeGenerationInstruction[]` from VS Code config (inline text or file imports)
- [ ] **Extension-contributed instructions**: Extensions declare `chatInstructions` in `package.json` with path to instruction files
- [ ] **Mode instructions**: Custom agent mode-specific instructions
- [ ] **GitHub Org instructions**: Organization-level instructions fetched/cached from GitHub API, polled every 2 minutes

### Skills System
- [ ] Skills live in directories with `SKILL.md` at root
- [ ] Skill discovery from: `.github/skills/`, `.claude/skills/`, `~/.copilot/skills/`, `~/.claude/skills/`
- [ ] Config-based skill locations via `chat.agentSkillsLocations` setting
- [ ] Built-in `agent-customization` skill provider

### Custom Agent Files
- [ ] **`.agent.md`** files with YAML frontmatter: `name`, `description`, `tools`, `model`, `target`, `disable-model-invocation`, `user-invocable`, `agents`, `handoffs`
- [ ] **`.prompt.md`** files: Prompt templates
- [ ] **`AGENTS.md`**: Agent configuration file

### Instruction Rendering
- [ ] Instructions wrapped in `<SystemMessage>` or `<UserMessage>` depending on model preference (`modelPrefersInstructionsInUserMessage`)
- [ ] Claude 3.5 Sonnet puts instructions in user message and after history

---

## CONTEXT RESOLUTION -- Gap Analysis

Agent2 provides no context to the model beyond the user's text message and tool results.

### Editor Context
- [ ] Currently focused editor file contents/path/language
- [ ] Active editor selection (with surrounding code above/below via character-budget regions)
- [ ] Dirty (unsaved) file detection and inclusion

### Workspace Context
- [ ] Workspace folder set (multi-root workspace support)
- [ ] Technology stack detection via indicator files (React, Python, TypeScript, etc.) - `PromptWorkspaceLabels`
- [ ] VS Code task definitions included in context

### Conversation Context
- [ ] Full conversation history with proper role alternation
- [ ] Summarized conversation history when context is tight (LLM-based summarization)
- [ ] Edited file events since last turn
- [ ] Notebook summary changes
- [ ] Terminal state

### Variable Resolution
- [ ] `#file` references resolved to file contents
- [ ] `#selection` references resolved to editor selection
- [ ] `#tool` references → tool hint injection
- [ ] Prompt variables resolution
- [ ] Copilotignore filtering on all file references

---

## COPILOTIGNORE -- Gap Analysis

Agent2 has no file filtering system at all.

- [ ] **`.copilotignore` files**: Gitignore-syntax ignore patterns per workspace folder, watched for changes
- [ ] **Remote content exclusions**: Organization/repository-level exclusion rules from GitHub API with path globs, content match regexes (`ifAnyMatch`, `ifNoneMatch`)
- [ ] **Tool result filtering**: All file-returning tools check `IIgnoreService.isCopilotIgnored(file)` before including content
- [ ] **User message sanitization**: File paths in user messages are sanitized if they match copilotignore patterns
- [ ] **File search exclusion**: Combined patterns fed to file search as exclusion globs
- [ ] **Feature-flagged**: Only active when copilot token has the `copilotignore` feature flag

---

## RESPONSE PROCESSING -- Gap Analysis

Agent2 streams raw text deltas to the UI. The extension has a multi-layer
response processing pipeline.

### Linkification
- [ ] **File path linkifier**: Backtick-wrapped and plain-text paths resolved to workspace file URIs via filesystem stat checks
- [ ] **Model file path linkifier**: Markdown links output by the model (e.g., `[src/file.ts](src/file.ts#L10)`) resolved to actual workspace URIs with line/range anchors
- [ ] **Incremental linkifier**: Stateful token-by-token processing that avoids linkifying inside backtick spans, math spans, and fenced code blocks
- [ ] **Stat cache**: Filesystem stat results cached to avoid repeated disk access during linkification

### Code Blocks
- [ ] **Code block tracking**: State machine parser tracks code block boundaries, extracts filepath comments at start of blocks, collects all code blocks as structured objects
- [ ] **Code vulnerability annotations**: Security vulnerability detection displayed only inside code blocks
- [ ] **IP/copyright citations**: `copilot_annotations.IPCodeCitations` deduplicated by URL and shown as code citations

### Content Filtering
- [ ] **RAI filtering**: Responses filtered by Responsible AI Service (HTTP 422) get user-friendly messages
- [ ] **Finish reason `content_filter`**: Detected and handled with retry-with-retryReason flow
- [ ] **Off-topic detection**: HTTP 400 with `off_topic` code handled specially

---

## CONVERSATION MANAGEMENT -- Gap Analysis

### Autopilot Mode
Agent2 has no autopilot mode at all.
- [ ] `task_complete` tool required to signal completion
- [ ] Up to 5 continuation nudges if model stops without calling `task_complete`
- [ ] Auto-expand tool call limit by 1.5x, up to 200
- [ ] Auto-retry on fetch failures (up to 3 retries)
- [ ] `AUTOPILOT_CONTINUATION_MESSAGE` nudge with specific behavioral expectations

### Tool Call Limit Management
- [ ] Default limit: 15 per turn
- [ ] `ToolCallLimitBehavior.Confirm`: Shows confirmation dialog for user to approve continuation
- [ ] `ToolCallLimitBehavior.Stop`: Silently stops
- [ ] Auto-expansion in autopilot mode up to 200

### Message Validation
- [ ] **Orphaned tool result cleanup**: Removes tool result messages with no matching tool call in the preceding assistant message
- [ ] **Orphaned tool call cleanup**: Strips orphaned tool_calls from assistant messages (required for Gemini which needs 1:1 function_call↔function_response pairing)
- [ ] **Telemetry on filtered messages**

### Conversation Store
- [ ] `IConversationStore.addConversation()` - persists after each request with `Turn` objects containing request, references, rounds, thinking, response status, metadata
- [ ] `ISessionTranscriptService` - disk-based transcript for hook integration
- [ ] `ChatSummarizerProvider` - LLM-based conversation summarization using `copilot-fast` model
- [ ] `ChatTitleProvider` - Auto-generated chat titles

### Conversation Summarization
- [ ] Structured summary prompt requesting analysis sections: objectives, technical foundation, codebase status, decisions, progress tracking
- [ ] Pre-compact hook allows custom instructions before summarization
- [ ] Summary replaces older turns to fit within token budget

---

## MODEL PROVIDER SERVICE -- Gap Analysis

Agent2 resolves models by name prefix (claude- → Anthropic, gpt-/o1/o3/o4 → OpenAI).
The extension has much richer model management.

### Model Metadata from CAPI
- [ ] **Full capabilities object**: tokenizer type, token limits (prompt/output/context window), vision limits (max_prompt_images), supported features (parallel_tool_calls, streaming, prediction, thinking, adaptive_thinking, thinking budgets)
- [ ] **Supported endpoints**: `ChatCompletions`, `Responses`, `WebSocketResponses`, `Messages` - auto-selection based on metadata, not name prefixes
- [ ] **Model picker**: `model_picker_enabled`, `preview`, `is_chat_default`, `is_chat_fallback` flags
- [ ] **Billing info**: `is_premium`, `multiplier`, `restricted_to` SKUs
- [ ] **Warning/info messages**: Per-model messages from CAPI shown to users
- [ ] **Custom models**: BYOK custom model support with `custom_model` flag

### Model Family Detection
The extension has detailed model family detection (not just prefix matching):
- [ ] `isAnthropicFamily()`, `isGeminiFamily()`, `isGpt5PlusFamily()`, `isGptCodexFamily()`, `isGpt51Family()`, `isGpt52Family()`, etc.
- [ ] Hidden/preview models identified by SHA-256 hashes
- [ ] Per-family behavioral flags: `modelPrefersInstructionsInUserMessage()`, `modelPrefersJsonNotebookRepresentation()`, `modelNeedsStrongReplaceStringHint()`, `modelCanUseMcpResultImageURL()`, `modelShouldUseReplaceStringHealing()`

### Model Alias Resolution
- [ ] `ModelAliasRegistry`: `copilot-fast` → `gpt-4o-mini`, plus dynamic alias registration
- [ ] Endpoint token override (`cloneWithTokenOverride`) for speculative decoding

### Chat Completions API (Legacy)
- [ ] Agent2 has NO Chat Completions API provider (only Anthropic Messages + OpenAI Responses). The extension still uses Chat Completions as the default fallback for models that don't support Responses or Messages APIs.
- [ ] Special o1 handling: system messages converted to user role in Chat Completions
- [ ] Anthropic via Chat Completions: `thinking_budget` field (not the Messages API format)

---

## TELEMETRY & OBSERVABILITY -- Gap Analysis

Agent2 has basic log output. The extension has multi-destination telemetry and
full OpenTelemetry integration.

### Telemetry Destinations
- [ ] **Microsoft telemetry** via Azure App Insights
- [ ] **GitHub telemetry** - standard, enhanced (opt-in), and error events
- [ ] **SKU-enriched** GitHub events
- [ ] Shared properties: experiment assignments, config keys, editor version, plugin version, machine ID

### OpenTelemetry (OTel)
- [ ] `invoke_agent` span per agent invocation with GenAI semantic conventions
- [ ] Attributes: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `gen_ai.request.model`, `gen_ai.response.model`, token usage
- [ ] Per-turn events: `emitAgentTurnEvent`
- [ ] Content capture (opt-in): input/output messages, tool definitions
- [ ] Subagent trace context linking
- [ ] Session count metrics, agent duration, turn count

### Experimentation
- [ ] `vscode-tas-client` integration for A/B testing
- [ ] Experiment assignments included in telemetry
- [ ] Per-feature experiment flags gating behaviors

### Debug Panel
- [ ] Expose model request/response data in VS Code's Agent Debug Panel via IPC

---

## MCP INTEGRATION -- Gap Analysis

Agent2 has no MCP support.

- [ ] MCP tools appear alongside built-in tools with `source` metadata (handled by VS Code core)
- [ ] MCP server discovery, installation, and configuration wizard (McpToolCallingLoop with QuickInputTool/QuickPickTool)
- [ ] Package validation for npm, pip, docker, nuget MCP servers
- [ ] NuGet-specific MCP server installation
- [ ] `modelCanUseMcpResultImageURL()` per-model flag for MCP image results
- [ ] MCP tool instructions in Anthropic system prompt

---

## AGENT MODES & CUSTOM AGENTS -- Gap Analysis

Agent2 has a single agent mode. The extension has multiple modes and extensibility.

- [ ] **Ask Mode**: Read-only agent, no tool calling. Customizable tools and model via settings.
- [ ] **Edit Mode**: Restricted to active file + attached files. Read + edit tools only. "Continue with Agent Mode" handoff.
- [ ] **Agent Mode**: Full tool calling agent (what agent2 roughly corresponds to).
- [ ] **Plan Mode**: Planning-oriented agent mode.
- [ ] **Explore Mode**: Exploration-oriented agent mode.
- [ ] **Remote Agents**: Platform-based agents (e.g., `@github`) registered dynamically from CAPI, with slug-based routing and skill mappings. Streamed via `RemoteAgentChatEndpoint`.
- [ ] **GitHub Org Custom Agents**: Organization-level custom agents from `.agent.md` files fetched from GitHub.
- [ ] Per-mode tool set filtering (edit mode uses only `['read', 'edit']` tool sets)

---

## MISCELLANEOUS -- Gap Analysis

### Prompt Categorization
- [ ] Fire-and-forget `categorizePrompt()` on first turn for analytics

### Interaction Tracking
- [ ] `interactionService.startInteraction()` on non-subagent requests for usage analytics

### Edit Survival Tracking
- [ ] `IEditSurvivalTrackerService` tracks which AI edits survive user interaction (for quality metrics)

### Speculative Decoding
- [ ] `Copilot-Edits-Session` response header stores speculative decoding endpoint token
- [ ] Predictions with empty content stripped from requests

### Claude Agent SDK Integration
- [ ] `LanguageModelServer` - localhost HTTP server exposing Anthropic Messages API-compatible endpoint for Claude Agent SDK
- [ ] `AnthropicAdapter` - translates between Anthropic Messages API ↔ VS Code/CAPI
- [ ] Token usage scaling: makes the SDK think context window is 200k even when real limit is smaller
- [ ] Model mapping: `claude-haiku*` → `claude-haiku-4.5`, `claude-sonnet-4*` → `claude-sonnet-4.5`, etc.

---

## TESTING STRATEGY

### Current state
- [x] **Unit tests** (~94 tests) covering core types, conversation format, agent loop,
  middleware, schema validation, Anthropic provider, OpenAI provider, copilot token,
  model provider service, local agent, and session storage.
- [x] **Integration tests** (`agentLoop.integrationTest.ts`) - end-to-end scenarios against
  a real CAPI endpoint, gated on `GITHUB_TOKEN` env var. Proves the happy path works
  but requires network access and a valid token.

### Inner dev loop tests (needed)

These tests run fast, require no network, and can be used as part of agentic
development workflows. They are the primary safety net during implementation.

#### Recorded replay tests (wire format regression)
- [ ] Record real CAPI request/response pairs as fixture files (raw SSE chunks)
- [ ] Replay through each provider's SSE parser and verify the `ModelResponseChunk[]` output
- [ ] One fixture per feature: basic text, tool calls, thinking, redacted thinking,
  interleaved thinking, context management response, compaction events, server tool
  calls, reasoning summaries, stateful markers, content filter, error events, usage
- [ ] Validates wire format correctness without network access
- [ ] Every new API feature gets a fixture before or alongside implementation
- [ ] Shared contract tests: parameterize across providers to verify they all produce
  equivalent `ModelResponseChunk` shapes for semantically equivalent responses

#### Conversation shape tests (multi-turn state management)
- [ ] Build realistic 10+ turn conversations with mixed tool calls, thinking, errors
- [ ] Serialize to JSONL via `SessionStorage`, restore, verify rebuilt `IConversationMessage[]`
  matches the original exactly
- [ ] Resume from storage mid-conversation and verify the next model call gets correct history
- [ ] Verify middleware effects accumulate correctly across turns (context window pruning
  after many tool results, tool output truncation, etc.)
- [ ] Mock `IModelProvider` returns scripted `ModelResponseChunk[]` sequences - no real API calls

#### Scenario tests (scripted multi-turn pipelines)
- [ ] Define scenarios as scripted model responses + expected outcomes
- [ ] Mock `IModelProvider` yields canned chunk sequences per iteration
- [ ] Verify the full pipeline: loop iterations, tool executions, middleware application,
  session storage writes, IPC event translation
- [ ] Cover key flows:
  - Basic tool call cycle (read_file → edit → verify)
  - Parallel read-only tool batch execution
  - Error recovery (tool failure → model retry)
  - Max iteration limit hit
  - Cancellation mid-tool-execution
  - Session resumption from disk
  - Context window compaction trigger
  - Permission middleware deny/ask flows

#### Prompt snapshot tests (when prompt-tsx migration begins)
- [ ] Render the full system prompt for a given model + context configuration
- [ ] Compare against golden snapshot files
- [ ] Catch unintended prompt drift from code changes
- [ ] Separate snapshots per model family (Anthropic, OpenAI, Gemini, etc.)
- [ ] Verify cache breakpoint placement stability (prompt cache invalidation is expensive)

### Eval benchmarks (outer loop)

Not part of the inner dev loop, but important for measuring overall quality.

#### vscbench
- [ ] Run agent2 through vscbench - real product scenarios with real endpoints
- [ ] Gives overall score and performance baseline comparable to the extension
- [ ] **Request diffing**: Log the exact CAPI requests sent by both agent2 and the extension
  for the same vscbench scenarios, then diff them. This surfaces prompt differences,
  missing headers, tool definition discrepancies, and wire format issues that unit
  tests won't catch. Useful as a one-time validation after major milestones (prompt
  migration, new provider features, tool set changes).

---

## P2 -- Production-Grade Features

- [ ] Workspace snapshots (shadow git)
- [ ] Edit tracking (baselines, diffs)
- [ ] Rate limit awareness (429 handling with retry-after headers) - partially done (agent2 retries on 429) but missing quota handling, rate limit UI, content filter retry
- [ ] Streaming intent extraction middleware
- [ ] Public-facing hooks (external extension points)
- [ ] Full model discovery (GET /models endpoint) - partially done (agent2 calls /models but doesn't use all metadata)
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
- [ ] Come up with a solution for logging/tracing runs. OpenTelemetry or VS Code's agent debug panel?
- [ ] Chat Completions API provider (for models that don't support Responses or Messages APIs)

---
