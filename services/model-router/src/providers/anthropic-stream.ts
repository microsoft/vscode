// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, StopReason } from './types.js';

/**
 * Translates a parsed Anthropic SSE event JSON object into zero or more
 * uniform AgentEvent values. Pure function — easy to unit-test against
 * captured fixture streams.
 *
 * Anthropic's streaming protocol is documented at:
 *   https://docs.anthropic.com/en/api/messages-streaming
 *
 * Key event types we handle:
 *   - message_start         → AgentEvent.message_start + an initial usage event
 *   - content_block_start   → AgentEvent.tool_use_start (for tool blocks only)
 *   - content_block_delta   → text_delta | thinking_delta | tool_use_delta
 *   - content_block_stop    → tool_use_stop (only after tool blocks)
 *   - message_delta         → usage (output_tokens) + message_stop
 *   - message_stop          → no-op (message_delta already terminated)
 *   - error                 → error
 *   - ping                  → no-op (keepalive)
 */

interface AnthropicEventBase {
	type: string;
}

interface AnthropicUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

interface AnthropicMessageStart extends AnthropicEventBase {
	type: 'message_start';
	message: {
		id: string;
		model: string;
		usage: AnthropicUsage;
	};
}

interface AnthropicContentBlockStart extends AnthropicEventBase {
	type: 'content_block_start';
	index: number;
	content_block: {
		type: 'text' | 'tool_use' | 'thinking';
		id?: string;
		name?: string;
		input?: unknown;
	};
}

interface AnthropicContentBlockDelta extends AnthropicEventBase {
	type: 'content_block_delta';
	index: number;
	delta: {
		type: 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta';
		text?: string;
		partial_json?: string;
		thinking?: string;
		signature?: string;
	};
}

interface AnthropicContentBlockStop extends AnthropicEventBase {
	type: 'content_block_stop';
	index: number;
}

interface AnthropicMessageDelta extends AnthropicEventBase {
	type: 'message_delta';
	delta: { stop_reason?: string };
	usage?: AnthropicUsage;
}

interface AnthropicMessageStop extends AnthropicEventBase {
	type: 'message_stop';
}

interface AnthropicError extends AnthropicEventBase {
	type: 'error';
	error: { type?: string; message?: string };
}

type AnthropicEvent =
	| AnthropicMessageStart
	| AnthropicContentBlockStart
	| AnthropicContentBlockDelta
	| AnthropicContentBlockStop
	| AnthropicMessageDelta
	| AnthropicMessageStop
	| AnthropicError
	| AnthropicEventBase;

/**
 * Per-stream translator. Holds the small amount of state needed to map
 * Anthropic's index-based content-block model onto the uniform shape's
 * tool-use-id-based model.
 */
export class AnthropicStreamTranslator {
	private readonly toolUseIdByIndex = new Map<number, string>();
	private readonly thinkingIndices = new Set<number>();
	private readonly textIndices = new Set<number>();
	private requestId: string;
	private provider: string;

	constructor(requestId: string, provider: string = 'anthropic-oauth') {
		this.requestId = requestId;
		this.provider = provider;
	}

	translate(event: AnthropicEvent): AgentEvent[] {
		const out: AgentEvent[] = [];

		switch (event.type) {
			case 'message_start': {
				const msg = (event as AnthropicMessageStart).message;
				out.push({
					type: 'message_start',
					requestId: this.requestId,
					provider: this.provider,
					model: msg.model,
				});
				const usage = msg.usage;
				if (usage) {
					out.push(this.usageEvent(usage));
				}
				break;
			}

			case 'content_block_start': {
				const e = event as AnthropicContentBlockStart;
				const block = e.content_block;
				if (block.type === 'tool_use') {
					const toolUseId = block.id ?? `tool-${e.index}`;
					this.toolUseIdByIndex.set(e.index, toolUseId);
					out.push({
						type: 'tool_use_start',
						toolUseId,
						name: block.name ?? '',
						input: block.input,
					});
				} else if (block.type === 'thinking') {
					this.thinkingIndices.add(e.index);
				} else {
					this.textIndices.add(e.index);
				}
				break;
			}

			case 'content_block_delta': {
				const e = event as AnthropicContentBlockDelta;
				const d = e.delta;
				if (d.type === 'text_delta' && typeof d.text === 'string') {
					out.push({ type: 'text_delta', text: d.text });
				} else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
					const toolUseId = this.toolUseIdByIndex.get(e.index);
					if (toolUseId !== undefined) {
						out.push({
							type: 'tool_use_delta',
							toolUseId,
							partialInput: d.partial_json,
						});
					}
				} else if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
					out.push({ type: 'thinking_delta', text: d.thinking });
				} else if (d.type === 'signature_delta' && typeof d.signature === 'string') {
					// Signature attaches to the most recent thinking block; emit a
					// thinking_delta with empty text and the signature so consumers
					// can surface the verification token.
					out.push({ type: 'thinking_delta', text: '', signature: d.signature });
				}
				break;
			}

			case 'content_block_stop': {
				const e = event as AnthropicContentBlockStop;
				const toolUseId = this.toolUseIdByIndex.get(e.index);
				if (toolUseId !== undefined) {
					out.push({ type: 'tool_use_stop', toolUseId });
				}
				// text and thinking blocks have no explicit stop event in the uniform shape
				break;
			}

			case 'message_delta': {
				const e = event as AnthropicMessageDelta;
				if (e.usage) {
					out.push(this.usageEvent(e.usage));
				}
				const stopReason = mapStopReason(e.delta?.stop_reason);
				out.push({ type: 'message_stop', stopReason });
				break;
			}

			case 'message_stop':
			case 'ping':
				// Already terminated via message_delta; ping is a keepalive.
				break;

			case 'error': {
				const e = event as AnthropicError;
				const code = e.error?.type ?? 'unknown_error';
				out.push({
					type: 'error',
					code,
					message: e.error?.message ?? 'Anthropic stream emitted an error',
					retryable: isRetryableErrorCode(code),
				});
				break;
			}

			default:
				// Unknown event types are silently ignored — providers may add new ones.
				break;
		}

		return out;
	}

	private usageEvent(usage: AnthropicUsage): AgentEvent {
		return {
			type: 'usage',
			inputTokens: usage.input_tokens ?? 0,
			outputTokens: usage.output_tokens ?? 0,
			cacheCreationInputTokens: usage.cache_creation_input_tokens,
			cacheReadInputTokens: usage.cache_read_input_tokens,
		};
	}
}

function mapStopReason(reason: string | undefined): StopReason {
	switch (reason) {
		case 'end_turn': return 'end_turn';
		case 'tool_use': return 'tool_use';
		case 'max_tokens': return 'max_tokens';
		default: return 'end_turn';
	}
}

function isRetryableErrorCode(code: string): boolean {
	return code === 'overloaded_error' || code === 'rate_limit_error' || code === 'api_error';
}

/**
 * Parses a Server-Sent Events byte chunk into individual JSON event payloads.
 * Stateful — feed it incremental decoded text via feed() and it will yield
 * complete events as they arrive.
 */
export class SseParser {
	private buffer = '';

	feed(chunk: string): unknown[] {
		this.buffer += chunk;
		const events: unknown[] = [];

		// SSE frames are separated by a blank line. Lines within a frame begin
		// with field names like "data:" / "event:".
		while (true) {
			const sep = this.buffer.indexOf('\n\n');
			if (sep < 0) {
				break;
			}
			const frame = this.buffer.slice(0, sep);
			this.buffer = this.buffer.slice(sep + 2);

			const dataLines: string[] = [];
			for (const line of frame.split('\n')) {
				if (line.startsWith('data: ')) {
					dataLines.push(line.slice(6));
				} else if (line.startsWith('data:')) {
					dataLines.push(line.slice(5));
				}
			}
			if (dataLines.length === 0) {
				continue;
			}
			const data = dataLines.join('\n');
			if (data === '[DONE]') {
				continue;
			}
			try {
				events.push(JSON.parse(data));
			} catch {
				// Skip malformed JSON frames.
			}
		}

		return events;
	}
}
