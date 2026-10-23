/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, observableValue } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatErrorLevel, ChatMcpAppData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { getMcpServerDisplayLabel, IAgentHostCustomizationService } from '../../../agentSessions/agentHost/agentHostCustomizationService.js';
import { renderMcpServerSignInButton } from '../../../aiCustomization/mcpServerSignInButton.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatErrorWidget } from '../chatErrorContentPart.js';
import { ChatResourceGroupWidget } from '../chatResourceGroupWidget.js';
import { ChatMcpAppModel, McpAppLoadState } from './chatMcpAppModel.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

/**
 * Data needed to render an MCP App, available before tool completion.
 *
 * Composed of the underlying MCP App backend descriptor (a discriminated
 * union — see {@link ChatMcpAppData}) plus rendering context (`input`,
 * `sessionResource`).
 */
export type IMcpAppRenderData = ChatMcpAppData & {
	/** The tool input arguments as a JSON string */
	readonly input: string;
	/** The session resource URI for the chat session */
	readonly sessionResource: URI;
};

interface IMcpAppServerPresentation {
	readonly status: McpServerStatus | undefined;
	readonly label: string | undefined;
	readonly authenticating: boolean;
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

	/** Current loading or unavailable placeholder */
	private _placeholderNode: HTMLElement | undefined;

	private readonly _signInDisposables = this._register(new DisposableStore());

	/** Current error node */
	private _errorNode: HTMLElement | undefined;

	/** Container for download resource pills */
	private readonly _downloadContainer: HTMLElement;

	/** Current resource group widget for downloads */
	private readonly _downloadWidget = this._register(new MutableDisposable<ChatResourceGroupWidget>());

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		onDidRemount: Event<void>,
		context: IChatContentPartRenderContext,
		private readonly _renderData: IMcpAppRenderData,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IAgentHostCustomizationService private readonly _agentHostCustomizationService: IAgentHostCustomizationService,
	) {
		super(toolInvocation);

		// Create the DOM structure
		this.domNode = dom.$('div.mcp-app-part');
		this._webviewContainer = dom.$('div.mcp-app-webview');
		this._webviewContainer.style.maxHeight = `${maxWebviewHeightPct * 100}vh`;
		this._webviewContainer.style.minHeight = '100px';
		this._webviewContainer.style.height = '300px'; // Initial height, will be updated by model
		this.domNode.appendChild(this._webviewContainer);

		// Download container — below webview, for ui/download-file resources
		this._downloadContainer = dom.$('div.mcp-app-downloads');
		this.domNode.appendChild(this._downloadContainer);

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

		const serverPresentation = derivedOpts<IMcpAppServerPresentation>({
			equalsFn: (a, b) => a.status === b.status && a.label === b.label && a.authenticating === b.authenticating,
		}, reader => {
			const server = this._model.server.read(reader);
			return {
				status: server?.status,
				label: server ? getMcpServerDisplayLabel(server) : this._renderData.kind === 'agentHost' ? this._renderData.serverName : undefined,
				authenticating: !!server?.authenticating,
			};
		});

		// Set up load state handling
		this._register(autorun(reader => {
			const loadState = this._model.loadState.read(reader);
			const presentation = loadState.status === 'unavailable' ? serverPresentation.read(reader) : undefined;
			this._handleLoadStateChange(this._webviewContainer, loadState, presentation);
		}));

		// Subscribe to model height changes
		this._register(this._model.onDidChangeHeight(() => {
			this._updateContainerHeight();
		}));

		// Observe download parts and render resource group widget
		this._register(autorun(reader => {
			const parts = this._model.downloadParts.read(reader);
			if (parts.length === 0) {
				this._downloadWidget.clear();
				dom.clearNode(this._downloadContainer);
				return;
			}

			dom.clearNode(this._downloadContainer);
			const widget = this._instantiationService.createInstance(ChatResourceGroupWidget, parts, undefined);
			this._downloadWidget.value = widget;
			this._downloadContainer.appendChild(widget.domNode);
		}));

		this._register(onDidRemount(() => {
			this._model.remount();
		}));

		this._register(context.onDidChangeVisibility(visible => {
			if (visible) {
				this._model.remount();
			}
		}));
	}

	private _handleLoadStateChange(container: HTMLElement, loadState: McpAppLoadState, server: IMcpAppServerPresentation | undefined): void {
		this._signInDisposables.clear();
		// Remove any existing loading/error indicators
		if (this._placeholderNode) {
			this._placeholderNode.remove();
			this._placeholderNode = undefined;
		}
		if (this._errorNode) {
			this._errorNode.remove();
			this._errorNode = undefined;
		}

		switch (loadState.status) {
			case 'loading':
			case 'unavailable': {
				container.style.display = 'none';
				const loading = loadState.status === 'loading';
				const placeholder = dom.$('div.mcp-app-placeholder', { role: 'status' });
				placeholder.classList.toggle('loading', loading);
				dom.append(placeholder, dom.$('span', { class: ThemeIcon.asClassName(loading ? Codicon.loading : Codicon.info), 'aria-hidden': 'true' }));
				const text = dom.append(placeholder, dom.$('span.mcp-app-placeholder-message'));
				if (loading) {
					text.textContent = localize('loadingMcpApp', 'Loading MCP App...');
				} else if (server?.status === McpServerStatus.AuthRequired && server.label) {
					text.textContent = localize('mcpAppSignIn', "Sign in to {0} to load this app.", server.label);
					renderMcpServerSignInButton(placeholder, this._signInDisposables, server.label, async () => {
						const currentServer = this._model.server.get();
						if (currentServer) {
							await this._agentHostCustomizationService.authenticateMcpServer(this._renderData.sessionResource, currentServer.id);
						}
					}, server.authenticating);
				} else {
					text.textContent = server?.label
						? localize('mcpAppWaitingForServer', "MCP server {0} isn't available yet. The app will load when it is.", server.label)
						: localize('mcpAppWaitingForUnknownServer', "The MCP server for this app isn't available yet. The app will load when it is.");
				}
				this.domNode.appendChild(placeholder);
				this._placeholderNode = placeholder;
				break;
			}
			case 'loaded': {
				// Show the webview container
				container.style.display = '';
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
		const errorWidget = this._register(new ChatErrorWidget(ChatErrorLevel.Error, errorMessage, this._markdownRendererService));
		errorNode.appendChild(errorWidget.domNode);

		// Add retry button
		const buttonContainer = dom.append(errorNode, dom.$('.chat-buttons-container'));
		const retryButton = this._register(new Button(buttonContainer, defaultButtonStyles));
		retryButton.label = localize('retry', 'Retry');
		this._register(retryButton.onDidClick(() => {
			this._model.retry();
		}));

		container.appendChild(errorNode);
		this._errorNode = errorNode;
	}
}
