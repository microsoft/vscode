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
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
/**
 * Sub-part for rendering a tool invocation in the streaming state.
 * This shows progress while the tool arguments are being streamed from the LM.
 */
let ChatToolStreamingSubPart = class ChatToolStreamingSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, context, renderer, instantiationService) {
        super(toolInvocation);
        this.context = context;
        this.renderer = renderer;
        this.instantiationService = instantiationService;
        this.codeblocks = [];
        this.domNode = this.createStreamingPart();
    }
    createStreamingPart() {
        const container = document.createElement('div');
        if (this.toolInvocation.kind !== 'toolInvocation') {
            return container;
        }
        const toolInvocation = this.toolInvocation;
        const state = toolInvocation.state.get();
        if (state.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
            return container;
        }
        // Observe streaming message changes
        this._register(autorun(reader => {
            const currentState = toolInvocation.state.read(reader);
            if (currentState.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
                // State changed - clear the container DOM before triggering re-render
                // This prevents the old streaming message from lingering
                dom.clearNode(container);
                this._onNeedsRerender.fire();
                return;
            }
            // Read the streaming message
            const streamingMessage = currentState.streamingMessage.read(reader);
            const displayMessage = streamingMessage ?? toolInvocation.invocationMessage;
            // Don't render anything if there's no meaningful content
            const messageText = typeof displayMessage === 'string' ? displayMessage : displayMessage.value;
            if (!messageText || messageText.trim().length === 0) {
                dom.clearNode(container);
                return;
            }
            const content = typeof displayMessage === 'string'
                ? new MarkdownString().appendText(displayMessage)
                : displayMessage;
            const progressMessage = {
                kind: 'progressMessage',
                content
            };
            const part = reader.store.add(this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, this.getIcon(), toolInvocation, false));
            dom.reset(container, part.domNode);
        }));
        return container;
    }
};
ChatToolStreamingSubPart = __decorate([
    __param(3, IInstantiationService)
], ChatToolStreamingSubPart);
export { ChatToolStreamingSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFJNUcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFL0U7OztHQUdHO0FBQ0ksSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSw2QkFBNkI7SUFLMUUsWUFDQyxjQUFtQyxFQUNsQixPQUFzQyxFQUN0QyxRQUEyQixFQUNyQixvQkFBNEQ7UUFFbkYsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBSkwsWUFBTyxHQUFQLE9BQU8sQ0FBK0I7UUFDdEMsYUFBUSxHQUFSLFFBQVEsQ0FBbUI7UUFDSix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBTjNELGVBQVUsR0FBeUIsRUFBRSxDQUFDO1FBVTlELElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDM0MsQ0FBQztJQUVPLG1CQUFtQjtRQUMxQixNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsYUFBYSxD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