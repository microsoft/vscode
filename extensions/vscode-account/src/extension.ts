/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService, onDidChangeSessions } from './AADHelper';

export async function activate(_: vscode.ExtensionContext) {

	const loginService = new AzureActiveDirectoryService();

	await loginService.initialize();

	vscode.authentication.registerAuthenticationProvider({
		id: 'MSA',
		displayName: 'Microsoft',
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: () => Promise.resolve(loginService.sessions),
		login: async (scopes: string[]) => {
			try {
				await loginService.login(scopes.sort().join(' '));
				return loginService.sessions[0]!;
			} catch (e) {
				vscode.window.showErrorMessage(`Logging in failed: ${e}`);
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
