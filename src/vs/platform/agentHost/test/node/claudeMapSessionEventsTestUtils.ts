/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { SDKAssistantMessage, SDKPartialAssistantMessage, SDKResultSuccess, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';

// Beta event-stream type aliases. The `Anthropic` namespace re-exports
// these from `@anthropic-ai/sdk/resources/beta/messages.js`, but
// importing that subpath directly trips the `local/code-import-patterns`
// allowlist (the agentHost rule only permits the bare
// `@anthropic-ai/sdk` specifier). Local aliases via the `Anthropic`
// import keep the body of this file readable without extending the
// allowlist.
export type BetaRawContentBlockDeltaEvent = Anthropic.Beta.BetaRawContentBlockDeltaEvent;
export type BetaRawContentBlockStartEvent = Anthropic.Beta.BetaRawContentBlockStartEvent;
export type BetaRawContentBlockStopEvent = Anthropic.Beta.BetaRawContentBlockStopEvent;
export type BetaRawMessageStartEvent = Anthropic.Beta.BetaRawMessageStartEvent;
export type BetaRawMessageStopEvent = Anthropic.Beta.BetaRawMessageStopEvent;
export type BetaContentBlock = Anthropic.Beta.BetaContentBlock;

/**
 * Static fixture uuid used by every helper that needs to emit a
 * `${string}-${string}-${string}-${string}-${string}`-shaped value.
 * Tests that exercise uuid-sensitive logic (e.g. the Cycle C send-seam
 * test) construct their own uuids instead of relying on this constant.
 */
export const TEST_UUID = '11111111-2222-3333-4444-555555555555';

/**
 * Builds the non-nullable shape of {@link SDKResultSuccess.usage}. Most
 * fields are zeroed; the mapper only reads `input_tokens`,
 * `output_tokens`, and `cache_read_input_tokens`.
 */
export function makeNonNullableUsage(): SDKResultSuccess['usage'] {
	return {
		cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
		cache_creation_input_tokens: 0,
		cache_read_input_tokens: 0,
		inference_geo: 'unknown',
		input_tokens: 0,
		iterations: [],
		output_tokens: 0,
		server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
		service_tier: 'standard',
		speed: 'standard',
	};
}

export function makeSystemInitMessage(sessionId: string): SDKSystemMessage {
	return {
		type: 'system',
		subtype: 'init',
		apiKeySource: 'user',
		claude_code_version: '0.0.0-test',
		cwd: '/workspace',
		tools: [],
		mcp_servers: [],
		model: 'claude-test',
		permissionMode: 'default',
		slash_commands: [],
		output_style: 'default',
		skills: [],
		plugins: [],
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}

export function makeResultSuccess(sessionId: string): SDKResultSuccess {
	return {
		type: 'result',
		subtype: 'success',
		duration_ms: 0,
		duration_api_ms: 0,
		is_error: false,
		num_turns: 1,
		result: '',
		stop_reason: 'end_turn',
		total_cost_usd: 0,
		usage: makeNonNullableUsage(),
		modelUsage: {},
		permission_denials: [],
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}

// `stream_event` (SDKPartialAssistantMessage) builders. The SDK's
// `Options.includePartialMessages: true` setting (Phase 6 §3.4) routes
// raw `BetaRawMessageStreamEvent`s through to the agent so we can map
// per-token. The deep `BetaMessage` shape on `message_start` carries
// many required fields irrelevant to mapping; these helpers populate
// only what the mapper reads, with everything else set to safe zero
// values so the SDK type-checks pass without `as unknown` casts.

export function makeStreamEvent(
	sessionId: string,
	event: SDKPartialAssistantMessage['event'],
): SDKPartialAssistantMessage {
	return {
		type: 'stream_event',
		event,
		parent_tool_use_id: null,
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}

export function makeMessageStart(): BetaRawMessageStartEvent {
	return {
		type: 'message_start',
		message: {
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			model: 'claude-test',
			content: [],
			stop_reason: null,
			stop_sequence: null,
			stop_details: null,
			container: null,
			context_management: null,
			usage: {
				cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				inference_geo: 'unknown',
				input_tokens: 0,
				iterations: [],
				output_tokens: 0,
				server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
				service_tier: 'standard',
				speed: 'standard',
			},
		},
	};
}

export function makeContentBlockStartText(index: number): BetaRawContentBlockStartEvent {
	return {
		type: 'content_block_start',
		index,
		content_block: { type: 'text', text: '', citations: null },
	};
}

export function makeContentBlockStartThinking(index: number): BetaRawContentBlockStartEvent {
	return {
		type: 'content_block_start',
		index,
		content_block: { type: 'thinking', thinking: '', signature: '' },
	};
}

export function makeContentBlockStartToolUse(
	index: number,
	id: string,
	name: string,
): BetaRawContentBlockStartEvent {
	return {
		type: 'content_block_start',
		index,
		content_block: { type: 'tool_use', id, name, input: {} },
	};
}

export function makeTextDelta(index: number, text: string): BetaRawContentBlockDeltaEvent {
	return {
		type: 'content_block_delta',
		index,
		delta: { type: 'text_delta', text },
	};
}

export function makeThinkingDelta(index: number, thinking: string): BetaRawContentBlockDeltaEvent {
	return {
		type: 'content_block_delta',
		index,
		delta: { type: 'thinking_delta', thinking },
	};
}

export function makeContentBlockStop(index: number): BetaRawContentBlockStopEvent {
	return {
		type: 'content_block_stop',
		index,
	};
}

export function makeMessageStop(): BetaRawMessageStopEvent {
	return { type: 'message_stop' };
}

/**
 * Builds the canonical {@link SDKAssistantMessage} envelope (`type:
 * 'assistant'`) the SDK delivers as the final, authoritative message
 * for a turn alongside its `'stream_event'` partials. The {@link
 * content} blocks mirror what the partial accumulator should already
 * have produced via `content_block_*` events. Only the fields the
 * mapper inspects are filled with real values; the rest are zeroed so
 * the SDK type-checks pass.
 */
export function makeAssistantMessage(
	sessionId: string,
	content: BetaContentBlock[],
): SDKAssistantMessage {
	return {
		type: 'assistant',
		message: {
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			model: 'claude-test',
			content,
			stop_reason: 'end_turn',
			stop_sequence: null,
			container: null,
			context_management: null,
			usage: {
				cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				inference_geo: 'unknown',
				input_tokens: 0,
				iterations: [],
				output_tokens: 0,
				server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
				service_tier: 'standard',
				speed: 'standard',
			},
		},
		parent_tool_use_id: null,
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}
