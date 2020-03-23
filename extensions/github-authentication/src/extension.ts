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
		id: 'github',
		displayName: 'GitHub',
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: () => Promise.resolve(loginService.sessions),
		login: async (scopeList: string[]) => {
			try {
				const session = await loginService.login(scopeList.join(' '));
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

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
