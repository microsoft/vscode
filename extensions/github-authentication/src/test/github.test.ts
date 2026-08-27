/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthenticationProvider } from '../github';

interface TestGitHubAuthenticationProvider {
	readonly _keychain: {
		getToken(): Promise<string>;
		deleteToken(): Promise<void>;
	};
	readonly _githubServer: {
		getUserInfo(token: string): Promise<{ id: string; accountName: string; avatarUrl: string | undefined }>;
	};
	readonly _logger: {
		error(message: string): void;
		info(message: string): void;
		trace(message: string): void;
	};
	readSessions(): Promise<vscode.AuthenticationSession[]>;
	storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void>;
}

suite('GitHub session persistence', () => {
	test('does not loop when Codespaces secret storage drops hydrated account data', async () => {
		const storedSessions = JSON.stringify([{
			id: 'session-id',
			scopes: ['repo'],
			accessToken: 'access-token'
		}]);
		let userInfoRequests = 0;
		let secretWrites = 0;
		const secretChangeReads: Promise<vscode.AuthenticationSession[]>[] = [];

		const provider: TestGitHubAuthenticationProvider = {
			_keychain: {
				getToken: async () => storedSessions,
				deleteToken: async () => { }
			},
			_githubServer: {
				getUserInfo: async _token => {
					userInfoRequests++;
					return {
						id: 'account-id',
						accountName: 'octocat',
						avatarUrl: 'https://avatars.githubusercontent.com/u/1'
					};
				}
			},
			_logger: {
				error: _message => { },
				info: _message => { },
				trace: _message => { }
			},
			readSessions: GitHubAuthenticationProvider.prototype['readSessions'],
			storeSessions: async _sessions => {
				secretWrites++;
				// Browser secret storage fires a change event for every write. The Codespaces
				// provider then exposes the original accountless session on the next read.
				if (secretWrites === 1) {
					secretChangeReads.push(provider.readSessions());
				}
			}
		};

		const sessions = await provider.readSessions();
		await Promise.all(secretChangeReads);

		assert.deepStrictEqual({
			account: {
				id: sessions[0].account.id,
				label: sessions[0].account.label,
				icon: sessions[0].account.icon?.toString()
			},
			userInfoRequests,
			secretWrites
		}, {
			account: {
				id: 'account-id',
				label: 'octocat',
				icon: 'https://avatars.githubusercontent.com/u/1'
			},
			userInfoRequests: 1,
			secretWrites: 0
		});
	});
});
