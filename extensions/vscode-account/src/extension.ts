/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService, onDidChangeAccounts } from './AADHelper';

export async function activate(context: vscode.ExtensionContext) {

	const loginService = new AzureActiveDirectoryService();

	await loginService.initialize();

	vscode.authentication.registerAuthenticationProvider({
		id: 'MSA',
		displayName: 'Microsoft Account', // TODO localize
		onDidChangeAccounts: onDidChangeAccounts.event,
		getAccounts: () => Promise.resolve(loginService.accounts),
		login: async () => {
			try {
				await loginService.login();
				return loginService.accounts[0]!;
			} catch (e) {
				vscode.window.showErrorMessage(`Logging in failed: ${e}`);
				throw e;
			}
		},
		logout: async (id: string) => {
			return loginService.logout();
		}
	});

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
