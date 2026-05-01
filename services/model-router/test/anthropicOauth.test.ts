// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	AnthropicOAuthAdapter,
	ANTHROPIC_OAUTH_PROVIDER_ID,
	buildAnthropicRequest,
	type BrokerLike,
	type FetchFn,
} from '../src/providers/anthropic-oauth.js';
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
		// On the next getToken, simulate a freshly refreshed token.
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

function makeAdapter(broker: BrokerLike, fetchFn: FetchFn): AnthropicOAuthAdapter {
	return new AnthropicOAuthAdapter({
		broker,
		baseUrl: 'https://example.test',
		fetchFn,
		userAgent: 'TestRunner/1',
	});
}

const baseRequest: UniformRequest = {
	model: 'claude-sonnet-4-6',
	messages: [{ role: 'user', content: 'Hello' }],
	system: 'You are a helpful assistant.',
	requestId: 'req-test-1',
	maxTokens: 256,
};

describe('buildAnthropicRequest', () => {
	test('shapes a minimal uniform request into the Anthropic wire format with cache_control on system', () => {
		const body = buildAnthropicRequest(baseRequest);
		assert.deepStrictEqual(body, {
			model: 'claude-sonnet-4-6',
			max_tokens: 256,
			messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
			system: [{ type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } }],
			stream: true,
		});
	});

	test('attaches cache_control to messages at the configured breakpoints', () => {
		const body = buildAnthropicRequest({
			...baseRequest,
			messages: [
				{ role: 'user', content: 'A' },
				{ role: 'assistant', content: 'B' },
				{ role: 'user', content: 'C' },
			],
			cacheBreakpoints: [{ atMessageIndex: 1, type: 'ephemeral' }],
		});

		assert.deepStrictEqual(body.messages, [
			{ role: 'user', content: [{ type: 'text', text: 'A' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'B', cache_control: { type: 'ephemeral' } }] },
			{ role: 'user', content: [{ type: 'text', text: 'C' }] },
		]);
	});

	test('passes through tool definitions', () => {
		const body = buildAnthropicRequest({
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
				name: 'search',
				description: 'Search the web',
				input_schema: { type: 'object', properties: { q: { type: 'string' } } },
			},
		]);
	});
});

describe('AnthropicOAuthAdapter', () => {
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

	test('listModels returns the curated default list', async () => {
		const broker = new FakeBroker();
		const adapter = makeAdapter(broker, () => Promise.reject(new Error('not called')));
		const models = await adapter.listModels();
		assert.ok(models.length >= 1);
		assert.ok(models.every(m => m.id.startsWith('claude-')));
	});

	test('send streams a complete text response and yields the right uniform events', async () => {
		const broker = new FakeBroker();
		const frames = [
			'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"cache_read_input_tokens":2}}}\n\n',
			'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
			'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
			'data: {"type":"content_block_stop","index":0}\n\n',
			'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
			'data: {"type":"message_stop"}\n\n',
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
			'start:claude-sonnet-4-6',
			'usage:in=10,out=0',
			'text:Hi',
			'usage:in=0,out=5',
			'stop:end_turn',
		]);

		assert.strictEqual(calls.length, 1);
		const call = calls[0];
		const headers = call.init!.headers as Record<string, string>;
		assert.strictEqual(headers['Authorization'], 'Bearer tok-1');
		assert.strictEqual(headers['anthropic-version'], '2023-06-01');
		assert.strictEqual(headers['User-Agent'], 'TestRunner/1');
	});

	test('send retries once on 401 and yields events from the second response', async () => {
		const broker = new FakeBroker('expired-token');
		let callCount = 0;
		const fetchFn: FetchFn = async () => {
			callCount += 1;
			if (callCount === 1) {
				return new Response('unauthorized', { status: 401 });
			}
			return new Response(sseStream([
				'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":1}}}\n\n',
				'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
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
		assert.ok(error, 'expected an error event');
		assert.ok(stop, 'expected a message_stop event');
		assert.deepStrictEqual(
			{
				code: error!.type === 'error' ? error!.code : '',
				retryable: error!.type === 'error' ? error!.retryable : false,
				stop: stop!.type === 'message_stop' ? stop!.stopReason : '',
			},
			{ code: 'rate_limited', retryable: true, stop: 'error' },
		);
	});

	test('send identifies itself with the configured provider id', () => {
		const broker = new FakeBroker();
		const adapter = makeAdapter(broker, () => Promise.reject(new Error('not called')));
		assert.strictEqual(adapter.id, ANTHROPIC_OAUTH_PROVIDER_ID);
	});
});
