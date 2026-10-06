/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeScheduler } from './fakeScheduler.js';

suite('GitHub HTTP rate limits', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = { host: 'github.example.test', accountId: '1' };
	const url = 'https://github.example.test/repos/owner/repo';
	const signal = () => new AbortController().signal;
	const healthyQuota = { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '4600' };
	const spentQuota = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1120' };
	const cases: {
		readonly name: string;
		readonly headers?: Readonly<Record<string, string>>;
		readonly status?: number;
		readonly message?: string;
		readonly limit?: 'primary' | 'secondary';
		readonly delay?: number;
	}[] = [
			{ name: 'generic denial without quota headers' },
			{ name: 'generic denial with healthy quota', headers: healthyQuota },
			{ name: 'generic denial with only a reset', headers: { 'x-ratelimit-reset': '4600' } },
			{ name: 'generic denial with invalid quota', headers: { 'x-ratelimit-remaining': 'invalid', 'x-ratelimit-reset': 'invalid' } },
			{ name: 'generic denial with a false secondary hint', headers: { ...healthyQuota, 'x-github-secondary-rate-limited': 'false' } },
			{ name: 'healthy quota overrides primary-sounding text', message: 'API rate limit exceeded for user ID 1.', headers: healthyQuota },
			...[' ', '0x0', '0.0', '0e0', '-0', '-1', '9007199254740992'].map(remaining => ({
				name: `generic denial with malformed remaining ${JSON.stringify(remaining)}`,
				headers: { 'x-ratelimit-remaining': remaining, 'x-ratelimit-reset': '4600' },
			})),
			...[' ', '-1', '0.5', '0x10', '1e3', '9007199254740992', '1970-01-01T00:20:00Z'].map(retryAfter => ({
				name: `generic denial with malformed Retry-After ${JSON.stringify(retryAfter)}`,
				headers: { ...healthyQuota, 'retry-after': retryAfter },
			})),
			{ name: 'primary 403 without rate-limit text', message: 'Forbidden', headers: spentQuota, limit: 'primary', delay: 120_000 },
			{ name: 'primary 403 without a reset', headers: { 'x-ratelimit-remaining': '0' }, limit: 'primary', delay: 60_000 },
			{ name: 'primary 403 with an expired reset', headers: { ...spentQuota, 'x-ratelimit-reset': '999' }, limit: 'primary', delay: 60_000 },
			{ name: 'primary 403 with a malformed reset', headers: { ...spentQuota, 'x-ratelimit-reset': '0x10000' }, limit: 'primary', delay: 60_000 },
			{ name: 'primary 403 with malformed Retry-After and a valid reset', headers: { ...spentQuota, 'retry-after': '-1' }, limit: 'primary', delay: 120_000 },
			{ name: 'explicit primary message without quota headers', message: 'API rate limit exceeded for user ID 1.', limit: 'primary', delay: 60_000 },
			{ name: '403 with Retry-After seconds', headers: { ...healthyQuota, 'retry-after': '5' }, limit: 'primary', delay: 5_000 },
			{ name: '403 with Retry-After date', headers: { ...healthyQuota, 'retry-after': new Date(1_008_000).toUTCString() }, limit: 'primary', delay: 8_000 },
			{ name: '403 with zero Retry-After', headers: { ...healthyQuota, 'retry-after': '0' }, limit: 'primary', delay: 60_000 },
			{ name: 'Retry-After takes precedence over the primary reset', headers: { ...spentQuota, 'retry-after': '5' }, limit: 'primary', delay: 5_000 },
			{ name: 'unhinted HTTP 429', status: 429, message: 'Too many requests', limit: 'primary', delay: 60_000 },
			{ name: 'HTTP 429 with Retry-After', status: 429, headers: { ...healthyQuota, 'retry-after': '5' }, limit: 'primary', delay: 5_000 },
			{ name: 'explicit secondary message with healthy primary quota', message: 'You have exceeded a secondary rate limit.', headers: healthyQuota, limit: 'secondary', delay: 60_000 },
			{ name: 'explicit secondary header', headers: { ...healthyQuota, 'x-github-secondary-rate-limited': 'true' }, limit: 'secondary', delay: 60_000 },
			{ name: 'legacy secondary message', message: 'You have triggered an abuse detection mechanism.', headers: healthyQuota, limit: 'secondary', delay: 60_000 },
			{ name: 'secondary limit with Retry-After', message: 'You have exceeded a secondary rate limit.', headers: { ...healthyQuota, 'retry-after': '120' }, limit: 'secondary', delay: 120_000 },
			{ name: 'secondary limit with spent primary quota', message: 'You have exceeded a secondary rate limit.', headers: spentQuota, limit: 'secondary', delay: 120_000 },
			{ name: 'HTTP 429 with a secondary header', status: 429, headers: { 'x-github-secondary-rate-limited': 'true' }, limit: 'secondary', delay: 60_000 },
		];

	for (const kind of ['REST read', 'REST mutation', 'GraphQL read', 'GraphQL mutation', 'download'] as const) {
		for (const entry of cases) {
			test(`${kind}: ${entry.name}`, async () => {
				const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
				let calls = 0;
				const transport = store.add(new GitHubTransport(async () => {
					calls++;
					return Response.json({ message: entry.message ?? 'Rate Limit Exceeded' }, { status: entry.status ?? 403, headers: entry.headers });
				}, scheduler));
				const request = kind === 'download'
					? transport.download(account, 'token', { url, timeout: 1_000, maximumBytes: 1 }, signal())
					: kind === 'REST read' || kind === 'REST mutation'
						? transport.rest(account, 'token', { method: kind === 'REST read' ? 'GET' : 'POST', url }, signal())
						: transport.graphql(account, 'token', 'https://github.example.test/graphql',
							kind === 'GraphQL read' ? 'query { viewer { login } }' : 'mutation Change { change { id } }', {}, signal());
				await assert.rejects(request, { kind: entry.limit ? 'rateLimit' : 'authorization', statusCode: entry.status ?? 403 });
				const resource = kind.startsWith('GraphQL') ? 'graphql' : 'core';
				assert.deepStrictEqual({
					calls,
					delay: transport.rateLimits.getDelay(account, resource),
					otherResource: transport.rateLimits.getDelay(account, resource === 'core' ? 'graphql' : 'core'),
					otherAccount: transport.rateLimits.getDelay({ ...account, accountId: '2' }, resource),
					otherHost: transport.rateLimits.getDelay({ ...account, host: 'other.example.test' }, resource),
					timers: scheduler.pendingCount,
				}, {
					calls: 1, delay: entry.delay ?? 0, otherResource: entry.limit === 'secondary' ? entry.delay : 0,
					otherAccount: 0, otherHost: 0, timers: 0,
				});
			});
		}
	}

	const exhaustedResponseCases: {
		readonly name: string;
		readonly headers: Readonly<Record<string, string>>;
		readonly delay: number;
	}[] = [
			{ name: 'extend the cooldown to a later reset', headers: { 'x-ratelimit-reset': '1240' }, delay: 240_000 },
			{ name: 'preserve the cooldown over an earlier reset', headers: { 'x-ratelimit-reset': '1060' }, delay: 120_000 },
			{ name: 'prefer Retry-After over the later reset', headers: { 'x-ratelimit-reset': '1240', 'retry-after': '180' }, delay: 180_000 },
			{ name: 'preserve the cooldown over a shorter Retry-After', headers: { 'x-ratelimit-reset': '1240', 'retry-after': '60' }, delay: 120_000 },
		];
	for (const entry of exhaustedResponseCases) {
		test(`successive exhausted REST responses ${entry.name}`, async () => {
			const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const dispatchTimes: number[] = [];
			const transport = store.add(new GitHubTransport(async () => {
				dispatchTimes.push(scheduler.now());
				if (dispatchTimes.length === 1) {
					await started.complete();
					return response.p;
				}
				return Response.json({}, { headers: healthyQuota });
			}, scheduler));
			const inFlight = transport.rest(account, 'token', { method: 'GET', url }, signal());
			await started.p;
			transport.rateLimits.updateFromResponse(account, new Response(null, { headers: spentQuota }));
			const initialDelay = transport.rateLimits.getDelay(account, 'core');
			await response.complete(Response.json({}, { headers: { ...spentQuota, ...entry.headers } }));
			await inFlight;
			const updatedDelay = transport.rateLimits.getDelay(account, 'core');
			const pending = transport.rest(account, 'token', { method: 'GET', url: `${url}/after` }, signal());
			scheduler.advanceBy(entry.delay - 1);
			await Promise.resolve();
			const beforeExpiry = dispatchTimes.length;
			scheduler.advanceBy(1);
			await pending;
			assert.deepStrictEqual({
				initialDelay, updatedDelay, beforeExpiry, dispatchTimes,
				expired: transport.rateLimits.getDelay(account, 'core'), timers: scheduler.pendingCount,
			}, {
				initialDelay: 120_000, updatedDelay: entry.delay, beforeExpiry: 1,
				dispatchTimes: [1_000_000, 1_000_000 + entry.delay], expired: 0, timers: 0,
			});
		});
	}

	for (const source of ['successful exhausted quota', 'primary refusal', 'secondary refusal'] as const) {
		test(`a generic 403 with healthy quota preserves a concurrent ${source} cooldown`, async () => {
			const scheduler = store.add(new FakeScheduler({ now: 1_000_000 }));
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const transport = store.add(new GitHubTransport(async () => {
				await started.complete();
				return response.p;
			}, scheduler));
			const rejected = assert.rejects(transport.rest(account, 'token', { method: 'GET', url }, signal()), { kind: 'authorization' });
			await started.p;
			transport.rateLimits.updateFromResponse(account, new Response(null, {
				status: source === 'successful exhausted quota' ? 200 : 403,
				headers: source === 'secondary refusal' ? { 'retry-after': '120' } : spentQuota,
			}), source === 'secondary refusal' ? 'You have exceeded a secondary rate limit.' : undefined);
			const before = transport.rateLimits.getDelay(account, 'core');
			await response.complete(Response.json({ message: 'Rate Limit Exceeded' }, { status: 403, headers: healthyQuota }));
			await rejected;
			const after = {
				core: transport.rateLimits.getDelay(account, 'core'),
				graphql: transport.rateLimits.getDelay(account, 'graphql'),
			};
			scheduler.advanceBy(119_999);
			const beforeExpiry = transport.rateLimits.getDelay(account, 'core');
			scheduler.advanceBy(1);
			assert.deepStrictEqual({
				before, after, beforeExpiry, expired: transport.rateLimits.getDelay(account, 'core'), timers: scheduler.pendingCount,
			}, {
				before: 120_000, after: { core: 120_000, graphql: source === 'secondary refusal' ? 120_000 : 0 },
				beforeExpiry: 1, expired: 0, timers: 0,
			});
		});
	}
});
