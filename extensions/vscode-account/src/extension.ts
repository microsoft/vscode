/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService, onDidChangeSessions } from './AADHelper';
import * as nls from 'vscode-nls';
import TelemetryReporter from 'vscode-extension-telemetry';

const localize = nls.loadMessageBundle();

export const DEFAULT_SCOPES = 'https://management.core.windows.net/.default offline_access';

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
	const telemetryReporter = new TelemetryReporter(name, version, aiKey);

	const loginService = new AzureActiveDirectoryService();

	await loginService.initialize();

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider({
		id: 'microsoft',
		displayName: 'Microsoft',
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: () => Promise.resolve(loginService.sessions),
		login: async (scopes: string[]) => {
			try {
				telemetryReporter.sendTelemetryEvent('login');
				await loginService.login(scopes.sort().join(' '));
				const session = loginService.sessions[loginService.sessions.length - 1];
				onDidChangeSessions.fire({ added: [session.id], removed: [], changed: [] });
				return loginService.sessions[0]!;
			} catch (e) {
				telemetryReporter.sendTelemetryEvent('loginFailed');
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
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('microsoft.signin', () => {
		return loginService.login(DEFAULT_SCOPES);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('microsoft.signout', async () => {
		const sessions = loginService.sessions;
		if (sessions.length === 0) {
			return;
		}

		if (sessions.length === 1) {
			const id = loginService.sessions[0].id;
			await loginService.logout(id);
			onDidChangeSessions.fire({ added: [], removed: [id], changed: [] });
			vscode.window.showInformationMessage(localize('signedOut', "Successfully signed out."));
			return;
		}

		const selectedSession = await vscode.window.showQuickPick(sessions.map(session => {
			return {
				id: session.id,
				label: session.accountName
			};
		}));

		if (selectedSession) {
			await loginService.logout(selectedSession.id);
			onDidChangeSessions.fire({ added: [], removed: [selectedSession.id], changed: [] });
			vscode.window.showInformationMessage(localize('signedOut', "Successfully signed out."));
			return;
		}
	}));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
