/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getGitHubCredential, IDefaultAccount } from '../../common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('DefaultAccount', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getGitHubCredential returns the GitHub account, and nothing without an account', () => {
		const account: IDefaultAccount = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
			accountName: 'octocat',
			sessionId: 'session',
			enterprise: false,
		};

		assert.deepStrictEqual(
			[getGitHubCredential(account), getGitHubCredential(null), getGitHubCredential(undefined)],
			[account, undefined, undefined],
		);
	});
});
