/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTransport.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AuthenticationSession, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubService, WorkbenchGitHubTokenProvider } from '../../browser/githubService.js';

suite('Workbench GitHub service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('enterprise endpoints require an available URL', () => {
		let baseUrl: string | undefined = 'https://tenant.ghe.com/';
		const service = store.add(new WorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override getDefaultAccountAuthenticationProvider() {
					return { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true };
				}
				override resolveGitHubUrl(path: string): string | undefined {
					return baseUrl ? `${baseUrl}${path}` : undefined;
				}
			}(),
			new NullLogService(),
		));
		const endpoints = [service.endpoint.getApiBaseUri(), service.endpoint.getGraphQlUri()];
		baseUrl = undefined;

		assert.deepStrictEqual(endpoints, ['https://api.tenant.ghe.com', 'https://api.tenant.ghe.com/graphql']);
		assert.throws(() => service.endpoint.getApiBaseUri(), GitHubRequestError);
		assert.throws(() => service.endpoint.getGraphQlUri(), GitHubRequestError);
	});

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
