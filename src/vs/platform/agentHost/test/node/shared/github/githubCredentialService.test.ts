/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { AgentHostAuthenticationService } from '../../../../node/agentHostAuthenticationService.js';
import { GitHubCredentialService } from '../../../../node/shared/github/githubCredentialService.js';
import { GitHubRequestError, GitHubTransport } from '../../../../node/shared/github/githubTransport.js';
import { MockAgent } from '../../mockAgent.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

function signal(): AbortSignal {
	return new AbortController().signal;
}

suite('GitHubCredentialService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('resolves a stable account once per accepted token generation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101, login: 'ignored' }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 202, login: 'ignored-again' }) }),
			);
			const endpoint = server.createEndpointService();
			const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, authentication, endpoint));
			const agent = new MockAgent();
			disposables.add(toDisposable(() => agent.dispose()));
			const resource = endpoint.getRepoResource();
			agent.getProtectedResources = () => [resource];

			await authentication.authenticate({ resource: resource.resource, scopes: resource.scopes_supported, token: 'one' }, [agent]);
			const first = await credentials.getCredential(signal());
			const shared = await credentials.getCredential(signal());
			await authentication.authenticate({ resource: resource.resource, scopes: resource.scopes_supported, token: 'two' }, [agent]);
			const replacement = await credentials.getCredential(signal());

			assert.deepStrictEqual({
				first: { account: first.account, generation: first.generation },
				sharedObject: first === shared,
				firstAborted: first.signal.aborted,
				replacement: { account: replacement.account, generation: replacement.generation },
				requestCount: server.requests.length,
			}, {
				first: { account: { host: new URL(server.apiBaseUrl).host, accountId: '101' }, generation: 1 },
				sharedObject: true,
				firstAborted: true,
				replacement: { account: { host: new URL(server.apiBaseUrl).host, accountId: '202' }, generation: 2 },
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('invalidates the matching authentication generation after 401', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/one', response: gitHubJsonResponse({ value: 1 }, { etag: '"one"' }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/two', response: gitHubJsonResponse({ value: 2 }, { etag: '"two"' }) }),
			);
			const endpoint = server.createEndpointService();
			const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, authentication, endpoint));
			const agent = new MockAgent();
			disposables.add(toDisposable(() => agent.dispose()));
			const resource = endpoint.getRepoResource();
			agent.getProtectedResources = () => [resource];
			await authentication.authenticate({ resource: resource.resource, scopes: resource.scopes_supported, token: 'one' }, [agent]);
			const credential = await credentials.getCredential(signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/one` }, signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/two` }, signal());
			const invalidations: string[] = [];
			disposables.add(credentials.onDidInvalidate(event => invalidations.push(event.reason)));

			credentials.handleRequestError(credential, new GitHubRequestError('Bad credentials', 'authentication', 401));

			assert.deepStrictEqual({
				token: authentication.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported }),
				aborted: credential.signal.aborted,
				invalidations,
			}, {
				token: undefined,
				aborted: true,
				invalidations: ['authentication'],
			});
			server.assertSatisfied();
		});
	});
});
