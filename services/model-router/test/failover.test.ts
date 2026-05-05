// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FailoverAdapter, isFailoverError, withFailover, type FailoverEntry, type FailoverTarget } from '../src/failover.js';
import { ModelRouter } from '../src/router.js';
import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from '../src/providers/types.js';
import type { ModelRoutesConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<UniformRequest> = {}): UniformRequest {
	return {
		requestId: 'req-1',
		model: 'model-a',
		messages: [{ role: 'user', content: 'hello' }],
		...overrides,
	};
}

/** A stub adapter that emits a fixed sequence of events. */
class StubAdapter implements ProviderAdapter {
	readonly id: string;
	readonly displayName: string;
	private readonly events: AgentEvent[];
	private readonly throwOnSend?: Error;
	private _available: boolean;

	calls: UniformRequest[] = [];

	constructor(id: string, events: AgentEvent[], options?: { available?: boolean; throwOnSend?: Error }) {
		this.id = id;
		this.displayName = id;
		this.events = events;
		this._available = options?.available ?? true;
		this.throwOnSend = options?.throwOnSend;
	}

	async isAvailable(): Promise<boolean> {
		return this._available;
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return [];
	}

	async *send(req: UniformRequest, _signal: AbortSignal): AsyncIterable<AgentEvent> {
		this.calls.push(req);
		if (this.throwOnSend) {
			throw this.throwOnSend;
		}
		for (const event of this.events) {
			yield event;
		}
	}
}

function makeTarget(id: string, model: string, adapter: StubAdapter): FailoverTarget {
	return { provider: id, model, adapter };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const e of iterable) {
		events.push(e);
	}
	return events;
}

function neverAborted(): AbortSignal {
	return new AbortController().signal;
}

function adapterThatYields(events: AgentEvent[]): ProviderAdapter {
	return {
		id: 'fake',
		displayName: 'Fake',
		async isAvailable() { return true; },
		async listModels(): Promise<ModelDescriptor[]> { return []; },
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			for (const e of events) {
				yield e;
			}
		},
	};
}

function adapterThatThrows(err: Error): ProviderAdapter {
	return {
		id: 'failing',
		displayName: 'Failing',
		async isAvailable() { return false; },
		async listModels(): Promise<ModelDescriptor[]> { return []; },
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			throw err;
		},
	};
}

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const e of iter) {
		events.push(e);
	}
	return events;
}

// ---------------------------------------------------------------------------
// FailoverAdapter
// ---------------------------------------------------------------------------

describe('FailoverAdapter', () => {
	test('uses primary when it succeeds', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'message_start', requestId: 'r', provider: 'primary', model: 'model-a' },
			{ type: 'text_delta', text: 'hello' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);
		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(primaryAdapter.calls.length, 1);
		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['message_start', 'text_delta', 'message_stop']);
	});

	test('replaces model in request for each target', async () => {
		const primaryAdapter = new StubAdapter('primary', [], {
			throwOnSend: new Error('connection refused'),
		});
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-primary', primaryAdapter),
			[makeTarget('fallback', 'model-fallback', fallbackAdapter)],
		);

		await collectEvents(adapter.send(makeRequest({ model: 'model-original' }), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls[0].model, 'model-fallback');
	});

	test('falls over on retryable error before content', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{
				type: 'error',
				code: 'rate_limit',
				message: 'Rate limited',
				retryable: true,
			},
		]);
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('does not fall over on retryable error after content has started', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'text_delta', text: 'partial ' },
			{ type: 'error', code: 'stream_interrupted', message: 'mid-stream', retryable: true },
		]);
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'should not appear' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'error']);
	});

	test('does not fall over on non-retryable error', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'error', code: 'auth_failed', message: 'bad token', retryable: false },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['error']);
	});

	test('falls over on connection exception', async () => {
		const primaryAdapter = new StubAdapter('primary', [], {
			throwOnSend: new Error('ECONNREFUSED'),
		});
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'fallback ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('tries full chain and emits error when all fail', async () => {
		const errorEvent: AgentEvent = { type: 'error', code: 'quota_exceeded', message: 'Quota', retryable: true };
		const a = new StubAdapter('a', [errorEvent]);
		const b = new StubAdapter('b', [errorEvent]);
		const c = new StubAdapter('c', [errorEvent]);

		const adapter = new FailoverAdapter(
			makeTarget('a', 'model-a', a),
			[makeTarget('b', 'model-b', b), makeTarget('c', 'model-c', c)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(a.calls.length, 1);
		assert.strictEqual(b.calls.length, 1);
		assert.strictEqual(c.calls.length, 1);
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].type, 'error');
	});

	test('skips unavailable providers unless last in chain', async () => {
		const unavailableAdapter = new StubAdapter('unavailable', [], { available: false });
		const availableAdapter = new StubAdapter('available', [
			{ type: 'text_delta', text: 'ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', unavailableAdapter),
			[makeTarget('secondary', 'model-b', availableAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(unavailableAdapter.calls.length, 0);
		assert.strictEqual(availableAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('isAvailable returns true if any target is available', async () => {
		const unavailable = new StubAdapter('x', [], { available: false });
		const available = new StubAdapter('y', [], { available: true });

		const adapter = new FailoverAdapter(
			makeTarget('x', 'model-x', unavailable),
			[makeTarget('y', 'model-y', available)],
		);

		assert.strictEqual(await adapter.isAvailable(), true);
	});

	test('isAvailable returns false when all targets unavailable', async () => {
		const a = new StubAdapter('a', [], { available: false });
		const b = new StubAdapter('b', [], { available: false });

		const adapter = new FailoverAdapter(
			makeTarget('a', 'model-a', a),
			[makeTarget('b', 'model-b', b)],
		);

		assert.strictEqual(await adapter.isAvailable(), false);
	});

	test('stops immediately when signal is aborted', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'error', code: 'rate_limit', message: 'limit', retryable: true },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);
		const controller = new AbortController();
		controller.abort();

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), controller.signal));

		assert.strictEqual(events.length, 0);
		assert.strictEqual(primaryAdapter.calls.length, 0);
	});
});

// ---------------------------------------------------------------------------
// isFailoverError
// ---------------------------------------------------------------------------

describe('isFailoverError', () => {
	test('returns false for non-Error values', () => {
		assert.strictEqual(isFailoverError('string error'), false);
		assert.strictEqual(isFailoverError(null), false);
		assert.strictEqual(isFailoverError(42), false);
	});

	test('returns true for ECONNRESET', () => {
		const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ECONNREFUSED', () => {
		const err = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ETIMEDOUT', () => {
		const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ENOTFOUND', () => {
		const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for HTTP 5xx message', () => {
		assert.strictEqual(isFailoverError(new Error('Provider x returned 503: Service Unavailable')), true);
		assert.strictEqual(isFailoverError(new Error('returned 500')), true);
	});

	test('returns true for quota_exceeded', () => {
		assert.strictEqual(isFailoverError(new Error('quota_exceeded: monthly cap reached')), true);
	});

	test('returns true for rate_limit_exceeded', () => {
		assert.strictEqual(isFailoverError(new Error('rate_limit_exceeded')), true);
	});

	test('returns true for 429 in message', () => {
		assert.strictEqual(isFailoverError(new Error('Provider returned 429')), true);
	});

	test('returns false for 4xx non-429 errors', () => {
		assert.strictEqual(isFailoverError(new Error('returned 400: bad request')), false);
		assert.strictEqual(isFailoverError(new Error('returned 401: unauthorized')), false);
		assert.strictEqual(isFailoverError(new Error('returned 403: forbidden')), false);
	});

	test('returns false for generic errors without code or 5xx pattern', () => {
		assert.strictEqual(isFailoverError(new Error('JSON parse error')), false);
		assert.strictEqual(isFailoverError(new Error('unexpected token')), false);
	});
});

// ---------------------------------------------------------------------------
// withFailover
// ---------------------------------------------------------------------------

describe('withFailover', () => {
	test('emits error + message_stop when entries is empty', async () => {
		const events = await collect(withFailover([], makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'NO_PROVIDERS', message: 'No providers configured', retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('passes through all events from successful single adapter', async () => {
		const expected: AgentEvent[] = [
			{ type: 'message_start', requestId: 'req-1', provider: 'fake', model: 'model-a' },
			{ type: 'text_delta', text: 'hello' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [{ adapter: adapterThatYields(expected), model: 'model-a' }];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, expected);
	});

	test('overrides model in request per entry', async () => {
		let capturedModel: string | undefined;
		const adapter: ProviderAdapter = {
			id: 'spy',
			displayName: 'Spy',
			async isAvailable() { return true; },
			async listModels(): Promise<ModelDescriptor[]> { return []; },
			async *send(req, _signal): AsyncIterable<AgentEvent> {
				capturedModel = req.model;
				yield { type: 'message_stop', stopReason: 'end_turn' };
			},
		};

		const entries: FailoverEntry[] = [{ adapter, model: 'overridden-model' }];
		await collect(withFailover(entries, makeRequest({ model: 'original-model' }), neverAborted()));
		assert.strictEqual(capturedModel, 'overridden-model');
	});

	test('fails over to second adapter when first throws a failover-worthy error', async () => {
		const connErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		const successEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatYields(successEvents), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, successEvents);
	});

	test('does NOT fail over on non-failover error; surfaces error events', async () => {
		const authErr = new Error('returned 401: unauthorized');
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(authErr), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'PROVIDER_ERROR', message: authErr.message, retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('walks full chain of three providers, succeeds on third', async () => {
		const connErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
		const quotaErr = new Error('quota_exceeded: limit hit');
		const successEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'third wins' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatThrows(quotaErr), model: 'model-b' },
			{ adapter: adapterThatYields(successEvents), model: 'model-c' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, successEvents);
	});

	test('all providers fail: surfaces last error code', async () => {
		const err5xx = new Error('returned 503: unavailable');
		const errConn = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(err5xx), model: 'model-a' },
			{ adapter: adapterThatThrows(errConn), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.strictEqual(events[0].type, 'error');
		const errorEvent = events[0] as Extract<AgentEvent, { type: 'error' }>;
		assert.strictEqual(errorEvent.code, 'ECONNRESET');
		assert.strictEqual(events[1].type, 'message_stop');
	});

	test('aborted signal surfaces cancelled error without trying fallback', async () => {
		const ac = new AbortController();
		ac.abort();
		const connErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), ac.signal));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'cancelled', message: 'Request cancelled', retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('fails over when adapter yields retryable error event before message_stop', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'partial...' },
			{ type: 'error', code: 'STREAM_RESET', message: 'upstream reset', retryable: true },
		];
		const fallbackEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
			{ adapter: adapterThatYields(fallbackEvents), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, [...primaryEvents, ...fallbackEvents]);
	});

	test('does NOT fail over on retryable error when it is the last adapter', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'error', code: 'STREAM_RESET', message: 'upstream reset', retryable: true },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, primaryEvents);
	});

	test('stops after message_stop; does not consume subsequent adapters', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'done' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'text_delta', text: 'should not appear' }, { type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, primaryEvents);
	});
});

// ---------------------------------------------------------------------------
// ModelRouter.resolveFallbackChain
// ---------------------------------------------------------------------------

const chainConfig: ModelRoutesConfig = {
	routes: [
		{
			name: 'with-fallbacks-array',
			match: { agentRole: 'orchestrator' },
			provider: 'anthropic-oauth',
			model: 'claude-opus-4-7',
			priority: 1,
			fallbacks: [
				{ provider: 'copilot', model: 'claude-opus' },
				{ provider: 'anthropic', model: 'claude-opus-4-7' },
			],
		},
		{
			name: 'with-single-fallback',
			match: { agentRole: 'coder' },
			provider: 'copilot',
			model: 'claude-sonnet',
			priority: 2,
			fallback: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
		},
		{
			name: 'no-fallback',
			match: { agentRole: 'explorer' },
			provider: 'anthropic',
			model: 'claude-haiku-4-5-20251001',
			priority: 3,
		},
		{
			name: 'both-fallback-and-fallbacks',
			match: { agentRole: 'tester' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			priority: 4,
			fallback: { provider: 'legacy', model: 'lm' },
			fallbacks: [
				{ provider: 'new1', model: 'nm1' },
				{ provider: 'new2', model: 'nm2' },
			],
		},
		{
			name: 'catch-all',
			match: { agentRole: '*' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			priority: 100,
		},
	],
	providers: {
		'anthropic-oauth': { baseUrl: 'https://api.anthropic.com', format: 'anthropic' },
		'copilot': { baseUrl: 'https://api.githubcopilot.com', format: 'openai' },
		'anthropic': { baseUrl: 'https://api.anthropic.com', format: 'anthropic' },
		'new1': { baseUrl: 'http://new1', format: 'openai' },
		'new2': { baseUrl: 'http://new2', format: 'openai' },
	},
};

describe('ModelRouter.resolveFallbackChain', () => {
	const router = new ModelRouter(chainConfig);

	test('returns primary + fallbacks when fallbacks array is set', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'orchestrator' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
			{ provider: 'copilot', model: 'claude-opus' },
			{ provider: 'anthropic', model: 'claude-opus-4-7' },
		]);
	});

	test('wraps single fallback field in array for backward compat', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'coder' });
		assert.deepStrictEqual(chain, [
			{ provider: 'copilot', model: 'claude-sonnet' },
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
		]);
	});

	test('returns single-element chain when no fallback is configured', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'explorer' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
		]);
	});

	test('fallbacks array takes precedence over fallback when both are present', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'tester' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
			{ provider: 'new1', model: 'nm1' },
			{ provider: 'new2', model: 'nm2' },
		]);
	});

	test('matches catch-all role when no specific role matches', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'unknown' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
		]);
	});

	test('throws when no route matches and no wildcard', () => {
		const strict = new ModelRouter({
			routes: [{
				name: 'only-coder',
				match: { agentRole: 'coder' },
				provider: 'anthropic',
				model: 'claude-sonnet-4-6',
				priority: 1,
			}],
			providers: { anthropic: { baseUrl: 'https://api.anthropic.com', format: 'anthropic' } },
		});
		assert.throws(
			() => strict.resolveFallbackChain({ agentRole: 'explorer' }),
			/No matching route found/,
		);
	});

	test('respects priority ordering — lower number matches first', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'orchestrator', taskType: 'planning' });
		assert.strictEqual(chain[0].provider, 'anthropic-oauth');
	});
});
