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
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from '../../../../common/chatService/chatService.js';
import { IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from '../../../../common/tools/languageModelToolsService.js';
import { ExtensionsInstallConfirmationWidgetSubPart } from './chatExtensionsInstallToolSubPart.js';
import { ChatInputOutputMarkdownProgressPart } from './chatInputOutputMarkdownProgressPart.js';
import { ChatMcpAppSubPart } from './chatMcpAppSubPart.js';
import { ChatResultListSubPart } from './chatResultListSubPart.js';
import { ChatSimpleToolProgressPart } from './chatSimpleToolProgressPart.js';
import { ChatMissingSandboxDepsConfirmationSubPart } from './chatMissingSandboxDepsConfirmationSubPart.js';
import { ChatModifiedFilesConfirmationSubPart } from './chatModifiedFilesConfirmationSubPart.js';
import { ChatTerminalToolConfirmationSubPart } from './chatTerminalToolConfirmationSubPart.js';
import { ChatTerminalToolProgressPart } from './chatTerminalToolProgressPart.js';
import { ToolConfirmationSubPart } from './chatToolConfirmationSubPart.js';
import { ChatToolOutputSubPart } from './chatToolOutputPart.js';
import { ChatToolPostExecuteConfirmationPart } from './chatToolPostExecuteConfirmationPart.js';
import { ChatToolProgressSubPart } from './chatToolProgressPart.js';
import { ChatToolStreamingSubPart } from './chatToolStreamingSubPart.js';
let ChatToolInvocationPart = class ChatToolInvocationPart extends Disposable {
    get codeblocks() {
        const codeblocks = this.subPart?.codeblocks ?? [];
        if (this.mcpAppPart) {
            codeblocks.push(...this.mcpAppPart.codeblocks);
        }
        return codeblocks;
    }
    get codeblocksPartId() {
        return this.subPart?.codeblocksPartId;
    }
    constructor(toolInvocation, context, renderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, codeBlockStartIndex, instantiationService, chatTodoListService) {
        super();
        this.toolInvocation = toolInvocation;
        this.context = context;
        this.renderer = renderer;
        this.listPool = listPool;
        this.editorPool = editorPool;
        this.currentWidthDelegate = currentWidthDelegate;
        this.announcedToolProgressKeys = announcedToolProgressKeys;
        this.codeBlockStartIndex = codeBlockStartIndex;
        this.instantiationService = instantiationService;
        this.chatTodoListService = chatTodoListService;
        this._onDidRemount = this._register(new Emitter());
        this.domNode = dom.$('.chat-tool-invocation-part');
        if (toolInvocation.presentation === 'hidden') {
            return;
        }
        // Update the todo list service if this tool invocation contains todo data
        if (toolInvocation.toolSpecificData?.kind === 'todoList') {
            const sessionResource = context.element.sessionResource;
            const todos = toolInvocation.toolSpecificData.todoList.map((todo, index) => {
                const parsedId = parseInt(todo.id, 10);
                const id = Number.isNaN(parsedId) ? index + 1 : parsedId;
                return {
                    id,
                    title: todo.title,
                    status: todo.status
                };
            });
            this.chatTodoListService.setTodos(sessionResource, todos);
        }
        if (toolInvocation.kind === 'toolInvocation') {
            const initialState = toolInvocation.state.get().type;
            this._register(autorun(reader => {
                if (toolInvocation.state.read(reader).type !== initialState) {
                    render();
                }
            }));
        }
        // This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
        // If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
        // when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
        // Note that `node.replaceWith` is used to ensure order is preserved when an mpc app is present.
        const partStore = this._register(new DisposableStore());
        let subPartDomNode = document.createElement('div');
        this.domNode.appendChild(subPartDomNode);
        const render = () => {
            partStore.clear();
            if (toolInvocation.presentation === ToolInvocationPresentation.HiddenAfterComplete && IChatToolInvocation.isComplete(toolInvocation)) {
                dom.hide(this.domNode);
                return;
            }
            dom.show(this.domNode);
            this.subPart = partStore.add(this.createToolInvocationSubPart());
            subPartDomNode.replaceWith(this.subPart.domNode);
            subPartDomNode = this.subPart.domNode;
            // Add class when displaying a confirmation widget
            const isConfirmation = this.subPart instanceof ToolConfirmationSubPart ||
                this.subPart instanceof ChatTerminalToolConfirmationSubPart ||
                this.subPart instanceof ChatModifiedFilesConfirmationSubPart ||
                this.subPart instanceof ChatMissingSandboxDepsConfirmationSubPart ||
                this.subPart instanceof ExtensionsInstallConfirmationWidgetSubPart ||
                this.subPart instanceof ChatToolPostExecuteConfirmationPart;
            this.domNode.classList.toggle('has-confirmation', isConfirmation);
            partStore.add(this.subPart.onNeedsRerender(render));
        };
        const mcpAppRenderData = this.getMcpAppRenderData();
        if (mcpAppRenderData) {
            const shouldRender = derived(r => {
                const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, r);
                return !!outcome && outcome.type !== 0 /* ToolConfirmKind.Denied */ && outcome.type !== 5 /* ToolConfirmKind.Skipped */;
            });
            let appDomNode = document.createElement('div');
            this.domNode.appendChild(appDomNode);
            this._register(autorun(r => {
                if (shouldRender.read(r)) {
                    this.mcpAppPart = r.store.add(this.instantiationService.createInstance(ChatMcpAppSubPart, this.toolInvocation, this._onDidRemount.event, context, mcpAppRenderData));
                    appDomNode.replaceWith(this.mcpAppPart.domNode);
                    appDomNode = this.mcpAppPart.domNode;
                }
                else {
                    this.mcpAppPart = undefined;
                    dom.clearNode(appDomNode);
                }
            }));
        }
        render();
    }
    createToolInvocationSubPart() {
        if (this.toolInvocation.kind === 'toolInvocation') {
            if (this.toolInvocation.toolSpecificData?.kind === 'extensions') {
                return this.instantiationService.createInstance(ExtensionsInstallConfirmationWidgetSubPart, this.toolInvocation, this.context);
            }
            const state = this.toolInvocation.state.get();
            // Handle streaming state - show streaming progress
            if (state.type === 0 /* IChatToolInvocation.StateKind.Streaming */) {
                return this.instantiationService.createInstance(ChatToolStreamingSubPart, this.toolInvocation, this.context, this.renderer);
            }
            if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                if (this.toolInvocation.toolSpecificData?.kind === 'terminal' && !isLegacyChatTerminalToolInvocationData(this.toolInvocation.toolSpecificData) && this.toolInvocation.toolSpecificData.missingSandboxDependencies?.length) {
                    return this.instantiationService.createInstance(ChatMissingSandboxDepsConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
                }
                else if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
                    return this.instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
                }
                else if (this.toolInvocation.toolSpecificData?.kind === 'modifiedFilesConfirmation') {
                    return this.instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, this.toolInvocation, this.context, this.listPool);
                }
                else {
                    return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
                }
            }
            if (state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                return this.instantiationService.createInstance(ChatToolPostExecuteConfirmationPart, this.toolInvocation, this.context);
            }
        }
        if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
            return this.instantiationService.createInstance(ChatTerminalToolProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
        }
        if (this.toolInvocation.toolSpecificData?.kind === 'resources' && this.toolInvocation.toolSpecificData.values.length > 0) {
            return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.toolSpecificData.values, this.listPool);
        }
        if (this.toolInvocation.toolSpecificData?.kind === 'simpleToolInvocation') {
            return this.instantiationService.createInstance(ChatSimpleToolProgressPart, this.toolInvocation, this.context, this.codeBlockStartIndex, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.originMessage, this.toolInvocation.toolSpecificData, false);
        }
        const resultDetails = IChatToolInvocation.resultDetails(this.toolInvocation);
        if (Array.isArray(resultDetails) && resultDetails.length) {
            return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, resultDetails, this.listPool);
        }
        if (isToolResultOutputDetails(resultDetails)) {
            return this.instantiationService.createInstance(ChatToolOutputSubPart, this.toolInvocation, this.context, this._onDidRemount.event);
        }
        if (isToolResultInputOutputDetails(resultDetails)) {
            return this.instantiationService.createInstance(ChatInputOutputMarkdownProgressPart, this.toolInvocation, this.context, this.codeBlockStartIndex, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.originMessage, resultDetails.input, resultDetails.inputLanguage, resultDetails.output, !!resultDetails.isError);
        }
        if (this.toolInvocation.kind === 'toolInvocation' && this.toolInvocation.toolSpecificData?.kind === 'input' && !IChatToolInvocation.isComplete(this.toolInvocation)) {
            return this.instantiationService.createInstance(ChatInputOutputMarkdownProgressPart, this.toolInvocation, this.context, this.codeBlockStartIndex, this.toolInvocation.invocationMessage, this.toolInvocation.originMessage, typeof this.toolInvocation.toolSpecificData.rawInput === 'string' ? this.toolInvocation.toolSpecificData.rawInput : JSON.stringify(this.toolInvocation.toolSpecificData.rawInput, null, 2), undefined, undefined, false);
        }
        return this.instantiationService.createInstance(ChatToolProgressSubPart, this.toolInvocation, this.context, this.renderer, this.announcedToolProgressKeys);
    }
    /**
     * Gets MCP App render data if this tool invocation has MCP App UI.
     * Returns data from either:
     * - toolSpecificData.mcpAppData (for in-progress tools)
     * - result details mcpOutput (for completed tools)
     */
    getMcpAppRenderData() {
        const toolSpecificData = this.toolInvocation.toolSpecificData;
        if (toolSpecificData?.kind === 'input' && toolSpecificData.mcpAppData) {
            const rawInput = typeof toolSpecificData.rawInput === 'string'
                ? toolSpecificData.rawInput
                : JSON.stringify(toolSpecificData.rawInput, null, 2);
            return {
                resourceUri: toolSpecificData.mcpAppData.resourceUri,
                serverDefinitionId: toolSpecificData.mcpAppData.serverDefinitionId,
                collectionId: toolSpecificData.mcpAppData.collectionId,
                input: rawInput,
                sessionResource: this.context.element.sessionResource,
            };
        }
        return undefined;
    }
    onDidRemount() {
        this._onDidRemount.fire();
    }
    hasSameContent(other, followingContent, element) {
        return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && this.toolInvocation.toolCallId === other.toolCallId;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatToolInvocationPart = __decorate([
    __param(8, IInstantiationService),
    __param(9, IChatTodoListService)
], ChatToolInvocationPart);
export { ChatToolInvocationPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xJbnZvY2F0aW9uUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRTVHLE9BQU8sRUFBRSxtQkFBbUIsRUFBaUMsc0NBQXNDLEVBQW1CLE1BQU0sK0NBQStDLENBQUM7QUFFNUssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdkYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFLOUosT0FBTyxFQUFFLDBDQUEwQyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkcsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFxQixNQUFNLHdCQUF3QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FB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