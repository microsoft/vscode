// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, StopReason } from './types.js';

/**
 * Translates parsed GitHub Copilot chat-completions SSE events into the
 * uniform AgentEvent stream.
 *
 * Copilot's inference endpoint (`https://api.githubcopilot.com/chat/completions`)
 * speaks the OpenAI **chat.completions** chunk vocabulary — a single event type
 * `chat.completion.chunk` with a `choices[].delta` payload. This is distinct
 * from the ChatGPT subscription endpoint which uses the newer Responses API
 * (`response.created`, `response.output_text.delta`, ...). We keep the two
 * translators separate because the wire shapes do not overlap meaningfully.
 *
 * The translator is permissive: unknown finish reasons and unknown delta
 * fields are ignored so that benign provider-side additions do not break the
 * IDE.
 */

interface ChatChoiceDeltaToolCallFunction {
	name?: string;
	arguments?: string;
}

interface ChatChoiceDeltaToolCall {
	index: number;
	id?: string;
	type?: 'function';
	function?: ChatChoiceDeltaToolCallFunction;
}

interface ChatChoiceDelta {
	role?: 'assistant' | 'system' | 'user' | 'tool';
	content?: string | null;
	tool_calls?: ChatChoiceDeltaToolCall[];
}

interface ChatChoice {
	index: number;
	delta: ChatChoiceDelta;
	finish_reason?: string | null;
}

interface ChatCompletionUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number };
}

interface ChatCompletionChunk {
	id?: string;
	object?: string;
	model?: string;
	created?: number;
	choices?: ChatChoice[];
	usage?: ChatCompletionUsage | null;
	error?: { code?: string; message?: string; type?: string };
}

/** Stateful per-stream translator. Mirrors ChatGPTStreamTranslator's contract. */
export class CopilotStreamTranslator {
	private readonly toolUseIdByIndex = new Map<number, string>();
	private readonly toolUseStopped = new Set<number>();
	private readonly requestId: string;
	private readonly provider: string;
	private startEmitted = false;
	private stopEmitted = false;
	private finishReason: string | undefined;

	constructor(requestId: string, provider: string = 'copilot') {
		this.requestId = requestId;
		this.provider = provider;
	}

	translate(event: ChatCompletionChunk): AgentEvent[] {
		const out: AgentEvent[] = [];

		if (event.error) {
			const code = event.error.code ?? event.error.type ?? 'stream_error';
			out.push({
				type: 'error',
				code,
				message: event.error.message ?? 'Copilot stream emitted an error',
				retryable: isRetryableErrorCode(code),
			});
			return out;
		}

		if (!this.startEmitted) {
			this.startEmitted = true;
			out.push({
				type: 'message_start',
				requestId: this.requestId,
				provider: this.provider,
				model: event.model ?? 'unknown',
			});
		}

		const choices = event.choices ?? [];
		for (const choice of choices) {
			const delta = choice.delta ?? {};

			if (typeof delta.content === 'string' && delta.content.length > 0) {
				out.push({ type: 'text_delta', text: delta.content });
			}

			for (const call of delta.tool_calls ?? []) {
				const existing = this.toolUseIdByIndex.get(call.index);
				if (existing === undefined) {
					const toolUseId = call.id ?? `call-${call.index}`;
					this.toolUseIdByIndex.set(call.index, toolUseId);
					out.push({
						type: 'tool_use_start',
						toolUseId,
						name: call.function?.name ?? '',
					});
					if (call.function?.arguments && call.function.arguments.length > 0) {
						out.push({
							type: 'tool_use_delta',
							toolUseId,
							partialInput: call.function.arguments,
						});
					}
				} else {
					if (call.function?.arguments && call.function.arguments.length > 0) {
						out.push({
							type: 'tool_use_delta',
							toolUseId: existing,
							partialInput: call.function.arguments,
						});
					}
				}
			}

			if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
				this.finishReason = choice.finish_reason;
				for (const [index, toolUseId] of this.toolUseIdByIndex) {
					if (!this.toolUseStopped.has(index)) {
						this.toolUseStopped.add(index);
						out.push({ type: 'tool_use_stop', toolUseId });
					}
				}
			}
		}

		if (event.usage) {
			out.push(usageEvent(event.usage));
		}

		return out;
	}

	/** Emit a `message_stop` event derived from the last finish_reason seen. */
	finalize(): AgentEvent[] {
		if (this.stopEmitted) {
			return [];
		}
		this.stopEmitted = true;
		return [{
			type: 'message_stop',
			stopReason: mapFinishReason(this.finishReason),
		}];
	}

	get hasStart(): boolean {
		return this.startEmitted;
	}

	get hasStop(): boolean {
		return this.stopEmitted;
	}
}

function usageEvent(usage: ChatCompletionUsage): AgentEvent {
	return {
		type: 'usage',
		inputTokens: usage.prompt_tokens ?? 0,
		outputTokens: usage.completion_tokens ?? 0,
		cacheCreationInputTokens: undefined,
		cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens,
	};
}

function isRetryableErrorCode(code: string): boolean {
	return code === 'rate_limit_exceeded'
		|| code === 'server_error'
		|| code === 'service_unavailable'
		|| code === 'overloaded';
}

export function mapFinishReason(reason: string | undefined): StopReason {
	switch (reason) {
		case 'stop':
		case 'end_turn':
			return 'end_turn';
		case 'tool_calls':
		case 'tool_use':
		case 'function_call':
			return 'tool_use';
		case 'length':
		case 'max_tokens':
		case 'max_output_tokens':
			return 'max_tokens';
		case 'content_filter':
		case 'error':
			return 'error';
		default:
			return 'end_turn';
	}
}

/**
 * SSE parser specialised for the OpenAI chat.completions stream. Frames are
 * separated by blank lines; payload lines start with `data:` and a single
 * frame may span multiple `data:` lines (joined with `\n`). The terminator
 * frame `data: [DONE]` is filtered out — `finalize()` synthesises the uniform
 * `message_stop` after the stream ends.
 */
export class CopilotSseParser {
	private buffer = '';

	feed(chunk: string): ChatCompletionChunk[] {
		this.buffer += chunk;
		const events: ChatCompletionChunk[] = [];

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
				events.push(JSON.parse(data) as ChatCompletionChunk);
			} catch {
				// Tolerate malformed frames — Copilot occasionally inserts keep-alive
				// JSON the public schema does not document.
				continue;
			}
		}

		return events;
	}
}
