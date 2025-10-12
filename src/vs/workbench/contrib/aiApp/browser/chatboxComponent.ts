/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter } from '../../../../base/common/event.js';

export interface ChatMessage {
	id: string;
	content: string;
	isUser: boolean;
	timestamp: Date;
}

export class ChatboxComponent extends Disposable {
	private readonly _container: HTMLElement;
	private readonly _messagesContainer: HTMLElement;
	private readonly _inputContainer: HTMLElement;
	private readonly _input: HTMLTextAreaElement;
	private readonly _sendButton: HTMLButtonElement;
	private readonly _apiKeyInput: HTMLInputElement;
	
	private _messages: ChatMessage[] = [];
	private _apiKey: string = '';

	private readonly _onMessageSent = this._register(new Emitter<string>());
	readonly onMessageSent = this._onMessageSent.event;

	constructor(
		container: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._container = container;
		this._messagesContainer = this.createMessagesContainer();
		this._inputContainer = this.createInputContainer();
		this._input = this.createInput();
		this._sendButton = this.createSendButton();
		this._apiKeyInput = this.createApiKeyInput();
		this.setupEventListeners();
		this.loadApiKey();
	}

	private createMessagesContainer(): HTMLElement {
		const container = append(this._container, $('.messages-container'));
		container.style.cssText = `
			flex: 1;
			overflow-y: auto;
			padding: 12px;
			background: var(--vscode-editor-background);
			border-bottom: 1px solid var(--vscode-panel-border);
		`;
		return container;
	}

	private createInputContainer(): HTMLElement {
		const container = append(this._container, $('.input-container'));
		container.style.cssText = `
			display: flex;
			flex-direction: column;
			padding: 12px;
			background: var(--vscode-editor-background);
			border-top: 1px solid var(--vscode-panel-border);
		`;
		return container;
	}

	private createApiKeyInput(): HTMLInputElement {
		const apiKeyContainer = append(this._inputContainer, $('.api-key-container'));
		apiKeyContainer.style.cssText = `
			display: flex;
			align-items: center;
			margin-bottom: 8px;
		`;

		const label = append(apiKeyContainer, $('label.api-key-label'));
		label.textContent = 'API Key:';
		label.style.cssText = `
			margin-right: 8px;
			color: var(--vscode-foreground);
			font-size: 12px;
		`;

		const input = append(apiKeyContainer, $('input.api-key-input')) as HTMLInputElement;
		input.type = 'password';
		input.placeholder = 'Enter your OpenAI API key';
		input.style.cssText = `
			flex: 1;
			padding: 4px 8px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 3px;
			font-size: 12px;
		`;

		return input;
	}

	private createInput(): HTMLTextAreaElement {
		const inputContainer = append(this._inputContainer, $('.input-wrapper'));
		inputContainer.style.cssText = `
			display: flex;
			align-items: flex-end;
			gap: 8px;
		`;

		const textarea = append(inputContainer, $('textarea.message-input')) as HTMLTextAreaElement;
		textarea.placeholder = 'Ask about the website content...';
		textarea.rows = 3;
		textarea.style.cssText = `
			flex: 1;
			padding: 8px 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 3px;
			resize: vertical;
			min-height: 60px;
			max-height: 120px;
			font-family: var(--vscode-font-family);
			font-size: 13px;
		`;

		return textarea;
	}

	private createSendButton(): HTMLButtonElement {
		const button = append(this._inputContainer.querySelector('.input-wrapper')!, $('button.send-button')) as HTMLButtonElement;
		button.textContent = 'Send';
		button.type = 'button';
		button.style.cssText = `
			padding: 8px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: 1px solid var(--vscode-button-border);
			border-radius: 3px;
			cursor: pointer;
			height: fit-content;
		`;

		return button;
	}

	private setupEventListeners(): void {
		// Handle Enter key in input (Ctrl+Enter to send)
		this._register(addDisposableListener(this._input, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.sendMessage();
			}
		}));

		// Handle Send button click
		this._register(addDisposableListener(this._sendButton, EventType.CLICK, () => {
			this.sendMessage();
		}));

		// Handle API key changes
		this._register(addDisposableListener(this._apiKeyInput, EventType.INPUT, () => {
			this._apiKey = this._apiKeyInput.value.trim();
			this.saveApiKey();
		}));
	}

	private sendMessage(): void {
		const message = this._input.value.trim();
		if (!message) return;

		if (!this._apiKey) {
			this.addMessage('Please enter your OpenAI API key first.', false);
			return;
		}

		// Add user message
		this.addMessage(message, true);
		this._input.value = '';

		// Emit message sent event
		this._onMessageSent.fire(message);
	}

	private addMessage(content: string, isUser: boolean): void {
		const message: ChatMessage = {
			id: Date.now().toString(),
			content,
			isUser,
			timestamp: new Date()
		};

		this._messages.push(message);
		this.renderMessage(message);
		this.scrollToBottom();
	}

	private renderMessage(message: ChatMessage): void {
		const messageElement = append(this._messagesContainer, $('.message'));
		messageElement.style.cssText = `
			margin-bottom: 12px;
			padding: 8px 12px;
			border-radius: 8px;
			max-width: 100%;
			word-wrap: break-word;
			${message.isUser ? 
				'background: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-left: 20px;' :
				'background: var(--vscode-panel-background); color: var(--vscode-foreground); margin-right: 20px;'
			}
		`;

		const content = append(messageElement, $('.message-content'));
		content.textContent = message.content;
		content.style.cssText = `
			white-space: pre-wrap;
			line-height: 1.4;
		`;

		const timestamp = append(messageElement, $('.message-timestamp'));
		timestamp.textContent = message.timestamp.toLocaleTimeString();
		timestamp.style.cssText = `
			font-size: 11px;
			opacity: 0.7;
			margin-top: 4px;
		`;
	}

	private scrollToBottom(): void {
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private loadApiKey(): void {
		const savedApiKey = this.storageService.get('aiApp.apiKey', 'user');
		if (savedApiKey) {
			this._apiKey = savedApiKey;
			this._apiKeyInput.value = savedApiKey;
		}
	}

	private saveApiKey(): void {
		this.storageService.store('aiApp.apiKey', this._apiKey, 'user');
	}

	public async sendToLLM(message: string, webContent: string): Promise<string> {
		if (!this._apiKey) {
			throw new Error('API key not provided');
		}

		try {
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this._apiKey}`
				},
				body: JSON.stringify({
					model: 'gpt-3.5-turbo',
					messages: [
						{
							role: 'system',
							content: `You are an AI assistant that helps users understand website content. The user is asking about a website, and you have access to the website's content. Please provide helpful and accurate responses based on the website content.

Website content:
${webContent.substring(0, 4000)} // Limit content to avoid token limits

Please respond to the user's question about this website content.`
						},
						{
							role: 'user',
							content: message
						}
					],
					max_tokens: 1000,
					temperature: 0.7
				})
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();
			return data.choices[0]?.message?.content || 'No response received';
		} catch (error) {
			console.error('LLM API error:', error);
			throw error;
		}
	}

	public getMessages(): ChatMessage[] {
		return [...this._messages];
	}

	public clearMessages(): void {
		this._messages = [];
		this._messagesContainer.innerHTML = '';
	}

	public layout(dimension: { width: number; height: number }): void {
		// The chatbox will automatically resize with flex layout
	}
}
