/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxSessionFeedConnection } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { CloudSandboxSessionFeed } from '../../../browser/remoteAgentHost/cloudSandboxSessionFeed.js';

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
		group: 'opaque-user-group',
		data: { type: 'task.changed', schema_version: 1, task: { id, updated_at: updatedAt } },
	};
}

function createFeed(store: Pick<DisposableStore, 'add'>, options?: {
	readonly connect?: (token: CancellationToken) => Promise<ICloudSandboxSessionFeedConnection | undefined>;
	readonly autoReady?: boolean;
	readonly socketError?: boolean;
	readonly onInvalidate?: () => void;
}) {
	const instantiationService = store.add(new TestInstantiationService());
	const sockets: TestSocket[] = [];
	const invalidations: boolean[] = [];
	const taskBatches: (readonly string[] | undefined)[] = [];
	const warnings: string[] = [];
	const debugs: string[] = [];
	const requests: CancellationToken[] = [];
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
	const feed = store.add(instantiationService.createInstance(CloudSandboxSessionFeed, (incremental: boolean, taskIds?: readonly string[]) => {
		invalidations.push(incremental);
		taskBatches.push(taskIds);
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
		return socket;
	}));
	return { feed, sockets, requests, invalidations, taskBatches, warnings, debugs };
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

	test('ignores unknown messages and other groups without disrupting the subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		for (const message of [
			{ ...changed('one'), group: 'another-group' },
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
				warnings: h.warnings, diagnostics: h.debugs,
			}, {
				connected: false, requests: 1, closed: true, warnings: [],
				diagnostics: [
					'[CloudSandboxSessionFeed] Connected to task status feed.',
					'[CloudSandboxSessionFeed] Invalid or unsupported feed message; using discovery polling until the next account or feature lifetime.',
				],
			});
		}));
	}

	test('opens a replacement before closing the previous socket and refreshes the full list', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		const initial = h.feed.start();
		await timeout(0);
		h.sockets[0].receive({ type: 'system', event: 'connected' });
		await initial;
		await timeout(8 * 60_000 + 1);
		const overlap = h.sockets.map(socket => socket.closed);
		h.sockets[1].receive({ type: 'system', event: 'connected' });
		await timeout(501);
		assert.deepStrictEqual({ overlap, closed: h.sockets.map(socket => socket.closed), refreshes: h.invalidations, taskBatches: h.taskBatches }, {
			overlap: [false, false], closed: [true, false], refreshes: [false], taskBatches: [undefined],
		});
	}));

	test('reconnects after disconnection and requests an authoritative full refresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store);
		await h.feed.start();
		h.sockets[0].disconnect();
		const disconnected = h.feed.connected;
		await timeout(1_701);
		assert.deepStrictEqual({ disconnected, sockets: h.sockets.length, connected: h.feed.connected, refreshes: h.invalidations }, {
			disconnected: false, sockets: 2, connected: true, refreshes: [false],
		});
	}));

	test('probes disabled feeds once without opening a socket or retrying', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { connect: async () => undefined });
		await h.feed.start();
		await timeout(60 * 60_000);
		await h.feed.start();
		assert.deepStrictEqual({ requests: h.requests.length, sockets: h.sockets.length, connected: h.feed.connected, warnings: h.warnings }, {
			requests: 1, sockets: 0, connected: false, warnings: [],
		});
	}));

	for (const status of [401, 403, 404, 429, 503]) {
		test(`HTTP ${status} falls back quietly without automatic retries`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const h = createFeed(store, { connect: async () => { throw new CloudSandboxRequestError(status, 'Unavailable', 30); } });
			await h.feed.start();
			await timeout(60 * 60_000);
			await h.feed.start();
			assert.deepStrictEqual({
				requests: h.requests.length, sockets: h.sockets.length, connected: h.feed.connected, warnings: h.warnings,
				diagnostic: h.debugs,
			}, {
				requests: 1, sockets: 0, connected: false, warnings: [],
				diagnostic: [`[CloudSandboxSessionFeed] Connection failed (HTTP ${status}); using discovery polling until the next account or feature lifetime.`],
			});
		}));
	}

	test('a network failure falls back quietly without automatic retries', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { connect: async () => { throw new Error('Network unavailable'); } });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({ requests: h.requests.length, sockets: h.sockets.length, warnings: h.warnings, diagnostics: h.debugs.length }, {
			requests: 1, sockets: 0, warnings: [], diagnostics: 1,
		});
	}));

	for (const failure of ['flag disabled', 'service unavailable'] as const) {
		test(`failed reconnect stops attempts when ${failure}`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			let attempts = 0;
			const h = createFeed(store, {
				connect: async () => {
					if (++attempts === 1) {
						return connection();
					}
					if (failure === 'service unavailable') {
						throw new CloudSandboxRequestError(503, 'Unavailable', 30);
					}
					return undefined;
				}
			});
			await h.feed.start();
			h.sockets[0].disconnect();
			await timeout(60 * 60_000);
			assert.deepStrictEqual({ attempts, connected: h.feed.connected, closed: h.sockets[0].closed, sockets: h.sockets.length, warnings: h.warnings }, {
				attempts: 2, connected: false, closed: true, sockets: 1, warnings: [],
			});
		}));
	}

	test('failed renewal closes the old socket and stops attempts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let attempts = 0;
		const h = createFeed(store, {
			connect: async () => {
				if (++attempts === 1) {
					return connection();
				}
				throw new CloudSandboxRequestError(404, 'Flag disabled');
			}
		});
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({ attempts, connected: h.feed.connected, closed: h.sockets[0].closed, warnings: h.warnings }, {
			attempts: 2, connected: false, closed: true, warnings: [],
		});
	}));

	test('times out an unresponsive WPS handshake', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { autoReady: false });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({ connected: h.feed.connected, closed: h.sockets[0].closed, warnings: h.warnings.length, attempts: h.requests.length }, {
			connected: false, closed: true, warnings: 0, attempts: 1,
		});
	}));

	test('never logs credential-bearing socket errors or retries them', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createFeed(store, { socketError: true });
		await h.feed.start();
		await timeout(60 * 60_000);
		assert.deepStrictEqual({ requests: h.requests.length, warnings: h.warnings, diagnostics: h.debugs }, {
			requests: 1, warnings: [], diagnostics: ['[CloudSandboxSessionFeed] Connection failed; using discovery polling until the next account or feature lifetime.'],
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
