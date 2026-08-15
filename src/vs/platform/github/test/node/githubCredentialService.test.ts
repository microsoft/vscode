/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubCredentialService } from '../../common/githubCredentialService.js';
import { GitHubRequestError, GitHubTransport } from '../../common/githubTransport.js';
import { IGitHubTokenProvider } from '../../common/githubTypes.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubDisconnectResponse, gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

function signal(): AbortSignal {
	return new AbortController().signal;
}

class TestTokenProvider extends Disposable implements IGitHubTokenProvider {

	private readonly _onDidChangeToken = this._register(new Emitter<void>());
	readonly onDidChangeToken = this._onDidChangeToken.event;
	readonly invalidatedTokens: string[] = [];
	private _token: string | undefined;

	getToken(): string | undefined {
		return this._token;
	}

	setToken(token: string | undefined): void {
		this._token = token;
		this._onDidChangeToken.fire();
	}

	invalidateToken(token: string): void {
		this.invalidatedTokens.push(token);
		if (this._token === token) {
			this._token = undefined;
		}
	}
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
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, tokenProvider, endpoint));

			tokenProvider.setToken('one');
			const first = await credentials.getCredential(signal());
			const shared = await credentials.getCredential(signal());
			tokenProvider.setToken('two');
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
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, tokenProvider, endpoint));
			tokenProvider.setToken('one');
			const credential = await credentials.getCredential(signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/one` }, signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/two` }, signal());
			const invalidations: string[] = [];
			disposables.add(credentials.onDidInvalidate(event => invalidations.push(event.reason)));

			credentials.handleRequestError(credential, new GitHubRequestError('Bad credentials', 'authentication', 401));

			assert.deepStrictEqual({
				token: tokenProvider.getToken(),
				invalidatedTokens: tokenProvider.invalidatedTokens,
				aborted: credential.signal.aborted,
				invalidations,
			}, {
				token: undefined,
				invalidatedTokens: ['one'],
				aborted: true,
				invalidations: ['authentication'],
			});
			server.assertSatisfied();
		});
	});

	test('retries stable account resolution after a transient identity failure', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubDisconnectResponse() }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubDisconnectResponse() }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
			);
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('one');
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, tokenProvider, server.createEndpointService()));

			await assert.rejects(() => credentials.getCredential(signal()), error =>
				error instanceof GitHubRequestError && error.kind === 'network');
			const recovered = await credentials.getCredential(signal());

			assert.deepStrictEqual({
				account: recovered.account,
				generation: recovered.generation,
				requestCount: server.requests.length,
			}, {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				generation: 2,
				requestCount: 3,
			});
			server.assertSatisfied();
		});
	});

	test('ignores authentication errors from a replaced credential generation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
			);
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(transport, tokenProvider, server.createEndpointService()));

			tokenProvider.setToken('one');
			const previous = await credentials.getCredential(signal());
			tokenProvider.setToken('two');
			const current = await credentials.getCredential(signal());
			credentials.handleRequestError(previous, new GitHubRequestError('Old request failed', 'authentication', 401));

			assert.deepStrictEqual({
				token: tokenProvider.getToken(),
				invalidatedTokens: tokenProvider.invalidatedTokens,
				previousAborted: previous.signal.aborted,
				currentAborted: current.signal.aborted,
			}, {
				token: 'two',
				invalidatedTokens: [],
				previousAborted: true,
				currentAborted: false,
			});
			server.assertSatisfied();
		});
	});
});
