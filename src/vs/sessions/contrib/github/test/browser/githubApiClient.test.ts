/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { IDefaultAccountAuthenticationProvider } from '../../../../../base/common/defaultAccount.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRequestCompleteEvent, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationGetSessionsOptions, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { GitHubApiClient, GitHubAuthenticationError } from '../../browser/githubApiClient.js';

/**
 * Captures the options passed to {@link IRequestService.request} and returns a
 * configurable response. Only the surface used by {@link GitHubApiClient} is
 * implemented; the rest is unused in these tests.
 */
class FakeRequestService extends Disposable implements Partial<IRequestService> {
	readonly _serviceBrand: undefined;

	private readonly _onDidCompleteRequest = this._register(new Emitter<IRequestCompleteEvent>());
	readonly onDidCompleteRequest = this._onDidCompleteRequest.event;

	lastOptions: IRequestOptions | undefined;
	lastToken: CancellationToken | undefined;
	nextResponse: IRequestContext = {
		res: { statusCode: 304, headers: { etag: '"etag-2"' } },
		stream: bufferToStream(VSBuffer.wrap(new Uint8Array(0))),
	};

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.lastOptions = options;
		this.lastToken = token;
		return this.nextResponse;
	}
}

class FakeAuthenticationService implements Partial<IAuthenticationService> {
	readonly _serviceBrand: undefined;
	readonly providerIds: string[] = [];
	readonly getSessionsOptions: (IAuthenticationGetSessionsOptions | undefined)[] = [];
	readonly createSessionCalls: Parameters<IAuthenticationService['createSession']>[] = [];
	getSessionsResult: Promise<readonly AuthenticationSession[]> | undefined;
	createSessionError: Error | string | undefined;
	createdSession: AuthenticationSession = {
		id: 'session-2',
		accessToken: 'token-created',
		account: { id: 'account-1', label: 'octocat' },
		scopes: ['repo'],
	};
	sessions: readonly AuthenticationSession[] = [{
		id: 'session-1',
		accessToken: 'token-123',
		account: { id: 'account-1', label: 'octocat' },
		scopes: ['repo'],
	}];

	async getSessions(...args: Parameters<IAuthenticationService['getSessions']>): Promise<readonly AuthenticationSession[]> {
		this.providerIds.push(args[0]);
		this.getSessionsOptions.push(args[2]);
		return this.getSessionsResult ?? this.sessions;
	}

	async createSession(...args: Parameters<IAuthenticationService['createSession']>): Promise<AuthenticationSession> {
		this.createSessionCalls.push(args);
		if (this.createSessionError) {
			throw this.createSessionError;
		}
		this.sessions = [...this.sessions, this.createdSession];
		return this.createdSession;
	}
}

class FakeDefaultAccountService extends mock<IDefaultAccountService>() {
	authenticationProvider: IDefaultAccountAuthenticationProvider = {
		id: 'github',
		name: 'GitHub',
		enterprise: false,
	};
	gitHubBaseUrl = 'https://github.com';

	override getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		return this.authenticationProvider;
	}

	override resolveGitHubUrl(path: string): string {
		return `${this.gitHubBaseUrl.replace(/\/+$/, '')}/${path}`;
	}
}

suite('GitHubApiClient', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let requestService: FakeRequestService;
	let authenticationService: FakeAuthenticationService;
	let defaultAccountService: FakeDefaultAccountService;
	let client: GitHubApiClient;

	setup(() => {
		requestService = store.add(new FakeRequestService());
		authenticationService = new FakeAuthenticationService();
		defaultAccountService = new FakeDefaultAccountService();
		client = store.add(new GitHubApiClient(
			requestService as unknown as IRequestService,
			authenticationService as unknown as IAuthenticationService,
			defaultAccountService,
			new NullLogService(),
		));
	});

	test('bypasses the HTTP cache so polling always reaches GitHub', async () => {
		await client.request('GET', '/repos/o/r/pulls/1', 'test');
		assert.strictEqual(requestService.lastOptions?.disableCache, true);
	});

	test('sends an If-None-Match conditional request when given an etag', async () => {
		await client.request('GET', '/repos/o/r/pulls/1', 'test', { etag: '"etag-1"' });

		const headers = requestService.lastOptions?.headers;
		assert.strictEqual(headers?.['If-None-Match'], '"etag-1"');
		// The conditional request must still bypass the cache, otherwise a stale
		// cached body would be returned instead of the server's 304/200.
		assert.strictEqual(requestService.lastOptions?.disableCache, true);
	});

	test('surfaces a 304 Not Modified response without data', async () => {
		const response = await client.request('GET', '/repos/o/r/pulls/1', 'test', { etag: '"etag-1"' });
		assert.deepStrictEqual(
			{ statusCode: response.statusCode, data: response.data, etag: response.etag },
			{ statusCode: 304, data: undefined, etag: '"etag-2"' },
		);
	});

	test('does not create an authentication session for a silent request', async () => {
		authenticationService.sessions = [];

		await assert.rejects(
			client.graphql('query Test { viewer { login } }', 'test', undefined, { createAuthenticationSession: false }),
			GitHubAuthenticationError,
		);

		assert.deepStrictEqual(authenticationService.getSessionsOptions, [{ silent: true }]);
	});

	test('repository requests do not silently fall back to insufficient scopes', async () => {
		authenticationService.sessions = [{ ...authenticationService.sessions[0], scopes: ['read:user'] }];

		await assert.rejects(
			client.request('GET', '/user/repos', 'test', { createAuthenticationSession: false, authenticationScopes: ['repo'] }),
			GitHubAuthenticationError,
		);

		assert.deepStrictEqual({
			created: authenticationService.createSessionCalls,
			request: requestService.lastOptions,
		}, { created: [], request: undefined });
	});

	for (const signedIn of [false, true]) {
		test(`interactively obtains repository access when ${signedIn ? 'existing scopes are insufficient' : 'signed out'}`, async () => {
			authenticationService.sessions = signedIn ? [{ ...authenticationService.sessions[0], scopes: ['read:user'] }] : [];
			const token = store.add(new CancellationTokenSource()).token;

			await client.authenticate(['repo'], token);
			await client.request('GET', '/user/repos', 'test', { token, createAuthenticationSession: false, authenticationScopes: ['repo'] });

			assert.deepStrictEqual({
				created: authenticationService.createSessionCalls,
				authorization: requestService.lastOptions?.headers?.Authorization,
				token: requestService.lastToken,
			}, {
				created: [['github', ['repo'], { activateImmediate: true }]],
				authorization: 'token token-created',
				token,
			});
		});
	}

	test('reuses a session whose scopes include repository access', async () => {
		authenticationService.sessions = [{ ...authenticationService.sessions[0], scopes: ['repo', 'read:user'] }];

		await client.authenticate(['repo'], CancellationToken.None);
		await client.request('GET', '/user/repos', 'test', { createAuthenticationSession: false, authenticationScopes: ['repo'] });

		assert.deepStrictEqual({
			created: authenticationService.createSessionCalls,
			authorization: requestService.lastOptions?.headers?.Authorization,
		}, { created: [], authorization: 'token token-123' });
	});

	test('rejects an interactive session that still lacks the required scopes', async () => {
		authenticationService.sessions = [];
		authenticationService.createdSession = { ...authenticationService.createdSession, scopes: ['read:user'] };

		await assert.rejects(client.authenticate(['repo'], CancellationToken.None), GitHubAuthenticationError);
	});

	for (const error of ['Cancelled', new Error('Cancelled')]) {
		test(`normalizes provider sign-in cancellation (${typeof error})`, async () => {
			authenticationService.sessions = [];
			authenticationService.createSessionError = error;

			await assert.rejects(client.authenticate(['repo'], CancellationToken.None), isCancellationError);
		});
	}

	test('cancellation while looking up sessions prevents sign-in and HTTP requests', async () => {
		const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
		authenticationService.getSessionsResult = sessions.p;
		const source = store.add(new CancellationTokenSource());
		const request = client.request('GET', '/user/repos', 'test', { token: source.token, authenticationScopes: ['repo'] });

		source.cancel();
		await assert.rejects(request, isCancellationError);
		await sessions.complete([]);

		assert.deepStrictEqual({
			created: authenticationService.createSessionCalls,
			request: requestService.lastOptions,
		}, { created: [], request: undefined });
	});

	test('does not look up sessions for an already cancelled request', async () => {
		await assert.rejects(
			client.request('GET', '/user/repos', 'test', { token: CancellationToken.Cancelled, authenticationScopes: ['repo'] }),
			isCancellationError,
		);
		assert.deepStrictEqual(authenticationService.providerIds, []);
	});

	test('preserves the unscoped fallback for existing callers', async () => {
		authenticationService.sessions = [{ ...authenticationService.sessions[0], scopes: ['read:user'] }];

		await client.request('GET', '/repos/o/r', 'test');

		assert.deepStrictEqual({
			created: authenticationService.createSessionCalls,
			authorization: requestService.lastOptions?.headers?.Authorization,
		}, { created: [], authorization: 'token token-123' });
	});

	for (const kind of ['REST', 'GraphQL']) {
		test(`does not request repository consent for a signed-out unscoped ${kind} caller`, async () => {
			authenticationService.sessions = [];

			await assert.rejects(
				kind === 'REST'
					? client.request('GET', '/repos/o/r/issues', 'test')
					: client.graphql('query Test { viewer { login } }', 'test'),
				GitHubAuthenticationError,
			);

			assert.deepStrictEqual({
				lookups: authenticationService.getSessionsOptions,
				created: authenticationService.createSessionCalls,
				request: requestService.lastOptions,
			}, {
				lookups: [{ silent: true }, { createIfNone: true }],
				created: [],
				request: undefined,
			});
		});
	}

	test('routes REST requests through GitHub Enterprise Server authentication and endpoints', async () => {
		defaultAccountService.authenticationProvider = {
			id: 'github-enterprise',
			name: 'GitHub Enterprise',
			enterprise: true,
		};
		defaultAccountService.gitHubBaseUrl = 'https://ghe.example.com';

		await client.request('GET', '/repos/o/r/issues', 'test');

		assert.deepStrictEqual({
			url: requestService.lastOptions?.url,
			providerIds: authenticationService.providerIds,
			enterpriseHost: client.enterpriseHost,
		}, {
			url: 'https://ghe.example.com/api/v3/repos/o/r/issues',
			providerIds: ['github-enterprise'],
			enterpriseHost: 'ghe.example.com',
		});
	});

	test('routes GraphQL requests through GitHub Enterprise Cloud', async () => {
		defaultAccountService.authenticationProvider = {
			id: 'github-enterprise',
			name: 'GitHub Enterprise',
			enterprise: true,
		};
		defaultAccountService.gitHubBaseUrl = 'https://tenant.ghe.com';
		requestService.nextResponse = {
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('{"data":{"viewer":{"login":"octocat"}}}')),
		};

		const data = await client.graphql<{ readonly viewer: { readonly login: string } }>('query Test { viewer { login } }', 'test');

		assert.deepStrictEqual({
			data,
			url: requestService.lastOptions?.url,
			providerIds: authenticationService.providerIds,
			enterpriseHost: client.enterpriseHost,
		}, {
			data: { viewer: { login: 'octocat' } },
			url: 'https://api.tenant.ghe.com/graphql',
			providerIds: ['github-enterprise'],
			enterpriseHost: 'tenant.ghe.com',
		});
	});
});
