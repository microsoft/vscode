/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Platform-side mirror of the extension's GenAI attribute constants.
 * Kept intentionally in sync with `extensions/copilot/src/platform/otel/common/genAiAttributes.ts`.
 */

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

// gen_ai.token.type values
export const GenAiTokenType = {
	INPUT: 'input',
	OUTPUT: 'output',
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

	// Token type (for metrics)
	TOKEN_TYPE: 'gen_ai.token.type',

	// Agent
	AGENT_NAME: 'gen_ai.agent.name',

	// Tool
	TOOL_NAME: 'gen_ai.tool.name',
	TOOL_TYPE: 'gen_ai.tool.type',
	TOOL_CALL_ID: 'gen_ai.tool.call.id',
} as const;

/**
 * Extension-specific attribute keys (custom namespace).
 */
export const CopilotChatAttr = {
	TURN_INDEX: 'copilot_chat.turn.index',
	TIME_TO_FIRST_TOKEN: 'copilot_chat.time_to_first_token',
	/** VS Code chat session ID from CapturingToken — the definitive session identifier */
	CHAT_SESSION_ID: 'copilot_chat.chat_session_id',
	/** Hook type / event name (e.g. PreToolUse, PostToolUse, Stop) */
	HOOK_TYPE: 'copilot_chat.hook_type',
	/** Serialized hook command input */
	HOOK_INPUT: 'copilot_chat.hook_input',
	/** Serialized hook command output */
	HOOK_OUTPUT: 'copilot_chat.hook_output',
	/** Hook result kind: 'success', 'error', or 'non_blocking_error' */
	HOOK_RESULT_KIND: 'copilot_chat.hook_result_kind',
} as const;

/**
 * Attribute keys emitted by the Copilot CLI SDK's native OTel instrumentation
 * (read by the bridge processor; the host itself does not produce these).
 */
export const CopilotCliSdkAttr = {
	HOOK_TYPE: 'github.copilot.hook.type',
	HOOK_INVOCATION_ID: 'github.copilot.hook.invocation_id',
} as const;
