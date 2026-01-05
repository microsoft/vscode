/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
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


/**
 * Sub-part for rendering MCP App webviews in chat tool output.
 * This is a thin view layer that delegates to ChatMcpAppModel via the pool.
 */
export class ChatMcpAppSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	/** The model from the pool */
	private readonly _model: ChatMcpAppModel;

	/** The webview placeholder container */
	private readonly _webviewContainer: HTMLElement;

	/** Current progress part for loading state */
	private readonly _progressPart = this._register(new MutableDisposable<ChatProgressSubPart>());

	/** Current error node */
	private _errorNode: HTMLElement | undefined;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		renderData: IMcpAppRenderData,
		private readonly _context: IChatContentPartRenderContext,
		private readonly _onDidRemount: Event<void>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		// Acquire model from pool
		this._model = this._context.mcpAppWebviewPool.acquire(toolInvocation, renderData);

		// Create the DOM structure
		this.domNode = dom.$('div.mcp-app-part');
		this._webviewContainer = this._createWebviewContainer();
		this.domNode.appendChild(this._webviewContainer);

		// Claim the webview and layout over our container
		this._model.claim(this, this.domNode);

		const resizeObserver = new ResizeObserver(() => this._layoutWebview());
		resizeObserver.observe(this.domNode);
		this._register(toDisposable(() => resizeObserver.disconnect()));

		// Subscribe to model height changes
		this._register(this._model.onDidChangeHeight(() => {
			this._updateContainerHeight();
			this._onDidChangeHeight.fire();
		}));

		// Handle remount events - reclaim the webview
		this._register(this._onDidRemount(() => {
			this._model.claim(this, this.domNode);
			this._layoutWebview();
		}));

		// Initial layout after DOM is ready
		queueMicrotask(() => {
			this._layoutWebview();
		});
	}

	private _createWebviewContainer(): HTMLElement {
		const container = dom.$('div.mcp-app-webview');
		container.style.maxHeight = `${ChatMcpAppModel.maxWebviewHeightPct * 100}vh`;
		container.style.minHeight = '100px';
		container.style.height = `${this._model.height}px`;

		// Set up load state handling
		this._register(autorun(reader => {
			const loadState = this._model.loadState.read(reader);
			this._handleLoadStateChange(container, loadState);
		}));

		return container;
	}

	private _handleLoadStateChange(container: HTMLElement, loadState: McpAppLoadState): void {
		// Remove any existing loading/error indicators
		this._progressPart.clear();
		if (this._errorNode) {
			this._errorNode.remove();
			this._errorNode = undefined;
		}

		switch (loadState.status) {
			case 'loading': {
				const progressMessage = dom.$('span');
				progressMessage.textContent = localize('loadingMcpApp', 'Loading MCP App...');
				const progressPart = this._instantiationService.createInstance(
					ChatProgressSubPart,
					progressMessage,
					ThemeIcon.modify(Codicon.loading, 'spin'),
					undefined
				);
				this._progressPart.value = progressPart;
				container.appendChild(progressPart.domNode);
				break;
			}
			case 'loaded': {
				// Layout the webview now that it's loaded
				this._layoutWebview();
				this._onDidChangeHeight.fire();
				break;
			}
			case 'error': {
				this._showError(container, loadState.error);
				break;
			}
		}
	}

	private _layoutWebview(): void {
		this._model.layoutOverElement(this._webviewContainer);
	}

	private _updateContainerHeight(): void {
		this._webviewContainer.style.height = `${this._model.height}px`;
	}

	/**
	 * Shows an error message in the container.
	 */
	private _showError(container: HTMLElement, error: Error): void {
		const errorNode = dom.$('.mcp-app-error');

		const errorHeaderNode = dom.$('.mcp-app-error-header');
		dom.append(errorNode, errorHeaderNode);

		const iconElement = dom.$('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
		errorHeaderNode.append(iconElement);

		const errorTitleNode = dom.$('.mcp-app-error-title');
		errorTitleNode.textContent = localize('mcpAppError', 'Error loading MCP App');
		errorHeaderNode.append(errorTitleNode);

		const errorMessageNode = dom.$('.mcp-app-error-details');
		errorMessageNode.textContent = error.message || String(error);
		errorNode.append(errorMessageNode);

		container.appendChild(errorNode);
		this._errorNode = errorNode;
		this._onDidChangeHeight.fire();
	}

	public override dispose(): void {
		// Release webview back to the model
		this._model.release(this);
		// Release our reference to the pool
		this._context.mcpAppWebviewPool.release(this.toolInvocation.toolCallId);
		super.dispose();
	}
}
