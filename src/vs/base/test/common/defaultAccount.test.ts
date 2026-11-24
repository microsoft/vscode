/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { asGitHubAccount, IDefaultAccount } from '../../common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('asGitHubAccount', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function account(providerId: string): IDefaultAccount {
		return {
			authenticationProvider: { id: providerId, name: providerId, enterprise: false },
			accountName: 'alice',
			sessionId: 'session',
			enterprise: false,
		};
	}

	test('only GitHub accounts are returned', () => {
		assert.deepStrictEqual({
			none: asGitHubAccount(null),
			missing: asGitHubAccount(undefined),
			microsoft: asGitHubAccount(account('microsoft')),
			github: asGitHubAccount(account('github'))?.authenticationProvider.id,
			enterprise: asGitHubAccount(account('github-enterprise'))?.authenticationProvider.id,
		}, {
			none: undefined,
			missing: undefined,
			microsoft: undefined,
			github: 'github',
			enterprise: 'github-enterprise',
		});
	});
});
