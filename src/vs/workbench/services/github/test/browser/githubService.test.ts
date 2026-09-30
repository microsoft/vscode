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
import { IFetchService } from '../../../../../platform/request/common/fetch.js';
import { AuthenticationSession, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubService, WorkbenchGitHubTokenProvider } from '../../browser/githubService.js';

suite('Workbench GitHub service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('injects the platform executor without changing engine request options', async () => {
		const requests: Request[] = [];
		const service = store.add(new WorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override getDefaultAccountAuthenticationProvider() {
					return { id: 'github', name: 'GitHub', enterprise: false };
				}
			}(),
			new NullLogService(),
			new class extends mock<IFetchService>() {
				override async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
					requests.push(new Request(input, init));
					return new Response('{"value":1}', { headers: { etag: '"one"' } });
				}
			}(),
		));
		const result = await service.transport.rest<{ value: number }>(
			{ host: 'github.com', accountId: 'account' },
			'token',
			{ method: 'GET', url: 'https://api.github.com/resource' },
			new AbortController().signal,
		);
		assert.deepStrictEqual({
			data: result.data,
			requests: requests.map(request => ({
				url: request.url, method: request.method, authorization: request.headers.get('authorization'),
				redirect: request.redirect, cache: request.cache,
			})),
		}, {
			data: { value: 1 },
			requests: [{ url: 'https://api.github.com/resource', method: 'GET', authorization: 'Bearer token', redirect: 'manual', cache: 'no-store' }],
		});
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
