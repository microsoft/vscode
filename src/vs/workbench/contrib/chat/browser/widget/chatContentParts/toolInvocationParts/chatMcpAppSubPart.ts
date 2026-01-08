/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatErrorLevel, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatErrorWidget } from '../chatErrorContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { ChatMcpAppModel, McpAppLoadState } from './chatMcpAppModel.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

/**
 * Data needed to render an MCP App, available before tool completion.
 */
export interface IMcpAppRenderData {
	/** URI of the UI resource for rendering (e.g., "ui://weather-server/dashboard") */
	readonly resourceUri: string;
	/** Reference to the server definition for reconnection */
	readonly serverDefinitionId: string;
	/** Reference to the collection containing the server */
	readonly collectionId: string;
	/** The tool input arguments as a JSON string */
	readonly input: string;
	/** The session resource URI for the chat session */
	readonly sessionResource: URI;
}

const maxWebviewHeightPct = 0.75;

/**
 * Sub-part for rendering MCP App webviews in chat tool output.
 * This is a thin view layer that delegates to ChatMcpAppModel.
 */
export class ChatMcpAppSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	/** The model that owns the webview */
	private readonly _model: ChatMcpAppModel;

	/** The webview container */
	private readonly _webviewContainer: HTMLElement;

	/** Current progress part for loading state */
	private readonly _progressPart = this._register(new MutableDisposable<ChatProgressSubPart>());

	/** Current error node */
	private _errorNode: HTMLElement | undefined;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		onDidRemount: Event<void>,
		context: IChatContentPartRenderContext,
		private readonly _renderData: IMcpAppRenderData,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
	) {
		super(toolInvocation);

		// Create the DOM structure
		this.domNode = dom.$('div.mcp-app-part');
		this._webviewContainer = dom.$('div.mcp-app-webview');
		this._webviewContainer.style.maxHeight = `${maxWebviewHeightPct * 100}vh`;
		this._webviewContainer.style.minHeight = '100px';
		this._webviewContainer.style.height = '300px'; // Initial height, will be updated by model
		this.domNode.appendChild(this._webviewContainer);

		const targetWindow = dom.getWindow(this.domNode);
		const getMaxHeight = () => maxWebviewHeightPct * targetWindow.innerHeight;
		const maxHeight = observableValue('mcpAppMaxHeight', getMaxHeight());
		dom.addDisposableListener(targetWindow, 'resize', () => maxHeight.set(getMaxHeight(), undefined));

		// Create the model - it will mount the webview to the container
		this._model = this._register(this._instantiationService.createInstance(
			ChatMcpAppModel,
			toolInvocation,
			this._renderData,
			this._webviewContainer,
			maxHeight,
			context.currentWidth,
		));

		// Update container height from model
		this._updateContainerHeight();

		// Set up load state handling
		this._register(autorun(reader => {
			const loadState = this._model.loadState.read(reader);
			this._handleLoadStateChange(this._webviewContainer, loadState);
		}));

		// Subscribe to model height changes
		this._register(this._model.onDidChangeHeight(() => {
			this._updateContainerHeight();
			this._onDidChangeHeight.fire();
		}));

		this._register(context.onDidChangeVisibility(visible => {
			if (visible) {
				this._model.remount();
			}
		}));

		this._register(onDidRemount(() => {
			this._model.remount();
		}));
	}

	private _handleLoadStateChange(container: HTMLElement, loadState: McpAppLoadState): void {
		// Remove any existing loading/error indicators
		if (this._progressPart.value) {
			this._progressPart.value.domNode.remove();
		}
		this._progressPart.clear();
		if (this._errorNode) {
			this._errorNode.remove();
			this._errorNode = undefined;
		}

		switch (loadState.status) {
			case 'loading': {
				// Hide the webview container while loading
				container.style.display = 'none';

				const progressMessage = dom.$('span');
				progressMessage.textContent = localize('loadingMcpApp', 'Loading MCP App...');
				const progressPart = this._instantiationService.createInstance(
					ChatProgressSubPart,
					progressMessage,
					ThemeIcon.modify(Codicon.loading, 'spin'),
					undefined
				);
				this._progressPart.value = progressPart;
				// Append to domNode (parent), not the webview container
				this.domNode.appendChild(progressPart.domNode);
				break;
			}
			case 'loaded': {
				// Show the webview container
				container.style.display = '';
				this._onDidChangeHeight.fire();
				break;
			}
			case 'error': {
				// Hide the webview container on error
				container.style.display = 'none';
				this._showError(this.domNode, loadState.error);
				break;
			}
		}
	}

	private _updateContainerHeight(): void {
		this._webviewContainer.style.height = `${this._model.height}px`;
	}

	/**
	 * Shows an error message in the container.
	 */
	private _showError(container: HTMLElement, error: Error): void {
		const errorNode = dom.$('.mcp-app-error');

		// Create error message with markdown
		const errorMessage = new MarkdownString();
		errorMessage.appendText(localize('mcpAppError', 'Error loading MCP App: {0}', error.message || String(error)));

		// Use ChatErrorWidget for consistent error styling
		const errorWidget = new ChatErrorWidget(ChatErrorLevel.Error, errorMessage, this._markdownRendererService);
		errorNode.appendChild(errorWidget.domNode);

		// Add retry button
		const buttonContainer = dom.append(errorNode, dom.$('.chat-buttons-container'));
		const retryButton = new Button(buttonContainer, defaultButtonStyles);
		retryButton.label = localize('retry', 'Retry');
		retryButton.onDidClick(() => {
			this._model.retry();
		});

		container.appendChild(errorNode);
		this._errorNode = errorNode;
		this._onDidChangeHeight.fire();
	}
}
