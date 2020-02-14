/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, onDidChangeSessions } from './github';
import { uriHandler } from './githubServer';
import Logger from './common/logger';

export async function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
	const loginService = new GitHubAuthenticationProvider();

	await loginService.initialize();

	vscode.authentication.registerAuthenticationProvider({
		id: 'GitHub',
		displayName: 'GitHub',
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: () => Promise.resolve(loginService.sessions),
		login: async (scopes: string[]) => {
			try {
				const session = await loginService.login(scopes.join(' '));
				Logger.info('Login success!');
				return session;
			} catch (e) {
				vscode.window.showErrorMessage(`Sign in failed: ${e}`);
				Logger.error(e);
				throw e;
			}
		},
		logout: async (id: string) => {
			return loginService.logout(id);
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('githubAuth.signIn', async (scopes) => {
		const resultingSession = await loginService.login(scopes || 'user:email');
		vscode.window.showInformationMessage(`Signed in as ${resultingSession.accountName}`);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('githubAuth.signOut', async () => {
		const sessions = loginService.sessions;
		if (sessions.length === 0) {
			return;
		}

		if (sessions.length === 1) {
			return loginService.logout(sessions[0].id);
		}

		// Show quick pick if there is more than one session
		const result = await vscode.window.showQuickPick(sessions.map(session => {
			return {
				label: session.accountName,
				id: session.id
			};
		}));

		if (result) {
			return loginService.logout(result.id);
		}
	}));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
