/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IAIAssistantService, IAIChatMessage } from '../common/aiAssistantService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { $ } from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';

export class AIChatViewSimple extends Disposable {
	static readonly ID = 'aiAssistant.chatView';
	static readonly TITLE = localize('aiChat', "AI Assistant");

	private _container!: HTMLElement;
	private _messagesContainer!: HTMLElement;
	private _inputContainer!: HTMLElement;
	private _inputTextArea!: HTMLTextAreaElement;
	private _sendButton!: HTMLButtonElement;
	private _clearButton!: HTMLButtonElement;

	private readonly _messages: IAIChatMessage[] = [];
	private _currentCancellation?: CancellationTokenSource;

	private readonly _onDidSendMessage = new Emitter<string>();
	readonly onDidSendMessage = this._onDidSendMessage.event;

	constructor(
		private readonly aiAssistantService: IAIAssistantService,
		private readonly editorService: IEditorService,
		private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();

		this._register(this.aiAssistantService.onDidReceiveChatResponse(response => {
			this._addMessage(response.message);
			this._currentCancellation = undefined;
		}));

		this._register(this.onDidSendMessage(message => {
			this._handleSendMessage(message);
		}));
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._container.classList.add('ai-chat-container');

		this._createChatInterface();
		this._addWelcomeMessage();
	}

	private _createChatInterface(): void {
		// Messages container
		this._messagesContainer = $('.messages-container');
		this._container.appendChild(this._messagesContainer);

		// Input container
		this._inputContainer = $('.input-container');
		this._container.appendChild(this._inputContainer);

		// Input textarea
		this._inputTextArea = document.createElement('textarea');
		this._inputTextArea.className = 'chat-input';
		this._inputTextArea.placeholder = localize('aiChatPlaceholder', 'Ask me anything about your code...');
		this._inputTextArea.rows = 3;
		this._inputContainer.appendChild(this._inputTextArea);

		// Button container
		const buttonContainer = $('.button-container');
		this._inputContainer.appendChild(buttonContainer);

		// Send button
		this._sendButton = document.createElement('button');
		this._sendButton.className = 'monaco-button';
		this._sendButton.textContent = localize('send', 'Send');
		this._sendButton.disabled = true;
		buttonContainer.appendChild(this._sendButton);

		// Clear button
		this._clearButton = document.createElement('button');
		this._clearButton.className = 'monaco-button';
		this._clearButton.textContent = localize('clear', 'Clear');
		buttonContainer.appendChild(this._clearButton);

		this._setupEventListeners();
	}

	private _setupEventListeners(): void {
		// Input events
		this._inputTextArea.addEventListener('input', () => {
			this._updateSendButtonState();
		});

		this._inputTextArea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this._sendMessage();
			}
		});

		// Button events
		this._sendButton.addEventListener('click', () => {
			this._sendMessage();
		});

		this._clearButton.addEventListener('click', () => {
			this._clearChat();
		});
	}

	private _updateSendButtonState(): void {
		const hasText = this._inputTextArea.value.trim().length > 0;
		const isAvailable = this.aiAssistantService.isAvailable();
		this._sendButton.disabled = !(hasText && isAvailable && !this._currentCancellation);
	}

	private _sendMessage(): void {
		const message = this._inputTextArea.value.trim();
		if (!message || !this.aiAssistantService.isAvailable()) {
			return;
		}

		this._inputTextArea.value = '';
		this._updateSendButtonState();
		this._onDidSendMessage.fire(message);
	}

	private async _handleSendMessage(message: string): Promise<void> {
		// Add user message
		const userMessage: IAIChatMessage = {
			role: 'user',
			content: message,
			timestamp: new Date()
		};
		this._addMessage(userMessage);

		// Get context from current editor
		const context = await this._getCurrentContext();

		// Show typing indicator
		this._showTypingIndicator();

		try {
			this._currentCancellation = new CancellationTokenSource();

			await this.aiAssistantService.generateChat({
				messages: [...this._messages, userMessage],
				context,
				maxTokens: 2000,
				temperature: 0.7
			}, this._currentCancellation.token);

		} catch (error) {
			this._hideTypingIndicator();
			this._addErrorMessage(error instanceof Error ? error.message : 'An error occurred');
		}
	}

	private async _getCurrentContext(): Promise<any> {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (!activeEditor || !('getModel' in activeEditor)) {
			return undefined;
		}

		const model = activeEditor.getModel();
		if (!model || !('uri' in model)) {
			return undefined;
		}

		const selection = activeEditor.getSelection();
		const workspace = this.workspaceContextService.getWorkspace();

		return {
			files: [model.uri],
			selection: selection ? { uri: model.uri, range: selection } : undefined,
			workspace: workspace.folders.length > 0 ? workspace.folders[0].uri : undefined
		};
	}

	private _addMessage(message: IAIChatMessage): void {
		this._messages.push(message);
		this._renderMessage(message);
		this._scrollToBottom();
		this._hideTypingIndicator();
	}

	private _renderMessage(message: IAIChatMessage): void {
		const messageElement = $('.message', { 'data-role': message.role });

		// Avatar
		const avatar = $('.message-avatar');
		avatar.textContent = message.role === 'user' ? '👤' : '🤖';
		messageElement.appendChild(avatar);

		// Content
		const content = $('.message-content');
		content.textContent = message.content; // Simple text rendering for now
		messageElement.appendChild(content);

		// Timestamp
		if (message.timestamp) {
			const timestamp = $('.message-timestamp');
			timestamp.textContent = message.timestamp.toLocaleTimeString();
			messageElement.appendChild(timestamp);
		}

		this._messagesContainer.appendChild(messageElement);
	}

	private _addWelcomeMessage(): void {
		const welcomeMessage: IAIChatMessage = {
			role: 'assistant',
			content: `Hello! I'm your AI coding assistant. I can help you with code explanations, generation, debugging, and more. Try asking me something!`,
			timestamp: new Date()
		};

		this._addMessage(welcomeMessage);
	}

	private _addErrorMessage(error: string): void {
		const errorMessage: IAIChatMessage = {
			role: 'assistant',
			content: `Error: ${error}. Please check your AI provider configuration.`,
			timestamp: new Date()
		};

		this._addMessage(errorMessage);
	}

	private _showTypingIndicator(): void {
		const indicator = $('.typing-indicator');
		indicator.innerHTML = '🤖 <span class="typing-dots">Thinking...</span>';
		this._messagesContainer.appendChild(indicator);
		this._scrollToBottom();
	}

	private _hideTypingIndicator(): void {
		const indicator = this._messagesContainer.querySelector('.typing-indicator');
		if (indicator) {
			indicator.remove();
		}
	}

	private _clearChat(): void {
		this._messages.length = 0;
		this._messagesContainer.innerHTML = '';
		this._addWelcomeMessage();

		if (this._currentCancellation) {
			this._currentCancellation.cancel();
			this._currentCancellation = undefined;
		}
	}

	private _scrollToBottom(): void {
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	focus(): void {
		this._inputTextArea?.focus();
	}
}
