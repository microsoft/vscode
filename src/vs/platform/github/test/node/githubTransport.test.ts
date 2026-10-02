/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GitHubAccountHandle, GitHubGraphQLError } from '../../common/githubTypes.js';
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
				scheduler.advanceBy(60_000);
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
				scheduler.advanceBy(transport.rateLimits.getDelay(accountA, 'core'));
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

	const primaryErrors = [{ type: 'RATE_LIMIT', code: 'graphql_rate_limit', message: 'API rate limit already exceeded for user ID 1.' }];
	const resourceErrors = [{ type: 'RATE_LIMITED', message: 'Too many requests', path: ['resolveReviewThread'] }];
	const graphQLHeaders = {
		'x-ratelimit-resource': 'graphql',
		'x-ratelimit-limit': '5000',
		'x-ratelimit-remaining': '4999',
		'x-ratelimit-used': '1',
		'x-ratelimit-reset': '4600',
	};
	const graphQLThrottlingCases: {
		readonly name: string;
		readonly errors: readonly GitHubGraphQLError[];
		readonly headers: Readonly<Record<string, string>>;
		readonly data?: object;
		readonly mutation?: boolean;
		readonly remaining?: number;
		readonly delay: number;
	}[] = [
			{
				name: 'resource-local RATE_LIMITED with healthy quota',
				errors: resourceErrors, headers: graphQLHeaders,
				data: { resolveReviewThread: null }, mutation: true, remaining: 4999, delay: 0,
			},
			{
				name: 'cost-exceeds-remaining RATE_LIMITED with points left for cheaper queries',
				errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user ID 1.' }],
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '100' }, remaining: 100, delay: 0,
			},
			{
				name: 'unscoped RATE_LIMITED with healthy quota',
				errors: [{ type: 'RATE_LIMITED', message: 'Too many requests' }],
				headers: graphQLHeaders, mutation: true, remaining: 4999, delay: 0,
			},
			{
				name: 'RATE_LIMITED without quota feedback',
				errors: resourceErrors, headers: {}, mutation: true, delay: 0,
			},
			{
				name: 'RATE_LIMITED with malformed quota feedback',
				errors: resourceErrors,
				headers: { 'x-ratelimit-remaining': 'invalid', 'x-ratelimit-reset': 'invalid' },
				data: { rateLimit: { remaining: 'invalid', resetAt: 'invalid' } }, delay: 0,
			},
			{
				name: 'RATE_LIMITED with an empty remaining header',
				errors: resourceErrors, headers: { ...graphQLHeaders, 'x-ratelimit-remaining': ' ' }, delay: 0,
			},
			{
				name: 'RATE_LIMITED with a non-decimal remaining header',
				errors: resourceErrors, headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0x0' }, delay: 0,
			},
			{
				name: 'RATE_LIMITED with malformed data and healthy headers',
				errors: resourceErrors, headers: graphQLHeaders,
				data: { rateLimit: { remaining: 'invalid', resetAt: 'invalid' } }, remaining: 4999, delay: 0,
			},
			{
				name: 'RATE_LIMITED with invalid quota numbers',
				errors: resourceErrors,
				headers: { 'x-ratelimit-remaining': '-1', 'x-ratelimit-reset': 'Infinity' },
				data: { rateLimit: { remaining: -1, limit: 0.5, used: -1 } }, delay: 0,
			},
			{
				name: 'primary RATE_LIMIT with an authoritative reset',
				errors: primaryErrors,
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0' }, remaining: 0, delay: 3_600_000,
			},
			{
				name: 'RATE_LIMITED with independently exhausted quota',
				errors: resourceErrors,
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0' }, remaining: 0, delay: 3_600_000,
			},
			{
				name: 'RATE_LIMITED with exhausted quota but no reset',
				errors: resourceErrors, headers: { 'x-ratelimit-remaining': '0' }, remaining: 0, delay: 60_000,
			},
			{
				name: 'primary RATE_LIMIT without quota feedback',
				errors: primaryErrors, headers: {}, remaining: 0, delay: 60_000,
			},
			{
				name: 'primary RATE_LIMIT with malformed feedback',
				errors: primaryErrors,
				headers: { 'x-ratelimit-remaining': 'invalid', 'x-ratelimit-reset': 'invalid', 'retry-after': 'invalid' },
				data: { rateLimit: { remaining: 'invalid', resetAt: 'invalid' } }, remaining: 0, delay: 60_000,
			},
			{
				name: 'primary RATE_LIMIT with a stale reset',
				errors: primaryErrors, headers: { 'x-ratelimit-reset': '1' }, remaining: 0, delay: 60_000,
			},
			{
				name: 'primary RATE_LIMIT with a reset but no remaining header',
				errors: primaryErrors, headers: { 'x-ratelimit-reset': '4600' }, remaining: 0, delay: 3_600_000,
			},
			{
				name: 'primary RATE_LIMIT with partial quota data',
				errors: primaryErrors, headers: graphQLHeaders,
				data: { rateLimit: { remaining: 0 } }, remaining: 0, delay: 3_600_000,
			},
			{
				name: 'RATE_LIMITED with exhausted quota in partial data',
				errors: resourceErrors, headers: graphQLHeaders,
				data: { rateLimit: { remaining: 0 } }, remaining: 0, delay: 3_600_000,
			},
			{
				name: 'primary RATE_LIMIT with Retry-After before the primary reset',
				errors: primaryErrors,
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0', 'retry-after': '7' }, remaining: 0, delay: 7_000,
			},
			{
				name: 'primary RATE_LIMIT with HTTP-date Retry-After',
				errors: primaryErrors,
				headers: { ...graphQLHeaders, 'retry-after': new Date(1_007_000).toUTCString() }, remaining: 0, delay: 7_000,
			},
			{
				name: 'primary RATE_LIMIT with Retry-After beyond the primary reset',
				errors: primaryErrors,
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1060', 'retry-after': '120' }, remaining: 0, delay: 120_000,
			},
			{
				name: 'resource-local RATE_LIMITED with explicit Retry-After',
				errors: resourceErrors,
				headers: { ...graphQLHeaders, 'retry-after': '7' }, remaining: 4999, delay: 7_000,
			},
		];

	for (const scenario of graphQLThrottlingCases) {
		test(`classifies GraphQL throttling: ${scenario.name}`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler({ now: 1_000_000 }));
			const dispatchTimes: number[] = [];
			const transport = disposables.add(new GitHubTransport(async () => {
				dispatchTimes.push(scheduler.now());
				assert.ok(dispatchTimes.length <= 2, 'A GraphQL failure must not replay the operation');
				return dispatchTimes.length === 1
					? new Response(JSON.stringify({ data: scenario.data, errors: scenario.errors }), { headers: scenario.headers })
					: new Response('{"data":{"viewer":{"id":"U1"}}}');
			}, scheduler, false, undefined, { requestTimeout: 4_000_000 }));
			const query = scenario.mutation
				? 'mutation { resolveReviewThread(input: { threadId: "T1" }) { thread { id } } }'
				: 'query Limited { viewer { id } rateLimit { limit remaining used resetAt } }';

			const limited = await transport.graphql(accountA, 'token-a', 'https://api.example.test/graphql', query, {}, signal());
			const remaining = transport.rateLimits.getState(accountA, 'graphql')?.remaining;
			const delay = transport.rateLimits.getDelay(accountA, 'graphql');
			const after = transport.graphql(accountA, 'token-a', 'https://api.example.test/graphql', 'query After { viewer { id } }', {}, signal());
			scheduler.advanceBy(delay);
			const unrelated = await after;

			assert.deepStrictEqual({
				response: { data: limited.data, errors: limited.errors },
				remaining, delay, dispatchTimes,
				unrelated: unrelated.data,
				pending: scheduler.pendingCount,
			}, {
				response: { data: scenario.data, errors: scenario.errors },
				remaining: scenario.remaining, delay: scenario.delay,
				dispatchTimes: [1_000_000, 1_000_000 + scenario.delay],
				unrelated: { viewer: { id: 'U1' } },
				pending: 0,
			});
		});
	}

	for (const source of ['primary error', 'primary headers', 'secondary error'] as const) {
		for (const locallyThrottled of [false, true]) {
			test(`preserves a GraphQL cooldown from ${source} when an older response reports healthy quota (RATE_LIMITED: ${locallyThrottled})`, async () => {
				const scheduler = disposables.add(new FakeGitHubScheduler({ now: 1_000_000 }));
				const started = new DeferredPromise<void>();
				const delayedResponse = new DeferredPromise<Response>();
				let requests = 0;
				const transport = disposables.add(new GitHubTransport(async () => {
					requests++;
					await started.complete();
					return delayedResponse.p;
				}, scheduler));
				const older = transport.graphql(accountA, 'token-a', 'https://api.example.test/graphql', 'query Older { viewer { id } }', {}, signal());
				await started.p;
				const body = source === 'secondary error' ? '{"message":"You have exceeded a secondary rate limit."}' : JSON.stringify({ errors: primaryErrors });
				transport.rateLimits.updateFromResponse(accountA, new Response(body, {
					status: source === 'secondary error' ? 403 : 200,
					headers: source === 'secondary error'
						? { ...graphQLHeaders, 'retry-after': '5' }
						: { ...graphQLHeaders, 'x-ratelimit-remaining': '0' },
				}), body);
				if (source === 'primary error') {
					transport.rateLimits.markGraphQLRateLimited(accountA);
				}
				const before = transport.rateLimits.getDelay(accountA, 'graphql');
				scheduler.advanceBy(1_000);
				await delayedResponse.complete(new Response(JSON.stringify({
					data: { viewer: { id: 'U1' }, rateLimit: { remaining: 4999, resetAt: new Date(8_200_000).toISOString() } },
					...(locallyThrottled ? { errors: resourceErrors } : {}),
				}), { headers: graphQLHeaders }));
				await older;

				const expected = source === 'secondary error' ? 5_000 : 3_600_000;
				assert.deepStrictEqual({
					before,
					after: transport.rateLimits.getDelay(accountA, 'graphql'),
					core: transport.rateLimits.getDelay(accountA, 'core'),
					requests,
				}, { before: expected, after: expected - 1_000, core: source === 'secondary error' ? 4_000 : 0, requests: 1 });
			});
		}
	}

	for (const type of ['RATE_LIMIT', 'RATE_LIMITED']) {
		test(`GraphQL ${type} with shorter Retry-After does not shorten an existing cooldown`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler({ now: 1_000_000 }));
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const transport = disposables.add(new GitHubTransport(async () => {
				await started.complete();
				return response.p;
			}, scheduler));
			const pending = transport.graphql(accountA, 'token-a', 'https://api.example.test/graphql', 'query { viewer { id } }', {}, signal());
			await started.p;
			transport.rateLimits.updateFromResponse(accountA, new Response(null, {
				headers: { ...graphQLHeaders, 'x-ratelimit-remaining': '0', 'retry-after': '90' },
			}));
			scheduler.advanceBy(1_000);
			await response.complete(new Response(JSON.stringify({ errors: [{ type, message: 'Rate limited' }] }), {
				headers: { ...graphQLHeaders, 'retry-after': '7' },
			}));
			await pending;

			assert.deepStrictEqual({
				delay: transport.rateLimits.getDelay(accountA, 'graphql'),
				remaining: transport.rateLimits.getState(accountA, 'graphql')?.remaining,
			}, { delay: 89_000, remaining: type === 'RATE_LIMIT' ? 0 : 4999 });
		});
	}

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
				bytesRead: 3,
				sourceUrl: `${server.apiBaseUrl}/repos/o/r/log`,
				contentType: 'application/octet-stream',
			});
			server.assertSatisfied();
		});
	});

	test('preserves byte-prefix semantics and distinguishes EOF from a limit probe', async () => {
		const results: { maximumBytes: number; text: string; truncated: boolean; bytesRead?: number; cancelled: boolean; locked: boolean }[] = [];
		for (const [maximumBytes, chunks] of [
			[3, ['abc']],
			[3, ['ab', 'c', 'd']],
			[0, []],
			[0, ['a']],
			[-1, ['a']],
			[3, ['\u00e9', '\u00e9']],
		] as const) {
			let cancelled = false;
			let chunkIndex = 0;
			const stream = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (chunkIndex < chunks.length) {
						controller.enqueue(new TextEncoder().encode(chunks[chunkIndex++]));
					} else {
						controller.close();
					}
				},
				cancel() { cancelled = true; },
			}, { highWaterMark: 0 });
			const transport = disposables.add(new GitHubTransport(async () => new Response(stream)));
			const result = await transport.download(accountA, 'token-a', {
				url: 'https://api.example.test/log', maximumBytes, timeout: 1_000,
			}, signal());
			results.push({ maximumBytes, text: result.text, truncated: result.truncated, bytesRead: result.bytesRead, cancelled, locked: stream.locked });
		}
		assert.deepStrictEqual(results, [
			{ maximumBytes: 3, text: 'abc', truncated: false, bytesRead: 3, cancelled: false, locked: false },
			{ maximumBytes: 3, text: 'abc', truncated: true, bytesRead: 3, cancelled: true, locked: false },
			{ maximumBytes: 0, text: '', truncated: false, bytesRead: 0, cancelled: false, locked: false },
			{ maximumBytes: 0, text: '', truncated: true, bytesRead: 0, cancelled: true, locked: false },
			{ maximumBytes: -1, text: '', truncated: true, bytesRead: 0, cancelled: true, locked: false },
			{ maximumBytes: 3, text: '\u00e9\ufffd', truncated: true, bytesRead: 3, cancelled: true, locked: false },
		]);
	});

	for (const abortMode of ['cancel', 'timeout'] as const) {
		test(`releases pending download reads on ${abortMode} even when source cancellation never settles`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler());
			const controller = new AbortController();
			const readStarted = new DeferredPromise<void>();
			let cancelled = false;
			const stream = new ReadableStream<Uint8Array>({
				pull() { void readStarted.complete(); },
				cancel() {
					cancelled = true;
					return new Promise<void>(() => { });
				},
			}, { highWaterMark: 0 });
			const transport = disposables.add(new GitHubTransport(async () => new Response(stream), scheduler));
			const pending = transport.download(accountA, 'token-a', {
				url: 'https://api.example.test/log', maximumBytes: 3, timeout: 30_000,
			}, controller.signal);
			const reason = new Error('cancelled by caller');
			const rejected = assert.rejects(pending, error => abortMode === 'cancel'
				? error === reason
				: error instanceof GitHubRequestError && error.kind === 'timeout');
			await readStarted.p;
			if (abortMode === 'cancel') {
				controller.abort(reason);
			} else {
				scheduler.advanceBy(30_000);
			}
			await rejected;
			assert.deepStrictEqual({ cancelled, locked: stream.locked, pendingTimers: scheduler.pendingCount }, {
				cancelled: true, locked: false, pendingTimers: 0,
			});
		});
	}

	test('does not await a hanging source cancellation after capturing the bounded prefix', async () => {
		const scheduler = disposables.add(new FakeGitHubScheduler());
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) { controller.enqueue(new TextEncoder().encode('abcdef')); },
			cancel() {
				cancelled = true;
				return new Promise<void>(() => { });
			},
		});
		const transport = disposables.add(new GitHubTransport(async () => new Response(stream), scheduler));
		const result = await transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 30_000,
		}, signal());
		assert.deepStrictEqual({
			text: result.text, truncated: result.truncated, cancelled, locked: stream.locked, pendingTimers: scheduler.pendingCount,
		}, { text: 'abc', truncated: true, cancelled: true, locked: false, pendingTimers: 0 });
	});

	test('sanitizes body read failures and releases the reader and deadline', async () => {
		const scheduler = disposables.add(new FakeGitHubScheduler());
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) { controller.error(new Error('private-token https://storage.example.test/log?sig=private')); },
		}, { highWaterMark: 0 });
		const transport = disposables.add(new GitHubTransport(async () => new Response(stream), scheduler));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 30_000,
		}, signal()), {
			name: 'GitHubRequestError', kind: 'network', message: 'GitHub download body failed (codes: unknown)',
		});
		assert.deepStrictEqual({ locked: stream.locked, pendingTimers: scheduler.pendingCount }, { locked: false, pendingTimers: 0 });
	});

	test('cleans up a body returned after cancellation without reading it', async () => {
		const controller = new AbortController();
		const reason = new Error('cancelled');
		let cancelled = false;
		let reads = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull() { reads++; },
			cancel() { cancelled = true; },
		}, { highWaterMark: 0 });
		const transport = disposables.add(new GitHubTransport(async () => {
			controller.abort(reason);
			return new Response(stream);
		}));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
		}, controller.signal), error => error === reason);
		assert.deepStrictEqual({ reads, cancelled, locked: stream.locked }, { reads: 0, cancelled: true, locked: false });
	});

	test('reports source cancellation failures without leaking their content or losing the bounded result', async () => {
		const warnings: string[] = [];
		const logService = disposables.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const stream = new ReadableStream<Uint8Array>({
			start(controller) { controller.enqueue(new TextEncoder().encode('abcdef')); },
			cancel() { throw new Error('private-token https://storage.example.test/log?sig=private'); },
		});
		const transport = disposables.add(new GitHubTransport(async () => new Response(stream), undefined, false, logService));
		const result = await transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
		}, signal());
		assert.deepStrictEqual({ text: result.text, locked: stream.locked, warnings }, {
			text: 'abc', locked: false, warnings: ['[GitHubTransport] Failed to cancel a download body'],
		});
	});

	test('cancels discarded redirects before rejecting unsafe, invalid, or missing locations', async () => {
		const results: { cancelled: boolean; requests: number }[] = [];
		for (const location of ['http://external.example.test/log', 'file:///private', 'https://user:password@storage.example.test/log', 'https://[invalid?sig=private', undefined]) {
			let cancelled = false;
			let requests = 0;
			const transport = disposables.add(new GitHubTransport(async () => {
				requests++;
				return new Response(new ReadableStream<Uint8Array>({
					cancel() { cancelled = true; },
				}), { status: 302, headers: location === undefined ? {} : { location } });
			}));
			await assert.rejects(() => transport.download(accountA, 'token-a', {
				url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
			}, signal()), error => error instanceof GitHubRequestError
				&& error.kind === (location === undefined ? 'malformedResponse' : 'authorization')
				&& !error.message.includes('private') && !error.message.includes('password'));
			results.push({ cancelled, requests });
		}
		assert.deepStrictEqual(results, Array.from({ length: 5 }, () => ({ cancelled: true, requests: 1 })));
	});

	test('cancels redirect bodies and never sends credentials to a storage origin', async () => {
		const requests: { host: string; authenticated: boolean }[] = [];
		let cancelled = 0;
		const transport = disposables.add(new GitHubTransport(async (input, init) => {
			requests.push({ host: new URL(String(input)).host, authenticated: new Headers(init?.headers).has('Authorization') });
			if (requests.length < 3) {
				return new Response(new ReadableStream<Uint8Array>({
					cancel() {
						cancelled++;
						return new Promise<void>(() => { });
					},
				}), {
					status: 302,
					headers: { location: requests.length === 1 ? '/other' : 'https://storage.example.test/log?sig=private' },
				});
			}
			return new Response('ok');
		}));
		const result = await transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
		}, signal());
		assert.deepStrictEqual({ requests, cancelled, text: result.text }, {
			requests: [
				{ host: 'api.example.test', authenticated: true },
				{ host: 'api.example.test', authenticated: true },
				{ host: 'storage.example.test', authenticated: false },
			],
			cancelled: 2, text: 'ok',
		});
	});

	test('cancels every discarded body when reaching the redirect limit', async () => {
		let cancelled = 0;
		let requests = 0;
		const transport = disposables.add(new GitHubTransport(async () => {
			requests++;
			return new Response(new ReadableStream<Uint8Array>({
				cancel() { cancelled++; },
			}), { status: 302, headers: { location: '/again?sig=private' } });
		}));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
		}, signal()), {
			name: 'GitHubRequestError', kind: 'unknown', message: 'GitHub download exceeded the redirect limit',
		});
		assert.deepStrictEqual({ requests, cancelled }, { requests: 6, cancelled: 6 });
	});

	test('discards download error bodies without exposing signed URLs or credentials', async () => {
		let cancelled = false;
		const transport = disposables.add(new GitHubTransport(async () => new Response(new ReadableStream<Uint8Array>({
			start(controller) { controller.enqueue(new TextEncoder().encode('private-token https://storage.example.test/log?sig=private'.repeat(1024))); },
			cancel() { cancelled = true; },
		}), { status: 403, statusText: 'private details' })));
		await assert.rejects(() => transport.download(accountA, 'token-a', {
			url: 'https://api.example.test/log', maximumBytes: 3, timeout: 1_000,
		}, signal()), {
			name: 'GitHubRequestError', kind: 'authorization', statusCode: 403, message: 'GitHub download failed - HTTP 403',
			responseBody: undefined,
		});
		assert.strictEqual(cancelled, true);
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

});
