/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatErrorLevel } from '../../../../common/chatService/chatService.js';
import { ChatErrorWidget } from '../chatErrorContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { ChatResourceGroupWidget } from '../chatResourceGroupWidget.js';
import { ChatMcpAppModel } from './chatMcpAppModel.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
const maxWebviewHeightPct = 0.75;
/**
 * Sub-part for rendering MCP App webviews in chat tool output.
 * This is a thin view layer that delegates to ChatMcpAppModel.
 */
let ChatMcpAppSubPart = class ChatMcpAppSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, onDidRemount, context, _renderData, _instantiationService, _markdownRendererService) {
        super(toolInvocation);
        this._renderData = _renderData;
        this._instantiationService = _instantiationService;
        this._markdownRendererService = _markdownRendererService;
        this.codeblocks = [];
        /** Current progress part for loading state */
        this._progressPart = this._register(new MutableDisposable());
        /** Current resource group widget for downloads */
        this._downloadWidget = this._register(new MutableDisposable());
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
        this._model = this._register(this._instantiationService.createInstance(ChatMcpAppModel, toolInvocation, this._renderData, this._webviewContainer, maxHeight, context.currentWidth));
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
            const widget = this._instantiationService.createInstance(ChatResourceGroupWidget, parts);
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
    _handleLoadStateChange(container, loadState) {
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
                const progressPart = this._instantiationService.createInstance(ChatProgressSubPart, progressMessage, ThemeIcon.modify(Codicon.loading, 'spin'), undefined);
                this._progressPart.value = progressPart;
                // Append to domNode (parent), not the webview container
                this.domNode.appendChild(progressPart.domNode);
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
    _updateContainerHeight() {
        this._webviewContainer.style.height = `${this._model.height}px`;
    }
    /**
     * Shows an error message in the container.
     */
    _showError(container, error) {
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
};
ChatMcpAppSubPart = __decorate([
    __param(4, IInstantiationService),
    __param(5, IMarkdownRendererService)
], ChatMcpAppSubPart);
export { ChatMcpAppSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1jcEFwcFN1YlBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0TWNwQXBwU3ViUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFdkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUM5RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFzRCxNQUFNLCtDQUErQyxDQUFDO0FBR25JLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsdUJBQXVCLEVB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