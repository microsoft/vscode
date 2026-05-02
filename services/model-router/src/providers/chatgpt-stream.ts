// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, StopReason } from './types.js';

/**
 * Translates parsed ChatGPT-backend SSE events into uniform AgentEvent values.
 *
 * The ChatGPT subscription endpoint speaks the OpenAI **Responses API** event
 * vocabulary (`response.created`, `response.output_item.added`,
 * `response.output_text.delta`, `response.function_call_arguments.delta`,
 * `response.completed`, ...) rather than the older `chat.completions` chunk
 * shape — see §5.2 of AGENTIC_PLATFORM_PLAN.md. Output items are addressed by
 * `output_index`; this translator carries the small amount of state needed to
 * map those indices onto our `tool_use_id`-based uniform shape.
 *
 * The translator is deliberately permissive: unknown event types, unknown item
 * types and unknown content-part types are silently ignored so that benign
 * additions on the provider side do not break the IDE. Errors that originate
 * from the provider become `error` AgentEvents.
 */

interface ResponsesEventBase {
	type: string;
}

interface ResponsesUsage {
	input_tokens?: number;
	output_tokens?: number;
	input_tokens_details?: { cached_tokens?: number };
	output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponsesResponseShape {
	id?: string;
	model?: string;
	usage?: ResponsesUsage;
	status?: string;
	error?: { code?: string; message?: string };
	incomplete_details?: { reason?: string };
}

interface ResponsesCreated extends ResponsesEventBase {
	type: 'response.created';
	response: ResponsesResponseShape;
}

interface ResponsesOutputItem {
	id?: string;
	type: 'message' | 'function_call' | 'reasoning' | string;
	call_id?: string;
	name?: string;
	arguments?: string;
}

interface ResponsesOutputItemAdded extends ResponsesEventBase {
	type: 'response.output_item.added';
	output_index: number;
	item: ResponsesOutputItem;
}

interface ResponsesOutputItemDone extends ResponsesEventBase {
	type: 'response.output_item.done';
	output_index: number;
	item: ResponsesOutputItem;
}

interface ResponsesOutputTextDelta extends ResponsesEventBase {
	type: 'response.output_text.delta';
	output_index: number;
	delta: string;
}

interface ResponsesFunctionCallArgsDelta extends ResponsesEventBase {
	type: 'response.function_call_arguments.delta';
	output_index: number;
	delta: string;
}

interface ResponsesFunctionCallArgsDone extends ResponsesEventBase {
	type: 'response.function_call_arguments.done';
	output_index: number;
	arguments: string;
}

interface ResponsesReasoningDelta extends ResponsesEventBase {
	type: 'response.reasoning_summary_text.delta';
	output_index: number;
	delta: string;
}

interface ResponsesCompleted extends ResponsesEventBase {
	type: 'response.completed';
	response: ResponsesResponseShape;
}

interface ResponsesFailed extends ResponsesEventBase {
	type: 'response.failed';
	response: ResponsesResponseShape;
}

interface ResponsesIncomplete extends ResponsesEventBase {
	type: 'response.incomplete';
	response: ResponsesResponseShape;
}

interface ResponsesErrorEvent extends ResponsesEventBase {
	type: 'error';
	code?: string;
	message?: string;
	param?: string;
}

export type ChatGPTResponsesEvent =
	| ResponsesCreated
	| ResponsesOutputItemAdded
	| ResponsesOutputItemDone
	| ResponsesOutputTextDelta
	| ResponsesFunctionCallArgsDelta
	| ResponsesFunctionCallArgsDone
	| ResponsesReasoningDelta
	| ResponsesCompleted
	| ResponsesFailed
	| ResponsesIncomplete
	| ResponsesErrorEvent
	| ResponsesEventBase;

/** Stateful per-stream translator. */
export class ChatGPTStreamTranslator {
	private readonly toolUseIdByIndex = new Map<number, string>();
	private readonly toolUseStopped = new Set<number>();
	private readonly requestId: string;
	private readonly provider: string;
	private startEmitted = false;
	private stopEmitted = false;

	constructor(requestId: string, provider: string = 'chatgpt-oauth') {
		this.requestId = requestId;
		this.provider = provider;
	}

	translate(event: ChatGPTResponsesEvent): AgentEvent[] {
		const out: AgentEvent[] = [];

		switch (event.type) {
			case 'response.created': {
				const e = event as ResponsesCreated;
				this.startEmitted = true;
				out.push({
					type: 'message_start',
					requestId: this.requestId,
					provider: this.provider,
					model: e.response?.model ?? 'unknown',
				});
				break;
			}

			case 'response.output_item.added': {
				const e = event as ResponsesOutputItemAdded;
				const item = e.item;
				if (item?.type === 'function_call') {
					const toolUseId = item.call_id ?? item.id ?? `call-${e.output_index}`;
					this.toolUseIdByIndex.set(e.output_index, toolUseId);
					out.push({
						type: 'tool_use_start',
						toolUseId,
						name: item.name ?? '',
					});
					// Some providers attach the full arguments string at item-add time
					// when no streaming-args events follow. Forward it as a delta so
					// downstream consumers see the same shape regardless.
					if (typeof item.arguments === 'string' && item.arguments.length > 0) {
						out.push({
							type: 'tool_use_delta',
							toolUseId,
							partialInput: item.arguments,
						});
					}
				}
				// `message` and `reasoning` items don't open a uniform-shape block;
				// their deltas are handled directly.
				break;
			}

			case 'response.output_text.delta': {
				const e = event as ResponsesOutputTextDelta;
				if (typeof e.delta === 'string' && e.delta.length > 0) {
					out.push({ type: 'text_delta', text: e.delta });
				}
				break;
			}

			case 'response.function_call_arguments.delta': {
				const e = event as ResponsesFunctionCallArgsDelta;
				const toolUseId = this.toolUseIdByIndex.get(e.output_index);
				if (toolUseId !== undefined && typeof e.delta === 'string' && e.delta.length > 0) {
					out.push({
						type: 'tool_use_delta',
						toolUseId,
						partialInput: e.delta,
					});
				}
				break;
			}

			case 'response.function_call_arguments.done': {
				const e = event as ResponsesFunctionCallArgsDone;
				const toolUseId = this.toolUseIdByIndex.get(e.output_index);
				if (toolUseId !== undefined && !this.toolUseStopped.has(e.output_index)) {
					this.toolUseStopped.add(e.output_index);
					out.push({ type: 'tool_use_stop', toolUseId });
				}
				break;
			}

			case 'response.output_item.done': {
				const e = event as ResponsesOutputItemDone;
				if (e.item?.type === 'function_call'
					&& this.toolUseIdByIndex.has(e.output_index)
					&& !this.toolUseStopped.has(e.output_index)) {
					this.toolUseStopped.add(e.output_index);
					out.push({
						type: 'tool_use_stop',
						toolUseId: this.toolUseIdByIndex.get(e.output_index)!,
					});
				}
				break;
			}

			case 'response.reasoning_summary_text.delta': {
				const e = event as ResponsesReasoningDelta;
				if (typeof e.delta === 'string' && e.delta.length > 0) {
					out.push({ type: 'thinking_delta', text: e.delta });
				}
				break;
			}

			case 'response.completed': {
				const e = event as ResponsesCompleted;
				if (e.response?.usage) {
					out.push(usageEvent(e.response.usage));
				}
				this.stopEmitted = true;
				out.push({
					type: 'message_stop',
					stopReason: this.toolUseIdByIndex.size > 0 ? 'tool_use' : 'end_turn',
				});
				break;
			}

			case 'response.incomplete': {
				const e = event as ResponsesIncomplete;
				if (e.response?.usage) {
					out.push(usageEvent(e.response.usage));
				}
				this.stopEmitted = true;
				out.push({
					type: 'message_stop',
					stopReason: e.response?.incomplete_details?.reason === 'max_output_tokens'
						? 'max_tokens'
						: 'end_turn',
				});
				break;
			}

			case 'response.failed': {
				const e = event as ResponsesFailed;
				const code = e.response?.error?.code ?? 'response_failed';
				out.push({
					type: 'error',
					code,
					message: e.response?.error?.message ?? 'ChatGPT response failed',
					retryable: isRetryableErrorCode(code),
				});
				this.stopEmitted = true;
				out.push({ type: 'message_stop', stopReason: 'error' });
				break;
			}

			case 'error': {
				const e = event as ResponsesErrorEvent;
				const code = e.code ?? 'unknown_error';
				out.push({
					type: 'error',
					code,
					message: e.message ?? 'ChatGPT stream emitted an error',
					retryable: isRetryableErrorCode(code),
				});
				break;
			}

			default:
				// Unknown / unhandled event types (response.in_progress,
				// response.content_part.added, response.output_text.done, ...) are
				// intentionally ignored — they carry no information that isn't
				// already present in the deltas and completion events above.
				break;
		}

		return out;
	}

	get hasStart(): boolean {
		return this.startEmitted;
	}

	get hasStop(): boolean {
		return this.stopEmitted;
	}
}

function usageEvent(usage: ResponsesUsage): AgentEvent {
	return {
		type: 'usage',
		inputTokens: usage.input_tokens ?? 0,
		outputTokens: usage.output_tokens ?? 0,
		cacheCreationInputTokens: undefined,
		cacheReadInputTokens: usage.input_tokens_details?.cached_tokens,
	};
}

function isRetryableErrorCode(code: string): boolean {
	return code === 'rate_limit_exceeded'
		|| code === 'server_error'
		|| code === 'service_unavailable'
		|| code === 'overloaded'
		|| code === 'response_failed';
}

/**
 * SSE parser specialised for the ChatGPT Responses stream. The provider sends
 * frames with both an `event:` field and a `data:` JSON payload; we read the
 * type from the JSON itself (so the parser is symmetric with Anthropic's),
 * but we tolerate frames whose JSON omits `type` by falling back to the
 * event-name field.
 */
export class ChatGPTSseParser {
	private buffer = '';

	feed(chunk: string): unknown[] {
		this.buffer += chunk;
		const events: unknown[] = [];

		while (true) {
			const sep = this.buffer.indexOf('\n\n');
			if (sep < 0) {
				break;
			}
			const frame = this.buffer.slice(0, sep);
			this.buffer = this.buffer.slice(sep + 2);

			let eventName: string | undefined;
			const dataLines: string[] = [];
			for (const line of frame.split('\n')) {
				if (line.startsWith('event: ')) {
					eventName = line.slice(7).trim();
				} else if (line.startsWith('event:')) {
					eventName = line.slice(6).trim();
				} else if (line.startsWith('data: ')) {
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
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(data) as Record<string, unknown>;
			} catch {
				continue;
			}
			if (typeof parsed['type'] !== 'string' && eventName) {
				parsed['type'] = eventName;
			}
			events.push(parsed);
		}

		return events;
	}
}

export function mapResponsesStopReason(reason: string | undefined): StopReason {
	switch (reason) {
		case 'completed':
		case 'end_turn': return 'end_turn';
		case 'tool_calls':
		case 'tool_use': return 'tool_use';
		case 'max_output_tokens':
		case 'max_tokens': return 'max_tokens';
		default: return 'end_turn';
	}
}
