/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AiEditorInput } from './aiEditorInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { $, append } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import './aiEditor.css';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

export class AiEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.aiEditor';

	private container!: HTMLElement;
	private leftPane!: HTMLElement;
	private rightPane!: HTMLElement;
	private urlInput!: HTMLInputElement;
	private loadButton!: HTMLButtonElement;
	private webview!: Electron.WebviewTag;
	private apiKeyInput!: HTMLInputElement;
	private chatHistory!: HTMLElement;
	private messageInput!: HTMLTextAreaElement;
	private sendButton!: HTMLButtonElement;
	private extractButton!: HTMLButtonElement;
	
	private chatMessages: ChatMessage[] = [];
	private currentPageContent = '';
	private currentPageTitle = '';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(AiEditorPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.ai-editor-container'));
		
		this.createLeftPane();
		this.createRightPane();
		
		this.loadStoredApiKey();
	}

	private createLeftPane(): void {
		this.leftPane = append(this.container, $('.ai-editor-left-pane'));
		
		// URL input section
		const urlSection = append(this.leftPane, $('.url-section'));
		this.urlInput = append(urlSection, $('input.url-input')) as HTMLInputElement;
		this.urlInput.placeholder = 'Enter URL (e.g., https://vnexpress.net)';
		this.urlInput.value = 'https://vnexpress.net';
		
		this.loadButton = append(urlSection, $('button.load-button', { 
			textContent: 'Load' 
		})) as HTMLButtonElement;
		
		// Webview container
		const webviewContainer = append(this.leftPane, $('.webview-container'));
		this.webview = document.createElement('webview') as Electron.WebviewTag;
		this.webview.style.width = '100%';
		this.webview.style.height = '100%';
		webviewContainer.appendChild(this.webview);
		
		this.setupWebviewListeners();
		this.setupUrlInputListeners();
	}

	private createRightPane(): void {
		this.rightPane = append(this.container, $('.ai-editor-right-pane'));
		
		// API Key section
		const apiSection = append(this.rightPane, $('.api-section'));
		append(apiSection, $('label', { 
			textContent: 'OpenAI API Key:' 
		}));
		this.apiKeyInput = append(apiSection, $('input.api-key-input')) as HTMLInputElement;
		this.apiKeyInput.type = 'password';
		this.apiKeyInput.placeholder = 'sk-...';
		
		append(apiSection, $('.api-note', { 
			textContent: '⚠️ Keys are stored locally. Do not commit to version control.' 
		}));
		
		// Chat section
		const chatSection = append(this.rightPane, $('.chat-section'));
		
		// Chat history
		this.chatHistory = append(chatSection, $('.chat-history'));
		
		// Extract button
		this.extractButton = append(chatSection, $('button.extract-button', { 
			textContent: 'Extract Page Content' 
		})) as HTMLButtonElement;
		
		// Message input
		const inputSection = append(chatSection, $('.input-section'));
		this.messageInput = append(inputSection, $('textarea.message-input')) as HTMLTextAreaElement;
		this.messageInput.placeholder = 'Ask about the page content...';
		this.messageInput.rows = 3;
		
		this.sendButton = append(inputSection, $('button.send-button', { 
			textContent: 'Send' 
		})) as HTMLButtonElement;
		
		this.setupChatListeners();
	}

	private setupWebviewListeners(): void {
		this.webview.addEventListener('dom-ready', () => {
			console.log('Webview DOM ready');
		});

		this.webview.addEventListener('did-fail-load', (event) => {
			console.error('Failed to load URL:', event);
			this.notificationService.error(`Failed to load URL: ${event.errorDescription}`);
		});

		this.webview.addEventListener('did-finish-load', () => {
			console.log('Webview finished loading');
		});
	}

	private setupUrlInputListeners(): void {
		this.loadButton.addEventListener('click', () => {
			this.loadUrl();
		});

		this.urlInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.loadUrl();
			}
		});
	}

	private setupChatListeners(): void {
		this.apiKeyInput.addEventListener('input', () => {
			this.saveApiKey();
		});

		this.extractButton.addEventListener('click', () => {
			this.extractPageContent();
		});

		this.sendButton.addEventListener('click', () => {
			this.sendMessage();
		});

		this.messageInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});
	}

	private loadUrl(): void {
		const url = this.urlInput.value.trim();
		if (!url) {
			this.notificationService.warn('Please enter a URL');
			return;
		}

		let fullUrl = url;
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			fullUrl = 'https://' + url;
		}

		this.webview.src = fullUrl;
		this.urlInput.value = fullUrl;
	}

	private async extractPageContent(): Promise<void> {
		try {
			const result = await this.webview.executeJavaScript(`
				(function() {
					const title = document.title;
					const bodyText = document.body ? document.body.innerText : '';
					return {
						title: title,
						content: bodyText.substring(0, 50000) // Limit content to avoid huge payloads
					};
				})()
			`);

			this.currentPageTitle = result.title;
			this.currentPageContent = result.content;
			
			this.notificationService.info(`Extracted content from: ${this.currentPageTitle}`);
			console.log('Extracted content:', { title: this.currentPageTitle, contentLength: this.currentPageContent.length });
		} catch (error) {
			console.error('Failed to extract page content:', error);
			this.notificationService.error('Failed to extract page content');
		}
	}

	private async sendMessage(): Promise<void> {
		const message = this.messageInput.value.trim();
		const apiKey = this.apiKeyInput.value.trim();

		if (!message) {
			return;
		}

		if (!apiKey) {
			this.notificationService.warn('Please enter your OpenAI API key');
			return;
		}

		// Add user message to chat
		this.addChatMessage('user', message);
		this.messageInput.value = '';

		// Show loading state
		const loadingMessage = this.addChatMessage('assistant', 'Thinking...');

		try {
			// Prepare context
			let contextualMessage = message;
			if (this.currentPageContent) {
				contextualMessage = `Page Title: ${this.currentPageTitle}\nPage URL: ${this.urlInput.value}\nPage Content: ${this.currentPageContent}\n\nUser Question: ${message}\n\nPlease answer the user's question based on the page content provided above.`;
			}

			// Call OpenAI API
			const response = await this.callOpenAI(apiKey, contextualMessage);
			
			// Update loading message with response
			loadingMessage.textContent = response;

		} catch (error) {
			console.error('OpenAI API error:', error);
			loadingMessage.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to get AI response'}`;
			loadingMessage.classList.add('error-message');
		}
	}

	private async callOpenAI(apiKey: string, message: string): Promise<string> {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-3.5-turbo',
				messages: [
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
			const errorData = await response.json().catch(() => ({}));
			throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
		}

		const data = await response.json();
		return data.choices[0]?.message?.content || 'No response from AI';
	}

	private addChatMessage(role: 'user' | 'assistant', content: string): HTMLElement {
		const messageDiv = append(this.chatHistory, $(`.chat-message.${role}`));
		append(messageDiv, $('.role-label', { 
			textContent: role === 'user' ? 'You:' : 'AI:' 
		}));
		const contentDiv = append(messageDiv, $('.message-content', { 
			textContent: content 
		}));

		// Auto scroll to bottom
		this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

		// Store message
		this.chatMessages.push({
			role,
			content,
			timestamp: Date.now()
		});

		return contentDiv;
	}

	private loadStoredApiKey(): void {
		const storedKey = this.storageService.get('aiEditor.apiKey', 0 /* StorageScope.PROFILE */);
		if (storedKey) {
			this.apiKeyInput.value = storedKey;
		}
	}

	private saveApiKey(): void {
		const apiKey = this.apiKeyInput.value;
		if (apiKey) {
			this.storageService.store('aiEditor.apiKey', apiKey, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.USER */);
		}
	}

	override async setInput(input: AiEditorInput, options: IEditorOptions | undefined, context: any, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		
		if (this.webview && !this.webview.src) {
			// Load default page
			this.loadUrl();
		}
	}

	override clearInput(): void {
		super.clearInput();
	}

	override focus(): void {
		if (this.urlInput) {
			this.urlInput.focus();
		}
	}

	override layout(dimension: any): void {
		// Handle layout changes
	}
}