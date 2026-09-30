/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { GitHubRequestQueue } from '../../common/githubRequestQueue.js';
import { GitHubRequestTelemetry, gitHubRequestOutcome } from '../../common/githubRequestTelemetry.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { GitHubRequestContext, GitHubRequestError } from '../../common/githubTypes.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

class RecordingTelemetryService extends mock<ITelemetryService>() {
	override telemetryLevel = TelemetryLevel.USAGE;
	readonly events: { readonly name: string; readonly data: ITelemetryData }[] = [];

	override publicLog2(name: string, data?: ITelemetryData): void {
		assert.ok(data);
		this.events.push({ name, data });
	}

	summary(): ITelemetryData {
		const event = this.events.find(event => event.name === 'githubRequestSummary');
		assert.ok(event);
		return event.data;
	}

	timings(): ITelemetryData[] {
		return this.events.filter(event => event.name === 'githubRequestTiming').map(event => event.data);
	}
}

function context(overrides: Partial<GitHubRequestContext> = {}): GitHubRequestContext {
	return {
		kind: 'rest',
		account: { host: 'private-tenant.example', accountId: 'private-account' },
		caller: 'github.query',
		resource: 'core',
		priority: 'interactive',
		deadline: 1_000,
		signal: new AbortController().signal,
		...overrides,
	};
}

suite('GitHubRequestTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const scheduler = store.add(new FakeGitHubScheduler());
		const sink = new RecordingTelemetryService();
		const telemetry = store.add(new GitHubRequestTelemetry('agentHost', scheduler, sink, new NullLogService()));
		return { scheduler, sink, telemetry };
	}

	test('separates logical calls, coalescing, wire attempts and conditional revalidation', async () => {
		const { scheduler, sink, telemetry } = setup();
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			if (calls === 1) {
				await started.complete();
				return response.p;
			}
			return new Response(null, { status: 304 });
		}, scheduler, false, undefined, undefined, telemetry));
		const request = { method: 'GET' as const, url: 'https://private-tenant.example/repos/private-owner/private-repo', caller: 'github.query' };
		const first = transport.rest(context().account, 'private-token', request, context().signal);
		const second = transport.rest(context().account, 'private-token', request, context().signal);
		await started.p;
		scheduler.advanceBy(7);
		await response.complete(new Response('{"private":"private-response"}', { headers: { ETag: '"private-validator"' } }));
		await Promise.all([first, second]);
		await transport.rest(context().account, 'private-token', request, context().signal);
		telemetry.flush();
		const summary = sink.summary();
		assert.deepStrictEqual({
			requests: summary.requests,
			succeeded: summary.succeeded,
			wireAttempts: summary.wireAttempts,
			coalesced: summary.coalesced,
			etagRevalidations: summary.etagRevalidations,
			notModified: summary.notModified,
			http2xx: summary.http2xx,
			http3xx: summary.http3xx,
			population: summary.admittedCompleted,
			timings: sink.timings().map(sample => sample.executionMs),
			containsPrivateData: JSON.stringify(sink.events).includes('private'),
			timers: scheduler.pendingCount,
		}, {
			requests: 3, succeeded: 3, wireAttempts: 2, coalesced: 1, etagRevalidations: 1,
			notModified: 1, http2xx: 1, http3xx: 1, population: 2, timings: [7, 0], containsPrivateData: false, timers: 0,
		});
	});

	test('separates observed cooldown, remaining queue wait, and active execution', async () => {
		const { scheduler, sink, telemetry } = setup();
		const queue = store.add(new GitHubRequestQueue(scheduler,
			request => request.resource === 'search' ? Math.max(0, 50 - scheduler.now()) : 0,
			undefined, telemetry));
		const releaseFirst = new DeferredPromise<void>();
		const releaseSecond = new DeferredPromise<void>();
		const firstStarted = new DeferredPromise<void>();
		const secondStarted = new DeferredPromise<void>();
		const first = queue.enqueue(context(), async () => { await firstStarted.complete(); await releaseFirst.p; });
		const second = queue.enqueue(context({ resource: 'search' }), async () => { await secondStarted.complete(); await releaseSecond.p; });
		await firstStarted.p;
		scheduler.advanceBy(80);
		await releaseFirst.complete();
		await first;
		await secondStarted.p;
		scheduler.advanceBy(10);
		await releaseSecond.complete();
		await second;
		telemetry.flush();
		assert.deepStrictEqual(sink.timings().map(sample => ({
			queue: sample.queueMs, cooldown: sample.cooldownMs, execution: sample.executionMs,
		})), [
			{ queue: 0, cooldown: 0, execution: 80 },
			{ queue: 30, cooldown: 50, execution: 10 },
		]);
	});

	test('allowlists categories and never emits request identity or raw errors', () => {
		const { sink, telemetry } = setup();
		const finish = telemetry.startRequest();
		const timing = telemetry.startQueue(context({
			caller: 'person@example.com/private-repo',
			resource: 'https://private-tenant.example/private-endpoint',
			priority: 'background',
		}));
		const outcome = gitHubRequestOutcome(new GitHubRequestError('private-error', 'network', 503, 'private-body', [{ message: 'private-query' }]), false);
		finish?.(outcome);
		timing?.finish(outcome);
		telemetry.flush();
		assert.deepStrictEqual({
			sample: sink.timings()[0],
			networkFailures: sink.summary().networkFailures,
			containsPrivateData: JSON.stringify(sink.events).includes('private') || JSON.stringify(sink.events).includes('person@'),
			flatPayloads: sink.events.every(event => Object.values(event.data).every(value => typeof value === 'number' || typeof value === 'string')),
		}, {
			sample: {
				caller: 'other', kind: 'rest', priority: 'background', resource: 'other', outcome: 'network',
				queueMs: 0, cooldownMs: 0, executionMs: 0, source: 'agentHost', samplePopulation: 1,
			},
			networkFailures: 1, containsPrivateData: false, flatPayloads: true,
		});
	});

	test('bounds reservoir emissions under a flood and emits nothing while idle', () => {
		const { scheduler, sink, telemetry } = setup();
		for (let index = 0; index < 5_000; index++) {
			const finish = telemetry.startRequest();
			const timing = telemetry.startQueue(context());
			timing?.start();
			telemetry.recordWireAttempt(false, false);
			timing?.finish('success');
			finish?.('success');
		}
		scheduler.advanceBy(GitHubRequestTelemetry.interval);
		const firstIntervalEvents = sink.events.length;
		scheduler.advanceBy(GitHubRequestTelemetry.interval * 10);
		assert.deepStrictEqual({
			firstIntervalEvents,
			totalEvents: sink.events.length,
			requests: sink.summary().requests,
			attempts: sink.summary().wireAttempts,
			population: sink.summary().admittedCompleted,
			samples: sink.timings().length,
			timers: scheduler.pendingCount,
		}, {
			firstIntervalEvents: 11, totalEvents: 11, requests: 5_000, attempts: 5_000, population: 5_000, samples: 10, timers: 0,
		});
	});

	test('respects disabled telemetry and discards pending aggregates and old completions', async () => {
		const { scheduler, sink, telemetry } = setup();
		const finish = telemetry.startRequest();
		const timing = telemetry.startQueue(context());
		sink.telemetryLevel = TelemetryLevel.NONE;
		telemetry.recordWireAttempt(false, false);
		const transport = store.add(new GitHubTransport(async () => new Response('{}'), scheduler, false, undefined, undefined, telemetry));
		await transport.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/user' }, context().signal);
		telemetry.flush();
		assert.deepStrictEqual({ events: sink.events, timers: scheduler.pendingCount }, { events: [], timers: 0 });
		sink.telemetryLevel = TelemetryLevel.USAGE;
		finish?.('success');
		timing?.finish('success');
		telemetry.startRequest()?.('success');
		telemetry.flush();
		assert.deepStrictEqual({
			requests: sink.summary().requests,
			successes: sink.summary().succeeded,
			attempts: sink.summary().wireAttempts,
			samples: sink.timings().length,
		}, { requests: 1, successes: 1, attempts: 0, samples: 0 });
	});

	test('counts shared-waiter rejections and cancellation independently', async () => {
		const { scheduler, sink, telemetry } = setup();
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		const transport = store.add(new GitHubTransport(async () => {
			await started.complete();
			return response.p;
		}, scheduler, false, undefined, { maximumSharedWaiters: 1 }, telemetry));
		const controller = new AbortController();
		const request = { method: 'GET' as const, url: 'https://github.example.test/user' };
		const pending = transport.rest(context().account, 'token', request, controller.signal);
		const cancelled = assert.rejects(pending, /private cancellation/);
		await started.p;
		await assert.rejects(transport.rest(context().account, 'token', request, context().signal), { kind: 'overloaded' });
		controller.abort(new Error('private cancellation'));
		await cancelled;
		await response.complete(new Response('{}'));
		telemetry.flush();
		assert.deepStrictEqual({
			requests: sink.summary().requests,
			cancelled: sink.summary().cancelled,
			overloaded: sink.summary().overloaded,
			waiterRejected: sink.summary().waiterRejected,
			attempts: sink.summary().wireAttempts,
			coalesced: sink.summary().coalesced,
			containsPrivateData: JSON.stringify(sink.events).includes('private'),
		}, { requests: 2, cancelled: 1, overloaded: 1, waiterRejected: 1, attempts: 1, coalesced: 0, containsPrivateData: false });
	});

	test('does not resurrect pre-opt-out completions after an aggregate was flushed', () => {
		const { sink, telemetry } = setup();
		const finish = telemetry.startRequest();
		const timing = telemetry.startQueue(context());
		telemetry.flush();
		const emitted = sink.events.length;
		sink.telemetryLevel = TelemetryLevel.ERROR;
		telemetry.recordWireAttempt(false, false);
		sink.telemetryLevel = TelemetryLevel.USAGE;
		finish?.('success');
		timing?.finish('success');
		telemetry.flush();
		assert.deepStrictEqual({ emitted, final: sink.events.length }, { emitted: 1, final: 1 });
	});

	test('records the promoted dispatch priority', () => {
		const { sink, telemetry } = setup();
		const timing = telemetry.startQueue(context({ priority: 'background' }));
		timing?.start('interactive');
		timing?.finish('success');
		telemetry.flush();
		assert.strictEqual(sink.timings()[0].priority, 'interactive');
	});

	for (const limit of ['engine', 'account', 'caller'] as const) {
		test(`reports ${limit} admission rejection without identifiers`, async () => {
			const { scheduler, sink, telemetry } = setup();
			const response = new DeferredPromise<Response>();
			const transport = store.add(new GitHubTransport(async () => response.p, scheduler, false, undefined, {
				queue: {
					reservedInteractiveRequests: 0,
					...(limit === 'engine' ? { maximumRequests: 1 }
						: limit === 'account' ? { maximumAccountRequests: 1 } : { maximumCallerRequests: 1 }),
				},
			}, telemetry));
			const first = transport.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/one' }, context().signal);
			await assert.rejects(transport.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/two' }, context().signal), { kind: 'overloaded' });
			await response.complete(new Response('{}'));
			await first;
			telemetry.flush();
			assert.deepStrictEqual({
				requests: sink.summary().requests, overloaded: sink.summary().overloaded,
				engine: sink.summary().engineRejected, account: sink.summary().accountRejected, caller: sink.summary().callerRejected,
			}, {
				requests: 2, overloaded: 1, engine: Number(limit === 'engine'), account: Number(limit === 'account'), caller: Number(limit === 'caller'),
			});
		});
	}

	test('counts GraphQL partial errors and rate limits without their contents', async () => {
		const { scheduler, sink, telemetry } = setup();
		const transport = store.add(new GitHubTransport(async () => new Response(JSON.stringify({
			data: { private: 'private-body' },
			errors: [{ type: 'RATE_LIMITED', message: 'private-error' }],
		})), scheduler, false, undefined, undefined, telemetry));
		await transport.graphql(context().account, 'private-token', 'https://private-host.example/graphql', 'query PrivateOperation { viewer { login } }', { private: 'private-variable' }, context().signal);
		telemetry.flush();
		assert.deepStrictEqual({
			requests: sink.summary().requests,
			succeeded: sink.summary().succeeded,
			graphqlErrors: sink.summary().graphqlErrorResponses,
			limited: sink.summary().rateLimitedResponses,
			http2xx: sink.summary().http2xx,
			containsPrivateData: JSON.stringify(sink.events).includes('private') || JSON.stringify(sink.events).includes('PrivateOperation'),
		}, { requests: 1, succeeded: 1, graphqlErrors: 1, limited: 1, http2xx: 1, containsPrivateData: false });
	});

	test('counts the remaining failure and HTTP status categories', () => {
		const { sink, telemetry } = setup();
		for (const kind of ['authentication', 'authorization', 'rateLimit', 'server', 'unknown'] as const) {
			telemetry.startRequest()?.(gitHubRequestOutcome(new GitHubRequestError('ignored', kind), false));
		}
		for (const status of [403, 429, 101]) {
			telemetry.recordResponse(status);
		}
		telemetry.flush();
		const summary = sink.summary();
		assert.deepStrictEqual({
			requests: summary.requests,
			failures: [
				summary.authenticationFailures, summary.authorizationFailures, summary.rateLimitFailures,
				summary.serverFailures, summary.otherFailures,
			],
			http4xx: summary.http4xx, httpOther: summary.httpOther, rateLimitedResponses: summary.rateLimitedResponses,
		}, { requests: 5, failures: [1, 1, 1, 1, 1], http4xx: 2, httpOther: 1, rateLimitedResponses: 1 });
	});

	test('counts wire retries without counting another logical request', async () => {
		const { scheduler, sink, telemetry } = setup();
		const started = new DeferredPromise<void>();
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			await started.complete();
			return new Response('{}', { status: calls === 1 ? 503 : 200 });
		}, scheduler, false, undefined, undefined, telemetry));
		const pending = transport.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/user' }, context().signal);
		await started.p;
		await Promise.resolve();
		await Promise.resolve();
		scheduler.advanceBy(101);
		await pending;
		telemetry.flush();
		assert.deepStrictEqual({
			requests: sink.summary().requests, succeeded: sink.summary().succeeded,
			attempts: sink.summary().wireAttempts, retries: sink.summary().retries,
			http2xx: sink.summary().http2xx, http5xx: sink.summary().http5xx,
		}, { requests: 1, succeeded: 1, attempts: 2, retries: 1, http2xx: 1, http5xx: 1 });
	});

	test('counts timeout and response-size failures separately', async () => {
		const { scheduler, sink, telemetry } = setup();
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<void>();
		const slow = store.add(new GitHubTransport(async () => {
			await started.complete();
			return response.p;
		}, scheduler, false, undefined, { requestTimeout: 10 }, telemetry));
		const timedOut = assert.rejects(slow.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/user' }, context().signal), { kind: 'timeout' });
		await started.p;
		scheduler.advanceBy(10);
		await timedOut;
		await response.complete(new Response(null, { status: 204 }));
		const large = store.add(new GitHubTransport(async () => new Response('{}'), scheduler, false, undefined, { maximumResponseBytes: 1 }, telemetry));
		await assert.rejects(large.rest(context().account, 'token', { method: 'GET', url: 'https://github.example.test/user' }, context().signal), { kind: 'responseTooLarge' });
		telemetry.flush();
		assert.deepStrictEqual({
			requests: sink.summary().requests, timedOut: sink.summary().timedOut,
			responseTooLarge: sink.summary().responseTooLarge, succeeded: sink.summary().succeeded,
		}, { requests: 2, timedOut: 1, responseTooLarge: 1, succeeded: 0 });
	});

	test('flushes completed work on disposal and isolates telemetry sink failures', () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const sink = new RecordingTelemetryService();
		const successful = store.add(new GitHubRequestTelemetry('web', scheduler, sink, new NullLogService()));
		successful.startRequest()?.('success');
		successful.dispose();
		const warnings: string[] = [];
		const failing = store.add(new GitHubRequestTelemetry('other', scheduler, new class extends RecordingTelemetryService {
			override publicLog2(): void { throw new Error('private-sink-error'); }
		}(), store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}())));
		failing.startRequest()?.('success');
		assert.doesNotThrow(() => failing.dispose());
		assert.deepStrictEqual({ source: sink.summary().source, warnings, timers: scheduler.pendingCount }, {
			source: 'web', warnings: ['[GitHubRequestTelemetry] Failed to emit request telemetry'], timers: 0,
		});
	});
});
