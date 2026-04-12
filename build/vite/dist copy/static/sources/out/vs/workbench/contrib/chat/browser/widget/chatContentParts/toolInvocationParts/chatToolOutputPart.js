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
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IChatWidgetService } from '../../../chat.js';
import { IChatOutputRendererService } from '../../../chatOutputItemRenderer.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { IChatToolOutputStateCache } from './chatToolOutputStateCache.js';
// TODO: see if we can reuse existing types instead of adding ChatToolOutputSubPart
let ChatToolOutputSubPart = class ChatToolOutputSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, context, onDidRemount, chatOutputItemRendererService, chatWidgetService, instantiationService, stateCache) {
        super(toolInvocation);
        this.context = context;
        this.onDidRemount = onDidRemount;
        this.chatOutputItemRendererService = chatOutputItemRendererService;
        this.chatWidgetService = chatWidgetService;
        this.instantiationService = instantiationService;
        this.stateCache = stateCache;
        this.codeblocks = [];
        this._disposeCts = this._register(new CancellationTokenSource());
        const details = toolInvocation.kind === 'toolInvocation'
            ? IChatToolInvocation.resultDetails(toolInvocation)
            : {
                output: {
                    type: 'data',
                    mimeType: toolInvocation.resultDetails.output.mimeType,
                    value: decodeBase64(toolInvocation.resultDetails.output.base64Data),
                },
            };
        this.domNode = dom.$('div.tool-output-part');
        if (toolInvocation.invocationMessage) {
            const titleEl = dom.$('.output-title');
            this.domNode.appendChild(titleEl);
            if (typeof toolInvocation.invocationMessage === 'string') {
                titleEl.textContent = toolInvocation.invocationMessage;
            }
            else {
                const md = this._register(renderMarkdown(toolInvocation.invocationMessage));
                titleEl.appendChild(md.element);
            }
        }
        this.domNode.appendChild(this.createOutputPart(toolInvocation, details));
    }
    dispose() {
        this._disposeCts.dispose(true);
        super.dispose();
    }
    createOutputPart(toolInvocation, details) {
        const parent = dom.$('div.webview-output');
        parent.style.maxHeight = '80vh';
        // Try to restore cached state, or create new state
        const partState = this.stateCache.get(toolInvocation.toolCallId) ?? { height: 0, webviewOrigin: generateUuid() };
        // Always update the cache with the current state reference
        this.stateCache.set(toolInvocation.toolCallId, partState);
        if (partState.height) {
            parent.style.height = `${partState.height}px`;
        }
        if (partState.webviewOrigin) {
            partState.webviewOrigin = partState.webviewOrigin;
        }
        const progressMessage = dom.$('span');
        progressMessage.textContent = localize('loading', 'Rendering tool output...');
        const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, progressMessage, ThemeIcon.modify(Codicon.loading, 'spin'), undefined));
        parent.appendChild(progressPart.domNode);
        // TODO: we also need to show the tool output in the UI
        this.chatOutputItemRendererService.renderOutputPart(details.output.mimeType, details.output.value.buffer, parent, { origin: partState.webviewOrigin, webviewState: partState.webviewState }, this._disposeCts.token).then((renderedItem) => {
            if (this._disposeCts.token.isCancellationRequested) {
                return;
            }
            this._register(renderedItem);
            progressPart.domNode.remove();
            this._register(renderedItem.webview.onDidUpdateState(e => {
                partState.webviewState = e;
            }));
            this._register(renderedItem.onDidChangeHeight(newHeight => {
                partState.height = newHeight;
            }));
            this._register(renderedItem.webview.onDidWheel(e => {
                this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.delegateScrollFromMouseWheelEvent({
                    ...e,
                    preventDefault: () => { },
                    stopPropagation: () => { }
                });
            }));
            // When the webview is disconnected from the DOM due to being hidden, we need to reload it when it is shown again.
            this._register(this.context.onDidChangeVisibility(visible => {
                if (visible) {
                    renderedItem.reinitialize();
                }
            }));
            this._register(this.onDidRemount(() => {
                renderedItem.reinitialize();
            }));
        }, (error) => {
            if (isCancellationError(error)) {
                return;
            }
            console.error('Error rendering tool output:', error);
            const errorNode = dom.$('.output-error');
            const errorHeaderNode = dom.$('.output-error-header');
            dom.append(errorNode, errorHeaderNode);
            const iconElement = dom.$('div');
            iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
            errorHeaderNode.append(iconElement);
            const errorTitleNode = dom.$('.output-error-title');
            errorTitleNode.textContent = localize('chat.toolOutputError', "Error rendering the tool output");
            errorHeaderNode.append(errorTitleNode);
            const errorMessageNode = dom.$('.output-error-details');
            errorMessageNode.textContent = error?.message || String(error);
            errorNode.append(errorMessageNode);
            progressPart.domNode.replaceWith(errorNode);
        });
        return parent;
    }
};
ChatToolOutputSubPart = __decorate([
    __param(3, IChatOutputRendererService),
    __param(4, IChatWidgetService),
    __param(5, IInstantiationService),
    __param(6, IChatToolOutputStateCache)
], ChatToolOutputSubPart);
export { ChatToolOutputSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xPdXRwdXRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xPdXRwdXRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdkUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFakYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLG1CQUFtQixFQUFxRSxNQUFNLCtDQUErQyxDQUFDO0FBRXZKLE9BQU8sRUFBc0Isa0JBQWtCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVoRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUs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