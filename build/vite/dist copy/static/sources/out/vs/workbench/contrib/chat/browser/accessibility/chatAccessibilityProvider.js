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
import { marked } from '../../../../../base/common/marked/marked.js';
import { isDefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString } from '../../common/tools/languageModelToolsService.js';
import { CancelChatActionId } from '../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../actions/chatToolActions.js';
export const getToolConfirmationAlert = (accessor, toolInvocation) => {
    const keybindingService = accessor.get(IKeybindingService);
    const contextKeyService = accessor.get(IContextKeyService);
    const acceptKb = keybindingService.lookupKeybinding(AcceptToolConfirmationActionId, contextKeyService)?.getAriaLabel();
    const cancelKb = keybindingService.lookupKeybinding(CancelChatActionId, contextKeyService)?.getAriaLabel();
    const text = toolInvocation.map(v => {
        const state = v.state.get();
        if (state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
            const detail = isToolResultInputOutputDetails(state.resultDetails)
                ? state.resultDetails.input
                : isToolResultOutputDetails(state.resultDetails)
                    ? undefined
                    : toolContentToA11yString(state.contentForModel);
            return {
                title: localize('toolPostApprovalTitle', "Approve results of tool"),
                detail: detail,
            };
        }
        if (!(state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ && state.confirmationMessages?.message)) {
            return;
        }
        let input = '';
        if (v.toolSpecificData) {
            if (v.toolSpecificData.kind === 'terminal') {
                const terminalData = migrateLegacyTerminalToolSpecificData(v.toolSpecificData);
                input = terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
            }
            else if (v.toolSpecificData.kind === 'extensions') {
                input = JSON.stringify(v.toolSpecificData.extensions);
            }
            else if (v.toolSpecificData.kind === 'input') {
                input = JSON.stringify(v.toolSpecificData.rawInput);
            }
            else if (v.toolSpecificData.kind === 'modifiedFilesConfirmation') {
                input = localize('modifiedFilesConfirmationInput', '{0} files', v.toolSpecificData.modifiedFiles.length);
            }
        }
        const titleObj = state.confirmationMessages?.title;
        const title = typeof titleObj === 'string' ? titleObj : titleObj?.value || '';
        return {
            title: (title + (input ? ': ' + input : '')).trim(),
            detail: undefined,
        };
    }).filter(isDefined);
    let message = acceptKb && cancelKb
        ? localize('toolInvocationsHintKb', "Chat confirmation required: {0}. Press {1} to accept or {2} to cancel.", text.map(t => t.title).join(', '), acceptKb, cancelKb)
        : localize('toolInvocationsHint', "Chat confirmation required: {0}", text.map(t => t.title).join(', '));
    if (text.some(t => t.detail)) {
        message += ' ' + localize('toolInvocationsHintDetails', "Details: {0}", text.map(t => t.detail ? t.detail : '').join(' '));
    }
    return message;
};
let ChatAccessibilityProvider = class ChatAccessibilityProvider {
    constructor(_accessibleViewService, _instantiationService) {
        this._accessibleViewService = _accessibleViewService;
        this._instantiationService = _instantiationService;
    }
    getWidgetRole() {
        return 'list';
    }
    getRole(element) {
        return 'listitem';
    }
    getWidgetAriaLabel() {
        return localize('chat', "Chat");
    }
    getAriaLabel(element) {
        if (isRequestVM(element)) {
            return element.messageText;
        }
        if (isResponseVM(element)) {
            return this._getLabelWithInfo(element);
        }
        return '';
    }
    _getLabelWithInfo(element) {
        const accessibleViewHint = this._accessibleViewService.getOpenAriaHint("accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */);
        let label = '';
        const toolInvocation = element.response.value.filter(v => v.kind === 'toolInvocation');
        let toolInvocationHint = '';
        if (toolInvocation.length) {
            const waitingForConfirmation = toolInvocation.filter(v => {
                const state = v.state.get().type;
                return state === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */;
            });
            if (waitingForConfirmation.length) {
                toolInvocationHint = this._instantiationService.invokeFunction(getToolConfirmationAlert, toolInvocation);
            }
        }
        const tableCount = marked.lexer(element.response.toString()).filter(token => token.type === 'table')?.length ?? 0;
        let tableCountHint = '';
        switch (tableCount) {
            case 0:
                break;
            case 1:
                tableCountHint = localize('singleTableHint', "1 table ");
                break;
            default:
                tableCountHint = localize('multiTableHint', "{0} tables ", tableCount);
                break;
        }
        const fileTreeCount = element.response.value.filter(v => v.kind === 'treeData').length ?? 0;
        let fileTreeCountHint = '';
        switch (fileTreeCount) {
            case 0:
                break;
            case 1:
                fileTreeCountHint = localize('singleFileTreeHint', "1 file tree ");
                break;
            default:
                fileTreeCountHint = localize('multiFileTreeHint', "{0} file trees ", fileTreeCount);
                break;
        }
        const elicitationCount = element.response.value.filter(v => v.kind === 'elicitation2' || v.kind === 'elicitationSerialized');
        let elicitationHint = '';
        for (const elicitation of elicitationCount) {
            const title = typeof elicitation.title === 'string' ? elicitation.title : elicitation.title.value;
            const message = typeof elicitation.message === 'string' ? elicitation.message : elicitation.message.value;
            elicitationHint += title + ' ' + message;
        }
        const codeBlockCount = marked.lexer(element.response.toString()).filter(token => token.type === 'code')?.length ?? 0;
        switch (codeBlockCount) {
            case 0:
                label = accessibleViewHint
                    ? localize('noCodeBlocksHint', "{0}{1}{2}{3}{4} {5}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString(), accessibleViewHint)
                    : localize('noCodeBlocks', "{0}{1}{2} {3}", fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString());
                break;
            case 1:
                label = accessibleViewHint
                    ? localize('singleCodeBlockHint', "{0}{1}{2}1 code block: {3} {4}{5}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString(), accessibleViewHint)
                    : localize('singleCodeBlock', "{0}{1}1 code block: {2} {3}", fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString());
                break;
            default:
                label = accessibleViewHint
                    ? localize('multiCodeBlockHint', "{0}{1}{2}{3} code blocks: {4}{5} {6}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, codeBlockCount, element.response.toString(), accessibleViewHint)
                    : localize('multiCodeBlock', "{0}{1}{2} code blocks: {3} {4}", fileTreeCountHint, elicitationHint, codeBlockCount, tableCountHint, element.response.toString());
                break;
        }
        return label;
    }
};
ChatAccessibilityProvider = __decorate([
    __param(0, IAccessibleViewService),
    __param(1, IInstantiationService)
], ChatAccessibilityProvider);
export { ChatAccessibilityProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFjY2Vzc2liaWxpdHlQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5L2NoYXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRTdFLE9BQU8sRUFBMEIsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSx5QkFBeUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3JKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRy9FLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLENBQUMsUUFBMEIsRUFBRSxjQUFxQyxFQUFFLEVBQUU7SUFDN0csTUFBTSxpQkFBaUIsR0FBRyxR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