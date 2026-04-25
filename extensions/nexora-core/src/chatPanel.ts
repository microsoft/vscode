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
			} else if (data.type === 'generateCode') {
				await this._handleCodeGeneration(data.prompt, data.connector);
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

	private async _handleCodeGeneration(prompt: string, connector: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: `Generating code with ${connector}...`,
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();

			if (!isConnected) {
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: 'Backend is offline. Please start the backend server and try again.',
					isLoading: false
				});
				return;
			}

			const config = connector === 'openai'
				? { model: 'gpt-4o-mini' }
				: { model: 'claude-3-haiku-20240307' };

			const result = await client.executeConnector(
				connector,
				'generate',
				{ prompt },
				config
			);

			if (result.success && result.data?.content) {
				const usage = result.usage;
				const costStr = usage.estimated_cost > 0
					? `$${usage.estimated_cost.toFixed(6)}`
					: 'free';
				const modelName = connector === 'openai' ? 'GPT-4o-mini' : 'Claude-3-Haiku';

				let response = `**${modelName}** generated in ${result.duration_ms}ms\n\n`;
				response += '```\n' + result.data.content + '\n```\n\n';
				response += ` **${usage.input_tokens}** in -> **${usage.output_tokens}** out | ${costStr}`;

				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: response,
					isLoading: false
				});
			} else {
				const errorMsg = result.error || 'Unknown error during code generation';
				let response = `**Generation Failed**\n\n`;
				response += `\`${errorMsg}\`\n\n`;
				response += `**Troubleshooting:**\n`;
				response += `- Check API key is set in \`.env\`\n`;
				response += `- OpenAI: \`OPENAI_API_KEY\`\n`;
				response += `- Anthropic: \`ANTHROPIC_API_KEY\``;

				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: response,
					isLoading: false
				});
			}
		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
		* { box-sizing: border-box; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			height: 100vh;
			background: var(--vscode-sideBar-background);
		}
		.status-bar {
			padding: 8px 12px;
			font-size: 11px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			align-items: center;
			gap: 8px;
			background: var(--vscode-titleBar-activeBackground);
		}
		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--vscode-charts-red);
			animation: pulse 2s infinite;
		}
		.status-dot.connected {
			background: var(--vscode-charts-green);
			animation: none;
		}
		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		.messages {
			flex: 1;
			overflow-y: auto;
			padding: 12px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}
		.message {
			padding: 12px;
			border-radius: 8px;
			word-wrap: break-word;
			line-height: 1.5;
			animation: fadeIn 0.2s ease-out;
		}
		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(4px); }
			to { opacity: 1; transform: translateY(0); }
		}
		.user {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			align-self: flex-end;
			max-width: 85%;
			border-radius: 12px 12px 4px 12px;
		}
		.assistant {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			align-self: flex-start;
			max-width: 95%;
			border-radius: 12px 12px 12px 4px;
		}
		.assistant.loading {
			opacity: 0.7;
		}
		.assistant.loading::after {
			content: '';
			display: inline-block;
			width: 12px;
			height: 12px;
			border: 2px solid var(--vscode-foreground);
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			margin-left: 8px;
			vertical-align: middle;
		}
		.message-header {
			font-size: 10px;
			opacity: 0.6;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.message-content {
			white-space: pre-wrap;
		}
		.code-block {
			background: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			padding: 12px;
			margin: 8px 0;
			overflow-x: auto;
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 12px;
			line-height: 1.4;
		}
		.code-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 6px 10px;
			background: var(--vscode-titleBar-activeBackground);
			border-radius: 6px 6px 0 0;
			margin: 8px 0 0 0;
			font-size: 11px;
		}
		.copy-btn {
			padding: 4px 8px;
			font-size: 10px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		}
		.copy-btn:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.usage-info {
			font-size: 10px;
			opacity: 0.7;
			padding: 6px 10px;
			background: var(--vscode-textBlockQuote-background);
			border-radius: 4px;
			margin-top: 8px;
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
		}
		.usage-item {
			display: flex;
			align-items: center;
			gap: 4px;
		}
		.input-area {
			padding: 12px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}
		.input-row {
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
		}
		.connector-row {
			display: flex;
			gap: 8px;
			align-items: center;
			flex-wrap: wrap;
		}
		input {
			flex: 1;
			padding: 10px 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 6px;
			outline: none;
			font-size: 13px;
		}
		input:focus {
			border-color: var(--vscode-focusBorder);
			box-shadow: 0 0 0 1px var(--vscode-focusBorder);
		}
		input::placeholder {
			opacity: 0.6;
		}
		select {
			padding: 8px 10px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 6px;
			outline: none;
			cursor: pointer;
			font-size: 12px;
		}
		select:focus {
			border-color: var(--vscode-focusBorder);
		}
		button {
			padding: 10px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-weight: 500;
			font-size: 12px;
			transition: background 0.15s ease;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button:active {
			transform: scale(0.98);
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		button.generate {
			background: linear-gradient(135deg, #6366f1, #8b5cf6);
			color: white;
		}
		button.generate:hover {
			background: linear-gradient(135deg, #4f46e5, #7c3aed);
		}
		.connector-label {
			font-size: 11px;
			opacity: 0.7;
		}
		.welcome {
			text-align: center;
			padding: 30px 20px;
			opacity: 0.9;
		}
		.welcome-icon {
			font-size: 40px;
			margin-bottom: 12px;
		}
		.welcome h3 {
			margin: 0 0 8px 0;
			font-size: 18px;
			font-weight: 600;
		}
		.welcome p {
			margin: 4px 0;
			font-size: 12px;
			opacity: 0.8;
		}
		.welcome .hint {
			margin-top: 20px;
			padding: 10px;
			background: var(--vscode-textBlockQuote-background);
			border-radius: 6px;
			font-size: 11px;
		}
		.badge {
			display: inline-block;
			padding: 2px 6px;
			font-size: 10px;
			border-radius: 3px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.badge.success { background: var(--vscode-charts-green); color: white; }
		.badge.info { background: var(--vscode-charts-blue); color: white; }
	</style>
</head>
<body>
	<div class="status-bar">
		<span class="status-dot" id="statusDot"></span>
		<span id="statusText">Checking backend...</span>
	</div>
	<div class="messages" id="messages">
		<div class="welcome">
			<div class="welcome-icon">*</div>
			<h3>Nexora AI</h3>
			<p>Universal AI Orchestration System</p>
			<div class="hint">
				<strong>Plan:</strong> Enter + describe what to build<br/>
				<strong>Generate:</strong> Shift+Enter or click Generate
			</div>
		</div>
	</div>
	<div class="input-area">
		<div class="input-row">
			<input type="text" id="input" placeholder="What would you like to build?" />
			<button id="send">Plan</button>
		</div>
		<div class="connector-row">
			<span class="connector-label">AI:</span>
			<select id="connector">
				<option value="openai">GPT-4o-mini</option>
				<option value="anthropic">Claude-3-Haiku</option>
			</select>
			<button id="generate" class="generate">Generate Code</button>
		</div>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const messages = document.getElementById('messages');
		const input = document.getElementById('input');
		const send = document.getElementById('send');
		const generate = document.getElementById('generate');
		const connector = document.getElementById('connector');
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

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function formatContent(content) {
			let html = escapeHtml(content);

			// Handle code blocks
			const codeBlockRegex = /\x60\x60\x60([\\s\\S]*?)\x60\x60\x60/g;
			html = html.replace(codeBlockRegex, function(match, code) {
				const trimmed = code.trim();
				const copyId = 'code-' + Math.random().toString(36).substr(2, 9);
				return '<div class="code-header"><span>Code</span><button class="copy-btn" onclick="copyCode(\\'' + copyId + '\\')">Copy</button></div><pre class="code-block" id="' + copyId + '">' + trimmed + '</pre>';
			});

			// Handle inline code
			html = html.replace(/\x60([^\x60]+)\x60/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>');

			// Handle bold
			html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

			// Handle line breaks
			html = html.replace(/\\n/g, '<br/>');

			return html;
		}

		function copyCode(id) {
			const el = document.getElementById(id);
			if (el) {
				navigator.clipboard.writeText(el.textContent);
				const btn = el.previousElementSibling.querySelector('.copy-btn');
				if (btn) {
					btn.textContent = 'Copied!';
					setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
				}
			}
		}
		window.copyCode = copyCode;

		function addMessage(role, content, isLoading) {
			const welcome = messages.querySelector('.welcome');
			if (welcome) welcome.remove();

			if (isLoading && lastLoadingMessage) {
				lastLoadingMessage.remove();
			}

			const div = document.createElement('div');
			div.className = 'message ' + role + (isLoading ? ' loading' : '');

			if (isLoading) {
				div.textContent = content;
			} else {
				div.innerHTML = formatContent(content);
			}

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

		function generateCode() {
			const text = input.value.trim();
			if (!text) return;
			const selectedConnector = connector.value;
			addMessage('user', '[Generate] ' + text, false);
			vscode.postMessage({ type: 'generateCode', prompt: text, connector: selectedConnector });
			input.value = '';
		}

		send.onclick = sendMessage;
		generate.onclick = generateCode;
		input.onkeypress = (e) => {
			if (e.key === 'Enter') {
				if (e.shiftKey) {
					generateCode();
				} else {
					sendMessage();
				}
			}
		};

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
