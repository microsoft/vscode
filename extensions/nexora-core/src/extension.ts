/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';
import { PlatformBrowserProvider } from './platformPanel';
import { getBackendClient } from './services/backendClient';

export function activate(context: vscode.ExtensionContext) {
	console.log('Nexora Core extension is now active!');

	const chatProvider = new ChatPanelProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('nexora.chatPanel', chatProvider)
	);

	const platformProvider = new PlatformBrowserProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('nexora.platformBrowser', platformProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('nexora.openChat', () => {
			vscode.commands.executeCommand('nexora.chatPanel.focus');
		}),
		vscode.commands.registerCommand('nexora.refreshPlatforms', async () => {
			await platformProvider.refresh();
			const count = platformProvider.getPlatformCount();
			const connected = platformProvider.isBackendConnected();
			if (connected) {
				vscode.window.showInformationMessage(`Platforms refreshed! (${count} platforms from backend)`);
			} else {
				vscode.window.showWarningMessage(`Using cached platforms (${count}). Backend offline.`);
			}
		}),
		vscode.commands.registerCommand('nexora.checkBackend', async () => {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();
			if (isConnected) {
				vscode.window.showInformationMessage('Backend is connected! API docs: http://localhost:8000/docs');
			} else {
				vscode.window.showErrorMessage('Backend is offline. Start it with: uvicorn app.main:app --reload --port 8000');
			}
		})
	);

	checkBackendOnStartup();
}

async function checkBackendOnStartup(): Promise<void> {
	const client = getBackendClient();
	const isConnected = await client.checkHealth();

	if (isConnected) {
		vscode.window.showInformationMessage('Nexora: Backend connected');
	} else {
		vscode.window.showWarningMessage('Nexora: Backend offline. Run backend for full functionality.');
	}
}

export function deactivate() {
	console.log('Nexora Core extension deactivated');
}
