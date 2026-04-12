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
var ChatSimpleToolProgressPart_1;
import { ProgressBar } from '../../../../../../../base/browser/ui/progressbar/progressbar.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { ChatCollapsibleInputOutputContentPart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage, shouldShimmerForTool } from './chatToolPartUtilities.js';
let ChatSimpleToolProgressPart = class ChatSimpleToolProgressPart extends BaseChatToolInvocationSubPart {
    static { ChatSimpleToolProgressPart_1 = this; }
    /** Remembers expanded tool parts on re-render */
    static { this._expandedByDefault = new WeakMap(); }
    get codeblocks() {
        return this.collapsibleListPart.codeblocks;
    }
    constructor(toolInvocation, context, codeBlockStartIndex, message, subtitle, data, isError, instantiationService, modelService, languageService, configurationService) {
        super(toolInvocation);
        let codeBlockIndex = codeBlockStartIndex;
        // Helper to convert string or MarkdownString to a collapsible part
        const createIOPart = (content, label) => {
            return {
                kind: 'code',
                data: content,
                languageId: 'plaintext',
                codeBlockIndex: codeBlockIndex++,
                ownerMarkdownPartId: this.codeblocksPartId,
                options: {
                    hideToolbar: true,
                    reserveWidth: 19,
                    maxHeightInLines: 13,
                    verticalPadding: 5,
                    editorOptions: {
                        wordWrap: 'on'
                    }
                }
            };
        };
        const inputPart = createIOPart(data.input, 'Input');
        const outputParts = data.output ? [createIOPart(data.output, 'Output')] : undefined;
        const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(ChatCollapsibleInputOutputContentPart, message, subtitle, this.getAutoApprovalMessageContent(), context, inputPart, outputParts ? { parts: outputParts } : undefined, isError, 
        // Expand by default when there's an error (if setting enabled),
        // otherwise use the stored expanded state (defaulting to false)
        (isError && configurationService.getValue(ChatConfiguration.AutoExpandToolFailures)) ||
            (ChatSimpleToolProgressPart_1._expandedByDefault.get(toolInvocation) ?? false), shouldShimmerForTool(toolInvocation)));
        this._register(toDisposable(() => ChatSimpleToolProgressPart_1._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));
        const progressObservable = toolInvocation.kind === 'toolInvocation' ? toolInvocation.state.map((s, r) => s.type === 2 /* IChatToolInvocation.StateKind.Executing */ ? s.progress.read(r) : undefined) : undefined;
        const progressBar = new Lazy(() => this._register(new ProgressBar(collapsibleListPart.domNode)));
        if (progressObservable) {
            this._register(autorun(reader => {
                const progress = progressObservable?.read(reader);
                if (progress?.message) {
                    collapsibleListPart.title = progress.message;
                }
                if (progress?.progress && !IChatToolInvocation.isComplete(toolInvocation, reader)) {
                    progressBar.value.setWorked(progress.progress * 100);
                }
            }));
        }
        this.domNode = collapsibleListPart.domNode;
    }
    getAutoApprovalMessageContent() {
        return getToolApprovalMessage(this.toolInvocation);
    }
};
ChatSimpleToolProgressPart = ChatSimpleToolProgressPart_1 = __decorate([
    __param(7, IInstantiationService),
    __param(8, IModelService),
    __param(9, ILanguageService),
    __param(10, IConfigurationService)
], ChatSimpleToolProgressPart);
export { ChatSimpleToolProgressPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNpbXBsZVRvb2xQcm9ncmVzc1BhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0U2ltcGxlVG9vbFByb2dyZXNzUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRTlGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRSxPQUFPLEVBQWlDLG1CQUFtQixFQUFpQyxNQUFNLCtDQUErQyxDQUFDO0FBR2xKLE9BQU8sRUFBRSxxQ0FBcUMsRUFBcUQsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoSixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVuRixJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEy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