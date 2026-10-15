/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  ILlmClient for OpenAI-compatible Chat Completions endpoints (OpenRouter, OpenAI, vLLM, …).
 *
 *  Request: `POST {baseUrl}/chat/completions` with `stream: true` and `tools` in OpenAI function
 *  format. Response: SSE `data: {choices: [{delta: {content, tool_calls}, finish_reason}]}`
 *  ending with `data: [DONE]`. Tool-call arguments arrive as string fragments keyed by `index`
 *  and are assembled here. Lines starting with `:` are keep-alive comments (OpenRouter sends
 *  `: OPENROUTER PROCESSING`).
 *--------------------------------------------------------------------------------------------*/

import { FinishReason, ILlmClient, LlmError, LlmEvent, LlmMessage, LlmRequest, LlmToolCall } from '../kernel/llm';
import { redactSecrets } from '../kernel/redact';

/** Limits on what an (untrusted) provider stream may make us buffer. */
export const STREAM_LIMITS = {
	maxLineChars: 4 * 1024 * 1024,
	maxToolCalls: 64,
	maxToolArgumentChars: 1024 * 1024,
	maxTextChars: 2 * 1024 * 1024,
} as const;

export interface OpenAiCompatibleOptions {
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly model: string;
	readonly extraHeaders?: Readonly<Record<string, string>>;
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly fetchImpl?: typeof fetch;
	/** Retries for network errors, 408, 429 and 5xx before the stream starts (default 3). */
	readonly maxRetries?: number;
	readonly retryBaseDelayMs?: number;
	/** Abort when no bytes arrive for this long (default 120 s). */
	readonly idleTimeoutMs?: number;
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

interface WireToolCall {
	readonly id: string;
	readonly type: 'function';
	readonly function: { readonly name: string; readonly arguments: string };
}

type WireMessage =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string };

export function toWireMessages(system: string, messages: readonly LlmMessage[]): WireMessage[] {
	const wire: WireMessage[] = [];
	if (system) {
		wire.push({ role: 'system', content: system });
	}
	for (const m of messages) {
		if (m.role === 'user') {
			wire.push({ role: 'user', content: m.content });
		} else if (m.role === 'tool') {
			wire.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
		} else if (m.toolCalls?.length) {
			wire.push({
				role: 'assistant',
				content: m.content || null,
				tool_calls: m.toolCalls.map(c => ({
					id: c.id,
					type: 'function',
					function: { name: c.name, arguments: c.rawArguments ?? JSON.stringify(c.input ?? {}) },
				})),
			});
		} else {
			wire.push({ role: 'assistant', content: m.content });
		}
	}
	return wire;
}

export function buildChatBody(options: Pick<OpenAiCompatibleOptions, 'model' | 'temperature' | 'maxTokens'>, request: LlmRequest): Record<string, unknown> {
	return {
		model: options.model,
		stream: true,
		messages: toWireMessages(request.system, request.messages),
		...request.tools.length ? {
			tools: request.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
		} : {},
		...options.temperature !== undefined ? { temperature: options.temperature } : {},
		...options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {},
	};
}

interface PendingCall {
	id: string;
	name: string;
	args: string;
}

function mapFinish(reason: string | undefined, hasCalls: boolean): FinishReason {
	if (hasCalls) {
		return 'tool-calls';
	}
	switch (reason) {
		case 'length': return 'length';
		case 'content_filter': return 'content-filter';
		case 'error': return 'error';
		default: return 'stop';
	}
}

function finishCall(pending: PendingCall, index: number): LlmToolCall {
	const id = pending.id || `call_${index}`;
	const raw = pending.args.trim();
	if (!raw) {
		return { id, name: pending.name, input: {} };
	}
	try {
		return { id, name: pending.name, input: JSON.parse(raw) };
	} catch (err) {
		return { id, name: pending.name, input: undefined, rawArguments: pending.args, inputError: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Parses a Chat Completions SSE stream into {@link LlmEvent}s. Chunks may split lines anywhere.
 * Tool calls are emitted once complete, before `finish`. An `error` payload throws.
 */
export async function* parseChatCompletionStream(chunks: AsyncIterable<Uint8Array | string>): AsyncGenerator<LlmEvent> {
	const decoder = new TextDecoder();
	const pending = new Map<number, PendingCall>();
	let finishReason: string | undefined;
	let sawFinish = false;
	let buffer = '';
	let textChars = 0;

	const flush = function* (): Generator<LlmEvent> {
		const ordered = [...pending.entries()].sort((a, b) => a[0] - b[0]);
		for (const [index, call] of ordered) {
			yield { kind: 'tool-call', call: finishCall(call, index) };
		}
		yield { kind: 'finish', reason: mapFinish(finishReason, ordered.length > 0) };
	};

	// Returns true at `[DONE]`.
	const handleLine = function* (line: string): Generator<LlmEvent, boolean> {
		if (!line.startsWith('data:')) {
			return false; // blank separators, `:` comments, `event:`/`id:` fields
		}
		const payload = line.slice(5).trim();
		if (payload === '[DONE]') {
			return true;
		}
		if (!payload) {
			return false;
		}
		let chunk: {
			error?: { message?: string; code?: number | string };
			choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
		};
		try {
			chunk = JSON.parse(payload);
		} catch {
			return false;
		}
		if (chunk.error) {
			const status = typeof chunk.error.code === 'number' ? chunk.error.code : undefined;
			throw new LlmError(`Model provider error: ${chunk.error.message ?? 'unknown error'}`, status);
		}
		const choice = chunk.choices?.[0];
		if (!choice) {
			return false;
		}
		if (choice.delta?.content) {
			textChars += choice.delta.content.length;
			if (textChars > STREAM_LIMITS.maxTextChars) {
				throw new LlmError('The model response is too long.');
			}
			yield { kind: 'text-delta', text: choice.delta.content };
		}
		for (const fragment of choice.delta?.tool_calls ?? []) {
			const index = fragment.index ?? 0;
			let call = pending.get(index);
			if (!call) {
				if (pending.size >= STREAM_LIMITS.maxToolCalls) {
					throw new LlmError(`The model requested more than ${STREAM_LIMITS.maxToolCalls} tool calls at once.`);
				}
				call = { id: '', name: '', args: '' };
				pending.set(index, call);
			}
			if (fragment.id) {
				call.id = fragment.id;
			}
			const name = fragment.function?.name;
			// Most providers send the name once in pieces; some repeat the whole name in later fragments.
			if (name && name !== call.name) {
				call.name += name;
			}
			if (fragment.function?.arguments) {
				call.args += fragment.function.arguments;
				if (call.args.length > STREAM_LIMITS.maxToolArgumentChars) {
					throw new LlmError('Tool-call arguments from the model are too large.');
				}
			}
		}
		if (choice.finish_reason) {
			finishReason = choice.finish_reason;
			sawFinish = true;
		}
		return false;
	};

	for await (const chunk of chunks) {
		buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, newline).replace(/\r$/, '');
			buffer = buffer.slice(newline + 1);
			if (yield* handleLine(line)) {
				yield* flush();
				return;
			}
		}
		if (buffer.length > STREAM_LIMITS.maxLineChars) {
			throw new LlmError('The model stream sent an oversized line.');
		}
	}
	buffer += decoder.decode();
	if (buffer.trim() && (yield* handleLine(buffer.trim()))) {
		yield* flush();
		return;
	}
	if (!sawFinish) {
		throw new LlmError('The model stream ended before the response was complete.');
	}
	yield* flush();
}

const defaultSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
	const timer = setTimeout(() => {
		signal.removeEventListener('abort', onAbort);
		resolve();
	}, ms);
	const onAbort = () => {
		clearTimeout(timer);
		reject(signal.reason ?? new Error('Aborted'));
	};
	signal.addEventListener('abort', onAbort, { once: true });
});

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function retryAfterMs(header: string | null): number | undefined {
	if (!header) {
		return undefined;
	}
	const seconds = Number(header);
	if (Number.isFinite(seconds)) {
		return Math.min(seconds * 1000, 60_000);
	}
	const date = Date.parse(header);
	return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 60_000);
}

export class OpenAiCompatibleClient implements ILlmClient {
	constructor(private readonly options: OpenAiCompatibleOptions) {
		if (!options.apiKey) {
			throw new LlmError('No API key configured for the model provider.');
		}
		if (!options.model) {
			throw new LlmError('No model configured for the model provider.');
		}
		let url: URL;
		try {
			url = new URL(options.baseUrl);
		} catch {
			throw new LlmError(`Invalid model provider URL "${options.baseUrl}".`);
		}
		const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
		if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
			throw new LlmError('The model provider URL must use https (plain http is only allowed for localhost), so the API key is never sent in clear text.');
		}
	}

	async *chat(request: LlmRequest, signal: AbortSignal): AsyncGenerator<LlmEvent> {
		const o = this.options;
		const doFetch = o.fetchImpl ?? fetch;
		const sleep = o.sleep ?? defaultSleep;
		const maxRetries = o.maxRetries ?? 3;
		const baseDelay = o.retryBaseDelayMs ?? 500;
		const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;
		const body = JSON.stringify(buildChatBody(o, request));

		// One controller per call: aborts on the caller's signal or on an idle stream.
		const controller = new AbortController();
		const onAbort = () => controller.abort(signal.reason);
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener('abort', onAbort, { once: true });
		}
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		const disarmIdle = () => clearTimeout(idleTimer);
		const armIdle = () => {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => controller.abort(new LlmError('The model stopped responding (idle timeout).')), o.idleTimeoutMs ?? 120_000);
		};

		try {
			let response: Response | undefined;
			for (let attempt = 0; ; attempt++) {
				armIdle();
				try {
					response = await doFetch(url, {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${o.apiKey}`,
							'Content-Type': 'application/json',
							'Accept': 'text/event-stream',
							...o.extraHeaders,
						},
						body,
						signal: controller.signal,
					});
				} catch (err) {
					if (controller.signal.aborted) {
						throw controller.signal.reason instanceof LlmError ? controller.signal.reason : err;
					}
					if (attempt < maxRetries) {
						disarmIdle();
						await sleep(baseDelay * 2 ** attempt, controller.signal);
						continue;
					}
					throw new LlmError(`Could not reach the model provider: ${err instanceof Error ? err.message : String(err)}`, undefined, true);
				}
				if (response.ok) {
					break;
				}
				const detail = redactSecrets((await response.text().catch(() => '')).slice(0, 500), [o.apiKey]);
				if (isRetryableStatus(response.status) && attempt < maxRetries) {
					disarmIdle();
					await sleep(retryAfterMs(response.headers.get('retry-after')) ?? baseDelay * 2 ** attempt, controller.signal);
					continue;
				}
				throw new LlmError(`Model provider returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status, isRetryableStatus(response.status));
			}
			if (!response.body) {
				throw new LlmError('Model provider returned an empty response.');
			}
			const stream = response.body as unknown as AsyncIterable<Uint8Array>;
			const watched = async function* () {
				for await (const chunk of stream) {
					armIdle();
					yield chunk;
				}
			};
			yield* parseChatCompletionStream(watched());
		} catch (err) {
			if (controller.signal.reason instanceof LlmError && !signal.aborted) {
				throw controller.signal.reason;
			}
			throw err;
		} finally {
			clearTimeout(idleTimer);
			signal.removeEventListener('abort', onAbort);
		}
	}
}
