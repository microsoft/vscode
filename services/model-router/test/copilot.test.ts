// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	CopilotAdapter,
	COPILOT_PROVIDER_ID,
	buildCopilotRequest,
	parseCopilotModels,
	type BrokerLike,
	type FetchFn,
} from '../src/providers/copilot.js';
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

function makeAdapter(broker: BrokerLike, fetchFn: FetchFn): CopilotAdapter {
	return new CopilotAdapter({
		broker,
		baseUrl: 'https://copilot.test',
		fetchFn,
		userAgent: 'TestRunner/1',
		editorVersion: 'TestEditor/9',
		editorPluginVersion: 'test-plugin/2',
		integrationId: 'test-int',
	});
}

const baseRequest: UniformRequest = {
	model: 'gpt-4o',
	messages: [{ role: 'user', content: 'Hello' }],
	system: 'You are a helpful assistant.',
	requestId: 'req-test-1',
	maxTokens: 256,
};

describe('buildCopilotRequest', () => {
	test('shapes a minimal uniform request into a chat.completions body', () => {
		const body = buildCopilotRequest(baseRequest);
		assert.deepStrictEqual(body, {
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: 'Hello' },
			],
			stream: true,
			stream_options: { include_usage: true },
			max_tokens: 256,
		});
	});

	test('emits tool results as separate role:tool messages, preserving order', () => {
		const body = buildCopilotRequest({
			...baseRequest,
			system: undefined,
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
		assert.deepStrictEqual(body.messages, [
			{ role: 'user', content: 'Look at:' },
			{ role: 'tool', tool_call_id: 'call_1', content: '42' },
			{ role: 'user', content: 'thanks' },
		]);
	});

	test('marks tool errors so the model can distinguish them', () => {
		const body = buildCopilotRequest({
			...baseRequest,
			system: undefined,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', toolUseId: 'call_2', content: 'boom', isError: true },
					],
				},
			],
		});
		assert.deepStrictEqual(body.messages, [
			{ role: 'tool', tool_call_id: 'call_2', content: '[error] boom' },
		]);
	});

	test('passes through tool definitions in the function-tool shape', () => {
		const body = buildCopilotRequest({
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
				function: {
					name: 'search',
					description: 'Search the web',
					parameters: { type: 'object', properties: { q: { type: 'string' } } },
				},
			},
		]);
	});

	test('drops cacheBreakpoints since Copilot has no cache_control analogue', () => {
		const body = buildCopilotRequest({
			...baseRequest,
			cacheBreakpoints: [{ atMessageIndex: 0, type: 'ephemeral' }],
		}) as unknown as Record<string, unknown>;
		assert.strictEqual('cache_breakpoints' in body, false);
		assert.strictEqual('cacheBreakpoints' in body, false);
	});
});

describe('parseCopilotModels', () => {
	test('maps the GitHub Copilot /models response shape onto ModelDescriptors', () => {
		const parsed = parseCopilotModels({
			data: [
				{
					id: 'gpt-4o',
					name: 'GPT-4o',
					capabilities: {
						limits: { max_context_window_tokens: 128000 },
						supports: { tool_calls: true, streaming: true },
					},
				},
				{
					id: 'claude-sonnet-4',
					name: 'Claude Sonnet 4',
					capabilities: { supports: { tool_calls: false } },
				},
				{ id: '' },
				{},
			],
		});
		assert.deepStrictEqual(parsed, [
			{
				id: 'gpt-4o',
				displayName: 'GPT-4o',
				contextWindow: 128000,
				supportsTools: true,
				supportsThinking: false,
				supportsCaching: false,
			},
			{
				id: 'claude-sonnet-4',
				displayName: 'Claude Sonnet 4',
				contextWindow: undefined,
				supportsTools: false,
				supportsThinking: false,
				supportsCaching: false,
			},
		]);
	});

	test('returns empty for malformed bodies', () => {
		assert.deepStrictEqual(parseCopilotModels({} as never), []);
		assert.deepStrictEqual(parseCopilotModels({ data: 'nope' as unknown as never }), []);
	});
});

describe('CopilotAdapter', () => {
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

	test('listModels hits /models, caches per session token, and falls back on failure', async () => {
		const broker = new FakeBroker('tok-A');
		let modelsCalls = 0;
		const fetchFn: FetchFn = async (input) => {
			const url = input.toString();
			if (url.endsWith('/models')) {
				modelsCalls += 1;
				return new Response(JSON.stringify({
					data: [
						{ id: 'gpt-4o', name: 'GPT-4o', capabilities: { supports: { tool_calls: true } } },
					],
				}), { status: 200, headers: { 'Content-Type': 'application/json' } });
			}
			throw new Error(`unexpected ${url}`);
		};
		const adapter = makeAdapter(broker, fetchFn);

		const first = await adapter.listModels();
		const second = await adapter.listModels();
		assert.deepStrictEqual(first.map(m => m.id), ['gpt-4o']);
		assert.deepStrictEqual(second.map(m => m.id), ['gpt-4o']);
		assert.strictEqual(modelsCalls, 1);

		broker.tokenValue = 'tok-B';
		const third = await adapter.listModels();
		assert.deepStrictEqual(third.map(m => m.id), ['gpt-4o']);
		assert.strictEqual(modelsCalls, 2);
	});

	test('listModels falls back to defaults when the live lookup fails', async () => {
		const broker = new FakeBroker();
		const fetchFn: FetchFn = async () => new Response('boom', { status: 500 });
		const adapter = makeAdapter(broker, fetchFn);
		const models = await adapter.listModels();
		assert.ok(models.length >= 1);
		assert.ok(models.every(m => typeof m.id === 'string' && m.id.length > 0));
	});

	test('send streams a complete text response and yields the right uniform events', async () => {
		const broker = new FakeBroker();
		const frames = [
			'data: {"id":"c","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n',
			'data: {"id":"c","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n\n',
			'data: {"id":"c","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
			'data: {"id":"c","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
			'data: [DONE]\n\n',
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
			'start:gpt-4o',
			'text:Hi',
			'usage:in=10,out=5',
			'stop:end_turn',
		]);

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].url, 'https://copilot.test/chat/completions');
		const headers = calls[0].init!.headers as Record<string, string>;
		assert.strictEqual(headers['Authorization'], 'Bearer tok-1');
		assert.strictEqual(headers['Accept'], 'text/event-stream');
		assert.strictEqual(headers['User-Agent'], 'TestRunner/1');
		assert.strictEqual(headers['Editor-Version'], 'TestEditor/9');
		assert.strictEqual(headers['Editor-Plugin-Version'], 'test-plugin/2');
		assert.strictEqual(headers['Copilot-Integration-Id'], 'test-int');
	});

	test('send does NOT retry on 401 and surfaces an unauthorized error', async () => {
		const broker = new FakeBroker('expired');
		let callCount = 0;
		const fetchFn: FetchFn = async () => {
			callCount += 1;
			return new Response('unauthorized', { status: 401 });
		};
		const adapter = makeAdapter(broker, fetchFn);

		const events: AgentEvent[] = [];
		for await (const e of adapter.send(baseRequest, new AbortController().signal)) {
			events.push(e);
		}

		assert.strictEqual(callCount, 1);
		assert.strictEqual(broker.invalidations, 0);
		const error = events.find(e => e.type === 'error');
		assert.ok(error && error.type === 'error');
		assert.strictEqual(error.code, 'unauthorized');
		assert.strictEqual(error.retryable, false);
		const stop = events.find(e => e.type === 'message_stop');
		assert.ok(stop && stop.type === 'message_stop' && stop.stopReason === 'error');
	});

	test('send yields an error event and message_stop on persistent 5xx', async () => {
		const broker = new FakeBroker();
		const fetchFn: FetchFn = async () => new Response('boom', { status: 503 });
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
			{ code: 'server_error', retryable: true, stop: 'error' },
		);
	});

	test('send synthesises a message_stop when the stream ends without a finish_reason', async () => {
		const broker = new FakeBroker();
		const { fetch } = fakeFetchOk([
			'data: {"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n',
		]);
		const adapter = makeAdapter(broker, fetch);

		const events: AgentEvent[] = [];
		for await (const e of adapter.send(baseRequest, new AbortController().signal)) {
			events.push(e);
		}
		const stop = events.find(e => e.type === 'message_stop');
		assert.ok(stop && stop.type === 'message_stop' && stop.stopReason === 'end_turn');
	});

	test('exposes the canonical provider id', () => {
		const broker = new FakeBroker();
		const adapter = makeAdapter(broker, () => Promise.reject(new Error('not called')));
		assert.strictEqual(adapter.id, COPILOT_PROVIDER_ID);
		assert.strictEqual(adapter.id, 'copilot');
	});

	test('forwards broker-supplied extra headers', async () => {
		const broker = new FakeBroker('tok-1', { 'X-GitHub-Api-Version': '2024-01-01' });
		const { fetch, calls } = fakeFetchOk([
			'data: {"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
		]);
		const adapter = makeAdapter(broker, fetch);
		for await (const _ of adapter.send(baseRequest, new AbortController().signal)) {
			// drain
		}
		const headers = calls[0].init!.headers as Record<string, string>;
		assert.strictEqual(headers['X-GitHub-Api-Version'], '2024-01-01');
	});
});
