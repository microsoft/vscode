/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotGitHubCredentials } from '../../node/copilot/copilotGitHubCredentials.js';

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
			providerSession: {
				usesStaticToken: false,
				token: 'provider-token',
				hasProvider: true,
			},
		});
	});
});
