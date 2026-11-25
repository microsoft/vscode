/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestWarningLogService } from '../../../log/test/common/testWarningLogService.js';
import { GitHubHostCapabilitiesService } from '../../common/githubHostCapabilitiesService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeScheduler } from './fakeScheduler.js';
import { nodeFetch } from './nodeFetch.js';
import { ProgrammableGitHubServer, gitHubGraphQLResponse, gitHubGraphQLStep } from './programmableGitHubServer.js';


suite('GitHubHostCapabilitiesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('probes once per host', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: ['__type(name: "PullRequest")', '__type(name: "Repository")', '__type(name: "RequirableByPullRequest")', '__type(name: "RemovedFromMergeQueueEvent")'],
				response: gitHubGraphQLResponse({
					pullRequest: { fields: [{ name: 'mergeQueueEntry' }, { name: 'reviewThreads' }] },
					repository: { fields: [{ name: 'mergeQueue' }] },
					requirableByPullRequest: { name: 'RequirableByPullRequest' },
					removedFromMergeQueueEvent: { name: 'RemovedFromMergeQueueEvent' },
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			};

			const first = await service.getCapabilities(credential, cancellationToken);
			const cached = await service.getCapabilities(credential, cancellationToken);

			assert.deepStrictEqual({
				first,
				sameObject: first === cached,
				requestCount: server.requests.length,
			}, {
				first: {
					graphql: true,
					mergeQueue: true,
					mergeQueueRemovals: true,
					reviewThreads: true,
					checkContextRequiredness: true,
				},
				sameObject: true,
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});

	test('stays within the GitHub introspection budget', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse({
					pullRequest: { fields: [{ name: 'reviewThreads' }] },
					repository: { fields: [] },
					requirableByPullRequest: { name: 'RequirableByPullRequest' },
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;

			await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			}, cancellationToken);

			// GitHub rejects a query that selects `__Type.fields` more than twice with
			// INTROSPECTION_LIMIT_EXCEEDED, which would silently disable every GraphQL capability.
			const query = server.requests[0].graphQl?.query ?? '';
			assert.strictEqual(query.match(/\bfields\b/g)?.length, 2);
			server.assertSatisfied();
		});
	});

	test('fails closed when the schema probe returns errors', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse(undefined, [{ message: 'Field does not exist', type: 'VALIDATION' }]),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;

			const result = await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			}, cancellationToken);

			assert.deepStrictEqual(result, {
				graphql: false,
				mergeQueue: false,
				mergeQueueRemovals: false,
				reviewThreads: false,
				checkContextRequiredness: false,
			});
			server.assertSatisfied();
		});
	});

	test('warns when an unexpected probe error disables GraphQL capabilities', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse(undefined, [{
					message: 'Introspection fields may only be used 2 times, but some fields were used more than that: __Type.fields (3)',
					type: 'INTROSPECTION_LIMIT_EXCEEDED',
				}]),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const logService = disposables.add(new TestWarningLogService());
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService(), logService));
			const cancellationToken = CancellationToken.None;

			const result = await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			}, cancellationToken);

			assert.deepStrictEqual({
				graphql: result.graphql,
				warnings: logService.warnings.map(warning => warning.includes('INTROSPECTION_LIMIT_EXCEEDED')),
			}, {
				graphql: false,
				warnings: [true],
			});
			server.assertSatisfied();
		});
	});

	test('does not infer requiredness from the status-check union', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse({
					pullRequest: { fields: [{ name: 'reviewThreads' }] },
					repository: { fields: [{ name: 'mergeQueue' }] },
					requirableByPullRequest: null,
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;

			const result = await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			}, cancellationToken);

			assert.deepStrictEqual(result, {
				graphql: true,
				mergeQueue: false,
				mergeQueueRemovals: false,
				reviewThreads: true,
				checkContextRequiredness: false,
			});
			server.assertSatisfied();
		});
	});

	test('reuses a degraded probe result before retrying a transient GraphQL error', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					response: gitHubGraphQLResponse(undefined, [{ message: 'Temporarily unavailable', type: 'INTERNAL' }]),
				}),
				gitHubGraphQLStep({
					response: gitHubGraphQLResponse({
						pullRequest: { fields: [{ name: 'reviewThreads' }] },
						repository: { fields: [] },
						requirableByPullRequest: null,
					}),
				}),
			);
			const scheduler = disposables.add(new FakeScheduler({ now: 0 }));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(scheduler, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken,
			};

			const transient = await service.getCapabilities(credential, cancellationToken);
			// An uncacheable result must not be re-probed on every lookup: the
			// fragments that ask still succeed on REST fallbacks, so nothing else
			// would throttle the extra introspection query.
			const throttled = await service.getCapabilities(credential, cancellationToken);
			const requestsWhileThrottled = server.requests.length;
			scheduler.advanceBy(65_000);
			const recovered = await service.getCapabilities(credential, cancellationToken);

			const unavailable = {
				graphql: false,
				mergeQueue: false,
				mergeQueueRemovals: false,
				reviewThreads: false,
				checkContextRequiredness: false,
			};
			assert.deepStrictEqual({
				transient,
				throttled,
				requestsWhileThrottled,
				recovered,
				requestCount: server.requests.length,
			}, {
				transient: unavailable,
				throttled: unavailable,
				requestsWhileThrottled: 1,
				recovered: {
					graphql: true,
					mergeQueue: false,
					mergeQueueRemovals: false,
					reviewThreads: true,
					checkContextRequiredness: false,
				},
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('re-probes a degraded host as soon as a new credential arrives', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					// A refusal that belongs to the credential, not the host.
					response: gitHubGraphQLResponse(undefined, [{ message: 'Resource protected by organization SAML enforcement', type: 'FORBIDDEN' }]),
				}),
				gitHubGraphQLStep({
					response: gitHubGraphQLResponse({
						pullRequest: { fields: [{ name: 'reviewThreads' }] },
						repository: { fields: [] },
						requirableByPullRequest: null,
					}),
				}),
			);
			const scheduler = disposables.add(new FakeScheduler({ now: 0 }));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(scheduler, undefined, transport, server.createEndpointService()));
			const cancellationToken = CancellationToken.None;
			const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };

			const refused = await service.getCapabilities({ account, token: 'stale', generation: 1, cancellationToken }, cancellationToken);
			// Authorizing the credential must not leave the user pinned to the
			// REST fallbacks the refusal produced for the rest of the window.
			const reauthenticated = await service.getCapabilities({ account, token: 'fresh', generation: 2, cancellationToken }, cancellationToken);

			assert.deepStrictEqual({
				refusedGraphql: refused.graphql,
				reauthenticatedGraphql: reauthenticated.graphql,
				reauthenticatedReviewThreads: reauthenticated.reviewThreads,
				elapsed: scheduler.now(),
				requestCount: server.requests.length,
			}, {
				refusedGraphql: false,
				reauthenticatedGraphql: true,
				reauthenticatedReviewThreads: true,
				elapsed: 0,
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('cancelling one capability waiter does not cancel another', async () => {
		await withServer(async server => {
			const requestSeen = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			server.enqueue(gitHubGraphQLStep({
				assert: async () => requestSeen.complete(),
				waitFor: release.p,
				response: gitHubGraphQLResponse({
					pullRequest: { fields: [{ name: 'reviewThreads' }] },
					repository: { fields: [] },
					requirableByPullRequest: null,
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(undefined, undefined, transport, server.createEndpointService()));
			const credentialSignal = CancellationToken.None;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				cancellationToken: credentialSignal,
			};
			const cancelled = disposables.add(new CancellationTokenSource());
			const active = disposables.add(new CancellationTokenSource());
			const first = service.getCapabilities(credential, cancelled.token);
			const second = service.getCapabilities(credential, active.token);
			await requestSeen.p;

			cancelled.cancel();
			await assert.rejects(() => first, isCancellationError);
			await release.complete();

			assert.deepStrictEqual({
				second: await second,
				activeAborted: active.token.isCancellationRequested,
				requestCount: server.requests.length,
			}, {
				second: {
					graphql: true,
					mergeQueue: false,
					mergeQueueRemovals: false,
					reviewThreads: true,
					checkContextRequiredness: false,
				},
				activeAborted: false,
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});
});
