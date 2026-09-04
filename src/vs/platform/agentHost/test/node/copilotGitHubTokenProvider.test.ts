/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotGitHubTokenProvider } from '../../node/copilot/copilotGitHubTokenProvider.js';

suite('CopilotGitHubTokenProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('coalesces refreshes and refreshes short-lived tokens before returning them', async () => {
		let now = 1_000_000;
		const tokenProvider = disposables.add(new CopilotGitHubTokenProvider(() => now));
		tokenProvider.updateToken('initial-token', 7200);
		let refreshRequests = 0;
		disposables.add(tokenProvider.onDidRequestRefresh(() => refreshRequests++));

		const firstRefresh = tokenProvider.provideToken({ host: 'github.com', sessionId: 'session', reason: 'refresh' });
		const secondRefresh = tokenProvider.provideToken({ host: 'github.com', sessionId: 'session', reason: 'refresh' });
		assert.strictEqual(refreshRequests, 1);

		now += 1000;
		tokenProvider.updateToken('refreshed-token', 7200);
		const refreshedTokens = await Promise.all([firstRefresh, secondRefresh]);
		tokenProvider.updateToken('short-token', 3600);
		const preflightRefresh = tokenProvider.provideToken({ host: 'github.com', sessionId: 'session', reason: 'initial' });
		assert.strictEqual(refreshRequests, 2);
		tokenProvider.updateToken('preflight-refreshed-token', 7200);

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
});
