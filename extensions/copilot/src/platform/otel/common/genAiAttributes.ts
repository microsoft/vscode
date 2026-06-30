/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// gen_ai.operation.name values
export const GenAiOperationName = {
	CHAT: 'chat',
	INVOKE_AGENT: 'invoke_agent',
	EXECUTE_TOOL: 'execute_tool',
	EMBEDDINGS: 'embeddings',
	/** Extension-specific: standalone markdown content event */
	CONTENT_EVENT: 'content_event',
	/** Extension-specific: hook command execution */
	EXECUTE_HOOK: 'execute_hook',
} as const;

// gen_ai.provider.name values
export const GenAiProviderName = {
	GITHUB: 'github',
	OPENAI: 'openai',
	ANTHROPIC: 'anthropic',
	AZURE_AI_OPENAI: 'azure.ai.openai',
	GEMINI: 'gemini',
} as const;

// gen_ai.token.type values
export const GenAiTokenType = {
	INPUT: 'input',
	OUTPUT: 'output',
} as const;

// gen_ai.tool.type values
export const GenAiToolType = {
	FUNCTION: 'function',
	EXTENSION: 'extension',
} as const;

/**
 * OTel GenAI semantic convention attribute keys.
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
 */
export const GenAiAttr = {
	// Core
	OPERATION_NAME: 'gen_ai.operation.name',
	PROVIDER_NAME: 'gen_ai.provider.name',

	// Request
	REQUEST_MODEL: 'gen_ai.request.model',
	REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
	REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
	REQUEST_TOP_P: 'gen_ai.request.top_p',
	REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
	REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',
	REQUEST_SEED: 'gen_ai.request.seed',
	REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
	/** Whether the request used streaming mode (recommended on streaming chat spans). */
	REQUEST_STREAM: 'gen_ai.request.stream',

	// Response
	RESPONSE_MODEL: 'gen_ai.response.model',
	RESPONSE_ID: 'gen_ai.response.id',
	RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
	/** Time to first streaming chunk, in seconds (recommended on streaming chat spans). */
	RESPONSE_TIME_TO_FIRST_CHUNK: 'gen_ai.response.time_to_first_chunk',

	// Usage
	USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
	USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
	USAGE_CACHE_READ_INPUT_TOKENS: 'gen_ai.usage.cache_read.input_tokens',
	USAGE_CACHE_CREATION_INPUT_TOKENS: 'gen_ai.usage.cache_creation.input_tokens',
	/** Legacy: reasoning/thinking token count. Prefer `USAGE_REASONING_OUTPUT_TOKENS`; this key is kept for backwards compatibility. */
	USAGE_REASONING_TOKENS: 'gen_ai.usage.reasoning_tokens',
	/** Reasoning/thinking output token count (semantic-convention-aligned). Dual-emitted alongside `USAGE_REASONING_TOKENS`. */
	USAGE_REASONING_OUTPUT_TOKENS: 'gen_ai.usage.reasoning.output_tokens',

	// Conversation
	CONVERSATION_ID: 'gen_ai.conversation.id',
	OUTPUT_TYPE: 'gen_ai.output.type',

	// Token type (for metrics)
	TOKEN_TYPE: 'gen_ai.token.type',

	// Agent
	AGENT_NAME: 'gen_ai.agent.name',
	AGENT_ID: 'gen_ai.agent.id',
	AGENT_VERSION: 'gen_ai.agent.version',
	AGENT_DESCRIPTION: 'gen_ai.agent.description',

	// Tool
	TOOL_NAME: 'gen_ai.tool.name',
	TOOL_TYPE: 'gen_ai.tool.type',
	TOOL_CALL_ID: 'gen_ai.tool.call.id',
	TOOL_DESCRIPTION: 'gen_ai.tool.description',
	TOOL_CALL_ARGUMENTS: 'gen_ai.tool.call.arguments',
	TOOL_CALL_RESULT: 'gen_ai.tool.call.result',

	// Content (opt-in)
	INPUT_MESSAGES: 'gen_ai.input.messages',
	OUTPUT_MESSAGES: 'gen_ai.output.messages',
	SYSTEM_INSTRUCTIONS: 'gen_ai.system_instructions',
	TOOL_DEFINITIONS: 'gen_ai.tool.definitions',
} as const;

/**
 * Extension-specific attribute keys (custom namespace).
 */
export const CopilotChatAttr = {
	LOCATION: 'copilot_chat.location',
	INTENT: 'copilot_chat.intent',
	TURN_INDEX: 'copilot_chat.turn.index',
	TURN_COUNT: 'copilot_chat.turn_count',
	TOOL_CALL_ROUND: 'copilot_chat.tool_call_round',
	API_TYPE: 'copilot_chat.api_type',
	FETCHER: 'copilot_chat.fetcher',
	DEBUG_NAME: 'copilot_chat.debug_name',
	ENDPOINT_TYPE: 'copilot_chat.endpoint_type',
	MAX_PROMPT_TOKENS: 'copilot_chat.request.max_prompt_tokens',
	TIME_TO_FIRST_TOKEN: 'copilot_chat.time_to_first_token',
	SESSION_ID: 'copilot_chat.session_id',
	SERVER_REQUEST_ID: 'copilot_chat.server_request_id',
	CANCELED: 'copilot_chat.canceled',
	/** Extended thinking/reasoning content (content-gated) */
	REASONING_CONTENT: 'copilot_chat.reasoning_content',
	/** User's actual typed message text, extracted from prompt context */
	USER_REQUEST: 'copilot_chat.user_request',
	/** Cache-relevant request options as a JSON blob (tool_choice, reasoning_effort, thinking, response_format, etc.). Used by Cache Explorer. */
	REQUEST_OPTIONS: 'copilot_chat.request.options',
	/** Request-shape metadata as a JSON blob (e.g. Responses API previous-response continuation and input item types). Used by Cache Explorer. */
	REQUEST_SHAPE: 'copilot_chat.request.shape',
	/** Resolved context section (code snippets, file contents, etc.) */
	PROMPT_CONTEXT: 'copilot_chat.prompt_context',
	/** Custom instructions section */
	PROMPT_INSTRUCTIONS: 'copilot_chat.prompt_instructions',
	/** VS Code chat session ID from CapturingToken — the definitive session identifier */
	CHAT_SESSION_ID: 'copilot_chat.chat_session_id',
	/** Parent chat session ID for linking child sessions (e.g., title, categorization) to their parent */
	PARENT_CHAT_SESSION_ID: 'copilot_chat.parent_chat_session_id',
	/** Debug log label for child sessions (e.g., 'title', 'categorization', 'runSubagent') */
	DEBUG_LOG_LABEL: 'copilot_chat.debug_log_label',
	/** Markdown content for standalone content events */
	MARKDOWN_CONTENT: 'copilot_chat.markdown_content',
	/** Edit source: inline_chat, chat_editing, chat_editing_hunk, apply_patch, replace_string, code_mapper */
	EDIT_SOURCE: 'copilot_chat.edit.source',
	/** Edit outcome: accepted, rejected, saved, unknown */
	EDIT_OUTCOME: 'copilot_chat.edit.outcome',
	/** Language identifier of the document */
	LANGUAGE_ID: 'copilot_chat.language_id',
	/** Time delay in milliseconds between acceptance and measurement */
	TIME_DELAY_MS: 'copilot_chat.time_delay_ms',
	/** Whether additional unactioned edits remain */
	HAS_REMAINING_EDITS: 'copilot_chat.has_remaining_edits',
	/** Git branch name (HEAD) */
	REPO_HEAD_BRANCH_NAME: 'copilot_chat.repo.head_branch_name',
	/** Git commit hash (HEAD) */
	REPO_HEAD_COMMIT_HASH: 'copilot_chat.repo.head_commit_hash',
	/** Normalized remote fetch URL */
	REPO_REMOTE_URL: 'copilot_chat.repo.remote_url',
	/** File path relative to the repository root */
	FILE_RELATIVE_PATH: 'copilot_chat.file.relative_path',
	/** Hook type / event name (e.g. PreToolUse, PostToolUse, Stop) */
	HOOK_TYPE: 'copilot_chat.hook_type',
	/** Serialized hook command input (truncated; emitters may or may not gate on captureContent — used by the Agent Debug Log panel) */
	HOOK_INPUT: 'copilot_chat.hook_input',
	/** Serialized hook command output (truncated; emitters may or may not gate on captureContent — used by the Agent Debug Log panel) */
	HOOK_OUTPUT: 'copilot_chat.hook_output',
	/** Hook result kind: 'success', 'error', or 'non_blocking_error' */
	HOOK_RESULT_KIND: 'copilot_chat.hook_result_kind',
	/** Custom chat mode name (when a custom mode is active) */
	MODE_NAME: 'copilot_chat.mode_name',
	/** Aggregated session cost in USD (Claude agent) */
	TOTAL_COST_USD: 'copilot_chat.total_cost_usd',
	/** Per-request cost from copilot_usage.total_nano_aiu */
	COPILOT_USAGE_NANO_AIU: 'copilot_chat.copilot_usage_nano_aiu',
} as const;

export type EditSource = 'inline_chat' | 'chat_editing' | 'chat_editing_hunk' | 'apply_patch' | 'replace_string' | 'code_mapper';
export type EditOutcome = 'accepted' | 'rejected' | 'saved' | 'unknown';

/**
 * Standard OTel attributes used alongside GenAI attributes.
 */
export const StdAttr = {
	ERROR_TYPE: 'error.type',
	SERVER_ADDRESS: 'server.address',
	SERVER_PORT: 'server.port',
} as const;

/**
 * Attribute keys emitted by the Copilot CLI SDK's native OTel instrumentation
 * (read by the bridge processor and the debug panel; the extension itself does
 * not produce these).
 */
export const CopilotCliSdkAttr = {
	HOOK_TYPE: 'github.copilot.hook.type',
	HOOK_INVOCATION_ID: 'github.copilot.hook.invocation_id',
} as const;

/**
 * Canonical `github.copilot.*` attribute namespace for Copilot Chat. These
 * attributes are dual-emitted alongside the legacy `copilot_chat.*` keys; new
 * dashboards should prefer this namespace.
 */
export const GitHubCopilotAttr = {
	/** Agent type classifier: `builtin` | `plugin` | `custom`. */
	AGENT_TYPE: 'github.copilot.agent.type',

	/** Cloud agent backend version classifier: `v1` (Jobs API) | `v2` (Task API). Used to compare the rollout backend versions. */
	CLOUD_BACKEND_VERSION: 'github.copilot.cloud.backend_version',

	/** Git remote URL (normalized). Dual of `copilot_chat.repo.remote_url`. */
	GIT_REPOSITORY: 'github.copilot.git.repository',
	/** Git HEAD branch. Dual of `copilot_chat.repo.head_branch_name`. */
	GIT_BRANCH: 'github.copilot.git.branch',
	/** Git HEAD commit. Dual of `copilot_chat.repo.head_commit_hash`. */
	GIT_COMMIT_SHA: 'github.copilot.git.commit_sha',
	/** GitHub `owner` segment derived from the remote URL (gated like the URL itself). */
	GITHUB_ORG: 'github.copilot.github.org',

	/** Hook decision result (`block` | `approve` | `non_blocking_error` | `pass`). */
	HOOK_DECISION: 'github.copilot.hook.decision',
	/** Hook duration in seconds (float). */
	HOOK_DURATION_SECONDS: 'github.copilot.hook.duration',
	/** JSON-encoded array of tool names a hook applies to (plural). */
	HOOK_TOOL_NAMES: 'github.copilot.hook.tool_names',

	/** SHA-256 hex of an MCP server name (always emitted). */
	MCP_SERVER_NAME_HASH: 'github.copilot.mcp.server.name_hash',
	/** Raw MCP server name (gated on captureContent). */
	MCP_SERVER_NAME: 'github.copilot.mcp.server.name',

	/** Shell command (truncated to 256 chars; gated on captureContent). */
	TOOL_PARAM_COMMAND: 'github.copilot.tool.parameters.command',
	/** File path argument (gated on captureContent). */
	TOOL_PARAM_FILE_PATH: 'github.copilot.tool.parameters.file_path',
	/** Edit operation kind (`create`, `update`, `str_replace`, `insert`). */
	TOOL_PARAM_EDIT_TYPE: 'github.copilot.tool.parameters.edit_type',
	/** Skill identifier for the invoked tool. */
	TOOL_PARAM_SKILL_NAME: 'github.copilot.tool.parameters.skill_name',
	/** SHA-256 hex of the MCP server name for an MCP tool call (always emitted). */
	TOOL_PARAM_MCP_SERVER_NAME_HASH: 'github.copilot.tool.parameters.mcp_server_name_hash',
	/** Raw MCP server name for an MCP tool call (gated). */
	TOOL_PARAM_MCP_SERVER_NAME: 'github.copilot.tool.parameters.mcp_server_name',
	/** MCP tool name (the part after the `mcp_<server>_` prefix). */
	TOOL_PARAM_MCP_TOOL_NAME: 'github.copilot.tool.parameters.mcp_tool_name',
} as const;

export type AgentType = 'builtin' | 'plugin' | 'custom';
export type HookDecision = 'block' | 'approve' | 'non_blocking_error' | 'pass';
export type EditOperationType = 'create' | 'update' | 'str_replace' | 'insert';

/** Max length for the `tool.parameters.command` attribute. */
export const TOOL_PARAM_COMMAND_MAX_LEN = 256;

/** Tool names treated as shell-command tools for parameter extraction. */
export const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
	'bash',
	'powershell',
	'local_shell',
	'runInTerminal',
	'run_in_terminal',
	// Claude
	'Bash',
]);

/**
 * Tool names treated as file tools for parameter extraction. Covers VS Code's
 * `ToolName` enum values (snake_case, see `extension/tools/common/toolNames.ts`)
 * and the camelCase / Claude-style variants seen on external surfaces.
 */
export const FILE_TOOL_NAMES: ReadonlySet<string> = new Set([
	// camelCase / Claude-style names
	'view',
	'create',
	'edit',
	'str_replace',
	'str_replace_editor',
	'insert',
	'readFile',
	'createFile',
	'replaceString',
	'applyPatch',
	// VS Code tool names (ToolName enum)
	'read_file',
	'create_file',
	'apply_patch',
	'insert_edit_into_file',
	'replace_string_in_file',
	'multi_replace_string_in_file',
	'edit_notebook_file',
	// Claude (capitalized)
	'Read',
	'Edit',
	'MultiEdit',
	'Write',
	'NotebookEdit',
]);
