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
import { Separator } from '../../../../../../../base/common/actions.js';
import { getExtensionForMimeType } from '../../../../../../../base/common/mime.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { ILanguageModelToolsConfirmationService } from '../../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, stringifyPromptTsxPart } from '../../../../common/tools/languageModelToolsService.js';
import { AcceptToolPostConfirmationActionId, SkipToolPostConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatToolOutputContentSubPart } from '../chatToolOutputContentSubPart.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
let ChatToolPostExecuteConfirmationPart = class ChatToolPostExecuteConfirmationPart extends AbstractToolConfirmationSubPart {
    get codeblocks() {
        return this._codeblocks;
    }
    constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, confirmationService) {
        super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);
        this.confirmationService = confirmationService;
        this._codeblocks = [];
        const subtitle = toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
        this.render({
            allowActionId: AcceptToolPostConfirmationActionId,
            skipActionId: SkipToolPostConfirmationActionId,
            allowLabel: localize('allow', "Allow Once"),
            skipLabel: localize('skip.post', 'Skip Results'),
            partType: 'chatToolPostConfirmation',
            subtitle: typeof subtitle === 'string' ? subtitle : subtitle?.value,
        });
    }
    createContentElement() {
        if (this.toolInvocation.kind !== 'toolInvocation') {
            throw new Error('post-approval not supported for serialized data');
        }
        const state = this.toolInvocation.state.get();
        if (state.type !== 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
            throw new Error('Tool invocation is not waiting for post-approval');
        }
        return this.createResultsDisplay(this.toolInvocation, state.contentForModel);
    }
    getTitle() {
        return localize('approveToolResult', "Approve Tool Result");
    }
    additionalPrimaryActions() {
        const actions = super.additionalPrimaryActions();
        const state = this.toolInvocation.state.get();
        if (state.type !== 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
            return actions;
        }
        // Get actions from confirmation service
        const confirmActions = this.confirmationService.getPostConfirmActions({
            toolId: this.toolInvocation.toolId,
            source: this.toolInvocation.source,
            parameters: state.parameters
        });
        for (const action of confirmActions) {
            if (action.divider) {
                actions.push(new Separator());
            }
            actions.push({
                label: action.label,
                tooltip: action.detail,
                scope: action.scope,
                data: async () => {
                    const shouldConfirm = await action.select();
                    if (shouldConfirm) {
                        this.confirmWith(this.toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
                    }
                }
            });
        }
        return actions;
    }
    createResultsDisplay(toolInvocation, contentForModel) {
        const container = dom.$('.tool-postconfirm-display');
        if (!contentForModel || contentForModel.length === 0) {
            container.textContent = localize('noResults', 'No results to display');
            return container;
        }
        const parts = [];
        for (const [i, part] of contentForModel.entries()) {
            if (part.kind === 'text') {
                // Display text parts
                parts.push({
                    kind: 'code',
                    title: part.title,
                    data: part.value,
                    languageId: 'plaintext',
                    codeBlockIndex: i,
                    ownerMarkdownPartId: this.codeblocksPartId,
                    options: {
                        hideToolbar: true,
                        reserveWidth: 19,
                        maxHeightInLines: 13,
                        verticalPadding: 5,
                        editorOptions: { wordWrap: 'on', readOnly: true }
                    }
                });
            }
            else if (part.kind === 'promptTsx') {
                // Display TSX parts as JSON-stringified
                const stringified = stringifyPromptTsxPart(part);
                parts.push({
                    kind: 'code',
                    data: stringified,
                    languageId: 'json',
                    codeBlockIndex: i,
                    ownerMarkdownPartId: this.codeblocksPartId,
                    options: {
                        hideToolbar: true,
                        reserveWidth: 19,
                        maxHeightInLines: 13,
                        verticalPadding: 5,
                        editorOptions: { wordWrap: 'on', readOnly: true }
                    }
                });
            }
            else if (part.kind === 'data') {
                // Display data parts
                const mimeType = part.value.mimeType;
                const data = part.value.data;
                // Check if it's an image
                if (mimeType?.startsWith('image/')) {
                    const permalinkBasename = getExtensionForMimeType(mimeType) ? `image${getExtensionForMimeType(mimeType)}` : 'image.bin';
                    const permalinkUri = ChatResponseResource.createUri(this.context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
                    parts.push({ kind: 'data', value: data.buffer, mimeType, uri: permalinkUri, audience: part.audience });
                }
                else {
                    // Try to display as UTF-8 text, otherwise base64
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    try {
                        const text = decoder.decode(data.buffer);
                        parts.push({
                            kind: 'code',
                            data: text,
                            languageId: 'plaintext',
                            codeBlockIndex: i,
                            ownerMarkdownPartId: this.codeblocksPartId,
                            options: {
                                hideToolbar: true,
                                reserveWidth: 19,
                                maxHeightInLines: 13,
                                verticalPadding: 5,
                                editorOptions: { wordWrap: 'on', readOnly: true }
                            }
                        });
                    }
                    catch {
                        // Not valid UTF-8, show base64
                        const base64 = data.toString();
                        parts.push({
                            kind: 'code',
                            data: base64,
                            languageId: 'plaintext',
                            codeBlockIndex: i,
                            ownerMarkdownPartId: this.codeblocksPartId,
                            options: {
                                hideToolbar: true,
                                reserveWidth: 19,
                                maxHeightInLines: 13,
                                verticalPadding: 5,
                                editorOptions: { wordWrap: 'on', readOnly: true }
                            }
                        });
                    }
                }
            }
        }
        if (parts.length > 0) {
            const outputSubPart = this._register(this.instantiationService.createInstance(ChatToolOutputContentSubPart, this.context, parts));
            this._codeblocks.push(...outputSubPart.codeblocks);
            outputSubPart.domNode.classList.add('tool-postconfirm-display');
            return outputSubPart.domNode;
        }
        container.textContent = localize('noDisplayableResults', 'No displayable results');
        return container;
    }
};
ChatToolPostExecuteConfirmationPart = __decorate([
    __param(2, IInstantiationService),
    __param(3, IKeybindingService),
    __param(4, IContextKeyService),
    __param(5, IChatWidgetService),
    __param(6, ILanguageModelToolsService),
    __param(7, ILanguageModelToolsConfirmationService)
], ChatToolPostExecuteConfirmationPart);
export { ChatToolPostExecuteConfirmationPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbFBvc3RFeGVjdXRlQ29uZmlybWF0aW9uUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFN0UsT0FBTyxFQUFFLHNDQUFzQyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDM0gsT0FBTyxFQUFFLDBCQUEwQixFQUFzRSxzQkFBc0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQy9MLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNILE9BQU8sRUFBc0Isa0JBQWtCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUcxRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRixP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