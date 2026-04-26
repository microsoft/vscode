/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';
import { PlatformBrowserProvider } from './platformPanel';
import { TaskTreeProvider } from './taskTreeProvider';
import { getBackendClient } from './services/backendClient';
import { getOrchestrationWebSocket, disposeWebSocket } from './services/websocketClient';

export function activate(context: vscode.ExtensionContext) {
	console.log('Nexora Core extension is now active!');

	// Initialize WebSocket connection for real-time updates
	const wsClient = getOrchestrationWebSocket('default');
	wsClient.connect().then(connected => {
		if (connected) {
			console.log('[Nexora] WebSocket connected for real-time updates');
		} else {
			console.log('[Nexora] WebSocket connection failed - will retry on plan execution');
		}
	});

	const chatProvider = new ChatPanelProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('nexora.chatPanel', chatProvider)
	);

	const platformProvider = new PlatformBrowserProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('nexora.platformBrowser', platformProvider)
	);

	// Task Tree View (Week 6)
	const taskTreeProvider = new TaskTreeProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('nexora.taskTree', taskTreeProvider)
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
		}),
		vscode.commands.registerCommand('nexora.decomposeRequest', async () => {
			const request = await vscode.window.showInputBox({
				prompt: 'What do you want to build?',
				placeHolder: 'e.g., Build a blog with user authentication'
			});

			if (request) {
				try {
					const client = getBackendClient();
					const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					const result = await client.decomposeRequest(request, workspacePath);

					if (result.tasks && result.tasks.length > 0) {
						taskTreeProvider.setDecomposition(result);
						vscode.window.showInformationMessage(
							`Decomposed into ${result.tasks.length} tasks`
						);
					} else if (result.error) {
						vscode.window.showErrorMessage(`Decomposition failed: ${result.error}`);
					} else {
						vscode.window.showWarningMessage('No tasks generated for this request');
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to decompose request: ${error}`);
				}
			}
		}),
		vscode.commands.registerCommand('nexora.clearTasks', () => {
			taskTreeProvider.clear();
			vscode.window.showInformationMessage('Task plan cleared');
		}),
		vscode.commands.registerCommand('nexora.updateTaskTree', (result: any) => {
			if (result && result.tasks && result.tasks.length > 0) {
				taskTreeProvider.setDecomposition(result);
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
	disposeWebSocket();
}
