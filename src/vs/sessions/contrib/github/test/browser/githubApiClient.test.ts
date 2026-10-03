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
import { URI } from '../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider } from '../../../../../base/common/defaultAccount.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRequestCompleteEvent, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationGetSessionsOptions, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { GitHubApiClient, GitHubApiError, GitHubAuthenticationError } from '../../browser/githubApiClient.js';

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
	override currentDefaultAccount: IDefaultAccount | null = null;
	authenticationProvider: IDefaultAccountAuthenticationProvider = {
		id: 'github',
		name: 'GitHub',
		enterprise: false,
	};
	gitHubBaseUrl: string | undefined = 'https://github.com';

	override getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		return this.authenticationProvider;
	}

	override resolveGitHubUrl(path: string): string | undefined {
		return this.gitHubBaseUrl ? `${this.gitHubBaseUrl.replace(/\/+$/, '')}/${path}` : undefined;
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

	for (const kind of ['REST', 'GraphQL'] as const) {
		const request = () => kind === 'REST'
			? client.request('POST', '/repos/o/r/issues', 'test')
			: client.graphql('query Test { viewer { login } }', 'test');

		for (const statusCode of [200, 201, 202]) {
			test(`${kind} retains JSON parse errors for empty ${statusCode} responses`, async () => {
				requestService.nextResponse = {
					res: { statusCode, headers: {} },
					stream: bufferToStream(VSBuffer.fromString('')),
				};
				await assert.rejects(request(), SyntaxError);
			});
		}

		test(`${kind} retains malformed JSON diagnostics`, async () => {
			const body = 'not-json';
			requestService.nextResponse = {
				res: { statusCode: 200, headers: {} },
				stream: bufferToStream(VSBuffer.fromString(body)),
			};
			await assert.rejects(request(), error => error instanceof SyntaxError && error.message.endsWith(`:\n${body}`));
		});

		test(`${kind} continues parsing nonempty 202 responses`, async () => {
			const data = { accepted: true };
			requestService.nextResponse = {
				res: { statusCode: 202, headers: {} },
				stream: bufferToStream(VSBuffer.fromString(JSON.stringify(kind === 'REST' ? data : { data }))),
			};
			const response = kind === 'REST'
				? (await client.request('POST', '/repos/o/r/issues', 'test')).data
				: await client.graphql('query Test { viewer { login } }', 'test');
			assert.deepStrictEqual(response, data);
		});

		test(`${kind} does not read an HTTP error body`, async () => {
			requestService.nextResponse = {
				res: { statusCode: 500, headers: {} },
				get stream(): never { throw new Error('Error body must not be read'); },
			};
			await assert.rejects(request(), error => error instanceof GitHubApiError && error.statusCode === 500);
		});

		for (const body of ['', 'not-json', '{"message":"Validation Failed","errors":[{"message":"invalid schedule"}]}']) {
			test(`${kind} retains status-based HTTP errors for ${body || 'empty body'}`, async () => {
				requestService.nextResponse = {
					res: { statusCode: 422, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(body)),
				};
				await assert.rejects(request(), error => error instanceof GitHubApiError
					&& error.statusCode === 422
					&& error.message === `GitHub API request failed: POST ${kind === 'REST' ? '/repos/o/r/issues' : '/graphql'} (422)`);
			});
		}
	}

	for (const body of ['', '{"accepted":true}']) {
		test(`Copilot accepts 202 acknowledgements ${body ? 'with' : 'without'} a body`, async () => {
			defaultAccountService.currentDefaultAccount = {
				accountName: 'octocat', sessionId: 'session-1', enterprise: false,
				authenticationProvider: defaultAccountService.authenticationProvider,
			};
			requestService.nextResponse = {
				res: { statusCode: 202, headers: {} },
				stream: bufferToStream(VSBuffer.fromString(body)),
			};
			const response = await client.requestCopilot('POST', '/agents/tasks/id/steer', 'test', { accountName: 'octocat' });
			assert.deepStrictEqual({ data: response.data, statusCode: response.statusCode }, { data: undefined, statusCode: 202 });
		});
	}

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

	test('requires both the pinned account and requested scopes', async () => {
		defaultAccountService.currentDefaultAccount = {
			accountName: 'octocat',
			sessionId: 'session-1',
			enterprise: false,
			authenticationProvider: defaultAccountService.authenticationProvider,
		};
		authenticationService.sessions = [
			{ id: 'session-1', accessToken: 'token-pinned', account: { id: 'account-1', label: 'octocat' }, scopes: ['repo'] },
			{ id: 'session-other', accessToken: 'token-other', account: { id: 'other', label: 'other' }, scopes: ['repo', 'workflow'] },
		];
		const options = { accountName: 'octocat', authenticationScopes: ['repo', 'workflow'], createAuthenticationSession: false };
		await assert.rejects(client.request('GET', '/user/repos', 'test', options), GitHubAuthenticationError);
		const sentBeforeScopesMatched = requestService.lastOptions !== undefined;
		authenticationService.sessions = [
			{ ...authenticationService.sessions[0], scopes: ['repo', 'workflow'] },
			authenticationService.sessions[1],
		];
		await client.request('GET', '/user/repos', 'test', options);
		assert.deepStrictEqual({
			sentBeforeScopesMatched,
			authorization: requestService.lastOptions?.headers?.Authorization,
			signIns: authenticationService.createSessionCalls.length,
		}, { sentBeforeScopesMatched: false, authorization: 'token token-pinned', signIns: 0 });
	});

	for (const change of ['provider', 'host', 'missing host', 'session'] as const) {
		test(`rejects a pinned request when the ${change} changes during authentication`, async () => {
			const enterprise = change !== 'provider';
			if (enterprise) {
				defaultAccountService.authenticationProvider = { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true };
				defaultAccountService.gitHubBaseUrl = 'https://first.example.com';
			}
			defaultAccountService.currentDefaultAccount = {
				accountName: 'octocat', sessionId: 'session-1', enterprise,
				authenticationProvider: defaultAccountService.authenticationProvider,
			};
			const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
			authenticationService.getSessionsResult = sessions.p;
			let dispatches = 0;
			const options = { accountName: 'octocat', onDispatch: () => { dispatches++; } };
			const request = enterprise
				? client.request('POST', '/repos/o/r/issues', 'test', options)
				: client.requestCopilot('POST', '/agents/repos/o/r/automations', 'test', options);

			if (change === 'provider') {
				defaultAccountService.authenticationProvider = { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true };
				defaultAccountService.currentDefaultAccount = {
					...defaultAccountService.currentDefaultAccount, enterprise: true,
					authenticationProvider: defaultAccountService.authenticationProvider,
				};
			} else if (change === 'session') {
				defaultAccountService.currentDefaultAccount = { ...defaultAccountService.currentDefaultAccount, sessionId: 'another-session' };
			} else {
				defaultAccountService.gitHubBaseUrl = change === 'host' ? 'https://second.example.com' : undefined;
			}
			await sessions.complete(authenticationService.sessions);
			await assert.rejects(request, GitHubAuthenticationError);
			assert.deepStrictEqual({ request: requestService.lastOptions, dispatches }, { request: undefined, dispatches: 0 });
		});
	}

	test('allows distinct default and repository authentication sessions on an unchanged connection', async () => {
		defaultAccountService.currentDefaultAccount = {
			accountName: 'octocat', sessionId: 'default-session', enterprise: false,
			authenticationProvider: defaultAccountService.authenticationProvider,
		};
		const repositorySession = authenticationService.sessions[0];
		authenticationService.sessions = [
			{ ...repositorySession, id: 'default-session', scopes: ['read:user'] },
			{ ...repositorySession, account: { ...repositorySession.account, label: 'renamed-label' } },
		];
		let dispatches = 0;
		await client.requestCopilot('POST', '/agents/repos/o/r/automations', 'test', {
			accountName: 'octocat', onDispatch: () => { dispatches++; },
		});
		assert.deepStrictEqual({
			url: requestService.lastOptions?.url, dispatches,
		}, { url: 'https://api.githubcopilot.com/agents/repos/o/r/automations', dispatches: 1 });
	});

	for (const mismatch of ['account ID', 'authorization server', 'missing selected session'] as const) {
		test(`does not substitute a same-label token with ${mismatch}`, async () => {
			defaultAccountService.currentDefaultAccount = {
				accountName: 'octocat', sessionId: 'default-session', enterprise: false,
				authenticationProvider: defaultAccountService.authenticationProvider,
			};
			const selected = { ...authenticationService.sessions[0], id: 'default-session', scopes: ['read:user'], authorizationServer: URI.parse('https://github.com') };
			const candidate = {
				...selected, id: 'repo-session', scopes: ['repo'],
				account: { ...selected.account, id: mismatch === 'account ID' ? 'another-account' : selected.account.id },
				authorizationServer: URI.parse(mismatch === 'authorization server' ? 'https://enterprise.example.com' : 'https://github.com'),
			};
			authenticationService.sessions = mismatch === 'missing selected session' ? [candidate] : [candidate, selected];
			await assert.rejects(client.requestCopilot('POST', '/agents/repos/o/r/automations', 'test', {
				accountName: 'octocat', createAuthenticationSession: false,
			}), GitHubAuthenticationError);
			assert.deepStrictEqual({ request: requestService.lastOptions, signIns: authenticationService.createSessionCalls }, { request: undefined, signIns: [] });
		});
	}

	test('selects the matching identity instead of the first same-label repository session', async () => {
		defaultAccountService.currentDefaultAccount = {
			accountName: 'octocat', sessionId: 'default-session', enterprise: false,
			authenticationProvider: defaultAccountService.authenticationProvider,
		};
		const selected = { ...authenticationService.sessions[0], id: 'default-session', scopes: ['read:user'] };
		authenticationService.sessions = [
			{ ...selected, id: 'other-session', account: { id: 'other-account', label: 'octocat' }, scopes: ['repo'], accessToken: 'wrong-token' },
			selected,
			{ ...selected, id: 'repo-session', scopes: ['repo'], accessToken: 'selected-token' },
		];
		await client.request('GET', '/user/repos', 'test', { accountName: 'octocat' });
		assert.strictEqual(requestService.lastOptions?.headers?.Authorization, 'token selected-token');
	});

	for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
		test(`Copilot ${method} sets remote fallback policy without changing existing REST callers`, async () => {
			defaultAccountService.currentDefaultAccount = {
				accountName: 'octocat', sessionId: 'session-1', enterprise: false,
				authenticationProvider: defaultAccountService.authenticationProvider,
			};
			await client.requestCopilot(method, '/agents/automations/id', 'test', { accountName: 'octocat' });
			const copilot = requestService.lastOptions?.disableRemoteFallback;
			await client.request(method, '/repos/o/r', 'test');
			assert.deepStrictEqual({ copilot, rest: requestService.lastOptions?.disableRemoteFallback }, { copilot: method !== 'GET', rest: false });
		});
	}

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

	test('can authenticate before the selected enterprise URL is available', async () => {
		defaultAccountService.authenticationProvider = {
			id: 'github-enterprise',
			name: 'GitHub Enterprise',
			enterprise: true,
		};
		defaultAccountService.gitHubBaseUrl = undefined;
		authenticationService.sessions = [];

		await client.authenticate(['repo'], CancellationToken.None);

		assert.deepStrictEqual({
			created: authenticationService.createSessionCalls,
			request: requestService.lastOptions,
		}, {
			created: [['github-enterprise', ['repo'], { activateImmediate: true }]],
			request: undefined,
		});
	});

	test('does not use public endpoints when the enterprise URL is unavailable', async () => {
		defaultAccountService.authenticationProvider = {
			id: 'github-enterprise',
			name: 'GitHub Enterprise',
			enterprise: true,
		};
		defaultAccountService.gitHubBaseUrl = undefined;

		await assert.rejects(client.request('GET', '/repos/o/r/issues', 'test'), GitHubAuthenticationError);
		await assert.rejects(client.graphql('query Test { viewer { login } }', 'test'), GitHubAuthenticationError);
		assert.deepStrictEqual({
			request: requestService.lastOptions,
			providerIds: authenticationService.providerIds,
			enterpriseHost: client.enterpriseHost,
		}, {
			request: undefined,
			providerIds: [],
			enterpriseHost: undefined,
		});
	});

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
