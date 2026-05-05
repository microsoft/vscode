// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FailoverChain, type FailoverSlot } from '../src/failover/failoverChain.js';
import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from '../src/providers/types.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

const BASE_REQUEST: UniformRequest = {
	requestId: 'test-req',
	model: 'claude-sonnet-4-6',
	messages: [{ role: 'user', content: 'Hello' }],
};

const ABORT = new AbortController().signal;

/** Builds a ProviderAdapter whose send() yields the given events in order. */
function adapterFromEvents(id: string, events: AgentEvent[]): ProviderAdapter {
	return {
		id,
		displayName: id,
		isAvailable: async () => true,
		listModels: async () => [],
		async *send(_req, _signal) {
			for (const ev of events) {
				yield ev;
			}
		},
	};
}

/** Builds a ProviderAdapter whose send() throws immediately. */
function throwingAdapter(id: string, message = 'connection reset'): ProviderAdapter {
	return {
		id,
		displayName: id,
		isAvailable: async () => false,
		listModels: async () => [],
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			throw new Error(message);
		},
	};
}

/** Builds a ProviderAdapter whose send() throws after yielding some events. */
function throwingMidStreamAdapter(id: string, preEvents: AgentEvent[]): ProviderAdapter {
	return {
		id,
		displayName: id,
		isAvailable: async () => true,
		listModels: async () => [],
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			for (const ev of preEvents) {
				yield ev;
			}
			throw new Error('mid-stream connection reset');
		},
	};
}

/** Collects all events from an AsyncIterable into an array. */
async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const out: AgentEvent[] = [];
	for await (const ev of iter) {
		out.push(ev);
	}
	return out;
}

function slot(adapter: ProviderAdapter, model = 'test-model'): FailoverSlot {
	return { adapter, model };
}

// ── FailoverChain construction ────────────────────────────────────────────────

describe('FailoverChain construction', () => {
	test('requires at least one slot', () => {
		assert.throws(
			() => new FailoverChain([]),
			/at least one slot/,
		);
	});

	test('exposes custom id and displayName', () => {
		const chain = new FailoverChain(
			[slot(adapterFromEvents('a', []))],
			'my-chain',
			'My Chain',
		);
		assert.strictEqual(chain.id, 'my-chain');
		assert.strictEqual(chain.displayName, 'My Chain');
	});

	test('defaults id and displayName', () => {
		const chain = new FailoverChain([slot(adapterFromEvents('a', []))]);
		assert.strictEqual(chain.id, 'failover-chain');
		assert.strictEqual(chain.displayName, 'Failover Chain');
	});
});

// ── isAvailable ───────────────────────────────────────────────────────────────

describe('FailoverChain.isAvailable', () => {
	test('returns true if any adapter is available', async () => {
		const unavailable: ProviderAdapter = {
			id: 'u',
			displayName: 'u',
			isAvailable: async () => false,
			listModels: async () => [],
			async *send() { /* empty */ },
		};
		const available: ProviderAdapter = {
			id: 'a',
			displayName: 'a',
			isAvailable: async () => true,
			listModels: async () => [],
			async *send() { /* empty */ },
		};
		const chain = new FailoverChain([slot(unavailable), slot(available)]);
		assert.strictEqual(await chain.isAvailable(), true);
	});

	test('returns false if all adapters are unavailable', async () => {
		const unavailable: ProviderAdapter = {
			id: 'u',
			displayName: 'u',
			isAvailable: async () => false,
			listModels: async () => [],
			async *send() { /* empty */ },
		};
		const chain = new FailoverChain([slot(unavailable), slot(unavailable)]);
		assert.strictEqual(await chain.isAvailable(), false);
	});

	test('tolerates an adapter whose isAvailable() throws', async () => {
		const boom: ProviderAdapter = {
			id: 'b',
			displayName: 'b',
			isAvailable: async () => { throw new Error('offline'); },
			listModels: async () => [],
			async *send() { /* empty */ },
		};
		const ok: ProviderAdapter = {
			id: 'ok',
			displayName: 'ok',
			isAvailable: async () => true,
			listModels: async () => [],
			async *send() { /* empty */ },
		};
		const chain = new FailoverChain([slot(boom), slot(ok)]);
		assert.strictEqual(await chain.isAvailable(), true);
	});
});

// ── listModels ────────────────────────────────────────────────────────────────

describe('FailoverChain.listModels', () => {
	test('unions models across adapters, deduplicating by id', async () => {
		const modelA: ModelDescriptor = { id: 'model-a', displayName: 'Model A' };
		const modelB: ModelDescriptor = { id: 'model-b', displayName: 'Model B' };
		const modelA2: ModelDescriptor = { id: 'model-a', displayName: 'Model A (dup)' };

		const adapterA: ProviderAdapter = {
			id: 'a', displayName: 'a',
			isAvailable: async () => true,
			listModels: async () => [modelA, modelB],
			async *send() { /* empty */ },
		};
		const adapterB: ProviderAdapter = {
			id: 'b', displayName: 'b',
			isAvailable: async () => true,
			listModels: async () => [modelA2],
			async *send() { /* empty */ },
		};
		const chain = new FailoverChain([slot(adapterA), slot(adapterB)]);
		const models = await chain.listModels();

		assert.deepStrictEqual(
			models.map(m => m.id),
			['model-a', 'model-b'],
		);
	});

	test('tolerates an adapter whose listModels() throws', async () => {
		const boom: ProviderAdapter = {
			id: 'b', displayName: 'b',
			isAvailable: async () => true,
			listModels: async () => { throw new Error('network error'); },
			async *send() { /* empty */ },
		};
		const ok: ProviderAdapter = {
			id: 'ok', displayName: 'ok',
			isAvailable: async () => true,
			listModels: async () => [{ id: 'gpt-4o', displayName: 'GPT-4o' }],
			async *send() { /* empty */ },
		};
		const chain = new FailoverChain([slot(boom), slot(ok)]);
		const models = await chain.listModels();
		assert.deepStrictEqual(models.map(m => m.id), ['gpt-4o']);
	});
});

// ── send — happy path ─────────────────────────────────────────────────────────

describe('FailoverChain.send happy path', () => {
	test('passes all events through from the primary adapter', async () => {
		const events: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r1', provider: 'a', model: 'm' },
			{ type: 'text_delta', text: 'Hello' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([slot(adapterFromEvents('a', events))]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(got, events);
	});

	test('uses the model from the slot, not the request', async () => {
		const received: string[] = [];
		const adapter: ProviderAdapter = {
			id: 'a', displayName: 'a',
			isAvailable: async () => true,
			listModels: async () => [],
			async *send(req) {
				received.push(req.model);
				yield { type: 'message_stop', stopReason: 'end_turn' };
			},
		};
		const chain = new FailoverChain([slot(adapter, 'overridden-model')]);
		await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(received, ['overridden-model']);
	});
});

// ── send — pre-stream failover ────────────────────────────────────────────────

describe('FailoverChain.send pre-stream failover', () => {
	test('silently skips a retryable error before content and uses fallback', async () => {
		const primaryError: AgentEvent[] = [
			{ type: 'error', code: 'server_error', message: '503', retryable: true },
			{ type: 'message_stop', stopReason: 'error' },
		];
		const fallback: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'fb', model: 'm' },
			{ type: 'text_delta', text: 'OK from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(adapterFromEvents('primary', primaryError)),
			slot(adapterFromEvents('fallback', fallback)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		// The error event must NOT be in the output — failover was transparent
		const hasError = got.some(e => e.type === 'error');
		assert.strictEqual(hasError, false);
		assert.deepStrictEqual(got, fallback);
	});

	test('discards message_start preamble from failed adapter before content', async () => {
		// Primary emits message_start then fails before any content — the
		// caller should never see the failed adapter's message_start.
		const primaryWithPreamble: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'primary', model: 'm' },
			{ type: 'error', code: 'server_error', message: '503', retryable: true },
			{ type: 'message_stop', stopReason: 'error' },
		];
		const fallback: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'fb', model: 'fm' },
			{ type: 'text_delta', text: 'Fallback response' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(adapterFromEvents('primary', primaryWithPreamble)),
			slot(adapterFromEvents('fallback', fallback)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));

		// The failed primary's message_start must not be in the output.
		const messageStarts = got.filter(e => e.type === 'message_start');
		assert.strictEqual(messageStarts.length, 1, 'exactly one message_start from the fallback');
		assert.deepStrictEqual(got, fallback);
	});

	test('silently skips a thrown exception before content and uses fallback', async () => {
		const fallback: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'fb', model: 'm' },
			{ type: 'text_delta', text: 'Recovered' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(throwingAdapter('primary')),
			slot(adapterFromEvents('fallback', fallback)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(got, fallback);
	});

	test('tries all adapters in order until one succeeds', async () => {
		const final: AgentEvent[] = [
			{ type: 'text_delta', text: 'Third time lucky' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(throwingAdapter('a')),
			slot(throwingAdapter('b')),
			slot(adapterFromEvents('c', final)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(got, final);
	});

	test('does not failover on a non-retryable error', async () => {
		const primaryError: AgentEvent[] = [
			{ type: 'error', code: 'client_error', message: '400', retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		];
		const chain = new FailoverChain([
			slot(adapterFromEvents('primary', primaryError)),
			slot(adapterFromEvents('fallback', [
				{ type: 'text_delta', text: 'should not reach' },
			])),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(got, primaryError);
	});
});

// ── send — mid-stream failover ────────────────────────────────────────────────

describe('FailoverChain.send mid-stream failover', () => {
	test('after content, a retryable error triggers failover to next adapter', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'p', model: 'm' },
			{ type: 'text_delta', text: 'partial' },
			{ type: 'error', code: 'server_error', message: 'mid-stream 503', retryable: true },
		];
		const fallback: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'fb', model: 'm' },
			{ type: 'text_delta', text: 'full from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(adapterFromEvents('primary', primaryEvents)),
			slot(adapterFromEvents('fallback', fallback)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		// Primary's content events up to (not including) the error should be yielded,
		// then fallback's events follow.
		assert.deepStrictEqual(got, [
			{ type: 'message_start', requestId: 'r', provider: 'p', model: 'm' },
			{ type: 'text_delta', text: 'partial' },
			// error is consumed and NOT yielded — chain advances to fallback
			...fallback,
		]);
	});

	test('mid-stream thrown exception triggers failover', async () => {
		const preEvents: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'p', model: 'm' },
			{ type: 'text_delta', text: 'some text' },
		];
		const fallback: AgentEvent[] = [
			{ type: 'message_start', requestId: 'r', provider: 'fb', model: 'm' },
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const chain = new FailoverChain([
			slot(throwingMidStreamAdapter('primary', preEvents)),
			slot(adapterFromEvents('fallback', fallback)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(got, [
			...preEvents,
			...fallback,
		]);
	});
});

// ── send — all adapters exhausted ────────────────────────────────────────────

describe('FailoverChain.send all adapters exhausted', () => {
	test('emits a terminal error when all adapters fail pre-stream', async () => {
		const chain = new FailoverChain([
			slot(throwingAdapter('a')),
			slot(throwingAdapter('b')),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.strictEqual(got.length, 2);
		assert.strictEqual(got[0].type, 'error');
		assert.strictEqual((got[0] as Extract<AgentEvent, { type: 'error' }>).retryable, false);
		assert.match(
			(got[0] as Extract<AgentEvent, { type: 'error' }>).message,
			/All providers failed/,
		);
		assert.deepStrictEqual(got[1], { type: 'message_stop', stopReason: 'error' });
	});

	test('emits terminal error with last error details', async () => {
		const errorEvents: AgentEvent[] = [
			{
				type: 'error',
				code: 'rate_limited',
				message: 'Too many requests',
				retryable: true,
			},
		];
		const chain = new FailoverChain([
			slot(adapterFromEvents('a', errorEvents)),
			slot(adapterFromEvents('b', errorEvents)),
		]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		const errEv = got.find(e => e.type === 'error') as Extract<AgentEvent, { type: 'error' }> | undefined;
		assert.ok(errEv);
		assert.match(errEv.message, /Too many requests/);
	});

	test('last adapter connection error surfaces as non-retryable error', async () => {
		const chain = new FailoverChain([slot(throwingAdapter('only', 'ECONNREFUSED'))]);
		const got = await collect(chain.send(BASE_REQUEST, ABORT));
		assert.ok(got.some(e => e.type === 'error'));
		const errEv = got.find(e => e.type === 'error') as Extract<AgentEvent, { type: 'error' }> | undefined;
		assert.ok(errEv);
		assert.strictEqual(errEv.retryable, false);
		assert.match(errEv.message, /ECONNREFUSED/);
	});
});

// ── request model override ────────────────────────────────────────────────────

describe('FailoverChain model override', () => {
	test('each slot uses its own model, not the original request model', async () => {
		const usedModels: string[] = [];

		function capturingAdapter(id: string, model: string, events: AgentEvent[]): FailoverSlot {
			return {
				model,
				adapter: {
					id,
					displayName: id,
					isAvailable: async () => true,
					listModels: async () => [],
					async *send(req) {
						usedModels.push(req.model);
						yield* events;
					},
				},
			};
		}

		const primaryError: AgentEvent[] = [
			{ type: 'error', code: 'server_error', message: 'boom', retryable: true },
		];
		const chain = new FailoverChain([
			capturingAdapter('primary', 'model-primary', primaryError),
			capturingAdapter('fallback', 'model-fallback', [
				{ type: 'message_stop', stopReason: 'end_turn' },
			]),
		]);

		await collect(chain.send(BASE_REQUEST, ABORT));
		assert.deepStrictEqual(usedModels, ['model-primary', 'model-fallback']);
	});
});
