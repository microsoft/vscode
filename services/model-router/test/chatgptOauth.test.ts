// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	ChatGPTOAuthAdapter,
	CHATGPT_OAUTH_PROVIDER_ID,
	buildChatGPTRequest,
	type BrokerLike,
	type FetchFn,
} from '../src/providers/chatgpt-oauth.js';
import type { AgentEvent, UniformRequest } from '../src/providers/types.js';

class FakeBroker implements BrokerLike {
	tokensIssued = 0;
	invalidations = 0;
	tokenValue: string;
	headers?: Record<string, string>;

	constructor(tokenValue: string = 'tok-1', headers?: Record<string, string>) {
		this.tokenValue = tokenValue;
		this.headers = headers;
	}

	async getToken(_providerId: string): Promise<{ token: string; headers?: Record<string, string> }> {
		this.tokensIssued += 1;
		return { token: this.tokenValue, headers: this.headers };
	}

	async invalidate(_providerId: string): Promise<void> {
		this.invalidations += 1;
		this.tokenValue = `${this.tokenValue}-refreshed`;
	}
}

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let i = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (i >= frames.length) {
				controller.close();
				return;
			}
			controller.enqueue(encoder.encode(frames[i++]));
		},
	});
}

function fakeFetchOk(frames: string[]): { fetch: FetchFn; calls: Array<{ url: string; init: RequestInit | undefined }> } {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchFn: FetchFn = async (input, init) => {
		calls.push({ url: input.toString(), init });
		return new Response(sseStream(frames), {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});
	};
	return { fetch: fetchFn, calls };
}

function makeAdapter(broker: BrokerLike, fetchFn: FetchFn): ChatGPTOAuthAdapter {
	return new ChatGPTOAuthAdapter({
		broker,
		baseUrl: 'https://example.test/codex',
		fetchFn,
		userAgent: 'TestRunner/1',
	});
}

const baseRequest: UniformRequest = {
	model: 'gpt-5-codex',
	messages: [{ role: 'user', content: 'Hello' }],
	system: 'You are a helpful assistant.',
	requestId: 'req-test-1',
	maxTokens: 256,
};

describe('buildChatGPTRequest', () => {
	test('shapes a minimal uniform request into the Responses API body', () => {
		const body = buildChatGPTRequest(baseRequest);
		assert.deepStrictEqual(body, {
			model: 'gpt-5-codex',
			input: [
				{
					type: 'message',
					role: 'user',
					content: [{ type: 'input_text', text: 'Hello' }],
				},
			],
			stream: true,
			instructions: 'You are a helpful assistant.',
			max_output_tokens: 256,
		});
	});

	test('uses output_text content parts for assistant messages', () => {
		const body = buildChatGPTRequest({
			...baseRequest,
			messages: [
				{ role: 'user', content: 'A' },
				{ role: 'assistant', content: 'B' },
				{ role: 'user', content: 'C' },
			],
		});
		assert.deepStrictEqual(body.input, [
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'A' }] },
			{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'B' }] },
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'C' }] },
		]);
	});

	test('emits tool results as separate function_call_output items, preserving order', () => {
		const body = buildChatGPTRequest({
			...baseRequest,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Look at:' },
						{ type: 'tool_result', toolUseId: 'call_1', content: '42' },
						{ type: 'text', text: 'thanks' },
					],
				},
			],
		});
		assert.deepStrictEqual(body.input, [
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Look at:' }] },
			{ type: 'function_call_output', call_id: 'call_1', output: '42' },
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'thanks' }] },
		]);
	});

	test('passes through tool definitions in the function-tool shape', () => {
		const body = buildChatGPTRequest({
			...baseRequest,
			tools: [
				{
					name: 'search',
					description: 'Search the web',
					inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
				},
			],
		});
		assert.deepStrictEqual(body.tools, [
			{
				type: 'function',
				name: 'search',
				description: 'Search the web',
				parameters: { type: 'object', properties: { q: { type: 'string' } } },
			},
		]);
	});

	test('drops cacheBreakpoints since the ChatGPT backend has no equivalent', () => {
		const body = buildChatGPTRequest({
			...baseRequest,
			cacheBreakpoints: [{ atMessageIndex: 0, type: 'ephemeral' }],
		}) as unknown as Record<string, unknown>;
		assert.strictEqual('cache_breakpoints' in body, false);
		assert.strictEqual('cacheBreakpoints' in body, false);
	});

	test('marks tool errors so the model can distinguish them in context', () => {
		const body = buildChatGPTRequest({
			...baseRequest,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', toolUseId: 'call_2', content: 'boom', isError: true },
					],
				},
			],
		});
		assert.deepStrictEqual(body.input, [
			{ type: 'function_call_output', call_id: 'call_2', output: '[error] boom' },
		]);
	});
});

describe('ChatGPTOAuthAdapter', () => {
	test('isAvailable returns true when broker has credentials', async () => {
		const broker = new FakeBroker();
		const { fetch } = fakeFetchOk([]);
		const adapter = makeAdapter(broker, fetch);
		assert.strictEqual(await adapter.isAvailable(), true);
	});

	test('isAvailable returns false when broker rejects', async () => {
		const failing: BrokerLike = {
			getToken: async () => { throw new Error('no creds'); },
			invalidate: async () => undefined,
		};
		const adapter = makeAdapter(failing, () => Promise.reject(new Error('not called')));
		assert.strictEqual(await adapter.isAvailable(), false);
	});

	test('listModels returns the curated default ChatGPT-side list', async () => {
		const broker = new FakeBroker();
		const adapter = makeAdapter(broker, () => Promise.reject(new Error('not called')));
		const models = await adapter.listModels();
		assert.ok(models.length >= 1);
		assert.ok(models.every(m => m.supportsTools === true));
	});

	test('send streams a complete text response and yields the right uniform events', async () => {
		const broker = new FakeBroker();
		const frames = [
			'event: response.created\n' +
			'data: {"type":"response.created","response":{"id":"r","model":"gpt-5-codex"}}\n\n',
			'event: response.output_item.added\n' +
			'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"m","type":"message"}}\n\n',
			'event: response.output_text.delta\n' +
			'data: {"type":"response.output_text.delta","output_index":0,"delta":"Hi"}\n\n',
			'event: response.output_item.done\n' +
			'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"m","type":"message"}}\n\n',
			'event: response.completed\n' +
			'data: {"type":"response.completed","response":{"id":"r","model":"gpt-5-codex","usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
		];
		const { fetch, calls } = fakeFetchOk(frames);
		const adapter = makeAdapter(broker, fetch);

		const collected: AgentEvent[] = [];
		const controller = new AbortController();
		for await (const ev of adapter.send(baseRequest, controller.signal)) {
			collected.push(ev);
		}

		const summary = collected.map(e => {
			switch (e.type) {
				case 'text_delta': return `text:${e.text}`;
				case 'message_start': return `start:${e.model}`;
				case 'message_stop': return `stop:${e.stopReason}`;
				case 'usage': return `usage:in=${e.inputTokens},out=${e.outputTokens}`;
				default: return e.type;
			}
		});
		assert.deepStrictEqual(summary, [
			'start:gpt-5-codex',
			'text:Hi',
			'usage:in=10,out=5',
			'stop:end_turn',
		]);

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].url, 'https://example.test/codex/responses');
		const headers = calls[0].init!.headers as Record<string, string>;
		assert.strictEqual(headers['Authorization'], 'Bearer tok-1');
		assert.strictEqual(headers['Accept'], 'text/event-stream');
		assert.strictEqual(headers['User-Agent'], 'TestRunner/1');
		assert.strictEqual(headers['OpenAI-Beta'], 'responses=v1');
	});

	test('send retries once on 401 and yields events from the second response', async () => {
		const broker = new FakeBroker('expired');
		let callCount = 0;
		const fetchFn: FetchFn = async () => {
			callCount += 1;
			if (callCount === 1) {
				return new Response('unauthorized', { status: 401 });
			}
			return new Response(sseStream([
				'event: response.created\n' +
				'data: {"type":"response.created","response":{"id":"r","model":"gpt-5-codex"}}\n\n',
				'event: response.completed\n' +
				'data: {"type":"response.completed","response":{"model":"gpt-5-codex","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
			]), { status: 200 });
		};
		const adapter = makeAdapter(broker, fetchFn);

		const events: AgentEvent[] = [];
		for await (const e of adapter.send(baseRequest, new AbortController().signal)) {
			events.push(e);
		}

		assert.strictEqual(callCount, 2);
		assert.strictEqual(broker.invalidations, 1);
		assert.strictEqual(broker.tokensIssued, 2);
		assert.ok(events.some(e => e.type === 'message_stop' && e.stopReason === 'end_turn'));
		assert.ok(!events.some(e => e.type === 'error'));
	});

	test('send yields an error event and message_stop on persistent 4xx', async () => {
		const broker = new FakeBroker();
		const fetchFn: FetchFn = async () => new Response('rate limited', { status: 429 });
		const adapter = makeAdapter(broker, fetchFn);

		const events: AgentEvent[] = [];
		for await (const e of adapter.send(baseRequest, new AbortController().signal)) {
			events.push(e);
		}

		const error = events.find(e => e.type === 'error');
		const stop = events.find(e => e.type === 'message_stop');
		assert.ok(error && stop);
		assert.deepStrictEqual(
			{
				code: error.type === 'error' ? error.code : '',
				retryable: error.type === 'error' ? error.retryable : false,
				stop: stop.type === 'message_stop' ? stop.stopReason : '',
			},
			{ code: 'rate_limited', retryable: true, stop: 'error' },
		);
	});

	test('send synthesises a message_stop when the stream ends without one', async () => {
		const broker = new FakeBroker();
		const { fetch } = fakeFetchOk([
			'event: response.created\n' +
			'data: {"type":"response.created","response":{"id":"r","model":"gpt-5-codex"}}\n\n',
			'event: response.output_text.delta\n' +
			'data: {"type":"response.output_text.delta","output_index":0,"delta":"hi"}\n\n',
		]);
		const adapter = makeAdapter(broker, fetch);

		const events: AgentEvent[] = [];
		for await (const e of adapter.send(baseRequest, new AbortController().signal)) {
			events.push(e);
		}
		const stop = events.find(e => e.type === 'message_stop');
		assert.ok(stop);
		assert.strictEqual(stop.type === 'message_stop' && stop.stopReason, 'end_turn');
	});

	test('send identifies itself with the configured provider id', () => {
		const broker = new FakeBroker();
		const adapter = makeAdapter(broker, () => Promise.reject(new Error('not called')));
		assert.strictEqual(adapter.id, CHATGPT_OAUTH_PROVIDER_ID);
	});

	test('forwards broker-supplied extra headers (e.g. session cookies)', async () => {
		const broker = new FakeBroker('tok-1', { 'X-Session': 'abc', 'OpenAI-Beta': 'override' });
		const { fetch, calls } = fakeFetchOk([
			'event: response.created\n' +
			'data: {"type":"response.created","response":{"id":"r","model":"gpt-5-codex"}}\n\n',
			'event: response.completed\n' +
			'data: {"type":"response.completed","response":{"model":"gpt-5-codex","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
		]);
		const adapter = makeAdapter(broker, fetch);
		for await (const _ of adapter.send(baseRequest, new AbortController().signal)) {
			// drain
		}
		const headers = calls[0].init!.headers as Record<string, string>;
		assert.strictEqual(headers['X-Session'], 'abc');
		assert.strictEqual(headers['OpenAI-Beta'], 'override');
	});
});
