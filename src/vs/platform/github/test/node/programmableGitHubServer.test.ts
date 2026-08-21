/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	gitHubDisconnectResponse,
	gitHubGraphQLResponse,
	gitHubGraphQLStep,
	gitHubJsonResponse,
	gitHubMalformedJsonResponse,
	gitHubNotModifiedResponse,
	gitHubRateLimitResponse,
	gitHubRedirectResponse,
	gitHubRestStep,
	ProgrammableGitHubServer,
} from './programmableGitHubServer.js';
import { nodeFetch } from './nodeFetch.js';

suite('ProgrammableGitHubServer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('scripts ordered REST and GraphQL responses and captures requests', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/microsoft/vscode/pulls',
					query: { head: 'octocat:feature/test', state: 'all' },
					response: gitHubJsonResponse([{ number: 42 }], { etag: 'W/"pulls-1"', link: '</next>; rel="next"' }),
				}),
				gitHubGraphQLStep({
					operationName: 'EnableAutoMerge',
					queryIncludes: ['mutation EnableAutoMerge', 'enablePullRequestAutoMerge'],
					response: gitHubGraphQLResponse(
						{ enablePullRequestAutoMerge: { clientMutationId: null } },
						[{ message: 'viewerPermission unavailable', path: ['repository', 'viewerPermission'] }],
					),
				}),
			);

			const restResponse = await nodeFetch(`${server.apiBaseUrl}/repos/microsoft/vscode/pulls?state=all&head=octocat%3Afeature%2Ftest`, {
				headers: { Authorization: 'Bearer test-token' },
			});
			assert.deepStrictEqual({
				status: restResponse.status,
				etag: restResponse.headers.get('etag'),
				link: restResponse.headers.get('link'),
				body: await restResponse.json(),
			}, {
				status: 200,
				etag: 'W/"pulls-1"',
				link: '</next>; rel="next"',
				body: [{ number: 42 }],
			});

			const graphQlResponse = await nodeFetch(server.graphQlUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					operationName: 'EnableAutoMerge',
					query: 'mutation EnableAutoMerge { enablePullRequestAutoMerge(input: {}) { clientMutationId } }',
					variables: { pullRequestId: 'PR_node_42' },
				}),
			});
			assert.deepStrictEqual(await graphQlResponse.json(), {
				data: { enablePullRequestAutoMerge: { clientMutationId: null } },
				errors: [{ message: 'viewerPermission unavailable', path: ['repository', 'viewerPermission'] }],
			});

			assert.deepStrictEqual(server.requests.map(request => ({
				service: request.service,
				method: request.method,
				path: request.servicePath,
				search: request.search,
				authorization: request.headers.authorization,
				operationName: request.graphQl?.operationName,
				variables: request.graphQl?.variables,
			})), [
				{
					service: 'rest',
					method: 'GET',
					path: '/repos/microsoft/vscode/pulls',
					search: '?state=all&head=octocat%3Afeature%2Ftest',
					authorization: 'Bearer test-token',
					operationName: undefined,
					variables: undefined,
				},
				{
					service: 'graphql',
					method: 'POST',
					path: '/',
					search: '',
					authorization: undefined,
					operationName: 'EnableAutoMerge',
					variables: { pullRequestId: 'PR_node_42' },
				},
			]);

			server.assertSatisfied();
		});
	});

	test('supports etag revalidation and manual redirects', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls',
					response: gitHubJsonResponse([{ number: 1 }], { etag: 'W/"etag-1"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls',
					assert: request => assert.strictEqual(request.headers['if-none-match'], 'W/"etag-1"'),
					response: gitHubNotModifiedResponse({ etag: 'W/"etag-1"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues',
					response: gitHubRedirectResponse(`${server.apiBaseUrl}/repos/octo/repo/issues/42`, { status: 302 }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/42',
					response: gitHubJsonResponse({ id: 42 }),
				}),
			);

			const first = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/pulls`);
			assert.deepStrictEqual(await first.json(), [{ number: 1 }]);

			const second = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/pulls`, {
				headers: { 'If-None-Match': first.headers.get('etag')! },
			});
			assert.deepStrictEqual({
				status: second.status,
				etag: second.headers.get('etag'),
			}, {
				status: 304,
				etag: 'W/"etag-1"',
			});

			const redirected = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/issues`, { redirect: 'manual' });
			assert.strictEqual(redirected.status, 302);

			const followUp = await nodeFetch(redirected.headers.get('location')!);
			assert.deepStrictEqual(await followUp.json(), { id: 42 });

			server.assertSatisfied();
		});
	});

	test('supports externally released delays, malformed payloads, rate limits, and disconnects', async () => {
		await withServer(async server => {
			const requestSeen = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();

			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/delayed',
					waitFor: release.p,
					assert: async () => {
						await requestSeen.complete();
					},
					response: gitHubJsonResponse({ ok: true }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/malformed',
					response: gitHubMalformedJsonResponse(),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/limited',
					response: gitHubRateLimitResponse({
						status: 429,
						resource: 'graphql',
						remaining: 0,
						resetAt: 1_750_000_000_000,
						retryAfterSeconds: 5,
					}),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/disconnect',
					response: gitHubDisconnectResponse(),
				}),
			);

			let delayedSettled = false;
			const delayed = nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/delayed`).then(async response => {
				delayedSettled = true;
				return response.json();
			});

			await requestSeen.p;
			await Promise.resolve();
			assert.strictEqual(delayedSettled, false);

			await release.complete();
			assert.deepStrictEqual(await delayed, { ok: true });

			const malformed = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/malformed`);
			assert.strictEqual(await malformed.text(), '{"malformed": true');

			const limited = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/limited`);
			assert.deepStrictEqual({
				status: limited.status,
				retryAfter: limited.headers.get('retry-after'),
				resource: limited.headers.get('x-ratelimit-resource'),
				body: await limited.json(),
			}, {
				status: 429,
				retryAfter: '5',
				resource: 'graphql',
				body: { message: 'You have exceeded a secondary rate limit.' },
			});

			await assert.rejects(() => nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/disconnect`));
			server.assertSatisfied();
		});
	});

	test('rejects only the selected mutation when it selects a Query-root-only field', async () => {
		const documents: Record<string, { readonly query: string; readonly operationName?: string }> = {
			'valid mutation': {
				query: 'mutation M($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }',
			},
			'mutation selecting rateLimit': {
				query: 'mutation M($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } rateLimit { limit } }',
			},
			'mutation preceded by a fragment definition': {
				query: 'fragment F on PullRequestReviewThread { id }\nmutation M($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { ...F } } rateLimit { limit } }',
			},
			'selected mutation of a multi-operation document': {
				query: 'query Q { repository(owner: "o", name: "r") { id } }\nmutation M { enqueuePullRequest(input: {}) { clientMutationId } rateLimit { limit } }',
				operationName: 'M',
			},
			'valid mutation beside a query selecting rateLimit': {
				query: 'mutation M { enqueuePullRequest(input: {}) { clientMutationId } }\nquery Q { repository(owner: "o", name: "r") { id } rateLimit { limit } }',
				operationName: 'M',
			},
			'query selecting rateLimit': {
				query: 'query Q { repository(owner: "o", name: "r") { id } rateLimit { limit } }',
			},
			'mutation selecting rateLimit below the root': {
				query: 'mutation M { enqueuePullRequest(input: {}) { rateLimit { limit } } }',
			},
			'mutation naming rateLimit inside a string argument': {
				query: 'mutation M { addComment(input: { body: "rateLimit { limit }" }) { clientMutationId } }',
			},
		};

		const rejected: Record<string, boolean> = {};
		for (const [name, body] of Object.entries(documents)) {
			await withServer(async server => {
				server.enqueue(gitHubGraphQLStep({ response: gitHubGraphQLResponse({ ok: true }) }));
				const response = await nodeFetch(server.graphQlUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				rejected[name] = response.status === 500 && (await response.text()).includes('only exposes on Query');
			});
		}

		assert.deepStrictEqual(rejected, {
			'valid mutation': false,
			'mutation selecting rateLimit': true,
			'mutation preceded by a fragment definition': true,
			'selected mutation of a multi-operation document': true,
			'valid mutation beside a query selecting rateLimit': false,
			'query selecting rateLimit': false,
			'mutation selecting rateLimit below the root': false,
			'mutation naming rateLimit inside a string argument': false,
		});
	});

	test('assertSatisfied reports unconsumed steps', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo/unconsumed',
				response: gitHubJsonResponse({ ok: true }),
			}));

			assert.throws(() => server.assertSatisfied(), /Unconsumed GitHub steps/);
		});
	});
});
