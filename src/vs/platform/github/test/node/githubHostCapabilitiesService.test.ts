/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubHostCapabilitiesService } from '../../common/githubHostCapabilitiesService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubGraphQLResponse, gitHubGraphQLStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

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

	test('probes once per host and enterprise version', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: ['__type(name: "PullRequest")', '__type(name: "Repository")', '__type(name: "RequirableByPullRequest")'],
				response: gitHubGraphQLResponse({
					pullRequest: { fields: [{ name: 'mergeQueueEntry' }, { name: 'reviewThreads' }] },
					repository: { fields: [{ name: 'mergeQueue' }] },
					requirableByPullRequest: { fields: [{ name: 'isRequired' }] },
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
			const signal = new AbortController().signal;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				signal,
			};

			const first = await service.getCapabilities(credential, '3.16', signal);
			const cached = await service.getCapabilities(credential, '3.16', signal);

			assert.deepStrictEqual({
				first,
				sameObject: first === cached,
				requestCount: server.requests.length,
			}, {
				first: {
					graphql: true,
					mergeQueue: true,
					internalMergeStatus: false,
					reviewThreads: true,
					checkContextRequiredness: true,
				},
				sameObject: true,
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});

	test('fails closed when the schema probe returns errors', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse(undefined, [{ message: 'Field does not exist', type: 'VALIDATION' }]),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
			const signal = new AbortController().signal;

			const result = await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				signal,
			}, undefined, signal);

			assert.deepStrictEqual(result, {
				graphql: false,
				mergeQueue: false,
				internalMergeStatus: false,
				reviewThreads: false,
				checkContextRequiredness: false,
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
			const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
			const signal = new AbortController().signal;

			const result = await service.getCapabilities({
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				signal,
			}, undefined, signal);

			assert.deepStrictEqual(result, {
				graphql: true,
				mergeQueue: false,
				internalMergeStatus: false,
				reviewThreads: true,
				checkContextRequiredness: false,
			});
			server.assertSatisfied();
		});
	});

	test('retries capability probing after a transient GraphQL error', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					response: gitHubGraphQLResponse(undefined, [{ message: 'Temporarily unavailable', type: 'INTERNAL' }]),
				}),
				gitHubGraphQLStep({
					response: gitHubGraphQLResponse({
						pullRequest: { fields: [{ name: 'reviewThreads' }] },
						repository: { fields: [] },
						requirableByPullRequest: { fields: [] },
					}),
				}),
			);
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
			const signal = new AbortController().signal;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				signal,
			};

			const transient = await service.getCapabilities(credential, undefined, signal);
			const recovered = await service.getCapabilities(credential, undefined, signal);

			assert.deepStrictEqual({
				transient,
				recovered,
				requestCount: server.requests.length,
			}, {
				transient: {
					graphql: false,
					mergeQueue: false,
					internalMergeStatus: false,
					reviewThreads: false,
					checkContextRequiredness: false,
				},
				recovered: {
					graphql: true,
					mergeQueue: false,
					internalMergeStatus: false,
					reviewThreads: true,
					checkContextRequiredness: false,
				},
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
					requirableByPullRequest: { fields: [] },
				}),
			}));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
			const credentialSignal = new AbortController().signal;
			const credential = {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				token: 'token',
				generation: 1,
				signal: credentialSignal,
			};
			const cancelled = new AbortController();
			const active = new AbortController();
			const first = service.getCapabilities(credential, undefined, cancelled.signal);
			const second = service.getCapabilities(credential, undefined, active.signal);
			await requestSeen.p;

			cancelled.abort(new Error('cancel first waiter'));
			await assert.rejects(() => first, /cancel first waiter/);
			await release.complete();

			assert.deepStrictEqual({
				second: await second,
				activeAborted: active.signal.aborted,
				requestCount: server.requests.length,
			}, {
				second: {
					graphql: true,
					mergeQueue: false,
					internalMergeStatus: false,
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
