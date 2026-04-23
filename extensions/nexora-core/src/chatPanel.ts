/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getBackendClient } from './services/backendClient';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'nexora.chatPanel';
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlContent();

		webviewView.webview.onDidReceiveMessage(async data => {
			if (data.type === 'sendMessage') {
				await this._handleUserMessage(data.message);
			} else if (data.type === 'checkBackend') {
				await this._checkBackendStatus();
			}
		});

		this._checkBackendStatus();
	}

	private async _checkBackendStatus(): Promise<void> {
		const client = getBackendClient();
		const isConnected = await client.checkHealth();

		if (this._view) {
			this._view.webview.postMessage({
				type: 'backendStatus',
				connected: isConnected
			});
		}
	}

	private async _handleUserMessage(message: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Processing...',
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();

			if (!isConnected) {
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: `Backend is offline. Your message: "${message}"\n\nPlease start the backend server and try again.\nBackend should be available at http://localhost:8000`,
					isLoading: false
				});
				return;
			}

			// Get workspace path for context
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const workspacePath = workspaceFolders && workspaceFolders.length > 0
				? workspaceFolders[0].uri.fsPath
				: undefined;

			// Step 1: Classify the intent
			const classification = await client.classifyIntent(message, workspacePath);

			// Step 2: Decompose into tasks (Week 6)
			const decomposition = await client.decomposeRequest(message, workspacePath);

			// Step 3: Update Task Tree panel
			if (decomposition && decomposition.tasks && decomposition.tasks.length > 0) {
				vscode.commands.executeCommand('nexora.updateTaskTree', decomposition);
			}

			// Format the response
			let response = `**Intent:** ${classification.intent} | **Confidence:** ${Math.round(classification.confidence * 100)}% | **Complexity:** ${classification.complexity}\n`;

			if (classification.sub_intents && classification.sub_intents.length > 0) {
				response += `**Sub-intents:** ${classification.sub_intents.join(', ')}\n`;
			}

			// Show decomposed tasks
			if (decomposition && decomposition.tasks && decomposition.tasks.length > 0) {
				response += `\n**Task Plan (${decomposition.tasks.length} tasks):**\n`;
				for (const task of decomposition.tasks) {
					const platform = task.selected_platform || 'TBD';
					const deps = task.depends_on && task.depends_on.length > 0
						? ` [after: ${task.depends_on.join(', ')}]`
						: '';
					response += `  ${task.id}: ${task.name} (${platform})${deps}\n`;
				}

				if (decomposition.execution_order && decomposition.execution_order.length > 0) {
					response += `\n**Execution Order:** ${decomposition.execution_order.join(' -> ')}\n`;
				}

				response += `\n*Tasks shown in Task Plan panel.*`;
			} else if (decomposition && decomposition.error) {
				response += `\n*Task decomposition error: ${decomposition.error}*`;
			} else {
				response += `\n*No tasks generated for this request.*`;
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check that the backend is running and try again.`,
				isLoading: false
			});
		}
	}

	private _getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		.status-bar {
			padding: 6px 10px;
			font-size: 11px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--vscode-charts-red);
		}
		.status-dot.connected {
			background: var(--vscode-charts-green);
		}
		.messages {
			flex: 1;
			overflow-y: auto;
			padding: 10px;
		}
		.message {
			margin-bottom: 10px;
			padding: 10px;
			border-radius: 6px;
			white-space: pre-wrap;
			word-wrap: break-word;
		}
		.user {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.assistant {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
		}
		.assistant.loading {
			opacity: 0.7;
		}
		.input-area {
			padding: 10px;
			border-top: 1px solid var(--vscode-panel-border);
			display: flex;
			gap: 8px;
		}
		input {
			flex: 1;
			padding: 8px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			outline: none;
		}
		input:focus {
			border-color: var(--vscode-focusBorder);
		}
		button {
			padding: 8px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.welcome {
			text-align: center;
			padding: 20px;
			opacity: 0.8;
		}
		.welcome h3 {
			margin: 0 0 10px 0;
		}
		.welcome p {
			margin: 5px 0;
			font-size: 12px;
		}
	</style>
</head>
<body>
	<div class="status-bar">
		<span class="status-dot" id="statusDot"></span>
		<span id="statusText">Checking backend...</span>
	</div>
	<div class="messages" id="messages">
		<div class="welcome">
			<h3>Nexora AI</h3>
			<p>Universal AI Orchestration System</p>
			<p style="margin-top: 15px; opacity: 0.7;">Describe what you want to build.</p>
		</div>
	</div>
	<div class="input-area">
		<input type="text" id="input" placeholder="Type your message..." />
		<button id="send">Send</button>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const messages = document.getElementById('messages');
		const input = document.getElementById('input');
		const send = document.getElementById('send');
		const statusDot = document.getElementById('statusDot');
		const statusText = document.getElementById('statusText');
		let lastLoadingMessage = null;

		function updateStatus(connected) {
			if (connected) {
				statusDot.classList.add('connected');
				statusText.textContent = 'Backend connected';
			} else {
				statusDot.classList.remove('connected');
				statusText.textContent = 'Backend offline';
			}
		}

		function addMessage(role, content, isLoading) {
			const welcome = messages.querySelector('.welcome');
			if (welcome) welcome.remove();

			if (isLoading && lastLoadingMessage) {
				lastLoadingMessage.remove();
			}

			const div = document.createElement('div');
			div.className = 'message ' + role + (isLoading ? ' loading' : '');
			div.textContent = content;
			messages.appendChild(div);
			messages.scrollTop = messages.scrollHeight;

			if (isLoading) {
				lastLoadingMessage = div;
			} else if (lastLoadingMessage) {
				lastLoadingMessage.remove();
				lastLoadingMessage = null;
			}
		}

		function sendMessage() {
			const text = input.value.trim();
			if (!text) return;
			addMessage('user', text, false);
			vscode.postMessage({ type: 'sendMessage', message: text });
			input.value = '';
		}

		send.onclick = sendMessage;
		input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

		window.addEventListener('message', e => {
			if (e.data.type === 'addMessage') {
				addMessage(e.data.role, e.data.content, e.data.isLoading);
			} else if (e.data.type === 'backendStatus') {
				updateStatus(e.data.connected);
			}
		});

		vscode.postMessage({ type: 'checkBackend' });
	</script>
</body>
</html>`;
	}
}
