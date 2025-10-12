/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { $, append } from '../../../../base/browser/dom.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { BrowserComponent } from './browserComponent.js';
import { ChatboxComponent } from './chatboxComponent.js';

export class AIAppComponent extends Disposable {
	private readonly _container: HTMLElement;
	private readonly _browserComponent: BrowserComponent;
	private readonly _chatboxComponent: ChatboxComponent;

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._container = container;
		
		// Create main layout container
		const mainContainer = append(this._container, $('.ai-app-container'));
		mainContainer.style.cssText = `
			display: flex;
			height: 100%;
			width: 100%;
			background: var(--vscode-editor-background);
		`;

		// Create browser container (80% width)
		const browserContainer = append(mainContainer, $('.browser-container'));
		browserContainer.style.cssText = `
			flex: 0 0 80%;
			display: flex;
			flex-direction: column;
			border-right: 1px solid var(--vscode-panel-border);
		`;

		// Create chatbox container (20% width)
		const chatboxContainer = append(mainContainer, $('.chatbox-container'));
		chatboxContainer.style.cssText = `
			flex: 0 0 20%;
			display: flex;
			flex-direction: column;
			min-width: 300px;
		`;

		// Create components
		this._browserComponent = this._register(new BrowserComponent(
			browserContainer,
			themeService,
			configurationService,
			storageService,
			contextKeyService,
			instantiationService
		));

		this._chatboxComponent = this._register(new ChatboxComponent(
			chatboxContainer,
			themeService,
			configurationService,
			storageService,
			contextKeyService,
			instantiationService
		));

		// Set up communication between components
		this.setupComponentCommunication();
	}

	private setupComponentCommunication(): void {
		// Listen for messages from chatbox
		this._register(this._chatboxComponent.onMessageSent(async (message) => {
			try {
				// Get current website content
				const webContent = this._browserComponent.getWebText();
				const currentUrl = this._browserComponent.getCurrentUrl();

				// Add a loading message
				this._chatboxComponent.addMessage('Thinking...', false);

				// Send to LLM
				const response = await this._chatboxComponent.sendToLLM(message, webContent);
				
				// Remove loading message and add response
				const messages = this._chatboxComponent.getMessages();
				if (messages.length > 0 && messages[messages.length - 1].content === 'Thinking...') {
					this._chatboxComponent.clearMessages();
					// Re-add all messages except the loading one
					for (let i = 0; i < messages.length - 1; i++) {
						this._chatboxComponent.addMessage(messages[i].content, messages[i].isUser);
					}
				}

				// Add the response
				this._chatboxComponent.addMessage(response, false);
			} catch (error) {
				console.error('Error processing message:', error);
				this._chatboxComponent.addMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, false);
			}
		}));
	}

	public getBrowserComponent(): BrowserComponent {
		return this._browserComponent;
	}

	public getChatboxComponent(): ChatboxComponent {
		return this._chatboxComponent;
	}

	public layout(dimension: { width: number; height: number }): void {
		this._browserComponent.layout(dimension);
		this._chatboxComponent.layout(dimension);
	}
}
