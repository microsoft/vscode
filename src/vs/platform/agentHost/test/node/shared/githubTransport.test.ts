/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GitHubAccountHandle } from '../../../common/githubService.js';
import { GitHubRequestQueue } from '../../../node/shared/githubRequestQueue.js';
import { GitHubRequestError, GitHubTransport } from '../../../node/shared/githubTransport.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';
import { gitHubGraphQLResponse, gitHubGraphQLStep, gitHubJsonResponse, gitHubNotModifiedResponse, gitHubRateLimitResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

const accountA: GitHubAccountHandle = { host: 'github.example.test', accountId: '1' };
const accountB: GitHubAccountHandle = { host: 'github.example.test', accountId: '2' };
const accountOnOtherHost: GitHubAccountHandle = { host: 'other.example.test', accountId: '1' };

function signal(): AbortSignal {
	return new AbortController().signal;
}

suite('GitHubTransport', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('always reaches the injected fetch with explicit no-store behavior', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/issues/1', response: gitHubJsonResponse({ value: 1 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/issues/1', response: gitHubJsonResponse({ value: 2 }) }),
			);
			const fetchOptions: RequestInit[] = [];
			const transport = disposables.add(new GitHubTransport(async (input, init) => {
				fetchOptions.push(init ?? {});
				return fetch(input, init);
			}));
			const request = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/issues/1`, etag: false };

			const first = await transport.rest<{ value: number }>(accountA, 'token-a', request, signal());
			const second = await transport.rest<{ value: number }>(accountA, 'token-a', request, signal());

			assert.deepStrictEqual({
				values: [first.data?.value, second.data?.value],
				serverRequests: server.requests.length,
				fetchOptions: fetchOptions.map(options => ({
					cache: options.cache,
					cacheControl: (options.headers as Record<string, string>)['Cache-Control'],
				})),
			}, {
				values: [1, 2],
				serverRequests: 2,
				fetchOptions: [
					{ cache: 'no-store', cacheControl: 'no-store' },
					{ cache: 'no-store', cacheControl: 'no-store' },
				],
			});
			server.assertSatisfied();
		});
	});

	test('reuses only the exact account-scoped body after authoritative 304', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls', query: { page: 1 }, response: gitHubJsonResponse([{ number: 1 }], { etag: '"a"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					query: { page: 1 },
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse([{ number: 2 }], { etag: '"b"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					query: { page: 1 },
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse([{ number: 30 }], { etag: '"other-host"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					query: { page: 1 },
					assert: request => assert.strictEqual(request.headers['if-none-match'], '"a"'),
					response: gitHubNotModifiedResponse(),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					query: { page: 2 },
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse([{ number: 3 }], { etag: '"page-2"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					query: { page: 1 },
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse([{ number: 4 }], { etag: '"media"' }),
				}),
			);
			const transport = disposables.add(new GitHubTransport(fetch, new FakeGitHubScheduler({ now: 123 })));
			const pageOne = `${server.apiBaseUrl}/repos/o/r/pulls?page=1`;

			await transport.rest(accountA, 'token-a', { method: 'GET', url: pageOne }, signal());
			await transport.rest(accountB, 'token-b', { method: 'GET', url: pageOne }, signal());
			await transport.rest(accountOnOtherHost, 'token-c', { method: 'GET', url: pageOne }, signal());
			const revalidated = await transport.rest<readonly { number: number }[]>(accountA, 'token-a', { method: 'GET', url: pageOne }, signal());
			await transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/pulls?page=2` }, signal());
			await transport.rest(accountA, 'token-a', { method: 'GET', url: pageOne, accept: 'application/vnd.github.raw+json' }, signal());

			assert.deepStrictEqual(revalidated.data, [{ number: 1 }]);
			server.assertSatisfied();
		});
	});

	test('removes an old validator when a 200 response has no ETag', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls', response: gitHubJsonResponse([{ number: 1 }], { etag: '"old"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					assert: request => assert.strictEqual(request.headers['if-none-match'], '"old"'),
					response: gitHubJsonResponse([{ number: 2 }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse([{ number: 3 }]),
				}),
			);
			const transport = disposables.add(new GitHubTransport(fetch));
			const request = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/pulls` };

			await transport.rest(accountA, 'token-a', request, signal());
			await transport.rest(accountA, 'token-a', request, signal());
			await transport.rest(accountA, 'token-a', request, signal());

			server.assertSatisfied();
		});
	});

	test('preserves GraphQL partial data and typed errors', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'repository',
				response: gitHubGraphQLResponse(
					{ repository: { id: 'R1' }, rateLimit: { limit: 5000, remaining: 7, used: 3, resetAt: '2030-01-01T00:00:00.000Z' } },
					[{ message: 'field denied', type: 'FORBIDDEN', path: ['repository', 'viewerPermission'] }],
				),
			}));
			const transport = disposables.add(new GitHubTransport(fetch));

			const response = await transport.graphql<{ repository: { id: string } }>(
				accountA,
				'token-a',
				server.graphQlUrl,
				'query { repository(owner: "o", name: "r") { id } }',
				{},
				signal(),
			);

			assert.deepStrictEqual({
				data: response.data,
				errors: response.errors,
				rateLimit: transport.rateLimits.getState(accountA, 'graphql'),
				requestHeaders: {
					cacheControl: server.requests[0].headers['cache-control'],
					authorization: server.requests[0].headers.authorization,
				},
			}, {
				data: { repository: { id: 'R1' }, rateLimit: { limit: 5000, remaining: 7, used: 3, resetAt: '2030-01-01T00:00:00.000Z' } },
				errors: [{ message: 'field denied', type: 'FORBIDDEN', path: ['repository', 'viewerPermission'] }],
				rateLimit: { limit: 5000, remaining: 7, used: 3, resetAt: Date.parse('2030-01-01T00:00:00.000Z') },
				requestHeaders: { cacheControl: 'no-store', authorization: '******' },
			});
			server.assertSatisfied();
		});
	});

	test('coalesces identical GraphQL reads while cancellation detaches one waiter', async () => {
		await withServer(async server => {
			const requestSeen = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'repository',
				assert: async () => requestSeen.complete(),
				waitFor: release.p,
				response: gitHubGraphQLResponse({ repository: { id: 'R1' } }),
			}));
			const transport = disposables.add(new GitHubTransport(fetch, new FakeGitHubScheduler({ now: 123 })));
			const cancelled = new AbortController();
			const query = 'query Repo($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }';
			const first = transport.graphql(accountA, 'token-a', server.graphQlUrl, query, { owner: 'o', name: 'r' }, cancelled.signal);
			const second = transport.graphql<{ repository: { id: string } }>(accountA, 'token-a', server.graphQlUrl, query, { name: 'r', owner: 'o' }, signal());
			await requestSeen.p;

			cancelled.abort(new Error('cancel first'));
			await assert.rejects(() => first, /cancel first/);
			await release.complete();

			assert.deepStrictEqual({
				second: await second,
				requestCount: server.requests.length,
			}, {
				second: { data: { repository: { id: 'R1' } }, errors: [], observedAt: 123 },
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});

	test('shares rate-limit backoff across requests for an account', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000 });
			const transport = disposables.add(new GitHubTransport(fetch, scheduler));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/limited',
					response: gitHubRateLimitResponse({ status: 429, resource: 'core', retryAfterSeconds: 5 }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/after', response: gitHubJsonResponse({ ok: true }) }),
			);

			await assert.rejects(
				() => transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/limited` }, signal()),
				error => error instanceof GitHubRequestError && error.kind === 'rateLimit',
			);
			let settled = false;
			const after = transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/after` }, signal()).then(() => settled = true);
			await Promise.resolve();

			scheduler.advanceBy(4_999);
			await Promise.resolve();
			assert.strictEqual(settled, false);
			scheduler.advanceBy(1);
			await after;

			assert.strictEqual(server.requests.length, 2);
			server.assertSatisfied();
		});
	});

	test('GraphQL RATE_LIMITED errors establish shared account backoff', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000 });
			const transport = disposables.add(new GitHubTransport(fetch, scheduler));
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'repository',
					response: gitHubGraphQLResponse(undefined, [{ message: 'rate limited', type: 'RATE_LIMITED' }]),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'viewer',
					response: gitHubGraphQLResponse({ viewer: { id: 'U1' } }),
				}),
			);

			const limited = await transport.graphql(accountA, 'token-a', server.graphQlUrl, 'query { repository(owner: "o", name: "r") { id } }', {}, signal());
			let settled = false;
			const after = transport.graphql(accountA, 'token-a', server.graphQlUrl, 'query { viewer { id } }', {}, signal()).then(() => settled = true);
			await Promise.resolve();

			scheduler.advanceBy(59_999);
			await Promise.resolve();
			assert.strictEqual(settled, false);
			scheduler.advanceBy(1);
			await after;

			assert.deepStrictEqual({
				errors: limited.errors,
				requestCount: server.requests.length,
			}, {
				errors: [{ message: 'rate limited', type: 'RATE_LIMITED' }],
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('runs higher-priority queued work before older background work', async () => {
		const queue = disposables.add(new GitHubRequestQueue());
		const firstRelease = new DeferredPromise<void>();
		const order: string[] = [];
		const first = queue.enqueue(accountA, 'background', signal(), async () => {
			order.push('first');
			await firstRelease.p;
		});
		const background = queue.enqueue(accountA, 'background', signal(), async () => {
			order.push('background');
		});
		const interactive = queue.enqueue(accountA, 'interactive', signal(), async () => {
			order.push('interactive');
		});

		await firstRelease.complete();
		await Promise.all([first, background, interactive]);

		assert.deepStrictEqual(order, ['first', 'interactive', 'background']);
	});
});
