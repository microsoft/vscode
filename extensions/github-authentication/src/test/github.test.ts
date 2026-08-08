/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	GitHubEnterpriseAuthenticationProviderEntry,
	GitHubEnterpriseAuthenticationProviderRouter,
	getAuthorizationServer
} from '../github';

class TestAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly calls: Array<{ operation: string; account?: vscode.AuthenticationSessionAccountInformation }> = [];

	constructor(private readonly sessions: vscode.AuthenticationSession[]) { }

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}

	getSessions(_scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions): Thenable<vscode.AuthenticationSession[]> {
		this.calls.push({ operation: 'getSessions', account: options?.account });
		return Promise.resolve(this.sessions);
	}

	createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions): Thenable<vscode.AuthenticationSession> {
		this.calls.push({ operation: 'createSession', account: options?.account });
		return Promise.resolve({
			id: 'created',
			accessToken: 'token',
			account: options?.account ?? { id: 'created-account', label: 'created-user' },
			scopes
		});
	}

	removeSession(sessionId: string): Thenable<void> {
		this.calls.push({ operation: `removeSession:${sessionId}` });
		return Promise.resolve();
	}
}

suite('GitHubEnterpriseAuthenticationProviderRouter', () => {
	const defaultUri = vscode.Uri.parse('https://github.example.com');
	const copilotUri = vscode.Uri.parse('https://copilot.example.com/');
	const defaultSession: vscode.AuthenticationSession = {
		id: 'default-session',
		accessToken: 'default-token',
		account: { id: '1', label: 'octocat' },
		scopes: ['repo']
	};
	const copilotSession: vscode.AuthenticationSession = {
		id: 'copilot-session',
		accessToken: 'copilot-token',
		account: { id: '1', label: 'octocat' },
		scopes: ['repo']
	};
	let defaultProvider: TestAuthenticationProvider;
	let copilotProvider: TestAuthenticationProvider;
	let router: GitHubEnterpriseAuthenticationProviderRouter;

	setup(() => {
		defaultProvider = new TestAuthenticationProvider([defaultSession]);
		copilotProvider = new TestAuthenticationProvider([copilotSession]);
		const entries: GitHubEnterpriseAuthenticationProviderEntry[] = [
			{
				ghesUri: defaultUri,
				authorizationServer: getAuthorizationServer(defaultUri),
				provider: defaultProvider,
				isDefault: true
			},
			{
				ghesUri: copilotUri,
				authorizationServer: getAuthorizationServer(copilotUri),
				provider: copilotProvider,
				isDefault: false
			}
		];
		router = new GitHubEnterpriseAuthenticationProviderRouter(entries);
	});

	teardown(() => router.dispose());

	test('routes requests by authorization server', async () => {
		const sessions = await router.getSessions(['repo'], {
			authorizationServer: getAuthorizationServer(copilotUri)
		});

		assert.deepStrictEqual({
			sessions,
			defaultCalls: defaultProvider.calls,
			copilotCalls: copilotProvider.calls
		}, {
			sessions: [{
				...copilotSession,
				account: {
					id: 'copilot.example.com:1',
					label: 'octocat (copilot.example.com)'
				}
			}],
			defaultCalls: [],
			copilotCalls: [{ operation: 'getSessions', account: undefined }]
		});
	});

	test('aggregates accounts across authorization servers', async () => {
		const sessions = await router.getSessions(undefined, {});

		assert.deepStrictEqual(sessions, [
			defaultSession,
			{
				...copilotSession,
				account: {
					id: 'copilot.example.com:1',
					label: 'octocat (copilot.example.com)'
				}
			}
		]);
	});

	test('routes decorated accounts back to their authorization server', async () => {
		const session = await router.createSession(['repo'], {
			authorizationServer: getAuthorizationServer(copilotUri),
			account: {
				id: 'copilot.example.com:1',
				label: 'octocat (copilot.example.com)'
			}
		});

		assert.deepStrictEqual({
			session,
			calls: copilotProvider.calls
		}, {
			session: {
				id: 'created',
				accessToken: 'token',
				account: {
					id: 'copilot.example.com:1',
					label: 'octocat (copilot.example.com)'
				},
				scopes: ['repo']
			},
			calls: [{
				operation: 'createSession',
				account: { id: '1', label: 'octocat' }
			}]
		});
	});

	test('removes the session only from its owning authorization server', async () => {
		await router.removeSession('copilot-session');

		assert.deepStrictEqual({
			defaultCalls: defaultProvider.calls,
			copilotCalls: copilotProvider.calls
		}, {
			defaultCalls: [{ operation: 'getSessions', account: undefined }],
			copilotCalls: [
				{ operation: 'getSessions', account: undefined },
				{ operation: 'removeSession:copilot-session', account: undefined }
			]
		});
	});

	test('rejects unsupported authorization servers', async () => {
		await assert.rejects(
			router.getSessions(['repo'], {
				authorizationServer: vscode.Uri.parse('https://unsupported.example.com/login/oauth')
			}),
			/Unsupported GitHub Enterprise authorization server/
		);
	});

	test('normalizes authorization servers', () => {
		assert.strictEqual(
			getAuthorizationServer(vscode.Uri.parse('https://copilot.example.com/enterprise/?ignored=true#fragment')).toString(),
			'https://copilot.example.com/enterprise/login/oauth'
		);
	});
});
