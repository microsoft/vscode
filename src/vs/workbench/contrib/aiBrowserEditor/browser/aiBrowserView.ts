/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import * as DOM from '../../../../base/browser/dom.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultInputBoxStyles, defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';

export interface IAiBrowserViewOptions {
	container: HTMLElement;
}

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
}

export class AiBrowserView extends Disposable {

	private readonly _disposables = this._register(new DisposableStore());

	// Main containers
	private mainContainer!: HTMLElement;
	private browserPanel!: HTMLElement;
	private chatPanel!: HTMLElement;

	// Browser components
	private urlInputBox!: InputBox;
	private webviewFrame!: HTMLIFrameElement;
	private urlContainer!: HTMLElement;
	private webviewContainer!: HTMLElement;

	// Chat components
	private chatMessagesContainer!: HTMLElement;
	private chatInputContainer!: HTMLElement;
	private chatInputBox!: InputBox;
	private sendButton!: Button;
	private messages: ChatMessage[] = [];

	// State
	private currentUrl: string = '';
	private currentPageContent: string = '';
	private isLoadingResponse: boolean = false;

	constructor(
		options: IAiBrowserViewOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this.create(options.container);
		this.setupEventListeners();
	}

	private create(container: HTMLElement): void {
		// Create main container with flex layout
		this.mainContainer = DOM.append(container, DOM.$('.ai-browser-main-container'));
		this.mainContainer.style.display = 'flex';
		this.mainContainer.style.width = '100%';
		this.mainContainer.style.height = '100%';
		this.mainContainer.style.overflow = 'hidden';

		// Create browser panel (left side - 80%)
		this.createBrowserPanel();

		// Create chat panel (right side - 20%)
		this.createChatPanel();
	}

	private createBrowserPanel(): void {
		this.browserPanel = DOM.append(this.mainContainer, DOM.$('.browser-panel'));
		this.browserPanel.style.width = '80%';
		this.browserPanel.style.height = '100%';
		this.browserPanel.style.display = 'flex';
		this.browserPanel.style.flexDirection = 'column';
		this.browserPanel.style.overflow = 'hidden';

		// Create URL input container
		this.createUrlInput();

		// Create webview container
		this.createWebviewContainer();
	}

	private createUrlInput(): void {
		this.urlContainer = DOM.append(this.browserPanel, DOM.$('.url-container'));
		this.urlContainer.style.padding = '8px';
		this.urlContainer.style.borderBottom = '1px solid var(--vscode-panel-border)';
		this.urlContainer.style.display = 'flex';
		this.urlContainer.style.gap = '8px';
		this.urlContainer.style.alignItems = 'center';

		// Create label
		const label = DOM.append(this.urlContainer, DOM.$('span'));
		label.textContent = 'URL:';
		label.style.marginRight = '4px';

		// Create input box for URL
		const inputContainer = DOM.append(this.urlContainer, DOM.$('.input-container'));
		inputContainer.style.flex = '1';

		this.urlInputBox = this._register(new InputBox(
			inputContainer,
			undefined,
			{
				placeholder: 'Enter website URL (e.g., https://example.com)',
				inputBoxStyles: defaultInputBoxStyles
			}
		));

		// Create Go button
		const buttonContainer = DOM.append(this.urlContainer, DOM.$('.button-container'));
		const goButton = this._register(new Button(buttonContainer, {
			...defaultButtonStyles,
			title: 'Load Website'
		}));
		goButton.label = 'Go';
		goButton.onDidClick(() => this.loadUrl(), this, this._disposables);
	}

	private createWebviewContainer(): void {
		this.webviewContainer = DOM.append(this.browserPanel, DOM.$('.webview-container'));
		this.webviewContainer.style.flex = '1';
		this.webviewContainer.style.overflow = 'hidden';
		this.webviewContainer.style.position = 'relative';
		this.webviewContainer.style.backgroundColor = 'var(--vscode-editor-background)';

		// Create iframe for web content
		this.webviewFrame = DOM.append(this.webviewContainer, DOM.$('iframe')) as HTMLIFrameElement;
		this.webviewFrame.style.width = '100%';
		this.webviewFrame.style.height = '100%';
		this.webviewFrame.style.border = 'none';
		this.webviewFrame.style.backgroundColor = '#ffffff';

		// Create placeholder message
		const placeholder = DOM.append(this.webviewContainer, DOM.$('.webview-placeholder'));
		placeholder.style.position = 'absolute';
		placeholder.style.top = '50%';
		placeholder.style.left = '50%';
		placeholder.style.transform = 'translate(-50%, -50%)';
		placeholder.style.color = 'var(--vscode-foreground)';
		placeholder.style.fontSize = '14px';
		placeholder.style.textAlign = 'center';
		placeholder.style.pointerEvents = 'none';
		placeholder.textContent = 'Enter a URL above to load a website';

		// Hide placeholder when iframe loads
		this._register(DOM.addDisposableListener(this.webviewFrame, 'load', () => {
			placeholder.style.display = 'none';
		}));
	}

	private createChatPanel(): void {
		this.chatPanel = DOM.append(this.mainContainer, DOM.$('.chat-panel'));
		this.chatPanel.style.width = '20%';
		this.chatPanel.style.height = '100%';
		this.chatPanel.style.display = 'flex';
		this.chatPanel.style.flexDirection = 'column';
		this.chatPanel.style.borderLeft = '1px solid var(--vscode-panel-border)';
		this.chatPanel.style.backgroundColor = 'var(--vscode-sideBar-background)';

		// Create header
		this.createChatHeader();

		// Create messages container
		this.createChatMessages();

		// Create input container
		this.createChatInput();
	}

	private createChatHeader(): void {
		const header = DOM.append(this.chatPanel, DOM.$('.chat-header'));
		header.style.padding = '12px';
		header.style.borderBottom = '1px solid var(--vscode-panel-border)';
		header.style.fontWeight = 'bold';
		header.style.fontSize = '13px';
		header.style.color = 'var(--vscode-foreground)';
		header.textContent = 'AI Assistant';
	}

	private createChatMessages(): void {
		this.chatMessagesContainer = DOM.append(this.chatPanel, DOM.$('.chat-messages'));
		this.chatMessagesContainer.style.flex = '1';
		this.chatMessagesContainer.style.overflowY = 'auto';
		this.chatMessagesContainer.style.padding = '12px';
		this.chatMessagesContainer.style.display = 'flex';
		this.chatMessagesContainer.style.flexDirection = 'column';
		this.chatMessagesContainer.style.gap = '12px';

		// Add welcome message
		this.addWelcomeMessage();
	}

	private addWelcomeMessage(): void {
		const welcomeMsg = DOM.append(this.chatMessagesContainer, DOM.$('.message.assistant'));
		welcomeMsg.style.padding = '8px';
		welcomeMsg.style.borderRadius = '6px';
		welcomeMsg.style.backgroundColor = 'var(--vscode-editor-background)';
		welcomeMsg.style.fontSize = '12px';
		welcomeMsg.style.lineHeight = '1.5';
		welcomeMsg.textContent = 'Hi! Load a website and ask me questions about its content.';
	}

	private createChatInput(): void {
		this.chatInputContainer = DOM.append(this.chatPanel, DOM.$('.chat-input-container'));
		this.chatInputContainer.style.padding = '12px';
		this.chatInputContainer.style.borderTop = '1px solid var(--vscode-panel-border)';
		this.chatInputContainer.style.display = 'flex';
		this.chatInputContainer.style.flexDirection = 'column';
		this.chatInputContainer.style.gap = '8px';

		// Create input box
		const inputWrapper = DOM.append(this.chatInputContainer, DOM.$('.input-wrapper'));
		inputWrapper.style.flex = '1';

		this.chatInputBox = this._register(new InputBox(
			inputWrapper,
			undefined,
			{
				placeholder: 'Ask me anything...',
				inputBoxStyles: defaultInputBoxStyles
			}
		));

		// Create send button
		const buttonWrapper = DOM.append(this.chatInputContainer, DOM.$('.button-wrapper'));
		this.sendButton = this._register(new Button(buttonWrapper, {
			...defaultButtonStyles,
			title: 'Send Message'
		}));
		this.sendButton.label = 'Send';
		this.sendButton.enabled = false;
	}

	private setupEventListeners(): void {
		// URL input - load on Enter key
		this._register(this.urlInputBox.onDidChange(() => {
			// Could add URL validation here
		}));

		this._register(DOM.addStandardDisposableListener(this.urlInputBox.inputElement, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter) {
				this.loadUrl();
			}
		}));

		// Chat input - send on Enter key
		this._register(this.chatInputBox.onDidChange((value) => {
			this.sendButton.enabled = value.trim().length > 0 && !this.isLoadingResponse;
		}));

		this._register(DOM.addStandardDisposableListener(this.chatInputBox.inputElement, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		}));

		// Send button click
		this._register(this.sendButton.onDidClick(() => {
			this.sendMessage();
		}));

		// Listen to iframe messages for content extraction
		this._register(DOM.addDisposableListener(DOM.getActiveWindow(), 'message', (event) => {
			if (event.data && event.data.type === 'pageContent') {
				this.currentPageContent = event.data.content;
			}
		}));
	}

	private loadUrl(): void {
		let url = this.urlInputBox.value.trim();

		if (!url) {
			this.notificationService.warn('Please enter a URL');
			return;
		}

		// Add protocol if missing
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}

		// Validate URL
		try {
			new URL(url);
		} catch (error) {
			this.notificationService.error('Invalid URL format');
			return;
		}

		this.currentUrl = url;
		this.webviewFrame.src = url;

		// Show loading notification
		this.notificationService.info(`Loading ${url}...`);

		// Extract page content after load
		this._register(DOM.addDisposableListener(this.webviewFrame, 'load', () => {
			this.extractPageContent();
			this.notificationService.info('Website loaded successfully');
		}));
	}

	private extractPageContent(): void {
		// Try to extract content from iframe
		// Note: This will only work for same-origin pages due to CORS
		try {
			const iframeDoc = this.webviewFrame.contentDocument || this.webviewFrame.contentWindow?.document;
			if (iframeDoc) {
				this.currentPageContent = iframeDoc.body.innerText || iframeDoc.body.textContent || '';
			}
		} catch (error) {
			// CORS restriction - can't access cross-origin iframe content
			console.warn('Cannot extract page content due to CORS restrictions');
			this.currentPageContent = `Content from: ${this.currentUrl}\n[Content extraction blocked by CORS policy]`;
		}
	}

	private async sendMessage(): Promise<void> {
		const question = this.chatInputBox.value.trim();

		if (!question || this.isLoadingResponse) {
			return;
		}

		if (!this.currentUrl) {
			this.notificationService.warn('Please load a website first');
			return;
		}

		// Add user message
		this.addMessage('user', question);
		this.chatInputBox.value = '';
		this.sendButton.enabled = false;

		// Show loading state
		this.isLoadingResponse = true;
		const loadingMessage = this.addLoadingMessage();

		try {
			// Get API configuration
			const apiKey = this.configurationService.getValue<string>('aiBrowser.apiKey');
			const apiProvider = this.configurationService.getValue<string>('aiBrowser.apiProvider') || 'openai';
			const model = this.configurationService.getValue<string>('aiBrowser.model') || 'gpt-3.5-turbo';

			if (!apiKey) {
				throw new Error('API key not configured. Please set aiBrowser.apiKey in settings.');
			}

			// Call LLM API with fallback models
			const response = await this.callLLMApiWithFallback(apiKey, apiProvider, model, question);

			// Remove loading message
			loadingMessage.remove();

			// Add assistant response
			this.addMessage('assistant', response);

		} catch (error: any) {
			loadingMessage.remove();
			const errorMsg = error.message || 'Failed to get response from AI';
			this.addMessage('assistant', `Error: ${errorMsg}`);
			this.notificationService.error(errorMsg);
		} finally {
			this.isLoadingResponse = false;
			this.sendButton.enabled = this.chatInputBox.value.trim().length > 0;
		}
	}

	private async callLLMApiWithFallback(apiKey: string, provider: string, model: string, question: string): Promise<string> {
		// Define fallback models for OpenAI
		const fallbackModels = ['gpt-3.5-turbo', 'gpt-4o-mini', 'gpt-4o'];

		// Try the requested model first
		try {
			return await this.callLLMApi(apiKey, provider, model, question);
		} catch (error: any) {
			// If it's a model access error, try fallback models
			if (error.message.includes('does not exist') || error.message.includes('not have access')) {
				for (const fallbackModel of fallbackModels) {
					if (fallbackModel !== model) {
						try {
							console.log(`Trying fallback model: ${fallbackModel}`);
							return await this.callLLMApi(apiKey, provider, fallbackModel, question);
						} catch (fallbackError) {
							console.warn(`Fallback model ${fallbackModel} also failed:`, fallbackError);
							continue;
						}
					}
				}
			}
			// Re-throw the original error if no fallback worked
			throw error;
		}
	}

	private async callLLMApi(apiKey: string, provider: string, model: string, question: string): Promise<string> {
		let endpoint = '';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		let body: any = {};

		// Configure based on provider
		if (provider === 'openai') {
			endpoint = 'https://api.openai.com/v1/chat/completions';
			headers['Authorization'] = `Bearer ${apiKey}`;
			body = {
				model: model,
				messages: [
					{
						role: 'system',
						content: `You are a helpful assistant analyzing a webpage. The webpage URL is: ${this.currentUrl}\n\nPage content:\n${this.currentPageContent.substring(0, 3000)}`
					},
					{
						role: 'user',
						content: question
					}
				],
				temperature: 0.7,
				max_tokens: 500
			};
		} else if (provider === 'anthropic') {
			endpoint = 'https://api.anthropic.com/v1/messages';
			headers['x-api-key'] = apiKey;
			headers['anthropic-version'] = '2023-06-01';
			body = {
				model: model,
				max_tokens: 500,
				messages: [
					{
						role: 'user',
						content: `Webpage URL: ${this.currentUrl}\n\nPage content:\n${this.currentPageContent.substring(0, 3000)}\n\nQuestion: ${question}`
					}
				]
			};
		} else {
			throw new Error(`Unsupported API provider: ${provider}`);
		}

		// Make API call
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const errorMessage = errorData.error?.message || `API request failed: ${response.statusText}`;

			// Handle specific model access errors
			if (errorMessage.includes('does not exist') || errorMessage.includes('not have access')) {
				throw new Error(`Model access error: ${errorMessage}. Try using 'gpt-3.5-turbo' or 'gpt-4o-mini' instead.`);
			}

			throw new Error(errorMessage);
		}

		const data = await response.json();

		// Extract response based on provider
		if (provider === 'openai') {
			return data.choices?.[0]?.message?.content || 'No response received';
		} else if (provider === 'anthropic') {
			return data.content?.[0]?.text || 'No response received';
		}

		return 'No response received';
	}

	private addMessage(role: 'user' | 'assistant', content: string): void {
		const message: ChatMessage = {
			role,
			content,
			timestamp: new Date()
		};
		this.messages.push(message);

		// Create message element
		const messageElement = DOM.append(this.chatMessagesContainer, DOM.$('.message'));
		messageElement.classList.add(role);

		messageElement.style.padding = '8px';
		messageElement.style.borderRadius = '6px';
		messageElement.style.fontSize = '12px';
		messageElement.style.lineHeight = '1.5';
		messageElement.style.wordWrap = 'break-word';

		if (role === 'user') {
			messageElement.style.backgroundColor = 'var(--vscode-button-background)';
			messageElement.style.color = 'var(--vscode-button-foreground)';
			messageElement.style.marginLeft = '20px';
		} else {
			messageElement.style.backgroundColor = 'var(--vscode-editor-background)';
			messageElement.style.color = 'var(--vscode-foreground)';
			messageElement.style.marginRight = '20px';
		}

		messageElement.textContent = content;

		// Scroll to bottom
		this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
	}

	private addLoadingMessage(): HTMLElement {
		const loadingElement = DOM.append(this.chatMessagesContainer, DOM.$('.message.loading'));
		loadingElement.style.padding = '8px';
		loadingElement.style.borderRadius = '6px';
		loadingElement.style.backgroundColor = 'var(--vscode-editor-background)';
		loadingElement.style.color = 'var(--vscode-foreground)';
		loadingElement.style.fontSize = '12px';
		loadingElement.style.lineHeight = '1.5';
		loadingElement.style.marginRight = '20px';
		loadingElement.textContent = 'Thinking...';

		// Scroll to bottom
		this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;

		return loadingElement;
	}
}
