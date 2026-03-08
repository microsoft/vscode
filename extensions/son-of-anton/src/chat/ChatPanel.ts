/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient, LlmMessage, ModelId } from '../llm/LlmClient';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	model?: ModelId;
	timestamp: number;
}

interface WebviewMessage {
	type: string;
	text?: string;
	model?: ModelId;
	attachments?: string[];
	diffId?: string;
}

const CONVERSATION_STORAGE_KEY = 'sota.chatHistory';

/**
 * The main chat panel webview for conversing with Claude.
 */
export class ChatPanel {
	private static currentPanel: ChatPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private readonly llmClient: LlmClient;
	private conversation: ChatMessage[] = [];
	private abortController: AbortController | undefined;
	private disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext,
		llmClient: LlmClient
	) {
		this.panel = panel;
		this.context = context;
		this.llmClient = llmClient;

		this.loadConversation();
		this.panel.webview.html = this.getHtmlContent();
		this.setupMessageHandler();

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Send existing conversation to webview once it's ready
		if (this.conversation.length > 0) {
			this.panel.webview.postMessage({
				type: 'loadConversation',
				messages: this.conversation,
			});
		}
	}

	static createOrShow(context: vscode.ExtensionContext, llmClient: LlmClient): void {
		if (ChatPanel.currentPanel) {
			ChatPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sotaChat',
			'Son of Anton Chat',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
				],
			}
		);

		ChatPanel.currentPanel = new ChatPanel(panel, context, llmClient);
	}

	static clearConversation(context: vscode.ExtensionContext): void {
		context.workspaceState.update(CONVERSATION_STORAGE_KEY, []);
		if (ChatPanel.currentPanel) {
			ChatPanel.currentPanel.conversation = [];
			ChatPanel.currentPanel.panel.webview.postMessage({ type: 'conversationCleared' });
		}
	}

	private loadConversation(): void {
		const saved = this.context.workspaceState.get<ChatMessage[]>(CONVERSATION_STORAGE_KEY);
		if (saved) {
			this.conversation = saved;
		}
	}

	private saveConversation(): void {
		this.context.workspaceState.update(CONVERSATION_STORAGE_KEY, this.conversation);
	}

	private setupMessageHandler(): void {
		this.panel.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case 'sendMessage':
						await this.handleSendMessage(message);
						break;
					case 'cancelRequest':
						this.abortController?.abort();
						break;
					case 'clearConversation':
						this.conversation = [];
						this.saveConversation();
						break;
					case 'acceptDiff':
						await this.handleAcceptDiff(message.diffId);
						break;
					case 'rejectDiff':
						// No action needed — diff is simply dismissed
						break;
					case 'copyCode':
						if (message.text) {
							await vscode.env.clipboard.writeText(message.text);
						}
						break;
				}
			},
			null,
			this.disposables
		);
	}

	private async handleSendMessage(message: WebviewMessage): Promise<void> {
		if (!message.text) {
			return;
		}

		const model: ModelId = message.model ?? 'sonnet';
		const userText = this.buildUserPrompt(message.text, message.attachments);

		const userMessage: ChatMessage = {
			role: 'user',
			content: userText,
			model,
			timestamp: Date.now(),
		};
		this.conversation.push(userMessage);
		this.saveConversation();

		// Build messages for the LLM
		const llmMessages: LlmMessage[] = this.conversation.map(m => ({
			role: m.role,
			content: m.content,
		}));

		this.abortController = new AbortController();

		let fullResponse = '';
		for await (const event of this.llmClient.streamRequest({
			model,
			messages: llmMessages,
			signal: this.abortController.signal,
		})) {
			if (event.type === 'token') {
				fullResponse += event.token;
				this.panel.webview.postMessage({
					type: 'streamToken',
					token: event.token,
				});
			} else if (event.type === 'complete') {
				const usage = this.llmClient.getTokenUsage();
				const cost = this.llmClient.estimateCost();
				this.panel.webview.postMessage({
					type: 'messageComplete',
					inputTokens: event.inputTokens,
					outputTokens: event.outputTokens,
					totalTokens: usage.input + usage.output,
					estimatedCost: cost.toFixed(4),
				});
			} else if (event.type === 'error') {
				this.panel.webview.postMessage({
					type: 'streamError',
					error: event.error,
				});
			}
		}

		if (fullResponse) {
			const assistantMessage: ChatMessage = {
				role: 'assistant',
				content: fullResponse,
				model,
				timestamp: Date.now(),
			};
			this.conversation.push(assistantMessage);
			this.saveConversation();
		}

		this.abortController = undefined;
	}

	private buildUserPrompt(text: string, attachments?: string[]): string {
		if (!attachments || attachments.length === 0) {
			return text;
		}
		const attachmentText = attachments
			.map(a => `[Attached: ${a}]`)
			.join('\n');
		return `${text}\n\n${attachmentText}`;
	}

	private async handleAcceptDiff(diffId?: string): Promise<void> {
		if (!diffId) {
			return;
		}
		// Diff application will be implemented when MCP integration is ready.
		// For now, show a notification.
		vscode.window.showInformationMessage('Diff accepted. Apply logic pending MCP integration.');
	}

	private getHtmlContent(): string {
		const cssUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css')
		);

		const defaultModel = vscode.workspace.getConfiguration('sota').get<string>('defaultModel', 'sonnet');

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-YourNonceHere';">
	<link href="${cssUri}" rel="stylesheet">
	<title>Son of Anton Chat</title>
</head>
<body>
	<div class="chat-container">
		<div class="message-list" id="messageList"></div>

		<div class="input-area">
			<div class="input-controls">
				<select class="model-selector" id="modelSelector">
					<option value="opus" ${defaultModel === 'opus' ? 'selected' : ''}>Opus</option>
					<option value="sonnet" ${defaultModel === 'sonnet' ? 'selected' : ''}>Sonnet</option>
					<option value="haiku" ${defaultModel === 'haiku' ? 'selected' : ''}>Haiku</option>
				</select>
				<div class="context-buttons">
					<button class="context-btn" id="attachFile" title="Attach current file">File</button>
					<button class="context-btn" id="attachSelection" title="Attach selection">Selection</button>
					<button class="context-btn" id="attachTerminal" title="Attach terminal output">Terminal</button>
				</div>
			</div>
			<div class="message-input-row">
				<textarea class="message-input" id="messageInput" placeholder="Ask Son of Anton..." rows="1"></textarea>
				<button class="send-btn" id="sendBtn">Send</button>
			</div>
		</div>

		<div class="session-stats" id="sessionStats">
			<span id="tokenCount">Tokens: 0</span>
			<span id="costEstimate">Cost: $0.00</span>
			<button class="clear-btn" id="clearBtn">Clear</button>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const messageList = document.getElementById('messageList');
		const messageInput = document.getElementById('messageInput');
		const sendBtn = document.getElementById('sendBtn');
		const modelSelector = document.getElementById('modelSelector');
		const clearBtn = document.getElementById('clearBtn');
		const tokenCount = document.getElementById('tokenCount');
		const costEstimate = document.getElementById('costEstimate');
		const attachFile = document.getElementById('attachFile');
		const attachSelection = document.getElementById('attachSelection');
		const attachTerminal = document.getElementById('attachTerminal');

		let isStreaming = false;
		let currentAssistantDiv = null;
		let attachments = [];

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function renderMarkdown(text) {
			// Simple markdown rendering: code blocks, inline code, bold, italic
			// First, extract fenced code blocks so that newline-to-<br> replacement
			// does not affect their contents.
			const codeBlocks = [];
			let placeholderIndex = 0;
			const withoutCode = text.replace(/\`\`\`(\\w*?)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
				const index = placeholderIndex++;
				codeBlocks[index] = { lang, code };
				return '@@CODE_BLOCK_' + index + '@@';
			});

			// Escape HTML in the non-code content.
			let html = escapeHtml(withoutCode);

			// Inline code
			html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

			// Bold
			html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

			// Newlines to <br> (only applied to non-code content, since code blocks
			// have been replaced with placeholders that do not contain newlines).
			html = html.replace(/\\n/g, '<br>');

			// Restore code blocks, escaping their contents to prevent HTML injection.
			html = html.replace(/@@CODE_BLOCK_(\\d+)@@/g, (_match, indexStr) => {
				const index = parseInt(indexStr, 10);
				const block = codeBlocks[index];
				if (!block) {
					return '';
				}
				const lang = block.lang || '';
				const escapedCode = escapeHtml(block.code);
				return '<pre><code class="language-' + lang + '">' + escapedCode + '</code><button class="copy-button" onclick="copyCode(this)">Copy</button></pre>';
			});
			return html;
		}

		function addMessage(role, content) {
			const div = document.createElement('div');
			div.className = 'message ' + role;
			const roleLabel = document.createElement('div');
			roleLabel.className = 'role-label';
			roleLabel.textContent = role === 'user' ? 'You' : 'Son of Anton';
			div.appendChild(roleLabel);

			const contentDiv = document.createElement('div');
			contentDiv.innerHTML = renderMarkdown(content);
			div.appendChild(contentDiv);

			messageList.appendChild(div);
			messageList.scrollTop = messageList.scrollHeight;
			return div;
		}

		function startStreamingMessage() {
			const div = document.createElement('div');
			div.className = 'message assistant';
			const roleLabel = document.createElement('div');
			roleLabel.className = 'role-label';
			roleLabel.innerHTML = 'Son of Anton <span class="streaming-indicator"></span>';
			div.appendChild(roleLabel);

			const contentDiv = document.createElement('div');
			contentDiv.className = 'streaming-content';
			div.appendChild(contentDiv);

			messageList.appendChild(div);
			messageList.scrollTop = messageList.scrollHeight;
			currentAssistantDiv = contentDiv;
			return div;
		}

		function sendMessage() {
			const text = messageInput.value.trim();
			if (!text || isStreaming) return;

			addMessage('user', text);
			messageInput.value = '';
			messageInput.style.height = 'auto';
			isStreaming = true;
			sendBtn.disabled = true;
			startStreamingMessage();

			vscode.postMessage({
				type: 'sendMessage',
				text: text,
				model: modelSelector.value,
				attachments: [...attachments],
			});
			attachments = [];
		}

		// Copy code to clipboard
		window.copyCode = function(btn) {
			const code = btn.previousElementSibling.textContent;
			vscode.postMessage({ type: 'copyCode', text: code });
			btn.textContent = 'Copied!';
			setTimeout(() => btn.textContent = 'Copy', 1500);
		};

		// Event listeners
		sendBtn.addEventListener('click', sendMessage);

		messageInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});

		// Auto-resize textarea
		messageInput.addEventListener('input', () => {
			messageInput.style.height = 'auto';
			messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
		});

		clearBtn.addEventListener('click', () => {
			messageList.innerHTML = '';
			vscode.postMessage({ type: 'clearConversation' });
		});

		attachFile.addEventListener('click', () => {
			attachments.push('current-file');
			attachFile.style.opacity = '0.5';
		});

		attachSelection.addEventListener('click', () => {
			attachments.push('current-selection');
			attachSelection.style.opacity = '0.5';
		});

		attachTerminal.addEventListener('click', () => {
			attachments.push('terminal-output');
			attachTerminal.style.opacity = '0.5';
		});

		// Handle messages from extension
		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'streamToken':
					if (currentAssistantDiv) {
						currentAssistantDiv.textContent += message.token;
						messageList.scrollTop = messageList.scrollHeight;
					}
					break;
				case 'messageComplete':
					if (currentAssistantDiv) {
						// Re-render with markdown
						currentAssistantDiv.innerHTML = renderMarkdown(currentAssistantDiv.textContent);
						const indicator = currentAssistantDiv.parentElement.querySelector('.streaming-indicator');
						if (indicator) indicator.remove();
					}
					isStreaming = false;
					sendBtn.disabled = false;
					currentAssistantDiv = null;
					tokenCount.textContent = 'Tokens: ' + (message.totalTokens || 0);
					costEstimate.textContent = 'Cost: $' + (message.estimatedCost || '0.00');
					break;
				case 'streamError':
					if (currentAssistantDiv) {
						currentAssistantDiv.textContent += '\\n\\nError: ' + message.error;
						const indicator = currentAssistantDiv.parentElement.querySelector('.streaming-indicator');
						if (indicator) indicator.remove();
					}
					isStreaming = false;
					sendBtn.disabled = false;
					currentAssistantDiv = null;
					break;
				case 'loadConversation':
					messageList.innerHTML = '';
					if (message.messages) {
						for (const msg of message.messages) {
							addMessage(msg.role, msg.content);
						}
					}
					break;
				case 'conversationCleared':
					messageList.innerHTML = '';
					break;
			}
		});
	</script>
</body>
</html>`;
	}

	private dispose(): void {
		ChatPanel.currentPanel = undefined;
		this.abortController?.abort();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}
