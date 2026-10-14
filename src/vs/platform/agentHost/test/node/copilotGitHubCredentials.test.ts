/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotGitHubCredentials, CopilotGitHubSessionCredentials } from '../../node/copilot/copilotGitHubCredentials.js';

suite('CopilotGitHubCredentials', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('coalesces refreshes and refreshes short-lived tokens before returning them', async () => {
		let now = 1_000_000;
		const credentials = disposables.add(new CopilotGitHubCredentials(() => now));
		credentials.update('initial-token', 7200);
		let refreshRequests = 0;
		disposables.add(credentials.onDidRequestRefresh(() => refreshRequests++));

		const firstRefresh = credentials.tokenProvider({ host: 'github.com', sessionId: 'session', reason: 'refresh' });
		const secondRefresh = credentials.tokenProvider({ host: 'github.com', sessionId: 'session', reason: 'refresh' });
		assert.strictEqual(refreshRequests, 1);

		now += 1000;
		credentials.update('refreshed-token', 7200);
		const refreshedTokens = await Promise.all([firstRefresh, secondRefresh]);
		credentials.update('short-token', 3600);
		const preflightRefresh = credentials.tokenProvider({ host: 'github.com', sessionId: 'session', reason: 'initial' });
		assert.strictEqual(refreshRequests, 2);
		credentials.update('preflight-refreshed-token', 7200);

		assert.deepStrictEqual({
			refreshedTokens,
			preflightToken: await preflightRefresh,
		}, {
			refreshedTokens: [
				{ kind: 'token', accessToken: 'refreshed-token', expiresIn: 7200 },
				{ kind: 'token', accessToken: 'refreshed-token', expiresIn: 7200 },
			],
			preflightToken: { kind: 'token', accessToken: 'preflight-refreshed-token', expiresIn: 7200 },
		});
	});

	test('cancels a refresh that does not complete in time', async () => {
		const credentials = disposables.add(new CopilotGitHubCredentials(() => 1_000_000, 0));
		credentials.update('expiring-token', 3600);
		let refreshRequests = 0;
		disposables.add(credentials.onDidRequestRefresh(() => refreshRequests++));

		const token = await credentials.tokenProvider({ host: 'github.com', sessionId: 'session', reason: 'initial' });

		assert.deepStrictEqual({ refreshRequests, token }, {
			refreshRequests: 1,
			token: { kind: 'cancelled' },
		});
	});

	test('captures credential mode for each SDK session', () => {
		const credentials = disposables.add(new CopilotGitHubCredentials());
		credentials.update('static-token', undefined);
		const staticSession = credentials.forSession();
		const clientAuthenticatedSession = CopilotGitHubSessionCredentials.fromClientAuthentication(credentials.token);
		const modeChange = credentials.update('provider-token', 7200);
		const providerSession = credentials.forSession();

		staticSession.updateStaticToken('updated-static-token');

		assert.deepStrictEqual({
			modeChange,
			staticSession: {
				usesStaticToken: staticSession.usesStaticToken,
				token: staticSession.token,
				options: staticSession.sdkSessionOptions,
			},
			clientAuthenticatedSession: {
				usesStaticToken: clientAuthenticatedSession.usesStaticToken,
				token: clientAuthenticatedSession.token,
				options: clientAuthenticatedSession.sdkSessionOptions,
			},
			providerSession: {
				usesStaticToken: providerSession.usesStaticToken,
				token: providerSession.token,
				hasProvider: providerSession.sdkSessionOptions.gitHubTokenProvider !== undefined,
			},
		}, {
			modeChange: { tokenChanged: true, modeChanged: true },
			staticSession: {
				usesStaticToken: true,
				token: 'updated-static-token',
				options: { gitHubToken: 'updated-static-token' },
			},
			clientAuthenticatedSession: {
				usesStaticToken: true,
				token: 'static-token',
				options: { gitHubToken: undefined },
			},
			providerSession: {
				usesStaticToken: false,
				token: 'provider-token',
				hasProvider: true,
			},
		});
	});

	test('scoped sessions do not follow legacy token changes or another session pin', () => runWithFakedTimers({}, async () => {
		const legacy = disposables.add(new CopilotGitHubCredentials());
		legacy.update('desktop', undefined);
		const resource = 'https://api.github.com';
		const expiresAt = Date.now() + 3_600_000;
		const first = CopilotGitHubSessionCredentials.fromCredential({ resource, token: 'first', expiresAt, revision: 1 });
		const second = CopilotGitHubSessionCredentials.fromCredential({ resource, token: 'second', expiresAt, revision: 1 });
		const request = { host: 'github.com', sessionId: 'session', reason: 'initial' as const };
		const firstProvider = first.sdkSessionOptions.gitHubTokenProvider!;
		legacy.update('desktop-rotated', undefined);
		assert.deepStrictEqual({
			legacy: legacy.token,
			first: await firstProvider(request),
			firstToken: first.token,
			second: await second.sdkSessionOptions.gitHubTokenProvider!(request),
			usesStaticToken: first.usesStaticToken,
			usesScopedCredential: first.usesScopedCredential,
		}, {
			legacy: 'desktop-rotated',
			first: { kind: 'token', accessToken: 'first', expiresIn: 3600 },
			firstToken: 'first',
			second: { kind: 'token', accessToken: 'second', expiresIn: 3600 },
			usesStaticToken: false,
			usesScopedCredential: true,
		});
		assert.throws(() => first.updateStaticToken('desktop'), /provider-backed/);
	}));

	test('scoped credentials without a deadline use explicit static SDK authentication without joining legacy updates', () => {
		const session = CopilotGitHubSessionCredentials.fromCredential({
			resource: 'https://api.github.com', token: 'captured', expiresAt: undefined, revision: 1,
		});
		assert.deepStrictEqual({
			options: session.sdkSessionOptions,
			token: session.token,
			usesStaticToken: session.usesStaticToken,
			usesScopedCredential: session.usesScopedCredential,
		}, {
			options: { gitHubToken: 'captured' }, token: 'captured', usesStaticToken: false, usesScopedCredential: true,
		});
	});

	test('a captured scoped credential remains available to in-flight work only until its deadline', () => runWithFakedTimers({}, async () => {
		const session = CopilotGitHubSessionCredentials.fromCredential({
			resource: 'https://api.github.com', token: 'captured', expiresAt: Date.now() + 1_000, revision: 1,
		});
		const provider = session.sdkSessionOptions.gitHubTokenProvider!;
		const request = { host: 'github.com', sessionId: 'session', reason: 'refresh' as const };
		const before = await provider(request);
		await timeout(1_001);
		assert.deepStrictEqual({ before, after: await provider(request), token: session.token }, {
			before: { kind: 'token', accessToken: 'captured', expiresIn: 1 },
			after: { kind: 'cancelled' },
			token: undefined,
		});
	}));

	test('observed revocation cancels a pinned SDK callback without acquiring another credential', async () => {
		let usable = true;
		const session = CopilotGitHubSessionCredentials.fromCredential({
			resource: 'https://api.github.com', token: 'captured', expiresAt: Date.now() + 3_600_000, revision: 1,
			isUsable: () => usable,
		});
		const provider = session.sdkSessionOptions.gitHubTokenProvider!;
		usable = false;
		assert.deepStrictEqual({
			token: session.token,
			callback: await provider({ host: 'github.com', sessionId: 'session', reason: 'refresh' }),
		}, { token: undefined, callback: { kind: 'cancelled' } });
	});
});
