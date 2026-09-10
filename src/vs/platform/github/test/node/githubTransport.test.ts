/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubAccountHandle } from '../../common/githubTypes.js';
import { GitHubRequestQueue } from '../../common/githubRequestQueue.js';
import { GitHubRequestError, GitHubTransport } from '../../common/githubTransport.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubGraphQLResponse, gitHubGraphQLStep, gitHubJsonResponse, gitHubNotModifiedResponse, gitHubRateLimitResponse, gitHubRawResponse, gitHubRedirectResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

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

	test('uses fetch cache mode without a Cache-Control request header', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/issues/1', response: gitHubJsonResponse({ value: 1 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/issues/1', response: gitHubJsonResponse({ value: 2 }) }),
			);
			const fetchOptions: RequestInit[] = [];
			const transport = disposables.add(new GitHubTransport(async (input, init) => {
				fetchOptions.push(init ?? {});
				return nodeFetch(input, init);
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
					{ cache: 'no-store', cacheControl: undefined },
					{ cache: 'no-store', cacheControl: undefined },
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
			const transport = disposables.add(new GitHubTransport(nodeFetch, new FakeGitHubScheduler({ now: 123 })));
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

	test('adopts a reissued validator when revalidating with a 304', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls', response: gitHubJsonResponse([{ number: 1 }], { etag: '"old"', link: '</old>; rel="next"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					assert: request => assert.strictEqual(request.headers['if-none-match'], '"old"'),
					// GitHub may answer a conditional request with a reissued validator.
					response: gitHubNotModifiedResponse({ etag: 'W/"new"', link: '</new>; rel="next"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pulls',
					// The reissued validator must be stored, otherwise the stale one is resent forever.
					assert: request => assert.strictEqual(request.headers['if-none-match'], 'W/"new"'),
					response: gitHubNotModifiedResponse({ etag: 'W/"new"' }),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const request = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/pulls` };

			await transport.rest(accountA, 'token-a', request, signal());
			const revalidated = await transport.rest<readonly { number: number }[]>(accountA, 'token-a', request, signal());
			const again = await transport.rest<readonly { number: number }[]>(accountA, 'token-a', request, signal());

			assert.deepStrictEqual({
				data: revalidated.data,
				statusCode: revalidated.statusCode,
				etag: revalidated.etag,
				link: revalidated.link,
				againData: again.data,
			}, {
				data: [{ number: 1 }],
				statusCode: 304,
				etag: 'W/"new"',
				link: '</new>; rel="next"',
				againData: [{ number: 1 }],
			});
			server.assertSatisfied();
		});
	});

	test('rejects a 304 that answers no cached representation', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/o/r/pulls',
				response: gitHubNotModifiedResponse({ etag: '"phantom"' }),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));

			await assert.rejects(
				() => transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/pulls` }, signal()),
				/GitHub returned 304 without a cached representation/,
			);
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
			const transport = disposables.add(new GitHubTransport(nodeFetch));
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
			const transport = disposables.add(new GitHubTransport(nodeFetch));

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
				authorizationIsExpected: server.requests[0].headers.authorization === ['Bearer', 'token-a'].join(' '),
				requestHeaders: {
					cacheControl: server.requests[0].headers['cache-control'],
					authorization: server.requests[0].headers.authorization === undefined ? undefined : '*'.repeat(6),
				},
			}, {
				data: { repository: { id: 'R1' }, rateLimit: { limit: 5000, remaining: 7, used: 3, resetAt: '2030-01-01T00:00:00.000Z' } },
				errors: [{ message: 'field denied', type: 'FORBIDDEN', path: ['repository', 'viewerPermission'] }],
				rateLimit: { limit: 5000, remaining: 7, used: 3, resetAt: Date.parse('2030-01-01T00:00:00.000Z') },
				authorizationIsExpected: true,
				requestHeaders: { cacheControl: undefined, authorization: '******' },
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
			const transport = disposables.add(new GitHubTransport(nodeFetch, new FakeGitHubScheduler({ now: 123 })));
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

	test('purges every account cache entry and aborts in-flight work on invalidation', async () => {
		await withServer(async server => {
			const requestSeen = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/one', response: gitHubJsonResponse({ value: 1 }, { etag: '"one"' }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/two', response: gitHubJsonResponse({ value: 2 }, { etag: '"two"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/pending',
					assert: async () => requestSeen.complete(),
					waitFor: release.p,
					response: gitHubJsonResponse({ value: 3 }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/one',
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse({ value: 10 }, { etag: '"ten"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/two',
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse({ value: 20 }, { etag: '"twenty"' }),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const one = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/one` };
			const two = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/two` };

			await transport.rest(accountA, 'token-a', one, signal());
			await transport.rest(accountA, 'token-a', two, signal());
			const pending = transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/pending` }, signal());
			await requestSeen.p;

			transport.invalidateAccount(accountA, new Error('credential invalidated'));
			await assert.rejects(() => pending, /credential invalidated/);
			await release.complete();

			const refreshedOne = await transport.rest<{ value: number }>(accountA, 'token-a', one, signal());
			const refreshedTwo = await transport.rest<{ value: number }>(accountA, 'token-a', two, signal());

			assert.deepStrictEqual({
				one: refreshedOne.data,
				two: refreshedTwo.data,
				requestCount: server.requests.length,
			}, {
				one: { value: 10 },
				two: { value: 20 },
				requestCount: 5,
			});
			server.assertSatisfied();
		});
	});

	test('starts fresh REST and GraphQL requests after every coalesced waiter cancels', async () => {
		await withServer(async server => {
			const restSeen = new DeferredPromise<void>();
			const releaseRest = new DeferredPromise<void>();
			const graphQLSeen = new DeferredPromise<void>();
			const releaseGraphQL = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/shared',
					assert: async () => restSeen.complete(),
					waitFor: releaseRest.p,
					response: gitHubJsonResponse({ value: 1 }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/shared', response: gitHubJsonResponse({ value: 2 }) }),
				gitHubGraphQLStep({
					queryIncludes: 'repository',
					assert: async () => graphQLSeen.complete(),
					waitFor: releaseGraphQL.p,
					response: gitHubGraphQLResponse({ repository: { id: 'old' } }),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'repository',
					response: gitHubGraphQLResponse({ repository: { id: 'new' } }),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const restController = new AbortController();
			const restRequest = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/shared`, etag: false };
			const firstRest = transport.rest(accountA, 'token-a', restRequest, restController.signal);
			await restSeen.p;
			restController.abort(new Error('cancel REST waiter'));
			await assert.rejects(() => firstRest, /cancel REST waiter/);
			const secondRestPromise = transport.rest<{ value: number }>(accountA, 'token-a', restRequest, signal());
			await releaseRest.complete();
			const secondRest = await secondRestPromise;

			const graphQLController = new AbortController();
			const query = 'query { repository(owner: "o", name: "r") { id } }';
			const firstGraphQL = transport.graphql(accountA, 'token-a', server.graphQlUrl, query, {}, graphQLController.signal);
			await graphQLSeen.p;
			graphQLController.abort(new Error('cancel GraphQL waiter'));
			await assert.rejects(() => firstGraphQL, /cancel GraphQL waiter/);
			const secondGraphQLPromise = transport.graphql<{ repository: { id: string } }>(accountA, 'token-a', server.graphQlUrl, query, {}, signal());
			await releaseGraphQL.complete();
			const secondGraphQL = await secondGraphQLPromise;

			assert.deepStrictEqual({
				rest: secondRest.data,
				graphQL: secondGraphQL.data,
				requestCount: server.requests.length,
			}, {
				rest: { value: 2 },
				graphQL: { repository: { id: 'new' } },
				requestCount: 4,
			});
			server.assertSatisfied();
		});
	});

	test('does not coalesce an unconditional GET with a conditional revalidation', async () => {
		await withServer(async server => {
			const conditionalSeen = new DeferredPromise<void>();
			const releaseConditional = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/state', response: gitHubJsonResponse({ value: 1 }, { etag: '"old"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/state',
					assert: async request => {
						assert.strictEqual(request.headers['if-none-match'], '"old"');
						await conditionalSeen.complete();
					},
					waitFor: releaseConditional.p,
					response: gitHubNotModifiedResponse(),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/state',
					assert: request => assert.strictEqual(request.headers['if-none-match'], undefined),
					response: gitHubJsonResponse({ value: 2 }, { etag: '"new"' }),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const request = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r/state` };
			await transport.rest(accountA, 'token-a', request, signal());

			const conditional = transport.rest<{ value: number }>(accountA, 'token-a', request, signal());
			await conditionalSeen.p;
			const unconditional = transport.rest<{ value: number }>(accountA, 'token-a', { ...request, unconditional: true }, signal());
			await releaseConditional.complete();

			assert.deepStrictEqual({
				conditional: (await conditional).data,
				unconditional: (await unconditional).data,
				requestCount: server.requests.length,
			}, {
				conditional: { value: 1 },
				unconditional: { value: 2 },
				requestCount: 3,
			});
			server.assertSatisfied();
		});
	});

	test('shares rate-limit backoff across requests for an account', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
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

	test('parks the account when a secondary rate limit gives no usable retry hint', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/unhinted',
					response: gitHubRateLimitResponse({ status: 403, resource: 'core' }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterUnhinted', response: gitHubJsonResponse({ ok: true }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/stale',
					// A secondary limit often reports the primary quota window,
					// which can already have elapsed.
					response: gitHubRateLimitResponse({ status: 403, resource: 'core', resetAt: 1_000 }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterStale', response: gitHubJsonResponse({ ok: true }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/primaryWindow',
					// A secondary limit reports the primary quota window, which
					// is far in the future while that quota is still unspent.
					response: gitHubRateLimitResponse({ status: 403, resource: 'core', resetAt: 4_600_000, remaining: 4_000 }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterPrimaryWindow', response: gitHubJsonResponse({ ok: true }) }),
			);

			const observed: number[] = [];
			for (const [limited, after] of [['unhinted', 'afterUnhinted'], ['stale', 'afterStale'], ['primaryWindow', 'afterPrimaryWindow']]) {
				await assert.rejects(
					() => transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/${limited}` }, signal()),
					error => error instanceof GitHubRequestError && error.kind === 'rateLimit',
				);
				const startedAt = scheduler.now();
				const pending = transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/${after}` }, signal());
				await Promise.resolve();
				scheduler.flushAll();
				await pending;
				observed.push(scheduler.now() - startedAt);
			}

			assert.deepStrictEqual(observed, [60_000, 60_000, 60_000]);
			server.assertSatisfied();
		});
	});

	test('parks a primary rate limit that GitHub reports as 403 rather than 429', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/spentNoReset',
					// Primary exhaustion carries no `retry-after`, and a proxy can
					// strip the reset, leaving nothing to wait on but the floor.
					response: gitHubRateLimitResponse({ status: 403, resource: 'core', remaining: 0, message: 'API rate limit exceeded for user ID 1.' }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterSpentNoReset', response: gitHubJsonResponse({ ok: true }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/spentWithReset',
					response: gitHubRateLimitResponse({ status: 403, resource: 'core', remaining: 0, resetAt: 1_180_000, message: 'API rate limit exceeded for user ID 1.' }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterSpentWithReset', response: gitHubJsonResponse({ ok: true }) }),
			);

			const observed: number[] = [];
			for (const [limited, after] of [['spentNoReset', 'afterSpentNoReset'], ['spentWithReset', 'afterSpentWithReset']]) {
				await assert.rejects(
					() => transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/${limited}` }, signal()),
					error => error instanceof GitHubRequestError && error.kind === 'rateLimit',
				);
				const startedAt = scheduler.now();
				const pending = transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/${after}` }, signal());
				await Promise.resolve();
				scheduler.flushAll();
				await pending;
				observed.push(scheduler.now() - startedAt);
			}

			// The floor when nothing usable was given, then the remainder of the
			// absolute reset window (1_180_000) from where the first park left off.
			assert.deepStrictEqual(observed, [60_000, 120_000]);
			server.assertSatisfied();
		});
	});

	test('does not park an authorization failure that merely shares the 403 status', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/forbidden',
					response: gitHubJsonResponse({ message: 'Resource not accessible by integration' }, { status: 403 }),
				}),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/afterForbidden', response: gitHubJsonResponse({ ok: true }) }),
			);

			await assert.rejects(
				() => transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/forbidden` }, signal()),
				error => error instanceof GitHubRequestError && error.kind === 'authorization',
			);
			const startedAt = scheduler.now();
			await transport.rest(accountA, 'token-a', { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/afterForbidden` }, signal());

			// A credential problem must surface at once rather than being parked.
			assert.deepStrictEqual({ waited: scheduler.now() - startedAt, pending: scheduler.pendingCount }, { waited: 0, pending: 0 });
			server.assertSatisfied();
		});
	});

	test('GraphQL RATE_LIMITED errors establish shared account backoff', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
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

	test('does not apply GraphQL primary-rate-limit state to the REST core bucket', async () => {
		await withServer(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 1_000 });
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
			transport.rateLimits.updateFromGraphQL(accountA, {
				remaining: 0,
				resetAt: new Date(61_000).toISOString(),
			});
			const graphQLController = new AbortController();
			const blockedGraphQL = transport.graphql(
				accountA,
				'token-a',
				server.graphQlUrl,
				'query { viewer { id } }',
				{},
				graphQLController.signal,
			);
			await Promise.resolve();
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/o/r/core',
				response: gitHubJsonResponse({ ok: true }),
			}));

			const response = await transport.rest<{ ok: boolean }>(
				accountA,
				'token-a',
				{ method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/core` },
				signal(),
			);
			graphQLController.abort(new Error('stop blocked GraphQL request'));
			await assert.rejects(() => blockedGraphQL, /stop blocked GraphQL request/);

			assert.deepStrictEqual({
				data: response.data,
				pendingDelays: scheduler.pendingCount,
			}, {
				data: { ok: true },
				pendingDelays: 0,
			});
			server.assertSatisfied();
		});
	});

	test('bounds downloads and rejects unsafe redirect targets', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/log',
					response: gitHubRawResponse('abcdef'),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/o/r/unsafe',
					response: gitHubRedirectResponse('http://example.invalid/signed-log'),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));

			const bounded = await transport.download(accountA, 'token-a', {
				url: `${server.apiBaseUrl}/repos/o/r/log`,
				maximumBytes: 3,
				timeout: 1_000,
			}, signal());
			await assert.rejects(
				() => transport.download(accountA, 'token-a', {
					url: `${server.apiBaseUrl}/repos/o/r/unsafe`,
					maximumBytes: 100,
					timeout: 1_000,
				}, signal()),
				error => error instanceof GitHubRequestError && error.kind === 'authorization',
			);

			assert.deepStrictEqual(bounded, {
				text: 'abc',
				truncated: true,
				sourceUrl: `${server.apiBaseUrl}/repos/o/r/log`,
				contentType: 'application/octet-stream',
			});
			server.assertSatisfied();
		});
	});

	test('reports the failing download hop and nested network codes without signed URLs or credentials', async () => {
		const requests: { host: string; authorization: string | null }[] = [];
		const transport = disposables.add(new GitHubTransport(async (input, init) => {
			requests.push({ host: new URL(String(input)).host, authorization: new Headers(init?.headers).get('Authorization') });
			if (requests.length === 1) {
				return new Response(null, { status: 302, headers: { location: 'https://storage.example.test/private-log?sig=secret-signature' } });
			}
			throw new TypeError('fetch failed for secret-signature', {
				cause: new AggregateError([
					Object.assign(new Error('private-address'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
					Object.assign(new Error('secret-token'), { code: 'ETIMEDOUT' }),
					{ code: 'https://storage.example.test/private-log?sig=secret-signature' },
				]),
			});
		}));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/repos/o/r/log',
			maximumBytes: 100,
			timeout: 1_000,
		}, signal()), {
			name: 'GitHubRequestError',
			kind: 'network',
			message: 'GitHub download network request failed (host: storage.example.test, redirect: 1, codes: UND_ERR_CONNECT_TIMEOUT, ETIMEDOUT)',
		});
		assert.deepStrictEqual(requests, [
			{ host: 'api.example.test', authorization: 'Bearer token-a' },
			{ host: 'storage.example.test', authorization: null },
		]);
	});

	test('reports initial download failures with a bounded cyclic cause chain', async () => {
		const error = Object.assign(new Error('private details'), { code: 'ENOTFOUND' });
		error.cause = error;
		const transport = disposables.add(new GitHubTransport(async () => { throw error; }));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/repos/o/r/log',
			maximumBytes: 100,
			timeout: 1_000,
		}, signal()), {
			name: 'GitHubRequestError',
			kind: 'network',
			message: 'GitHub download network request failed (host: api.example.test, redirect: 0, codes: ENOTFOUND)',
		});
	});

	test('reports unknown download network codes without exposing thrown content', async () => {
		const transport = disposables.add(new GitHubTransport(async () => { throw new Error('secret-token'); }));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/repos/o/r/log',
			maximumBytes: 100,
			timeout: 1_000,
		}, signal()), {
			name: 'GitHubRequestError',
			kind: 'network',
			message: 'GitHub download network request failed (host: api.example.test, redirect: 0, codes: unknown)',
		});
	});

	test('preserves download cancellation instead of reporting a network failure', async () => {
		const controller = new AbortController();
		const reason = new Error('cancelled download');
		const transport = disposables.add(new GitHubTransport(async () => {
			controller.abort(reason);
			throw new TypeError('fetch failed');
		}));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/repos/o/r/log',
			maximumBytes: 100,
			timeout: 1_000,
		}, controller.signal), error => error === reason);
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
