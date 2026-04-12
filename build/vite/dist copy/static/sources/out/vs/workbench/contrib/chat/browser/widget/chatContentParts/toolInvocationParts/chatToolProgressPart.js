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
import { renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../../../base/common/iconLabels.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { shouldShimmerForTool } from './chatToolPartUtilities.js';
let ChatToolProgressSubPart = class ChatToolProgressSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, context, renderer, announcedToolProgressKeys, instantiationService, configurationService) {
        super(toolInvocation);
        this.context = context;
        this.renderer = renderer;
        this.announcedToolProgressKeys = announcedToolProgressKeys;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.codeblocks = [];
        this.domNode = this.createProgressPart();
    }
    createProgressPart() {
        const isComplete = IChatToolInvocation.isComplete(this.toolInvocation);
        if (isComplete && this.toolIsConfirmed && this.toolInvocation.pastTenseMessage) {
            const key = this.getAnnouncementKey('complete');
            const completionContent = this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage;
            // Don't render anything if there's no meaningful content
            if (!this.hasMeaningfulContent(completionContent)) {
                return document.createElement('div');
            }
            const shouldAnnounce = this.toolInvocation.kind === 'toolInvocation' && this.hasMeaningfulContent(completionContent) ? this.computeShouldAnnounce(key) : false;
            const part = this.renderProgressContent(completionContent, shouldAnnounce);
            this._register(part);
            return part.domNode;
        }
        else {
            const container = document.createElement('div');
            this._register(autorun(reader => {
                let progressContent;
                const key = this.getAnnouncementKey('progress');
                if (this.toolInvocation.kind === 'toolInvocation') {
                    const state = this.toolInvocation.state.read(reader);
                    // Handle cancelled state with reason message
                    if (state.type === 5 /* IChatToolInvocation.StateKind.Cancelled */ && state.reasonMessage) {
                        progressContent = state.reasonMessage;
                    }
                    else if (state.type === 2 /* IChatToolInvocation.StateKind.Executing */) {
                        const progress = state.progress.read(reader);
                        progressContent = progress?.message ?? this.toolInvocation.invocationMessage;
                    }
                    else {
                        progressContent = this.toolInvocation.invocationMessage;
                    }
                }
                else {
                    progressContent = this.toolInvocation.invocationMessage;
                }
                // Don't render anything if there's no meaningful content
                if (!this.hasMeaningfulContent(progressContent)) {
                    dom.clearNode(container);
                    return;
                }
                const shouldAnnounce = this.toolInvocation.kind === 'toolInvocation' && this.hasMeaningfulContent(progressContent) ? this.computeShouldAnnounce(key) : false;
                const part = reader.store.add(this.renderProgressContent(progressContent, shouldAnnounce));
                dom.reset(container, part.domNode);
            }));
            return container;
        }
    }
    get toolIsConfirmed() {
        const c = IChatToolInvocation.executionConfirmedOrDenied(this.toolInvocation);
        return !!c && c.type !== 0 /* ToolConfirmKind.Denied */;
    }
    renderProgressContent(content, shouldAnnounce) {
        if (typeof content === 'string') {
            content = new MarkdownString().appendText(content);
        }
        const progressMessage = {
            kind: 'progressMessage',
            content
        };
        if (shouldAnnounce) {
            this.provideScreenReaderStatus(content);
        }
        return this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, this.getIcon(), this.toolInvocation, shouldShimmerForTool(this.toolInvocation));
    }
    getAnnouncementKey(kind) {
        return `${kind}:${this.toolInvocation.toolCallId}`;
    }
    computeShouldAnnounce(key) {
        if (!this.announcedToolProgressKeys) {
            return false;
        }
        if (!this.configurationService.getValue("accessibility.verboseChatProgressUpdates" /* AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates */)) {
            return false;
        }
        if (this.announcedToolProgressKeys.has(key)) {
            return false;
        }
        this.announcedToolProgressKeys.add(key);
        return true;
    }
    provideScreenReaderStatus(content) {
        const message = typeof content === 'string' ? content : stripIcons(renderAsPlaintext(content, { useLinkFormatter: true }));
        status(message);
    }
    hasMeaningfulContent(content) {
        if (!content) {
            return false;
        }
        const text = typeof content === 'string' ? content : content.value;
        return text.trim().length > 0;
    }
};
ChatToolProgressSubPart = __decorate([
    __param(4, IInstantiationService),
    __param(5, IConfigurationService)
], ChatToolProgressSubPart);
export { ChatToolProgressSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xQcm9ncmVzc1BhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbFByb2dyZXNzUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUF3QixtQkFBbUIsRUFBa0QsTUFBTSwrQ0FBK0MsQ0FBQztBQUkxSixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUUzRCxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLDZCQUE2QjtJQUt6RSxZQUNDLGNBQW1FLEVBQ2xELE9BQXNDLEVBQ3RDLFFBQTJCLEVBQzNCLHlCQUFrRCxFQUM1Qyxv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