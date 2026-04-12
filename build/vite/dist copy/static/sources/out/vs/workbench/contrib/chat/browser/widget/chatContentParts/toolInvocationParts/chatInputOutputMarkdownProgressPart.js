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
var ChatInputOutputMarkdownProgressPart_1;
import { ProgressBar } from '../../../../../../../base/browser/ui/progressbar/progressbar.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { getExtensionForMimeType } from '../../../../../../../base/common/mime.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { ChatCollapsibleInputOutputContentPart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage, shouldShimmerForTool } from './chatToolPartUtilities.js';
let ChatInputOutputMarkdownProgressPart = class ChatInputOutputMarkdownProgressPart extends BaseChatToolInvocationSubPart {
    static { ChatInputOutputMarkdownProgressPart_1 = this; }
    /** Remembers expanded tool parts on re-render */
    static { this._expandedByDefault = new WeakMap(); }
    get codeblocks() {
        return this.collapsibleListPart.codeblocks;
    }
    constructor(toolInvocation, context, codeBlockStartIndex, message, subtitle, input, inputLanguage, output, isError, instantiationService, modelService, languageService, configurationService) {
        super(toolInvocation);
        let codeBlockIndex = codeBlockStartIndex;
        // Simple factory to create code part data objects
        const createCodePart = (data, languageId = 'json') => ({
            kind: 'code',
            data,
            languageId,
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
        });
        let processedOutput = output;
        if (typeof output === 'string') { // back compat with older stored versions
            processedOutput = [{ type: 'embed', value: output, isText: true }];
        }
        const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(ChatCollapsibleInputOutputContentPart, message, subtitle, this.getAutoApproveMessageContent(), context, createCodePart(input, inputLanguage), processedOutput && processedOutput.length > 0 ? {
            parts: processedOutput.map((o, i) => {
                const permalinkBasename = o.type === 'ref' || o.uri
                    ? basename(o.uri)
                    : o.mimeType && getExtensionForMimeType(o.mimeType)
                        ? `file${getExtensionForMimeType(o.mimeType)}`
                        : 'file' + (o.isText ? '.txt' : '.bin');
                if (o.type === 'ref') {
                    return { kind: 'data', uri: o.uri, mimeType: o.mimeType };
                }
                else if (o.isText && !o.asResource) {
                    return createCodePart(o.value);
                }
                else {
                    // Defer base64 decoding to avoid expensive decode during scroll.
                    // The value will be decoded lazily in ChatToolOutputContentSubPart.
                    const permalinkUri = ChatResponseResource.createUri(context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
                    if (!o.isText) {
                        // Pass base64 string for lazy decoding
                        return { kind: 'data', base64Value: o.value, mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
                    }
                    else {
                        // Text content: encode immediately since it's not expensive
                        return { kind: 'data', value: new TextEncoder().encode(o.value), mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
                    }
                }
            }),
        } : undefined, isError, 
        // Expand by default when there's an error (if setting enabled),
        // otherwise use the stored expanded state (defaulting to false)
        (isError && configurationService.getValue(ChatConfiguration.AutoExpandToolFailures)) ||
            (ChatInputOutputMarkdownProgressPart_1._expandedByDefault.get(toolInvocation) ?? false), shouldShimmerForTool(toolInvocation)));
        this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart_1._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));
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
    getAutoApproveMessageContent() {
        return getToolApprovalMessage(this.toolInvocation);
    }
};
ChatInputOutputMarkdownProgressPart = ChatInputOutputMarkdownProgressPart_1 = __decorate([
    __param(9, IInstantiationService),
    __param(10, IModelService),
    __param(11, ILanguageService),
    __param(12, IConfigurationService)
], ChatInputOutputMarkdownProgressPart);
export { ChatInputOutputMarkdownProgressPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRTlGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLG1CQUFtQixFQUFpQyxNQUFNLCtDQUErQyxDQUFDO0FBSW5ILE9BQU8sRUFBRSxxQ0FBcUMsRUFBcUQsTUFB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