/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, onDidChangeSessions } from './github';
import { uriHandler } from './githubServer';
import Logger from './common/logger';
import TelemetryReporter from 'vscode-extension-telemetry';
import { GitExtension, CredentialsProvider, Credentials } from './typings/git';

class GitHubCredentialProvider implements CredentialsProvider {

	async getCredentials(host: vscode.Uri): Promise<Credentials | undefined> {
		if (!/github\.com/i.test(host.authority)) {
			return;
		}

		const session = await this.getSession();
		return { username: session.account.id, password: await session.getAccessToken() };
	}

	private async getSession(): Promise<vscode.AuthenticationSession> {
		const authenticationSessions = await vscode.authentication.getSessions('github', ['repo']);

		if (authenticationSessions.length) {
			return await authenticationSessions[0];
		} else {
			return await vscode.authentication.login('github', ['repo']);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
	const telemetryReporter = new TelemetryReporter(name, version, aiKey);

	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
	const loginService = new GitHubAuthenticationProvider();

	await loginService.initialize();

	vscode.authentication.registerAuthenticationProvider({
		id: 'github',
		displayName: 'GitHub',
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: () => Promise.resolve(loginService.sessions),
		login: async (scopeList: string[]) => {
			try {
				telemetryReporter.sendTelemetryEvent('login');
				const session = await loginService.login(scopeList.sort().join(' '));
				Logger.info('Login success!');
				onDidChangeSessions.fire({ added: [session.id], removed: [], changed: [] });
				return session;
			} catch (e) {
				telemetryReporter.sendTelemetryEvent('loginFailed');
				vscode.window.showErrorMessage(`Sign in failed: ${e}`);
				Logger.error(e);
				throw e;
			}
		},
		logout: async (id: string) => {
			try {
				telemetryReporter.sendTelemetryEvent('logout');
				await loginService.logout(id);
				onDidChangeSessions.fire({ added: [], removed: [id], changed: [] });
			} catch (e) {
				telemetryReporter.sendTelemetryEvent('logoutFailed');
				vscode.window.showErrorMessage(`Sign out failed: ${e}`);
				Logger.error(e);
				throw e;
			}
		}
	});

	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
	const gitAPI = gitExtension.getAPI(1);
	context.subscriptions.push(gitAPI.registerCredentialsProvider(new GitHubCredentialProvider()));
}

// this method is called when your extension is deactivated
export function deactivate() { }
