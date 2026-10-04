/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeScheduler } from './fakeScheduler.js';

suite('GitHub REST rate limits', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const origin = 'https://github.example.test';
	const account = { host: 'github.example.test', accountId: '101' };
	const signal = () => new AbortController().signal;
	const headers = (resource: string) => ({
		'x-ratelimit-resource': resource, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1060',
	});
	const families = [
		{ name: 'core', resource: 'core', first: '/repos/o/r/issues/1', next: '/repos/other/repo/pulls', independent: '/search/issues?q=test' },
		{ name: 'checks', resource: 'checks', first: '/repos/o/r/commits/main/check-runs', next: '/repos/other/repo/check-runs/2/annotations', independent: '/repos/o/r/issues/1' },
		{ name: 'enterprise checks', resource: 'checks', first: '/api/v3/repositories/1/check-suites/2/check-runs', next: '/api/v3/repos/o/r/commits/feature%2Fbranch/check-suites', independent: '/api/v3/repos/o/r/issues/1' },
		{ name: 'search', resource: 'search', first: '/search/issues?q=first', next: '/search/repositories?q=second', independent: '/repos/o/r/issues/1' },
		{ name: 'code search', resource: 'code_search', first: '/search/code?q=first', next: '/search/code?q=second', independent: '/search/issues?q=test' },
		{ name: 'expanded code search', resource: 'code_search_expanded', first: '/api/v3/search/code?q=first', next: '/api/v3/search/code/?q=second', independent: '/api/v3/search/issues?q=test' },
		{ name: 'semantic search', resource: 'semantic_search', first: '/search/issues?q=first&search_type=semantic', next: '/search/issues?q=second&search_type=hybrid', independent: '/search/issues?q=keyword' },
		{ name: 'legacy checks', resource: 'core', first: '/repos/o/r/check-suites/1', next: '/repos/other/repo/check-runs/2', independent: '/search/issues?q=test' },
		{ name: 'legacy code search', resource: 'search', first: '/search/code?q=first', next: '/search/code?q=second', independent: '/repos/o/r/issues/1' },
	];

	for (const family of families) {
		for (const status of [200, 403, 503]) {
			test(`${family.name}: HTTP ${status} quota feedback gates the next route`, async () => {
				const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
				const calls: { path: string; at: number }[] = [];
				const transport = store.add(new GitHubTransport(async input => {
					const target = new URL(String(input));
					calls.push({ path: target.pathname + target.search, at: scheduler.now() });
					return calls.length === 1 ? Response.json({}, { status, headers: headers(family.resource) }) : Response.json({});
				}, scheduler));
				const first = transport.rest(account, 'token', { method: 'GET', url: origin + family.first }, signal());
				if (status === 200) {
					await first;
				} else {
					await assert.rejects(first, { kind: status === 403 ? 'rateLimit' : 'server' });
				}
				await transport.rest(account, 'token', { method: 'GET', url: origin + family.independent }, signal());
				const pending = transport.rest(account, 'token', { method: 'GET', url: origin + family.next }, signal());
				scheduler.advanceBy(59_999);
				await Promise.resolve();
				const beforeReset = calls.length;
				scheduler.advanceBy(1);
				await pending;
				assert.deepStrictEqual({ calls, beforeReset, timers: scheduler.pendingCount }, {
					calls: [{ path: family.first, at: 1_000_000 }, { path: family.independent, at: 1_000_000 }, { path: family.next, at: 1_060_000 }],
					beforeReset: 2, timers: 0,
				});
			});
		}
	}

	for (const resource of ['custom_resource', 'checks', 'graphql']) {
		for (const status of [200, 403, 503]) {
			test(`unexpected REST resource ${resource} on HTTP ${status} conservatively gates only that account's REST requests`, async () => {
				const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
				const calls: number[] = [];
				const transport = store.add(new GitHubTransport(async () => {
					calls.push(scheduler.now());
					return calls.length === 1 ? Response.json({}, { status, headers: headers(resource) }) : Response.json({ data: {} });
				}, scheduler));
				const first = transport.rest(account, 'token', { method: 'GET', url: `${origin}/custom` }, signal());
				if (status === 200) {
					await first;
				} else {
					await assert.rejects(first, { kind: status === 403 ? 'rateLimit' : 'server' });
				}
				const reportedState = transport.rateLimits.getState(account, resource);
				transport.rateLimits.updateFromResponse(account, new Response(null, {
					headers: { ...headers('different_resource'), 'x-ratelimit-remaining': '4999' },
				}), undefined, 'core');
				await transport.graphql(account, 'token', `${origin}/graphql`, 'query { viewer { login } }', {}, signal());
				await transport.rest({ ...account, accountId: '202' }, 'peer', { method: 'GET', url: `${origin}/custom` }, signal());
				await transport.rest({ ...account, host: 'other.example.test' }, 'other', { method: 'GET', url: 'https://other.example.test/custom' }, signal());
				const pending = ['/repos/o/r/issues/1', '/repos/o/r/check-runs/1', '/search/code', '/search/issues?search_type=semantic'].map(path =>
					transport.rest(account, 'token', { method: 'GET', url: origin + path }, signal()));
				scheduler.advanceBy(59_999);
				await Promise.resolve();
				const beforeReset = calls.length;
				scheduler.advanceBy(1);
				await Promise.all(pending);
				assert.deepStrictEqual({
					calls, beforeReset, timers: scheduler.pendingCount, reportedState,
				}, {
					calls: [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_060_000, 1_060_000, 1_060_000, 1_060_000],
					beforeReset: 4, timers: 0, reportedState: undefined,
				});
			});
		}
	}

	for (const remaining of [undefined, '0.0', '4999', '0']) {
		test(`expired fallback counters do not combine with another bucket: ${JSON.stringify(remaining)}`, () => runWithFakedTimers({ startTime: 1_000_000 }, async () => {
			const calls: { path: string; at: number }[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				const path = new URL(String(input)).pathname;
				calls.push({ path, at: Date.now() });
				if (path === '/first') {
					return Response.json({}, { headers: headers('custom_a') });
				}
				if (path === '/second') {
					return Response.json({}, {
						headers: {
							'x-ratelimit-resource': 'custom_b', 'x-ratelimit-reset': '4600',
							...(remaining === undefined ? {} : { 'x-ratelimit-remaining': remaining }),
						}
					});
				}
				return Response.json({});
			}));
			try {
				await transport.rest(account, 'token', { method: 'GET', url: `${origin}/first` }, signal());
				await timeout(60_000);
				await transport.rest(account, 'token', { method: 'GET', url: `${origin}/second` }, signal());
				const next = transport.rest(account, 'token', {
					method: 'GET', url: `${origin}/after`, deadline: Date.now() + 100,
				}, signal());
				if (remaining === '0') {
					await assert.rejects(next, { kind: 'timeout' });
				} else {
					await next;
				}
				assert.deepStrictEqual(calls, [
					{ path: '/first', at: 1_000_000 }, { path: '/second', at: 1_060_000 },
					...(remaining === '0' ? [] : [{ path: '/after', at: 1_060_000 }]),
				]);
			} finally {
				transport.dispose();
			}
		}));
	}

	test('an unexpected bucket cannot bypass a queued deadline or cancellation', async () => {
		const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return Response.json({}, { status: 403, headers: headers('custom_resource') });
		}, scheduler));
		const request = { method: 'GET' as const, url: `${origin}/custom` };
		await assert.rejects(transport.rest(account, 'token', request, signal()), { kind: 'rateLimit' });
		const controller = new AbortController();
		const cancelled = assert.rejects(transport.rest(account, 'token', { ...request, url: `${origin}/search/code` }, controller.signal), /cancelled/);
		const expired = assert.rejects(transport.rest(account, 'token', { ...request, deadline: scheduler.now() + 100 }, signal()), { kind: 'timeout' });
		controller.abort(new Error('cancelled'));
		scheduler.advanceBy(100);
		await Promise.all([cancelled, expired]);
		assert.deepStrictEqual({ calls, timers: scheduler.pendingCount }, { calls: 1, timers: 0 });
	});

	for (const remaining of [' ', '0x0', '0.0', '-1']) {
		test(`malformed successful quota feedback cannot invent a shared REST wait: ${JSON.stringify(remaining)}`, async () => {
			const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
			let calls = 0;
			const transport = store.add(new GitHubTransport(async () => {
				calls++;
				return Response.json({}, { headers: { ...headers('custom_resource'), 'x-ratelimit-remaining': remaining, 'retry-after': '-1' } });
			}, scheduler));
			await transport.rest(account, 'token', { method: 'GET', url: `${origin}/custom` }, signal());
			await transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/code` }, signal());
			assert.deepStrictEqual({ calls, delay: transport.rateLimits.getRequestDelay(account, 'core'), timers: scheduler.pendingCount }, { calls: 2, delay: 0, timers: 0 });
		});
	}

	for (const resource of ['checks', 'custom_resource']) {
		for (const accountId of [undefined, account.accountId]) {
			test(`queued bootstrap ${resource} cooldown survives ${accountId ? 'known-account' : 'unknown-account'} credential replacement`, () => runWithFakedTimers({}, async () => {
				const started = new DeferredPromise<void>();
				const response = new DeferredPromise<Response>();
				const blockedUntil: number[] = [];
				let calls = 0;
				const service = store.add(new GitHubService({
					fetch: async () => {
						calls++;
						await started.complete();
						return response.p;
					},
				}, new NullLogService(), NullTelemetryService));
				const options = { apiBaseUri: origin, accountId };
				const first = store.add(service.acquireBootstrapClient({ ...options, token: 'first' }));
				const peer = store.add(service.acquireBootstrapClient({ ...options, token: 'peer' }));
				const firstRejected = assert.rejects(first.object.get('/repos/o/r/check-runs/1', signal()), { kind: 'rateLimit' });
				await started.p;
				const peerRejected = assert.rejects(peer.object.get('/repos/other/repo/check-suites/2', signal(), {
					deadline: Date.now() + 100, onBlockedUntil: time => blockedUntil.push(time),
				}), { kind: 'rateLimit', statusCode: 429 });
				await response.complete(Response.json({}, {
					status: 403, headers: { 'x-ratelimit-resource': resource, 'x-ratelimit-remaining': '0', 'retry-after': '60' },
				}));
				await Promise.all([firstRejected, peerRejected]);
				first.dispose();
				peer.dispose();
				const replacement = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, accountId: account.accountId, token: 'replacement' })).object;
				await assert.rejects(replacement.get('/repos/o/r/check-runs/3', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
				assert.deepStrictEqual({ calls, notified: blockedUntil.some(time => time > Date.now()) }, { calls: 1, notified: true });
			}));
		}
	}

	for (const kind of ['REST', 'download'] as const) {
		test(`${kind} redirects cannot enter an exhausted checks bucket`, async () => {
			const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
			const paths: string[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				const path = new URL(String(input)).pathname;
				paths.push(path);
				return path === '/alias'
					? new Response(null, { status: 302, headers: { Location: '/repos/o/r/check-runs/2' } })
					: Response.json({}, { status: 403, headers: headers('checks') });
			}, scheduler));
			await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal()), { kind: 'rateLimit' });
			const request = kind === 'REST'
				? transport.rest(account, 'token', { method: 'GET', url: `${origin}/alias` }, signal())
				: transport.download(account, 'token', { url: `${origin}/alias`, maximumBytes: 100, timeout: 1_000 }, signal());
			await assert.rejects(request, { kind: 'rateLimit' });
			assert.deepStrictEqual({ paths, timers: scheduler.pendingCount }, { paths: ['/repos/o/r/check-runs/1', '/alias'], timers: 0 });
		});
	}

	test('a cached redirect uses its target family before admission', async () => {
		const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
		const paths: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const path = new URL(String(input)).pathname;
			paths.push(path);
			return path === '/alias'
				? new Response(null, { status: 302, headers: { Location: '/repos/o/r/check-runs/1' } })
				: path.endsWith('/2') ? Response.json({}, { status: 403, headers: headers('checks') }) : Response.json({});
		}, scheduler));
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/alias` }, signal());
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/2` }, signal()), { kind: 'rateLimit' });
		const rejected = assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/alias`, deadline: scheduler.now() + 100 }, signal()), { kind: 'timeout' });
		scheduler.advanceBy(100);
		await rejected;
		assert.deepStrictEqual({ paths, timers: scheduler.pendingCount }, { paths: ['/alias', '/repos/o/r/check-runs/1', '/repos/o/r/check-runs/2'], timers: 0 });
	});
});
