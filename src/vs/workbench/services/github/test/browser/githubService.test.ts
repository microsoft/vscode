/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AuthenticationSession, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubTokenProvider } from '../../browser/githubService.js';

suite('Workbench GitHub service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses a repo-capable session with additional scopes', async () => {
		const sessions: AuthenticationSession[] = [{
			id: 'session',
			accessToken: 'token',
			account: { id: 'account', label: 'Account' },
			scopes: ['repo', 'user:email'],
		}];
		const requestedScopes: (readonly string[] | undefined)[] = [];
		const tokenProvider = new WorkbenchGitHubTokenProvider(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
				override async getSessions(_id: string, scopes?: readonly string[]): Promise<readonly AuthenticationSession[]> {
					requestedScopes.push(scopes);
					return sessions;
				}
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override readonly currentDefaultAccount = null;
				override getDefaultAccountAuthenticationProvider() {
					return { id: 'github', name: 'GitHub', enterprise: false };
				}
				override async getDefaultAccount() {
					return null;
				}
			}(),
			new NullLogService(),
		);

		assert.deepStrictEqual({
			token: await tokenProvider.getToken(),
			requestedScopes,
		}, {
			token: 'token',
			requestedScopes: [[]],
		});
	});
});
