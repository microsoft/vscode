/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccountClient } from '../../../../platform/github/common/account/accountClient.js';
import { AnonymousClient } from '../../../../platform/github/common/anonymous/anonymousClient.js';
import { ApiRequest, ApiResponse, IApiRequestProvider } from '../../../../platform/github/common/client/request.js';
import { parse } from '../../../../platform/github/common/client/schema.js';
import { GitHubAuthorizationContext, GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadGitHub } from '../../browser/mainThreadGitHub.js';
import { IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

const extensionId = 'vscode.configuration-editing';
const scopes = ['gist', 'user:email'];

function session(id: string, label: string): AuthenticationSession {
	return { id, accessToken: `secret-token-${id}`, account: { id: `account-${label}`, label }, scopes };
}

function gistResponse(id: string, files: Record<string, { content: string; truncated?: boolean }>) {
	return {
		id, node_id: `G_${id}`, url: `https://api.github.com/gists/${id}`, html_url: `https://gist.github.com/${id}`,
		git_pull_url: `https://gist.github.com/${id}.git`, git_push_url: `https://gist.github.com/${id}.git`,
		forks_url: `https://api.github.com/gists/${id}/forks`, commits_url: `https://api.github.com/gists/${id}/commits`,
		comments_url: `https://api.github.com/gists/${id}/comments`, public: false, description: null,
		files: Object.fromEntries(Object.entries(files).map(([filename, file]) => [filename, {
			filename, type: 'application/json', language: 'JSON', raw_url: `https://gist.githubusercontent.com/raw/${id}/${filename}`,
			size: file.content.length, truncated: file.truncated ?? false, content: file.content, encoding: 'utf-8',
		}])),
		truncated: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', comments: 0,
	};
}

suite('MainThreadGitHub', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ISetupOptions {
		readonly sessions?: readonly AuthenticationSession[];
		readonly lookupSessions?: () => Promise<readonly AuthenticationSession[]>;
		/** Sessions of the `github-enterprise` provider, which the proposal must never bind. */
		readonly enterpriseSessions?: readonly AuthenticationSession[];
		readonly respond?: (request: ApiRequest, signal: AbortSignal) => Promise<unknown>;
		readonly acquisitionGate?: () => Promise<void>;
	}

	function setup(options: ISetupOptions = {}) {
		const requests: ApiRequest[] = [];
		const acquisitions: GitHubAuthorizationContext[] = [];
		const released: string[] = [];
		const queriedProviders: string[] = [];
		const access = new Map<string, boolean | undefined>();
		const onDidInvalidate = store.add(new Emitter<void>());
		const onDidChangeAccess = store.add(new Emitter<{ providerId: string; accountName: string }>());
		const onDidUnregisterProvider = store.add(new Emitter<{ id: string; label: string }>());
		const provider: IApiRequestProvider = {
			request: async <T>(request: ApiRequest, signal: AbortSignal, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> => {
				requests.push(request);
				const data = await (options.respond ?? (async () => gistResponse('gist-id', { 'profile.json': { content: '{}' } })))(request, signal);
				return { data: parser?.(data), status: request.method === 'POST' ? 201 : 200 };
			},
		};
		const gitHubService = upcastPartial<IWorkbenchGitHubService>({
			acquireAccountApiClient: async authorization => {
				acquisitions.push(authorization);
				await options.acquisitionGate?.();
				return new AccountClient(authorization, { rest: provider, graphql: provider, onDidInvalidate: onDidInvalidate.event }, toDisposable(() => released.push(authorization.sessionId)));
			},
			acquireAnonymousApiClient: async () => {
				await options.acquisitionGate?.();
				return new AnonymousClient(provider, undefined, toDisposable(() => released.push('anonymous')));
			},
		});
		const authenticationService = upcastPartial<IAuthenticationService>({
			onDidUnregisterAuthenticationProvider: onDidUnregisterProvider.event,
			getSessions: async (providerId: string) => {
				queriedProviders.push(providerId);
				return providerId === 'github' ? options.lookupSessions?.() ?? options.sessions ?? [] : providerId === 'github-enterprise' ? options.enterpriseSessions ?? [] : [];
			},
		});
		const accessService = upcastPartial<IAuthenticationAccessService>({
			onDidChangeExtensionSessionAccess: onDidChangeAccess.event,
			isAccessAllowed: (providerId: string, accountName: string, extension: string) => access.get(`${providerId}/${accountName}/${extension}`),
		});
		const mainThread = store.add(new MainThreadGitHub(SingleProxyRPCProtocol(null), gitHubService, authenticationService, accessService, new NullLogService()));
		const allow = (accountName: string, allowed: boolean | undefined = true, extension = extensionId, providerId = 'github') => access.set(`${providerId}/${accountName}/${extension}`, allowed);
		return { mainThread, requests, acquisitions, released, queriedProviders, allow, onDidInvalidate, onDidChangeAccess, onDidUnregisterProvider };
	}

	test('binds exactly the selected session and creates a secret gist without exposing credentials', async () => {
		const { mainThread, requests, acquisitions, released, allow } = setup({
			sessions: [session('alice-session', 'alice'), session('bob-session', 'bob')],
			respond: async () => gistResponse('new-gist', { 'My Profile': { content: 'profile' } }),
		});
		allow('alice');
		allow('bob');

		const acquired = await mainThread.$getClient(1, extensionId, 'bob-session', CancellationToken.None);
		const request = { extra: 'unused', files: { 'My Profile': { content: 'profile', extra: 'unused' } } };
		const created = await mainThread.$createGist(1, request, CancellationToken.None);
		mainThread.$releaseClient(1);
		mainThread.$releaseClient(1);

		assert.deepStrictEqual({ acquired, created, acquisitions, requests, released, leaksToken: JSON.stringify([acquired, created]).includes('secret-token') }, {
			acquired: { kind: 'ok', value: undefined },
			created: {
				kind: 'ok', value: {
					id: 'new-gist', htmlUrl: 'https://gist.github.com/new-gist',
					files: [{ content: 'profile', isBinary: false, truncated: false }],
				},
			},
			acquisitions: [{ providerId: 'github', sessionId: 'bob-session', accountId: 'account-bob', scopes, authorizationServer: undefined }],
			requests: [{
				domain: 'gists', method: 'POST', path: '/gists', authentication: 'required', expectedStatus: 201,
				body: { public: false, files: { 'My Profile': { content: 'profile' } } },
				options: { caller: `extension.${extensionId}` },
			}],
			released: ['bob-session'],
			leaksToken: false,
		});
	});

	test('rejects unknown, stale, inaccessible and Enterprise-only sessions identically without acquiring', async () => {
		const { mainThread, acquisitions, queriedProviders, allow } = setup({
			sessions: [session('alice-session', 'alice'), session('bob-session', 'bob'), session('carol-session', 'carol')],
			enterpriseSessions: [session('enterprise-session', 'dave')],
		});
		allow('alice', true, 'other.extension');
		allow('bob', false);
		allow('dave', true, extensionId, 'github-enterprise');

		const results = [
			await mainThread.$getClient(1, extensionId, 'missing-session', CancellationToken.None),
			await mainThread.$getClient(2, extensionId, 'alice-session', CancellationToken.None),
			await mainThread.$getClient(3, extensionId, 'bob-session', CancellationToken.None),
			await mainThread.$getClient(4, extensionId, 'carol-session', CancellationToken.None),
			await mainThread.$getClient(5, extensionId, 'enterprise-session', CancellationToken.None),
			await mainThread.$getClient(6, extensionId, '', CancellationToken.None),
		];
		const afterwards = await mainThread.$getGist(2, 'gist-id', CancellationToken.None);

		const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
		assert.deepStrictEqual({ results, acquisitions, queriedProviders: [...new Set(queriedProviders)], afterwards }, {
			results: [unavailable, unavailable, unavailable, unavailable, unavailable, unavailable],
			acquisitions: [],
			queriedProviders: ['github'],
			afterwards: { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } },
		});
	});

	test('anonymous clients read gists in file order without credentials and cannot create gists', async () => {
		const { mainThread, requests, acquisitions, released } = setup({
			respond: async () => gistResponse('shared', { 'b.json': { content: 'first' }, 'a.json': { content: 'cut', truncated: true } }),
		});

		const acquired = await mainThread.$getAnonymousClient(1, extensionId, CancellationToken.None);
		const read = await mainThread.$getGist(1, 'shared', CancellationToken.None);
		const create = await mainThread.$createGist(1, { files: { 'a.json': { content: '{}' } } }, CancellationToken.None);
		mainThread.$releaseClient(1);

		assert.deepStrictEqual({ acquired, read, create, acquisitions, requests, released }, {
			acquired: { kind: 'ok', value: undefined },
			read: {
				kind: 'ok', value: {
					id: 'shared', htmlUrl: 'https://gist.github.com/shared',
					files: [
						{ content: 'first', isBinary: false, truncated: false },
						{ content: 'cut', isBinary: false, truncated: true },
					],
				},
			},
			create: { kind: 'error', error: { code: 'authentication', message: 'Creating a gist requires a client bound to a GitHub session.' } },
			acquisitions: [],
			requests: [{ domain: 'gists', method: 'GET', path: '/gists/shared', expectedStatus: 200, options: { caller: `extension.${extensionId}` } }],
			released: ['anonymous'],
		});
	});

	test('maps request failures to typed errors without response bodies and validates gist input', async () => {
		const failures = [
			new GitHubRequestError('Not Found', 'notFound', 404, 'secret response body'),
			new GitHubRequestError('Malformed', 'schema'),
			new GitHubRequestError('Busy', 'overloaded'),
			new Error('boom'),
		];
		const { mainThread, requests, allow } = setup({
			sessions: [session('alice-session', 'alice')],
			respond: async () => { throw failures.shift(); },
		});
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);

		const results = [
			await mainThread.$getGist(1, 'missing', CancellationToken.None),
			await mainThread.$getGist(1, 'malformed', CancellationToken.None),
			await mainThread.$getGist(1, 'busy', CancellationToken.None),
			await mainThread.$getGist(1, 'unexpected', CancellationToken.None),
			await mainThread.$getGist(1, '', CancellationToken.None),
			await mainThread.$createGist(1, { files: {} }, CancellationToken.None),
			await mainThread.$createGist(1, { files: { 'dir/name': { content: '' } } }, CancellationToken.None),
			await mainThread.$createGist(1, { files: { name: { content: 42 as unknown as string } } }, CancellationToken.None),
		];

		assert.deepStrictEqual({ results, requestCount: requests.length }, {
			results: [
				{ kind: 'error', error: { code: 'notFound', message: 'Not Found', status: 404 } },
				{ kind: 'error', error: { code: 'invalidResponse', message: 'Malformed', status: undefined } },
				{ kind: 'error', error: { code: 'rateLimit', message: 'Busy', status: undefined } },
				{ kind: 'error', error: { code: 'unknown', message: 'The GitHub request failed.' } },
				{ kind: 'error', error: { code: 'validation', message: 'A gist identifier is required.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": A gist must contain at least one file with non-empty names and no path separators.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": A gist must contain at least one file with non-empty names and no path separators.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": Invalid value at key "name": Invalid value at key "content": Expected a string' } },
			],
			requestCount: 4,
		});
	});

	test('cancels requests, and disposes clients whose acquisition was released or cancelled', async () => {
		const gate = new DeferredPromise<void>();
		const arrived = new DeferredPromise<void>();
		let arrivals = 0;
		let observedAbort = false;
		const { mainThread, released, allow } = setup({
			sessions: [session('alice-session', 'alice')],
			acquisitionGate: () => {
				if (++arrivals === 3) {
					arrived.complete();
				}
				return gate.p;
			},
			respond: (_request, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
				observedAbort = true;
				reject(signal.reason);
			})),
		});
		allow('alice');

		const releasedDuringAcquisition = mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		const cancellation = store.add(new CancellationTokenSource());
		const cancelledAcquisition = mainThread.$getAnonymousClient(2, extensionId, cancellation.token);
		const active = mainThread.$getClient(3, extensionId, 'alice-session', CancellationToken.None);
		await arrived.p;
		mainThread.$releaseClient(1);
		cancellation.cancel();
		gate.complete();
		const acquisitionResults = [await releasedDuringAcquisition, await cancelledAcquisition, await active];

		const requestCancellation = store.add(new CancellationTokenSource());
		const cancelledRequest = mainThread.$getGist(3, 'slow', requestCancellation.token);
		requestCancellation.cancel();
		const releasedRequest = mainThread.$getGist(3, 'slow', CancellationToken.None);
		await Promise.resolve();
		mainThread.$releaseClient(3);

		assert.deepStrictEqual({
			acquisitionResults,
			requestResults: [await cancelledRequest, await releasedRequest],
			observedAbort,
			afterRelease: await mainThread.$getGist(1, 'gist-id', CancellationToken.None),
			released: released.sort(),
		}, {
			acquisitionResults: [{ kind: 'canceled' }, { kind: 'canceled' }, { kind: 'ok', value: undefined }],
			requestResults: [{ kind: 'canceled' }, { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } }],
			observedAbort: true,
			afterRelease: { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } },
			released: ['alice-session', 'alice-session', 'anonymous'],
		});
	});

	test('invalidates clients when the session is revoked or the extension loses account access', async () => {
		const { mainThread, released, allow, onDidInvalidate, onDidChangeAccess } = setup({ sessions: [session('alice-session', 'alice'), session('bob-session', 'bob')] });
		allow('alice');
		allow('bob');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);

		onDidInvalidate.fire();
		const revoked = await mainThread.$getGist(1, 'gist-id', CancellationToken.None);

		await mainThread.$getClient(3, extensionId, 'bob-session', CancellationToken.None);
		onDidChangeAccess.fire({ providerId: 'github', accountName: 'alice' });
		const unaffected = await mainThread.$getGist(3, 'gist-id', CancellationToken.None);
		allow('bob', false);
		onDidChangeAccess.fire({ providerId: 'github', accountName: 'bob' });
		const accessRemoved = await mainThread.$getGist(3, 'gist-id', CancellationToken.None);
		allow('bob');
		await mainThread.$getClient(4, extensionId, 'bob-session', CancellationToken.None);
		allow('bob', false);
		const accessChangedWithoutEvent = await mainThread.$getGist(4, 'gist-id', CancellationToken.None);
		const anonymous = await mainThread.$getGist(2, 'gist-id', CancellationToken.None);

		const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
		assert.deepStrictEqual({ revoked, unaffected: unaffected.kind, accessRemoved, accessChangedWithoutEvent, anonymous: anonymous.kind, released: [...released] }, {
			revoked: unavailable,
			unaffected: 'ok',
			accessRemoved: unavailable,
			accessChangedWithoutEvent: unavailable,
			anonymous: 'ok',
			released: ['alice-session', 'bob-session', 'bob-session'],
		});
	});

	test('rechecks account access after pending acquisition', async () => {
		const gate = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const { mainThread, allow, released, requests } = setup({
			sessions: [session('alice-session', 'alice')],
			acquisitionGate: () => { started.complete(); return gate.p; },
		});
		allow('alice');
		const pending = mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await started.p;
		allow('alice', false);
		gate.complete();
		assert.deepStrictEqual({ result: await pending, released, requests }, {
			result: { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } },
			released: ['alice-session'],
			requests: [],
		});
	});

	test('cancels initial session lookups and invalidates clients on provider removal', async () => {
		const sessions = [session('alice-session', 'alice')];
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		let pendingLookup = false;
		const { mainThread, allow, acquisitions, released, onDidUnregisterProvider } = setup({
			lookupSessions: () => pendingLookup ? lookup.p : Promise.resolve(sessions),
		});
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);
		pendingLookup = true;
		try {
			const cancellation = store.add(new CancellationTokenSource());
			const cancelledLookup = mainThread.$getClient(3, extensionId, 'alice-session', cancellation.token);
			cancellation.cancel();
			const cancelled = await cancelledLookup;
			const pending = mainThread.$getClient(4, extensionId, 'alice-session', CancellationToken.None);
			onDidUnregisterProvider.fire({ id: 'github', label: 'GitHub' });
			const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
			assert.deepStrictEqual({
				cancelled,
				pending: await pending,
				active: await mainThread.$getGist(1, 'gist-id', CancellationToken.None),
				anonymous: (await mainThread.$getGist(2, 'gist-id', CancellationToken.None)).kind,
				acquisitions: acquisitions.length,
				released,
			}, {
				cancelled: { kind: 'canceled' },
				pending: unavailable,
				active: unavailable,
				anonymous: 'ok',
				acquisitions: 1,
				released: ['alice-session'],
			});
		} finally {
			lookup.complete(sessions);
		}
	});

	test('releases every client when the extension host connection is disposed', async () => {
		const { mainThread, released, allow } = setup({ sessions: [session('alice-session', 'alice')] });
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);

		mainThread.dispose();

		assert.deepStrictEqual({
			released: released.sort(),
			afterDispose: await mainThread.$getAnonymousClient(3, extensionId, CancellationToken.None),
		}, {
			released: ['alice-session', 'anonymous'],
			afterDispose: { kind: 'error', error: { code: 'unknown', message: 'The GitHub client could not be created.' } },
		});
	});
});
