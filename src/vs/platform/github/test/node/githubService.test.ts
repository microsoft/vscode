/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GitHubCredentialService } from '../../common/githubCredentialService.js';
import { GitHubHostCapabilitiesService } from '../../common/githubHostCapabilitiesService.js';
import { GitHubQueryService } from '../../common/githubQueryServiceImpl.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { PullRequestMutationService } from '../../common/pullRequestMutationService.js';
import { PullRequestResourceService } from '../../common/pullRequestResourceService.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

class TestLogService extends NullLogService {

	readonly messages: string[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.messages.push([message, ...args].join(' '));
	}

	override debug(message: string, ...args: unknown[]): void {
		this.messages.push([message, ...args].join(' '));
	}
}

suite('GitHubService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('owns the complete GitHub component graph behind one service', () => {
		const service = disposables.add(new GitHubService(
			{
				endpoint: {
					onDidChange: Event.None,
					getApiBaseUri: () => 'https://api.github.com',
					getGraphQlUri: () => 'https://api.github.com/graphql',
				},
				tokenProvider: {
					getToken: () => undefined,
				},
			},
			new NullLogService(),
		));

		assert.deepStrictEqual({
			transport: service.transport instanceof GitHubTransport,
			endpoint: service.endpoint.getApiBaseUri(),
			credentials: service.credentials instanceof GitHubCredentialService,
			capabilities: service.capabilities instanceof GitHubHostCapabilitiesService,
			query: service.query instanceof GitHubQueryService,
			pullRequests: service.pullRequests instanceof PullRequestResourceService,
			mutations: service.mutations instanceof PullRequestMutationService,
		}, {
			transport: true,
			endpoint: 'https://api.github.com',
			credentials: true,
			capabilities: true,
			query: true,
			pullRequests: true,
			mutations: true,
		});
	});

	test('logs service, credential, transport, and resource lifecycle without sensitive payloads', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101, private: 'response-secret' }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('private-title')) }),
			);
			const logService = new TestLogService();
			const service = new GitHubService({
				endpoint: server.createEndpointService(),
				tokenProvider: { getToken: () => 'token-secret' },
				fetch: nodeFetch,
			}, logService);
			try {
				const subscription = service.pullRequests.subscribePullRequest({
					host: new URL(server.apiBaseUrl).host,
					accountId: '101',
					owner: 'o',
					repo: 'r',
					number: 7,
				}, { priority: 'interactive' });
				await subscription.refresh('core');
				subscription.dispose();

				assert.deepStrictEqual({
					initialized: logService.messages.some(message => message.includes('[GitHubService] Reusable GitHub service initialized')),
					credential: logService.messages.some(message => message.includes('[GitHubCredentialService] Resolved account identity')),
					transport: logService.messages.some(message => message.includes('[GitHubTransport] REST GET') && message.includes('/repos/o/r/pulls/7')),
					resource: logService.messages.some(message => message.includes('[PullRequestResourceService] Refreshed core')),
					containsToken: logService.messages.some(message => message.includes('token-secret')),
					containsResponse: logService.messages.some(message => message.includes('response-secret') || message.includes('private-title')),
				}, {
					initialized: true,
					credential: true,
					transport: true,
					resource: true,
					containsToken: false,
					containsResponse: false,
				});
				server.assertSatisfied();
			} finally {
				service.dispose();
			}
		});
	});

	test('keeps pull request subscriptions alive across same-account token rotation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('First')) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('Second')) }),
			);
			let token = 'token-1';
			const service = disposables.add(new GitHubService({
				endpoint: server.createEndpointService(),
				tokenProvider: { getToken: () => token },
				fetch: nodeFetch,
			}, new NullLogService()));
			const ref = {
				host: new URL(server.apiBaseUrl).host,
				accountId: '101',
				owner: 'o',
				repo: 'r',
				number: 7,
			};
			const subscription = disposables.add(service.pullRequests.subscribePullRequest(ref, {
				priority: 'interactive',
			}));

			await subscription.refresh('core');
			const resource = subscription.resource;
			token = 'token-2';
			await subscription.refresh('core');

			assert.deepStrictEqual({
				sameResource: subscription.resource === resource,
				title: subscription.resource.snapshot.get().core.value?.title,
				status: subscription.resource.snapshot.get().core.status,
				requestCount: server.requests.length,
			}, {
				sameResource: true,
				title: 'Second',
				status: 'ready',
				requestCount: 4,
			});
			server.assertSatisfied();
		});
	});

	test('uses the browser global fetch safely when no fetch is supplied', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }));
			const service = disposables.add(new GitHubService({
				endpoint: server.createEndpointService(),
				tokenProvider: { getToken: () => 'token' },
			}, new NullLogService()));

			const credential = await service.credentials.getCredential(new AbortController().signal);

			assert.deepStrictEqual(credential.account, {
				host: new URL(server.apiBaseUrl).host,
				accountId: '101',
			});
			server.assertSatisfied();
		});
	});

	test('keeps subscriptions alive across authentication expiry and reauthentication', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('First')) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse({ message: 'Bad credentials' }, { status: 401 }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('Second')) }),
			);
			let token: string | undefined = 'token-1';
			const onDidChangeToken = disposables.add(new Emitter<void>());
			const service = disposables.add(new GitHubService({
				endpoint: server.createEndpointService(),
				tokenProvider: {
					onDidChangeToken: onDidChangeToken.event,
					getToken: () => token,
					invalidateToken: invalidated => {
						if (invalidated === token) {
							token = undefined;
						}
					},
				},
				fetch: nodeFetch,
			}, new NullLogService()));
			const subscription = disposables.add(service.pullRequests.subscribePullRequest({
				host: new URL(server.apiBaseUrl).host,
				accountId: '101',
				owner: 'o',
				repo: 'r',
				number: 7,
			}, {
				priority: 'interactive',
			}));
			await subscription.refresh('core');

			await assert.rejects(() => subscription.refresh('core'), /Bad credentials/);
			assert.doesNotThrow(() => subscription.update({ priority: 'visible' }));
			token = 'token-2';
			onDidChangeToken.fire();
			await subscription.refresh('core');

			assert.deepStrictEqual({
				title: subscription.resource.snapshot.get().core.value?.title,
				status: subscription.resource.snapshot.get().core.status,
				requestCount: server.requests.length,
			}, {
				title: 'Second',
				status: 'ready',
				requestCount: 5,
			});
			server.assertSatisfied();
		});
	});

	test('does not invalidate a valid token for a mismatched account resource', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 202 }) }));
			let token: string | undefined = 'token';
			const invalidatedTokens: string[] = [];
			const service = disposables.add(new GitHubService({
				endpoint: server.createEndpointService(),
				tokenProvider: {
					getToken: () => token,
					invalidateToken: invalidated => {
						invalidatedTokens.push(invalidated);
						token = undefined;
					},
				},
				fetch: nodeFetch,
			}, new NullLogService()));
			const subscription = disposables.add(service.pullRequests.subscribePullRequest({
				host: new URL(server.apiBaseUrl).host,
				accountId: '101',
				owner: 'o',
				repo: 'r',
				number: 7,
			}, {
				priority: 'interactive',
			}));

			await assert.rejects(() => subscription.refresh('core'), /does not match the current GitHub credential/);

			assert.deepStrictEqual({
				token,
				invalidatedTokens,
				requestCount: server.requests.length,
			}, {
				token: 'token',
				invalidatedTokens: [],
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});
});

function pullRequestResponse(title: string): object {
	return {
		node_id: 'PR7',
		number: 7,
		title,
		body: '',
		html_url: 'https://example.test/o/r/pull/7',
		state: 'open',
		merged: false,
		draft: false,
		user: { id: 1, login: 'author' },
		head: { sha: 'head', ref: 'feature' },
		base: {
			sha: 'base',
			ref: 'main',
			repo: { node_id: 'R1', full_name: 'o/r' },
		},
	};
}
