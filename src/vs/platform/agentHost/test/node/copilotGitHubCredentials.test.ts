/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AhpErrorCodes } from '../../common/state/sessionProtocol.js';
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

	test('scoped sessions do not follow legacy token changes or another session pin', () => {
		const legacy = disposables.add(new CopilotGitHubCredentials());
		legacy.update('desktop', undefined);
		const resource = 'https://api.github.com';
		const expiresAt = Date.now() + 3_600_000;
		const first = CopilotGitHubSessionCredentials.fromCredential({ resource, token: 'first', expiresAt, revision: 1 });
		const second = CopilotGitHubSessionCredentials.fromCredential({ resource, token: 'second', expiresAt, revision: 1 });
		legacy.update('desktop-rotated', undefined);
		assert.deepStrictEqual({
			legacy: legacy.token,
			first: first.sdkSessionOptions,
			firstToken: first.token,
			second: second.sdkSessionOptions,
			usesStaticToken: first.usesStaticToken,
			usesScopedCredential: first.usesScopedCredential,
		}, {
			legacy: 'desktop-rotated',
			first: { gitHubToken: 'first' },
			firstToken: 'first',
			second: { gitHubToken: 'second' },
			usesStaticToken: false,
			usesScopedCredential: true,
		});
		assert.throws(() => first.updateStaticToken('desktop'), /provider-backed/);
	});

	for (const expiresIn of [1, 60, 3599, 3600]) {
		test(`scoped credentials with ${expiresIn} seconds remaining use explicit static SDK authentication`, () => {
			const session = CopilotGitHubSessionCredentials.fromCredential({
				resource: 'https://api.github.com', token: 'captured', expiresAt: Date.now() + expiresIn * 1000, revision: 1,
			});
			assert.deepStrictEqual({
				options: session.sdkSessionOptions,
				usesStaticToken: session.usesStaticToken,
				usesScopedCredential: session.usesScopedCredential,
			}, {
				options: { gitHubToken: 'captured' }, usesStaticToken: false, usesScopedCredential: true,
			});
		});
	}

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

	test('an expired captured credential cannot launch another SDK session', () => runWithFakedTimers({}, async () => {
		const session = CopilotGitHubSessionCredentials.fromCredential({
			resource: 'https://api.github.com', token: 'captured', expiresAt: Date.now() + 1_000, revision: 1,
		});
		const before = session.sdkSessionOptions;
		await timeout(1_001);
		assert.throws(() => session.sdkSessionOptions, { code: AhpErrorCodes.AuthRequired });
		assert.deepStrictEqual({ before, token: session.token }, {
			before: { gitHubToken: 'captured' },
			token: undefined,
		});
	}));

	test('observed revocation prevents a scoped SDK launch without acquiring another credential', () => {
		let usable = true;
		const session = CopilotGitHubSessionCredentials.fromCredential({
			resource: 'https://api.github.com', token: 'captured', expiresAt: Date.now() + 3_600_000, revision: 1,
			isUsable: () => usable,
		});
		usable = false;
		assert.throws(() => session.sdkSessionOptions, { code: AhpErrorCodes.AuthRequired });
		assert.strictEqual(session.token, undefined);
	});
});
