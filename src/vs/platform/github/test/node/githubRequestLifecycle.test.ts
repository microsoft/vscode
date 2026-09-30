/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubAccountHandle, GitHubRequestError, GitHubRequestOptions } from '../../common/githubTypes.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

const account: GitHubAccountHandle = { host: 'github.example.test', accountId: '1' };
const url = 'https://github.example.test/repos/owner/repo';

function request(transport: GitHubTransport, kind: 'rest' | 'graphql', options: GitHubRequestOptions = {}, signal = new AbortController().signal) {
	return kind === 'rest'
		? transport.rest<{ value: string }>(account, 'token', { method: 'GET', url, ...options }, signal)
		: transport.graphql<{ value: string }>(account, 'token', 'https://github.example.test/graphql', 'query { viewer { login } }', {}, signal, 'interactive', options);
}

suite('GitHub request lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const kind of ['rest', 'graphql'] as const) {
		test(`${kind}: bounds retained timers during a synchronous rejected-request burst`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const transport = store.add(new GitHubTransport(async () => new Promise<Response>(() => { }), scheduler, false, undefined, {
				queue: { maximumRequests: 4, maximumAccountRequests: 4, maximumCallerRequests: 4, reservedInteractiveRequests: 0 },
			}));
			const read = (index: number) => (kind === 'rest'
				? transport.rest(account, 'token', { method: 'GET', url: `${url}?page=${index}` }, new AbortController().signal)
				: transport.graphql(account, 'token', url, 'query Read($page: Int!) { value }', { page: index }, new AbortController().signal)
			).then(() => 'completed', error => error instanceof GitHubRequestError ? error.kind : 'unexpected');
			const requests = Array.from({ length: 100 }, (_, index) => read(index));
			const burstTimers = scheduler.pendingCount;
			requests.push(read(0));
			const coalescedTimers = scheduler.pendingCount;
			transport.clear();
			const outcomes = await Promise.all(requests);
			assert.deepStrictEqual({
				burstTimers, coalescedTimers,
				overloaded: outcomes.filter(outcome => outcome === 'overloaded').length,
				timers: scheduler.pendingCount,
			}, { burstTimers: 8, coalescedTimers: 9, overloaded: 96, timers: 0 });
		});

		test(`${kind}: classifies oversized HTTP failures before the response size error`, async () => {
			const transport = store.add(new GitHubTransport(async () => new Response('invalid credential details', { status: 401 }), undefined, false, undefined, { maximumResponseBytes: 4 }));
			await assert.rejects(request(transport, kind), { kind: 'authentication', statusCode: 401, responseBody: 'inva' });
		});

		test(`${kind}: detaches cancelled waiters while keeping a shared peer alive`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const response = new DeferredPromise<Response>();
			let calls = 0;
			const transport = store.add(new GitHubTransport(async () => {
				calls++;
				return response.p;
			}, scheduler, false, undefined, { maximumSharedWaiters: 2 }));
			const peer = new AbortController();
			const pending = request(transport, kind, {}, peer.signal);
			for (let i = 0; i < 100; i++) {
				const controller = new AbortController();
				const reason = new Error('cancelled waiter');
				const rejected = assert.rejects(request(transport, kind, {}, controller.signal), error => error === reason);
				controller.abort(reason);
				await rejected;
			}
			const waitingTimers = scheduler.pendingCount;
			await response.complete(new Response('{"data":{}}'));
			await pending;
			assert.deepStrictEqual({
				calls, waitingTimers,
				timers: scheduler.pendingCount,
			}, { calls: 1, waitingTimers: 2, timers: 0 });
		});

		for (const phase of ['queued', 'headers', 'body'] as const) {
			test(`${kind}: timeout records whether a mutation reached network dispatch (${phase})`, async () => {
				const scheduler = store.add(new FakeGitHubScheduler());
				const started = new DeferredPromise<void>();
				const transport = store.add(new GitHubTransport(async () => {
					await started.complete();
					return phase === 'headers' ? new Promise<Response>(() => { }) : new Response(new ReadableStream<Uint8Array>());
				}, scheduler, false, undefined, { requestTimeout: 10 }));
				const signal = new AbortController().signal;
				const pending = kind === 'rest'
					? transport.rest(account, 'token', { method: 'POST', url, body: {} }, signal)
					: transport.graphql(account, 'token', url, 'mutation Write { write { id } }', {}, signal);
				const rejected = assert.rejects(pending, { kind: 'timeout', requestDispatched: phase !== 'queued' });
				if (phase !== 'queued') {
					await started.p;
					await Promise.resolve();
					await Promise.resolve();
				}
				scheduler.advanceBy(10);
				await rejected;
				assert.strictEqual(scheduler.pendingCount, 0);
			});
		}

		test(`${kind}: bounds decoded response bytes and accepts the exact limit`, async () => {
			const body = JSON.stringify(kind === 'rest' ? { value: '\u00e9' } : { data: { value: '\u00e9' } });
			const bytes = new TextEncoder().encode(body).byteLength;
			const oversized = store.add(new GitHubTransport(async () => new Response(body), undefined, false, undefined, { maximumResponseBytes: bytes - 1 }));
			await assert.rejects(request(oversized, kind), { kind: 'responseTooLarge' });
			const exact = store.add(new GitHubTransport(async () => new Response(body), undefined, false, undefined, { maximumResponseBytes: bytes }));
			assert.deepStrictEqual((await request(exact, kind)).data, { value: '\u00e9' });
		});

		test(`${kind}: expires a hanging body and cancels the reader`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const started = new DeferredPromise<void>();
			const cancelled = new DeferredPromise<void>();
			const body = new ReadableStream<Uint8Array>({
				pull() { void started.complete(); },
				cancel() { void cancelled.complete(); return new Promise<void>(() => { }); },
			}, { highWaterMark: 0 });
			const transport = store.add(new GitHubTransport(async () => new Response(body), scheduler, false, undefined, { requestTimeout: 10 }));
			const rejected = assert.rejects(request(transport, kind), { kind: 'timeout' });
			await started.p;
			scheduler.advanceBy(10);
			await rejected;
			await cancelled.p;
			assert.deepStrictEqual({ locked: body.locked, timers: scheduler.pendingCount }, { locked: false, timers: 0 });
		});

		test(`${kind}: a waiter's deadline does not cancel another coalesced reader`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const started = new DeferredPromise<AbortSignal>();
			const response = new DeferredPromise<Response>();
			let calls = 0;
			const transport = store.add(new GitHubTransport(async (_input, options) => {
				calls++;
				assert.ok(options?.signal);
				await started.complete(options.signal);
				return response.p;
			}, scheduler));
			const first = request(transport, kind, { caller: 'first', deadline: 10 });
			const rejected = assert.rejects(first, { kind: 'timeout' });
			const second = request(transport, kind, { caller: 'second', deadline: 20 });
			const signal = await started.p;
			scheduler.advanceBy(10);
			await rejected;
			const body = kind === 'rest' ? { value: 'shared' } : { data: { value: 'shared' } };
			await response.complete(new Response(JSON.stringify(body)));
			const result = await second;
			assert.deepStrictEqual({ calls, aborted: signal.aborted, data: result.data, timers: scheduler.pendingCount }, {
				calls: 1, aborted: false, data: { value: 'shared' }, timers: 0,
			});
		});

		test(`${kind}: a fresh reader does not join queued work expired by a wall-clock jump`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<Response>();
			const calls: string[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				const path = new URL(String(input)).pathname;
				calls.push(path);
				if (path === '/busy') {
					await started.complete();
					return release.p;
				}
				return new Response(JSON.stringify(kind === 'rest' ? { value: 'fresh' } : { data: { value: 'fresh' } }));
			}, scheduler, false, undefined, { requestTimeout: 100 }));
			const busy = transport.rest(account, 'token', {
				method: 'GET', url: 'https://github.example.test/busy',
			}, new AbortController().signal);
			const rejectedBusy = assert.rejects(busy, { kind: 'timeout' });
			await started.p;
			const expired = request(transport, kind);
			const outcome = expired.then(() => 'success', error => error instanceof GitHubRequestError ? error.kind : 'unexpected');
			scheduler.advanceWallClockBy(1_000);
			const fresh = request(transport, kind);
			await release.complete(new Response('{}'));
			await rejectedBusy;
			const result = await fresh;
			assert.deepStrictEqual({ outcome: await outcome, calls, data: result.data, timers: scheduler.pendingCount }, {
				outcome: 'timeout', calls: ['/busy', kind === 'rest' ? '/repos/owner/repo' : '/graphql'], data: { value: 'fresh' }, timers: 0,
			});
		});
	}

	test('expires stalled headers and discards a late response', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		const cancelled = new DeferredPromise<void>();
		const transport = store.add(new GitHubTransport(async (_input, options) => {
			assert.ok(options?.signal);
			await started.complete(options.signal);
			return response.p;
		}, scheduler));
		const rejected = assert.rejects(request(transport, 'rest', { deadline: 10 }), { kind: 'timeout' });
		const signal = await started.p;
		scheduler.advanceBy(10);
		await rejected;
		const body = new ReadableStream<Uint8Array>({ cancel() { void cancelled.complete(); } }, { highWaterMark: 0 });
		await response.complete(new Response(body));
		await cancelled.p;
		assert.deepStrictEqual({ aborted: signal.aborted, timers: scheduler.pendingCount }, { aborted: true, timers: 0 });
	});

	test('bounds coalesced consumers without issuing extra requests', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => { calls++; return response.p; }, scheduler, false, undefined, { maximumSharedWaiters: 2 }));
		const first = request(transport, 'rest');
		const second = request(transport, 'rest');
		await assert.rejects(request(transport, 'rest'), { kind: 'overloaded' });
		await response.complete(new Response('{"value":"shared"}'));
		const results = await Promise.all([first, second]);
		assert.deepStrictEqual({ calls, values: results.map(result => result.data), timers: scheduler.pendingCount }, {
			calls: 1, values: [{ value: 'shared' }, { value: 'shared' }], timers: 0,
		});
	});

	test('an interactive coalesced reader promotes an already queued background request', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const release = new DeferredPromise<Response>();
		const started = new DeferredPromise<void>();
		const paths: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const path = new URL(String(input)).pathname;
			paths.push(path);
			if (path === '/busy') {
				await started.complete();
				return release.p;
			}
			return new Response('{}');
		}, scheduler));
		const fetch = (path: string, priority: 'background' | 'interactive') => transport.rest(account, 'token', {
			method: 'GET', url: `https://github.example.test/${path}`, priority,
		}, new AbortController().signal);
		const busy = fetch('busy', 'background');
		await started.p;
		const older = fetch('older', 'background');
		const background = fetch('shared', 'background');
		const interactive = fetch('shared', 'interactive');
		await release.complete(new Response('{}'));
		await Promise.all([busy, older, background, interactive]);
		assert.deepStrictEqual({ paths, timers: scheduler.pendingCount }, {
			paths: ['/busy', '/shared', '/older'], timers: 0,
		});
	});

	test('download timeout includes its cooldown wait', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => { calls++; return new Response('log'); }, scheduler));
		transport.rateLimits.updateFromResponse(account, new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
		const pending = transport.download(account, 'token', { url, timeout: 10, maximumBytes: 100 }, new AbortController().signal);
		const rejected = assert.rejects(pending, { kind: 'timeout' });
		scheduler.advanceBy(10);
		await rejected;
		scheduler.advanceBy(30_000);
		assert.deepStrictEqual({ calls, timers: scheduler.pendingCount }, { calls: 0, timers: 0 });
	});

	for (const hinted of [false, true]) {
		test(`download secondary rate limits park the account ${hinted ? 'with' : 'without'} Retry-After`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const calls: number[] = [];
			const transport = store.add(new GitHubTransport(async () => {
				calls.push(scheduler.now());
				return calls.length === 1
					? new Response('{"message":"You have exceeded a secondary rate limit. private-detail"}', {
						status: 403,
						headers: { 'Content-Type': 'application/json', ...(hinted ? { 'Retry-After': '120' } : {}) },
					})
					: new Response('{"data":{"value":"ok"}}');
			}, scheduler));
			await assert.rejects(transport.download(account, 'private-token', {
				url, timeout: 1_000, maximumBytes: 1,
			}, new AbortController().signal), {
				name: 'GitHubRequestError', kind: 'rateLimit', statusCode: 403,
				message: 'GitHub download failed - HTTP 403', responseBody: undefined,
			});
			const delay = hinted ? 120_000 : 60_000;
			const blocked = {
				core: transport.rateLimits.getDelay(account, 'core'),
				graphql: transport.rateLimits.getDelay(account, 'graphql'),
			};
			const pending = request(transport, 'graphql');
			scheduler.advanceBy(delay - 1);
			const beforeReset = calls.length;
			scheduler.advanceBy(1);
			await pending;
			assert.deepStrictEqual({ blocked, beforeReset, calls, timers: scheduler.pendingCount }, {
				blocked: { core: delay, graphql: delay }, beforeReset: 1, calls: [0, delay], timers: 0,
			});
		});
	}

	test('download same-origin redirects respect a newly established cooldown', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const calls: { path: string; at: number }[] = [];
		let discardedRedirects = 0;
		const transport = store.add(new GitHubTransport(async input => {
			const path = new URL(String(input)).pathname;
			calls.push({ path, at: scheduler.now() });
			return calls.length === 1
				? new Response(new ReadableStream<Uint8Array>({
					cancel() { discardedRedirects++; },
				}), { status: 302, headers: { Location: '/redirected', 'Retry-After': '120' } })
				: new Response('ok');
		}, scheduler));
		const download = () => transport.download(account, 'token', {
			url, timeout: 180_000, maximumBytes: 100,
		}, new AbortController().signal);
		await assert.rejects(download(), { kind: 'rateLimit' });
		const pending = download();
		scheduler.advanceBy(119_999);
		const beforeReset = calls.length;
		scheduler.advanceBy(1);
		const result = await pending;
		assert.deepStrictEqual({ beforeReset, calls, discardedRedirects, text: result.text, timers: scheduler.pendingCount }, {
			beforeReset: 1, calls: [{ path: '/repos/owner/repo', at: 0 }, { path: '/repos/owner/repo', at: 120_000 }],
			discardedRedirects: 1, text: 'ok', timers: 0,
		});
	});

	test('download errors use a bounded diagnostic prefix without exposing its contents', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let chunks = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				const message = chunks++ === 0 ? '{"message":"secondary rate limit: private-detail"}' : '';
				controller.enqueue(new TextEncoder().encode(message.padEnd(4 * 1024, 'x')));
			},
			cancel() { cancelled = true; },
		}, { highWaterMark: 0 });
		const transport = store.add(new GitHubTransport(async () => new Response(body, { status: 403 }), scheduler));
		await assert.rejects(transport.download(account, 'private-token', { url, timeout: 1_000, maximumBytes: 1 }, new AbortController().signal), {
			kind: 'rateLimit', message: 'GitHub download failed - HTTP 403', responseBody: undefined,
		});
		assert.deepStrictEqual({
			chunks, cancelled, locked: body.locked, timers: scheduler.pendingCount,
			graphqlCooldown: transport.rateLimits.getDelay(account, 'graphql'),
		}, { chunks: 3, cancelled: true, locked: false, timers: 0, graphqlCooldown: 60_000 });
	});

	test('download authorization failures and storage-origin limits do not park GitHub traffic', async () => {
		const outcomes: { storage: boolean; calls: number; core: number; graphql: number }[] = [];
		for (const storage of [false, true]) {
			const scheduler = store.add(new FakeGitHubScheduler());
			let calls = 0;
			const transport = store.add(new GitHubTransport(async (_input, options) => {
				calls++;
				if (storage && calls === 1) {
					return new Response(null, { status: 302, headers: { Location: 'https://storage.example.test/log?sig=private' } });
				}
				assert.strictEqual(new Headers(options?.headers).has('Authorization'), !storage);
				return storage
					? new Response('{"message":"secondary rate limit"}', { status: 403, headers: { 'Retry-After': '120' } })
					: new Response('{"message":"Resource not accessible by integration"}', { status: 403 });
			}, scheduler));
			await assert.rejects(transport.download(account, 'token', { url, timeout: 1_000, maximumBytes: 100 }, new AbortController().signal), {
				kind: 'authorization', responseBody: undefined,
			});
			outcomes.push({
				storage, calls,
				core: transport.rateLimits.getDelay(account, 'core'),
				graphql: transport.rateLimits.getDelay(account, 'graphql'),
			});
		}
		assert.deepStrictEqual(outcomes, [
			{ storage: false, calls: 1, core: 0, graphql: 0 },
			{ storage: true, calls: 2, core: 0, graphql: 0 },
		]);
	});

	test('download error-body inspection remains cancellable and sanitized', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const started = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		const body = new ReadableStream<Uint8Array>({
			pull() { void started.complete(); },
			cancel() { void cancelled.complete(); return new Promise<void>(() => { }); },
		}, { highWaterMark: 0 });
		const transport = store.add(new GitHubTransport(async () => new Response(body, { status: 403 }), scheduler));
		const rejected = assert.rejects(transport.download(account, 'token', { url, timeout: 10, maximumBytes: 1 }, new AbortController().signal), { kind: 'timeout' });
		await started.p;
		scheduler.advanceBy(10);
		await rejected;
		await cancelled.p;
		assert.deepStrictEqual({ locked: body.locked, timers: scheduler.pendingCount }, { locked: false, timers: 0 });
	});

	test('rechecks cooldowns between admission and network dispatch', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => { calls++; return new Response('{}'); }, scheduler));
		const pending = request(transport, 'rest');
		transport.rateLimits.updateFromResponse(account, new Response('', { status: 429, headers: { 'Retry-After': '5' } }));
		await assert.rejects(pending, { kind: 'rateLimit' });
		assert.deepStrictEqual({ calls, timers: scheduler.pendingCount }, { calls: 0, timers: 0 });
	});

	test('account invalidation reclaims quota state after its last cooldown expires', () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const transport = store.add(new GitHubTransport(undefined, scheduler));
		transport.rateLimits.updateFromResponse(account, new Response(null, { headers: { 'x-ratelimit-resource': 'graphql' } }));
		transport.rateLimits.updateFromResponse(account, new Response(null, { status: 403, headers: { 'retry-after': '1' } }), 'secondary rate limit');
		transport.invalidateAccount(account);
		scheduler.advanceBy(999);
		const blocked = transport.rateLimits.getDelay(account, 'graphql');
		scheduler.advanceBy(1);
		assert.deepStrictEqual({
			blocked,
			core: transport.rateLimits.getState(account, 'core'),
			graphql: transport.rateLimits.getState(account, 'graphql'),
			timers: scheduler.pendingCount,
		}, { blocked: 1, core: undefined, graphql: undefined, timers: 0 });
	});

	test('account invalidation immediately reclaims quota state without a cooldown', () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const transport = store.add(new GitHubTransport(undefined, scheduler));
		transport.rateLimits.updateFromResponse(account, new Response(null, { headers: { 'x-ratelimit-remaining': '10' } }));
		transport.invalidateAccount(account);
		assert.deepStrictEqual({ state: transport.rateLimits.getState(account, 'core'), timers: scheduler.pendingCount }, {
			state: undefined, timers: 0,
		});
	});

	test('account reuse cancels expiry cleanup without discarding its cooldown', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const transport = store.add(new GitHubTransport(async () => new Response('{}'), scheduler));
		transport.rateLimits.updateFromResponse(account, new Response(null, { status: 429, headers: { 'retry-after': '1' } }));
		transport.invalidateAccount(account);
		const pending = request(transport, 'rest');
		scheduler.advanceBy(1_000);
		await pending;
		const retained = transport.rateLimits.getState(account, 'core') !== undefined;
		transport.invalidateAccount(account);
		assert.deepStrictEqual({ retained, state: transport.rateLimits.getState(account, 'core'), timers: scheduler.pendingCount }, {
			retained: true, state: undefined, timers: 0,
		});
	});

	test('many inactive accounts share one expiry timer and release all quota state', () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const transport = store.add(new GitHubTransport(undefined, scheduler));
		const accounts = Array.from({ length: 100 }, (_, i) => ({ ...account, accountId: String(i) }));
		for (const inactive of accounts) {
			transport.rateLimits.updateFromResponse(inactive, new Response(null, { status: 429, headers: { 'retry-after': '1' } }));
			transport.invalidateAccount(inactive);
		}
		const cleanupTimers = scheduler.pendingCount;
		scheduler.advanceBy(1_000);
		assert.deepStrictEqual({
			cleanupTimers,
			retained: accounts.filter(inactive => transport.rateLimits.getState(inactive, 'core') !== undefined).length,
			timers: scheduler.pendingCount,
		}, { cleanupTimers: 1, retained: 0, timers: 0 });
	});

	test('long GraphQL comments cannot trigger backtracking or hide the mutation operation', async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return new Response('{}', { status: 503 });
		}));
		const comment = `#${'#'.repeat(100_000)} query NotAnOperation`;
		await assert.rejects(transport.graphql(account, 'token', url, `${comment}\r\n, # { ignored }\nmutation Write { write { id } }`, {}, new AbortController().signal), { kind: 'server' });
		assert.strictEqual(calls, 1);
	});

	test('does not retry mutations whose comments contain query keywords', async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return new Response('{}', { status: 503 });
		}));
		await assert.rejects(transport.graphql(account, 'token', url, '# query NotAnOperation\nmutation Write { write { id } }', {}, new AbortController().signal), { kind: 'server' });
		assert.strictEqual(calls, 1);
	});

	test('rejects expired or cancelled requests before network access', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => { calls++; return new Response('{}'); }, scheduler));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(request(transport, 'rest', { deadline: 0 }), { kind: 'timeout' });
		await assert.rejects(request(transport, 'graphql', {}, controller.signal), error => error === reason);
		assert.deepStrictEqual({ calls, timers: scheduler.pendingCount }, { calls: 0, timers: 0 });
	});

	test('honors search cooldowns before dispatch without blocking the core bucket', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			requests.push(String(input));
			return new Response('{}');
		}, scheduler));
		transport.rateLimits.updateFromResponse(account, new Response('', {
			status: 429, headers: { 'x-ratelimit-resource': 'search', 'Retry-After': '1' },
		}));
		const search = transport.rest(account, 'token', { method: 'GET', url: 'https://github.example.test/search/issues' }, new AbortController().signal);
		await request(transport, 'rest');
		const beforeReset = requests.length;
		scheduler.advanceBy(1_000);
		await search;
		assert.deepStrictEqual({ beforeReset, requests, timers: scheduler.pendingCount }, {
			beforeReset: 1, requests: [url, 'https://github.example.test/search/issues'], timers: 0,
		});
	});

	test('preserves cooldowns from a failed response instead of immediately retrying', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			return ++calls === 1
				? new Response('{}', { status: 503, headers: { 'Retry-After': new Date(5_000).toUTCString() } })
				: new Response('{}');
		}, scheduler));
		await assert.rejects(request(transport, 'rest'), { kind: 'server' });
		transport.invalidateAccount(account);
		const pending = request(transport, 'rest');
		scheduler.advanceBy(4_999);
		const beforeReset = calls;
		scheduler.advanceBy(1);
		await pending;
		assert.deepStrictEqual({ beforeReset, calls, timers: scheduler.pendingCount }, { beforeReset: 1, calls: 2, timers: 0 });
	});

	test('GraphQL quota data does not erase a header cooldown', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return new Response('{"data":{"rateLimit":{"remaining":100}}}', { headers: { 'Retry-After': '5' } });
		}, scheduler));
		await request(transport, 'graphql');
		const delay = transport.rateLimits.getDelay(account, 'graphql');
		const pending = request(transport, 'graphql');
		const beforeReset = calls;
		scheduler.advanceBy(5_000);
		await pending;
		assert.deepStrictEqual({ delay, beforeReset, calls, timers: scheduler.pendingCount }, { delay: 5_000, beforeReset: 1, calls: 2, timers: 0 });
	});

	test('retries a read only once and never retries a mutation', async () => {
		const scheduler = store.add(new FakeGitHubScheduler({ jitterValues: [50] }));
		let reads = 0;
		const readStarted = new DeferredPromise<void>();
		const transport = store.add(new GitHubTransport(async () => {
			reads++;
			await readStarted.complete();
			return new Response('{}', { status: 503 });
		}, scheduler));
		const rejected = assert.rejects(request(transport, 'rest'), { kind: 'server' });
		await readStarted.p;
		await Promise.resolve();
		await Promise.resolve();
		scheduler.advanceBy(150);
		await rejected;

		let writes = 0;
		const mutations = store.add(new GitHubTransport(async () => { writes++; return new Response('{}', { status: 503 }); }, scheduler));
		await assert.rejects(mutations.rest(account, 'token', { method: 'POST', url, body: {} }, new AbortController().signal), { kind: 'server' });
		await assert.rejects(mutations.graphql(account, 'token', url, '# comment\nmutation Update { updatePullRequest { id } }', {}, new AbortController().signal), { kind: 'server' });
		assert.deepStrictEqual({ reads, writes, timers: scheduler.pendingCount }, { reads: 2, writes: 2, timers: 0 });
	});

	test('does not retry a read after its deadline', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const started = new DeferredPromise<void>();
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			await started.complete();
			throw new Error('network failure');
		}, scheduler));
		const rejected = assert.rejects(request(transport, 'rest', { deadline: 10 }), { kind: 'timeout' });
		await started.p;
		await Promise.resolve();
		await Promise.resolve();
		scheduler.advanceBy(10);
		await rejected;
		scheduler.advanceBy(1_000);
		assert.deepStrictEqual({ calls, timers: scheduler.pendingCount }, { calls: 1, timers: 0 });
	});
});
