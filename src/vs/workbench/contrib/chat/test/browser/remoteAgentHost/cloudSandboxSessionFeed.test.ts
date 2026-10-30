/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxSessionFeedConnection } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { CloudSandboxSessionFeed, type CloudSandboxSessionFeedRefresh } from '../../../browser/remoteAgentHost/cloudSandboxSessionFeed.js';
import { ICloudSandboxTelemetryService, type ICloudSandboxSessionFeedTelemetryData } from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

class TestSocket {
	onmessage: OmitThisParameter<NonNullable<WebSocket['onmessage']>> | null = null;
	onerror: OmitThisParameter<NonNullable<WebSocket['onerror']>> | null = null;
	onclose: OmitThisParameter<NonNullable<WebSocket['onclose']>> | null = null;
	closed = false;

	close(): void { this.closed = true; }

	receive(data: unknown): void {
		this.onmessage?.(new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }));
	}

	disconnect(): void {
		this.onclose?.(new CloseEvent('close'));
	}
}

function connection(): ICloudSandboxSessionFeedConnection {
	return {
		url: 'wss://feed.example.test/client/hubs/opaque?access_token=secret',
		subprotocol: 'json.webpubsub.azure.v1',
		group: 'opaque-user-group',
		expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
		reconnect_after: new Date(Date.now() + 8 * 60_000).toISOString(),
		frame_schema_version: 1,
	};
}

function changed(id: string, updatedAt = '2026-10-18T12:00:00Z') {
	return {
		type: 'message',
		from: 'server',
		dataType: 'json',
		data: { type: 'task.changed', schema_version: 1, task: { id, updated_at: updatedAt } },
	};
}

function createFeed(store: Pick<DisposableStore, 'add'>, options?: {
	readonly connect?: (token: CancellationToken) => Promise<ICloudSandboxSessionFeedConnection | undefined>;
	readonly autoReady?: boolean;
	readonly socketError?: boolean;
	readonly onInvalidate?: () => void;
	readonly disconnectAfterMs?: number;
}) {
	const instantiationService = store.add(new TestInstantiationService());
	const sockets: TestSocket[] = [];
	const invalidations: boolean[] = [];
	const reasons: CloudSandboxSessionFeedRefresh['reason'][] = [];
	const taskBatches: (readonly string[] | undefined)[] = [];
	const warnings: string[] = [];
	const debugs: string[] = [];
	const requests: CancellationToken[] = [];
	const telemetry: ICloudSandboxSessionFeedTelemetryData[] = [];
	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override async connectSessionFeed(token: CancellationToken) {
			requests.push(token);
			return options?.connect ? options.connect(token) : connection();
		}
	}());
	instantiationService.stub(ILogService, new class extends NullLogService {
		override warn(message: string) { warnings.push(message); }
		override debug(message: string) { debugs.push(message); }
	}());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportSessionFeed(data: ICloudSandboxSessionFeedTelemetryData) {
			// Drop absent optional fields so expectations can omit them.
			telemetry.push(JSON.parse(JSON.stringify(data)));
		}
	}());
	const feed = store.add(instantiationService.createInstance(CloudSandboxSessionFeed, (refresh: CloudSandboxSessionFeedRefresh) => {
		invalidations.push(refresh.reason !== 'reconnect');
		reasons.push(refresh.reason);
		taskBatches.push(refresh.reason === 'change' ? refresh.taskIds : undefined);
		options?.onInvalidate?.();
	}, (url: string, protocol: string) => {
		assert.deepStrictEqual({ url, protocol }, { url: connection().url, protocol: connection().subprotocol });
		if (options?.socketError) {
			throw new Error(`Socket failed: ${url}`);
		}
		const socket = new TestSocket();
		sockets.push(socket);
		if (options?.autoReady !== false) {
			queueMicrotask(() => socket.receive({ type: 'system', event: 'connected' }));
		}
		if (options?.disconnectAfterMs !== undefined) {
			store.add(disposableTimeout(() => socket.disconnect(), options.disconnectAfterMs));
		}
		return socket;
	}, () => StopWatch.create(false)));
	return { feed, sockets, requests, invalidations, reasons, taskBatches, warnings, debugs, telemetry };
}

suite('CloudSandboxSessionFeed', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the WPS connected event and shares its initial attempt', async () => {
		const h = createFeed(store, { autoReady: false });
		const first = h.feed.start();
		const second = h.feed.start();
		await timeout(0);
		const pending = h.feed.connected;
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await Promise.all([first, second]);
		assert.deepStrictEqual({ pending, connected: h.feed.connected, requests: h.requests.length, refreshes: h.invalidations }, {
			pending: false, connected: true, requests: 1, refreshes: [],
		});
	});

	test('coalesces bursts and drops duplicate or out-of-order task hints', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		h.sockets[0].receive(changed('one'));
		h.sockets[0].receive(changed('two'));
		await timeout(501);
		h.sockets[0].receive(changed('one'));
		h.sockets[0].receive(changed('two', '2026-10-17T12:00:00Z'));
		await timeout(501);
		h.sockets[0].receive(changed('one', '2026-10-18T12:01:00Z'));
		await timeout(501);
		assert.deepStrictEqual({ invalidations: h.invalidations, taskBatches: h.taskBatches }, {
			invalidations: [true, true], taskBatches: [['one', 'two'], ['one']],
		});
	}));

	test('a continuous stream still refreshes every debounce interval', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		for (let i = 0; i < 12; i++) {
			h.sockets[0].receive(changed(String(i)));
			await timeout(100);
		}
		assert.deepStrictEqual(h.invalidations, [true, true]);
	}));

	test('accepts task hints from the negotiated group', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		h.sockets[0].receive({ ...changed('one'), from: 'group', group: connection().group });
		await timeout(501);
		assert.deepStrictEqual({ taskBatches: h.taskBatches, connected: h.feed.connected }, {
			taskBatches: [['one']], connected: true,
		});
	}));

	test('ignores unknown messages and other groups without disrupting the subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		for (const message of [
			{ ...changed('one'), from: 'group', group: 'another-group' },
			{ type: 'message', group: 'opaque-user-group', data: { type: 'future.event' } },
			{ type: 'future.envelope' },
		]) {
			h.sockets[0].receive(message);
		}
		await timeout(501);
		assert.deepStrictEqual({ refreshes: h.invalidations, warnings: h.warnings.length, connected: h.feed.connected }, {
			refreshes: [], warnings: 0, connected: true,
		});
	}));

	for (const malformed of [
		'{invalid',
		{ ...changed('two'), data: { ...changed('two').data, schema_version: 2 } },
		changed('three', 'invalid date'),
	]) {
		test(`an invalid feed message falls back quietly without retrying (${JSON.stringify(malformed)})`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const h = createFeed(store);
			await h.feed.start();
			h.sockets[0].receive(malformed);
			await timeout(60 * 60_000);
			assert.deepStrictEqual({
				connected: h.feed.connected, requests: h.requests.length, closed: h.sockets[0].closed,
				warnings: h.warnings, diagnostics: h.debugs, telemetry: h.telemetry,
			}, {
				connected: false, requests: 1, closed: true, warnings: [],
				diagnostics: [
					'[CloudSandboxSessionFeed] Connected to task status feed.',
					'[CloudSandboxSessionFeed] Invalid or unsupported feed message; using discovery polling until the next account or feature lifetime.',
				],
				telemetry: [{ outcome: 'connected', consecutiveFailures: 0 }, { outcome: 'invalidMessage', consecutiveFailures: 0 }],
			});
		}));
	}

	test('overlapping renewal requests incremental inventory catch-up rather than an empty targeted refresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		const initial = h.feed.start();
		await timeout(0);
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await initial;
		await timeout(8 * 60_000 + 1);
		const overlap = h.sockets.map(socket => socket.closed);
		h.sockets[1].receive({ type: 'system', event: 'connected' });
		await timeout(501);
		assert.deepStrictEqual({ overlap, closed: h.sockets.map(socket => socket.closed), reasons: h.reasons, taskBatches: h.taskBatches }, {
			overlap: [false, false], closed: [true, false], reasons: ['renewal'], taskBatches: [undefined],
		});
	}));

	test('repeated seamless renewals never request full recovery', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		await timeout(24 * 60_000 + 501);
		assert.deepStrictEqual({ requests: h.requests.length, reasons: h.reasons, taskBatches: h.taskBatches, telemetry: h.telemetry }, {
			requests: 4, reasons: ['renewal', 'renewal', 'renewal'], taskBatches: [undefined, undefined, undefined],
			telemetry: [{ outcome: 'connected', consecutiveFailures: 0 }],
		});
	}));

	test('a connection gap during renewal still requests full recovery', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		const initial = h.feed.start();
		await timeout(0);
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await initial;
		await timeout(8 * 60_000 + 1);
		h.sockets[0].disconnect();
		h.sockets[1].receive({ type: 'system', event: 'connected' });
		await timeout(501);
		assert.deepStrictEqual({ reasons: h.reasons, connected: h.feed.connected }, {
			reasons: ['reconnect'], connected: true,
		});
	}));

	test('renewal preserves coalesced task hints for targeted removal checks', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		const initial = h.feed.start();
		await timeout(0);
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await initial;
		await timeout(8 * 60_000 + 1);
		h.sockets[0].receive(changed('removed'));
		h.sockets[1].receive({ type: 'system', event: 'connected' });
		await timeout(501);
		assert.deepStrictEqual({ reasons: h.reasons, taskBatches: h.taskBatches }, {
			reasons: ['renewal', 'change'], taskBatches: [undefined, ['removed']],
		});
	}));

	test('uses server-relative renewal timing despite clock skew', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
		const results: { skew: number; negotiations: number; refreshes: number }[] = [];
		for (const skew of [475_000, -475_000]) {
			const h = createFeed(store, {
				connect: async () => ({
					...connection(),
					expires_at: new Date(Date.now() - skew + 10 * 60_000).toISOString(),
					reconnect_after: new Date(Date.now() - skew + 8 * 60_000).toISOString(),
					expires_in: 10 * 60_000,
					reconnect_in: 8 * 60_000,
				}),
			});
			await h.feed.start();
			await timeout(30 * 60_000 - 1);
			results.push({ skew, negotiations: h.requests.length, refreshes: h.invalidations.length });
			h.feed.dispose();
		}
		assert.deepStrictEqual(results, [
			{ skew: 475_000, negotiations: 4, refreshes: 3 },
			{ skew: -475_000, negotiations: 4, refreshes: 3 },
		]);
	}));

	test('includes negotiation and handshake time in the relative renewal delay', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const started = Date.now();
		const negotiations: number[] = [];
		const h = createFeed(store, {
			autoReady: false,
			connect: async token => {
				negotiations.push(Date.now() - started);
				const result = { ...connection(), expires_in: 600_000, reconnect_in: 480_000 };
				await timeout(180_000, token);
				return result;
			},
		});
		const initial = h.feed.start();
		await timeout(185_000);
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await initial;
		await timeout(294_999);
		const beforeRenewal = negotiations.length;
		await timeout(1);
		h.feed.dispose();
		assert.deepStrictEqual({ beforeRenewal, negotiations }, { beforeRenewal: 1, negotiations: [0, 480_000] });
	}));

	test('reconnects after disconnection and requests an authoritative full refresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		h.sockets[0].disconnect();
		const disconnected = h.feed.connected;
		await timeout(1_701);
		assert.deepStrictEqual({
			disconnected, sockets: h.sockets.length, connected: h.feed.connected, refreshes: h.invalidations,
			telemetry: h.telemetry.map(event => [event.outcome, event.consecutiveFailures]),
		}, {
			disconnected: false, sockets: 2, connected: true, refreshes: [false],
			telemetry: [['connected', 0], ['disconnected', 1], ['connected', 1]],
		});
	}));

	test('backs off short-lived sockets toward the negotiation ceiling and resets only after a healthy connection', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		const attemptTimes: number[] = [];
		const options = {
			// The final socket stays connected at a jittered time; renew far outside the test so no renewal lands in a measured window.
			connect: async () => { attemptTimes.push(Date.now()); return { ...connection(), reconnect_after: new Date(Date.now() + 60 * 60_000).toISOString() }; },
			disconnectAfterMs: 1 as number | undefined,
		};
		const h = createFeed(store, options);
		await h.feed.start();
		const attempts: { beforeMinimum: number; afterMaximum: number }[] = [];
		const maximumDelays = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000, 1_024_000, 1_800_000, 1_800_000];
		for (const [index, maximumDelay] of maximumDelays.entries()) {
			// Let the final reconnection stay up so a healthy minute can reset the backoff.
			options.disconnectAfterMs = index === maximumDelays.length - 1 ? undefined : 1;
			const before = h.requests.length;
			const dropped = attemptTimes[attemptTimes.length - 1] + 1;
			await timeout(Math.max(0, dropped + maximumDelay / 2 - Date.now() - 1));
			const beforeMinimum = h.requests.length - before;
			await timeout(dropped + maximumDelay - Date.now() + 1);
			attempts.push({ beforeMinimum, afterMaximum: h.requests.length - before });
		}
		await timeout(60_001);
		h.sockets[h.sockets.length - 1].disconnect();
		await timeout(1_001);
		assert.deepStrictEqual({ attempts, requests: h.requests.length, connected: h.feed.connected }, {
			attempts: maximumDelays.map(() => ({ beforeMinimum: 0, afterMaximum: 1 })),
			requests: maximumDelays.length + 2,
			connected: true,
		});
	}));

	test('bounds negotiations when successful sockets repeatedly close after two seconds', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
		const h = createFeed(store, { disconnectAfterMs: 2_000 });
		await h.feed.start();
		await timeout(30 * 60_000 - 1);
		h.feed.dispose();
		assert.ok(h.requests.length >= 10 && h.requests.length <= 13, `Expected the reconnect delay to keep doubling, got ${h.requests.length} negotiations in 30 minutes`);
	}));

	test('probes disabled feeds once without opening a socket or retrying', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { connect: async () => undefined });
		await h.feed.start();
		await timeout(60 * 60_000);
		await h.feed.start();
		assert.deepStrictEqual({ requests: h.requests.length, sockets: h.sockets.length, connected: h.feed.connected, warnings: h.warnings, telemetry: h.telemetry }, {
			requests: 1, sockets: 0, connected: false, warnings: [], telemetry: [{ outcome: 'unavailable', consecutiveFailures: 0 }],
		});
	}));

	for (const status of [401, 429, 503]) {
		test(`HTTP ${status} retries negotiation with a slow jittered backoff while polling covers the gap`, () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
			const attemptTimes: number[] = [];
			const h = createFeed(store, { connect: async () => { attemptTimes.push(Date.now()); throw new CloudSandboxRequestError(status, 'Unavailable'); } });
			await h.feed.start();
			const attempts: { beforeMinimum: number; afterMaximum: number }[] = [];
			for (const maximumDelay of [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000]) {
				const before = h.requests.length;
				const last = attemptTimes[attemptTimes.length - 1];
				await timeout(Math.max(0, last + maximumDelay / 2 - Date.now() - 1));
				const beforeMinimum = h.requests.length - before;
				await timeout(last + maximumDelay - Date.now() + 1);
				attempts.push({ beforeMinimum, afterMaximum: h.requests.length - before });
			}
			assert.deepStrictEqual({
				attempts, sockets: h.sockets.length, connected: h.feed.connected, warnings: h.warnings,
				diagnostic: h.debugs[0].replace(/\d+ms/, 'Nms'),
				telemetry: h.telemetry.map(event => [event.outcome, event.consecutiveFailures, event.statusCode]),
			}, {
				attempts: Array.from({ length: 7 }, () => ({ beforeMinimum: 0, afterMaximum: 1 })),
				sockets: 0, connected: false, warnings: [],
				diagnostic: `[CloudSandboxSessionFeed] Connection failed (HTTP ${status}); retrying in Nms with discovery polling retained.`,
				telemetry: Array.from({ length: 8 }, (_, i) => ['negotiationFailed', i + 1, status]),
			});
		}));
	}

	test('honors a Retry-After longer than the backoff delay', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const started = Date.now();
		const attemptTimes: number[] = [];
		const h = createFeed(store, {
			connect: async () => {
				attemptTimes.push(Date.now() - started);
				if (attemptTimes.length <= 2) {
					throw new CloudSandboxRequestError(503, 'Unavailable', 600);
				}
				return connection();
			}
		});
		await h.feed.start();
		await timeout(20 * 60_000 + 501);
		assert.deepStrictEqual({ attemptTimes, connected: h.feed.connected, reasons: h.reasons, telemetry: h.telemetry }, {
			attemptTimes: [0, 600_000, 1_200_000], connected: true, reasons: ['reconnect'],
			telemetry: [
				{ outcome: 'negotiationFailed', consecutiveFailures: 1, retryDelayMs: 600_000, statusCode: 503 },
				{ outcome: 'negotiationFailed', consecutiveFailures: 2, retryDelayMs: 600_000, statusCode: 503 },
				{ outcome: 'connected', consecutiveFailures: 2 },
			],
		});
	}));

	test('a network failure is retried with the slow backoff', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		const h = createFeed(store, { connect: async () => { throw new Error('Network unavailable'); } });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.ok(h.requests.length >= 6 && h.requests.length <= 8, `Expected bounded retries, got ${h.requests.length} negotiations in an hour`);
		assert.deepStrictEqual({
			sockets: h.sockets.length, warnings: h.warnings,
			diagnostics: [...new Set(h.debugs.map(line => line.replace(/\d+ms/, 'Nms')))],
			outcomes: [...new Set(h.telemetry.map(event => event.outcome))],
			reported: h.telemetry.length === h.requests.length,
		}, {
			sockets: 0, warnings: [],
			diagnostics: ['[CloudSandboxSessionFeed] Connection failed; retrying in Nms with discovery polling retained.'],
			outcomes: ['negotiationFailed'],
			reported: true,
		});
	}));

	test('a reconnect that finds the feed disabled stops attempts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let attempts = 0;
		const h = createFeed(store, { connect: async () => ++attempts === 1 ? connection() : undefined });
		await h.feed.start();
		h.sockets[0].disconnect();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({
			attempts, connected: h.feed.connected, closed: h.sockets[0].closed, sockets: h.sockets.length, warnings: h.warnings,
			telemetry: h.telemetry.map(event => [event.outcome, event.consecutiveFailures]),
		}, {
			attempts: 2, connected: false, closed: true, sockets: 1, warnings: [],
			telemetry: [['connected', 0], ['disconnected', 1], ['unavailable', 1]],
		});
	}));

	test('a failed reconnect negotiation keeps retrying until the feed is restored', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let attempts = 0;
		const h = createFeed(store, {
			connect: async () => {
				if (++attempts === 2) {
					throw new CloudSandboxRequestError(503, 'Unavailable', 600);
				}
				return connection();
			}
		});
		await h.feed.start();
		h.sockets[0].disconnect();
		await timeout(1_001);
		const afterFailure = { attempts, connected: h.feed.connected };
		await timeout(600_000 + 501);
		assert.deepStrictEqual({
			afterFailure, attempts, connected: h.feed.connected, reasons: h.reasons, retryAfter: h.telemetry[2].retryDelayMs,
			telemetry: h.telemetry.map(event => [event.outcome, event.consecutiveFailures, event.statusCode]),
		}, {
			afterFailure: { attempts: 2, connected: false }, attempts: 3, connected: true, reasons: ['reconnect'], retryAfter: 600_000,
			telemetry: [['connected', 0, undefined], ['disconnected', 1, undefined], ['negotiationFailed', 2, 503], ['connected', 2, undefined]],
		});
	}));

	test('a renewal that finds the feed disabled closes the old socket and stops attempts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let attempts = 0;
		const h = createFeed(store, { connect: async () => ++attempts === 1 ? connection() : undefined });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({ attempts, connected: h.feed.connected, closed: h.sockets[0].closed, warnings: h.warnings, telemetry: h.telemetry }, {
			attempts: 2, connected: false, closed: true, warnings: [],
			telemetry: [{ outcome: 'connected', consecutiveFailures: 0 }, { outcome: 'unavailable', consecutiveFailures: 0 }],
		});
	}));

	test('a failed renewal closes the old socket and retries with the slow backoff', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let attempts = 0;
		const h = createFeed(store, {
			connect: async () => {
				if (++attempts === 2) {
					throw new CloudSandboxRequestError(503, 'Unavailable');
				}
				return connection();
			}
		});
		await h.feed.start();
		await timeout(8 * 60_000 + 1);
		const afterFailure = { attempts, connected: h.feed.connected, closed: h.sockets[0].closed };
		await timeout(60_000 + 501);
		assert.deepStrictEqual({
			afterFailure, attempts, connected: h.feed.connected, reasons: h.reasons,
			telemetry: h.telemetry.map(event => [event.outcome, event.consecutiveFailures, event.statusCode]),
		}, {
			afterFailure: { attempts: 2, connected: false, closed: true }, attempts: 3, connected: true, reasons: ['reconnect'],
			telemetry: [['connected', 0, undefined], ['negotiationFailed', 1, 503], ['connected', 1, undefined]],
		});
	}));

	test('times out an unresponsive WPS handshake and retries with the slow backoff', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		await h.feed.start();
		const afterTimeout = { connected: h.feed.connected, closed: h.sockets[0].closed, attempts: h.requests.length };
		await timeout(30_000 - 1);
		const beforeMinimum = h.requests.length;
		await timeout(30_000 + 2);
		assert.deepStrictEqual({
			afterTimeout, beforeMinimum, attempts: h.requests.length, warnings: h.warnings.length,
			first: [h.telemetry[0].outcome, h.telemetry[0].consecutiveFailures],
		}, {
			afterTimeout: { connected: false, closed: true, attempts: 1 }, beforeMinimum: 1, attempts: 2, warnings: 0,
			first: ['socketFailed', 1],
		});
	}));

	test('retries a failing socket constructor without logging the credential-bearing error', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		const h = createFeed(store, { socketError: true });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.ok(h.requests.length >= 6 && h.requests.length <= 8, `Expected bounded retries, got ${h.requests.length} negotiations in an hour`);
		assert.deepStrictEqual({
			warnings: h.warnings, leaked: h.debugs.some(line => line.includes('secret')),
			diagnostics: [...new Set(h.debugs.map(line => line.replace(/\d+ms/, 'Nms')))],
			outcomes: [...new Set(h.telemetry.map(event => event.outcome))],
		}, {
			warnings: [], leaked: false,
			diagnostics: ['[CloudSandboxSessionFeed] Connection failed; retrying in Nms with discovery polling retained.'],
			outcomes: ['socketFailed'],
		});
	}));

	test('disposal cancels pending negotiation without opening a socket', async () => {
		const pending = new DeferredPromise<ICloudSandboxSessionFeedConnection>();
		const h = createFeed(store, { connect: () => pending.p });
		const start = h.feed.start();
		h.feed.dispose();
		await pending.complete(connection());
		await start;
		assert.deepStrictEqual({ cancelled: h.requests[0].isCancellationRequested, sockets: h.sockets.length, warnings: h.warnings }, {
			cancelled: true, sockets: 0, warnings: [],
		});
	});

	test('disposal closes sockets and cancels queued invalidations and reconnects', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		h.sockets[0].receive(changed('one'));
		h.feed.dispose();
		await timeout(10 * 60_000);
		assert.deepStrictEqual({ closed: h.sockets[0].closed, requests: h.requests.length, refreshes: h.invalidations }, {
			closed: true, requests: 1, refreshes: [],
		});
	}));
});
