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

	// Response
	RESPONSE_MODEL: 'gen_ai.response.model',
	RESPONSE_ID: 'gen_ai.response.id',
	RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

	// Usage
	USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
	USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
	USAGE_CACHE_READ_INPUT_TOKENS: 'gen_ai.usage.cache_read.input_tokens',
	USAGE_CACHE_CREATION_INPUT_TOKENS: 'gen_ai.usage.cache_creation.input_tokens',
	/** Custom: reasoning/thinking token count (not yet standardized in GenAI conventions) */
	USAGE_REASONING_TOKENS: 'gen_ai.usage.reasoning_tokens',

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
