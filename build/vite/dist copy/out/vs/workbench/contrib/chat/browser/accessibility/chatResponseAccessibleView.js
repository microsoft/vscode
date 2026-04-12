/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from '../../common/chatService/chatService.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString } from '../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../chat.js';
import { isLocation } from '../../../../../editor/common/languages.js';
export class ChatResponseAccessibleView {
    constructor() {
        this.priority = 100;
        this.name = 'panelChat';
        this.type = "view" /* AccessibleViewType.View */;
        this.when = ChatContextKeys.inChatSession;
    }
    getProvider(accessor) {
        const widgetService = accessor.get(IChatWidgetService);
        const storageService = accessor.get(IStorageService);
        const widget = widgetService.lastFocusedWidget;
        if (!widget) {
            return;
        }
        const chatInputFocused = widget.hasInputFocus();
        if (chatInputFocused) {
            widget.focusResponseItem();
        }
        const verifiedWidget = widget;
        let focusedItem = verifiedWidget.getFocus();
        if (!focusedItem || !isResponseVM(focusedItem)) {
            const responseItems = verifiedWidget.viewModel?.getItems().filter(isResponseVM);
            const lastResponse = responseItems?.at(-1);
            if (lastResponse) {
                focusedItem = lastResponse;
                verifiedWidget.focus(lastResponse);
            }
        }
        if (!focusedItem || !isResponseVM(focusedItem)) {
            return;
        }
        return new ChatResponseAccessibleProvider(verifiedWidget, focusedItem, chatInputFocused, storageService);
    }
}
export const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY = 'chat.accessibleView.includeThinking';
const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT = true;
export function isThinkingContentIncludedInAccessibleView(storageService) {
    return storageService.getBoolean(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, 0 /* StorageScope.PROFILE */, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT);
}
function isOutputDetailsSerialized(obj) {
    return typeof obj === 'object' && obj !== null && 'output' in obj &&
        typeof obj.output === 'object' &&
        obj.output?.type === 'data' &&
        typeof obj.output?.base64Data === 'string';
}
export function getToolSpecificDataDescription(toolSpecificData) {
    if (!toolSpecificData) {
        return '';
    }
    if (isLegacyChatTerminalToolInvocationData(toolSpecificData) || toolSpecificData.kind === 'terminal') {
        const terminalData = migrateLegacyTerminalToolSpecificData(toolSpecificData);
        return terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
    }
    switch (toolSpecificData.kind) {
        case 'subagent': {
            const parts = [];
            if (toolSpecificData.agentName) {
                parts.push(localize('subagentName', "Agent: {0}", toolSpecificData.agentName));
            }
            if (toolSpecificData.description) {
                parts.push(toolSpecificData.description);
            }
            if (toolSpecificData.prompt) {
                parts.push(localize('subagentPrompt', "Task: {0}", toolSpecificData.prompt));
            }
            return parts.join('. ') || '';
        }
        case 'extensions':
            return toolSpecificData.extensions.length > 0
                ? localize('extensionsList', "Extensions: {0}", toolSpecificData.extensions.join(', '))
                : '';
        case 'todoList': {
            const todos = toolSpecificData.todoList;
            if (todos.length === 0) {
                return '';
            }
            const todoDescriptions = todos.map(t => localize('todoItem', "{0} ({1})", t.title, t.status));
            return localize('todoListCount', "{0} items: {1}", todos.length, todoDescriptions.join('; '));
        }
        case 'pullRequest':
            return localize('pullRequestInfo', "PR: {0} by {1}", toolSpecificData.title, toolSpecificData.author);
        case 'input':
            return typeof toolSpecificData.rawInput === 'string'
                ? toolSpecificData.rawInput
                : JSON.stringify(toolSpecificData.rawInput);
        case 'resources': {
            const values = toolSpecificData.values;
            if (values.length === 0) {
                return '';
            }
            const paths = values.map(v => {
                if ('uri' in v && 'range' in v) {
                    // Location
                    return `${v.uri.fsPath || v.uri.path}:${v.range.startLineNumber}`;
                }
                else {
                    // URI
                    return v.fsPath || v.path;
                }
            }).join(', ');
            return localize('resourcesList', "Resources: {0}", paths);
        }
        case 'simpleToolInvocation': {
            const inputText = toolSpecificData.input;
            const outputText = toolSpecificData.output;
            return localize('simpleToolInvocation', "Input: {0}, Output: {1}", inputText, outputText);
        }
        case 'modifiedFilesConfirmation': {
            if (toolSpecificData.modifiedFiles.length === 0) {
                return '';
            }
            return localize('modifiedFilesConfirmation', "Modified files: {0}", toolSpecificData.modifiedFiles.map(file => {
                const revivedUri = URI.revive(file.uri);
                return revivedUri.fsPath || revivedUri.path;
            }).join(', '));
        }
        default:
            return '';
    }
}
export function getResultDetailsDescription(resultDetails) {
    if (!resultDetails) {
        return {};
    }
    if (Array.isArray(resultDetails)) {
        const files = resultDetails.map(ref => {
            if (URI.isUri(ref)) {
                return ref.fsPath || ref.path;
            }
            return ref.uri.fsPath || ref.uri.path;
        });
        return { files };
    }
    if (isToolResultInputOutputDetails(resultDetails)) {
        return {
            input: resultDetails.input,
            isError: resultDetails.isError
        };
    }
    if (isOutputDetailsSerialized(resultDetails)) {
        return {
            input: localize('binaryOutput', "{0} data", resultDetails.output.mimeType)
        };
    }
    if (isToolResultOutputDetails(resultDetails)) {
        return {
            input: localize('binaryOutput', "{0} data", resultDetails.output.mimeType)
        };
    }
    return {};
}
export function getToolInvocationA11yDescription(invocationMessage, pastTenseMessage, toolSpecificData, resultDetails, isComplete) {
    const parts = [];
    const message = isComplete && pastTenseMessage ? pastTenseMessage : invocationMessage;
    if (message) {
        parts.push(message);
    }
    const toolDataDesc = getToolSpecificDataDescription(toolSpecificData);
    if (toolDataDesc) {
        parts.push(toolDataDesc);
    }
    if (isComplete && resultDetails) {
        const details = getResultDetailsDescription(resultDetails);
        if (details.isError) {
            parts.unshift(localize('errored', "Errored"));
        }
        if (details.input && !toolDataDesc) {
            parts.push(localize('input', "Input: {0}", details.input));
        }
        if (details.files && details.files.length > 0) {
            parts.push(localize('files', "Files: {0}", details.files.join(', ')));
        }
    }
    return parts.join('. ');
}
class ChatResponseAccessibleProvider extends Disposable {
    constructor(_widget, item, _wasOpenedFromInput, _storageService) {
        super();
        this._widget = _widget;
        this._wasOpenedFromInput = _wasOpenedFromInput;
        this._storageService = _storageService;
        this._focusedItemDisposables = this._register(new DisposableStore());
        this._storageDisposables = this._register(new DisposableStore());
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this.id = "panelChat" /* AccessibleViewProviderId.PanelChat */;
        this.verbositySettingKey = "accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */;
        this.options = { type: "view" /* AccessibleViewType.View */ };
        this._storageDisposables.add(this._storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, this._storageDisposables)(() => {
            this._onDidChangeContent.fire();
        }));
        this._setFocusedItem(item);
    }
    provideContent() {
        return this._getContent(this._focusedItem);
    }
    _setFocusedItem(item) {
        this._focusedItem = item;
        this._focusedItemDisposables.clear();
        if (isResponseVM(item)) {
            this._focusedItemDisposables.add(item.model.onDidChange(() => this._onDidChangeContent.fire()));
        }
    }
    _renderMessageAsPlaintext(message) {
        return typeof message === 'string' ? message : stripIcons(renderAsPlaintext(message, { useLinkFormatter: true }));
    }
    _getContent(item) {
        const contentParts = [];
        if (!isResponseVM(item)) {
            return '';
        }
        if ('errorDetails' in item && item.errorDetails) {
            contentParts.push(item.errorDetails.message);
        }
        // Process all parts in order to maintain the natural flow
        for (const part of item.response.value) {
            switch (part.kind) {
                case 'thinking': {
                    if (!this._shouldIncludeThinkingContent()) {
                        break;
                    }
                    const thinkingValue = Array.isArray(part.value) ? part.value.join('') : (part.value || '');
                    const trimmed = thinkingValue.trim();
                    if (trimmed) {
                        contentParts.push(localize('thinkingContent', "Thinking: {0}", trimmed));
                    }
                    break;
                }
                case 'markdownContent': {
                    const text = renderAsPlaintext(part.content, { includeCodeBlocksFences: true, useLinkFormatter: true });
                    if (text.trim()) {
                        contentParts.push(text);
                    }
                    break;
                }
                case 'inlineReference': {
                    const ref = part.inlineReference;
                    let text;
                    if (URI.isUri(ref)) {
                        const name = part.name || basename(ref);
                        const path = ref.scheme === 'file' ? ref.path : ref.toString(true);
                        text = name !== path ? `${name} (${path})` : path;
                    }
                    else if (isLocation(ref)) {
                        const name = part.name || basename(ref.uri);
                        const path = ref.uri.scheme === 'file' ? ref.uri.path : ref.uri.toString(true);
                        text = `${name} (${path}:${ref.range.startLineNumber})`;
                    }
                    else {
                        // IWorkspaceSymbol
                        const path = ref.location.uri.scheme === 'file' ? (ref.location.uri.fsPath || ref.location.uri.path) : ref.location.uri.toString(true);
                        text = `${ref.name} (${path}:${ref.location.range.startLineNumber})`;
                    }
                    contentParts.push(text);
                    break;
                }
                case 'elicitation2':
                case 'elicitationSerialized': {
                    const title = part.title;
                    let elicitationContent = '';
                    if (typeof title === 'string') {
                        elicitationContent += `${title}\n`;
                    }
                    else if (isMarkdownString(title)) {
                        elicitationContent += renderAsPlaintext(title, { includeCodeBlocksFences: true }) + '\n';
                    }
                    const message = part.message;
                    if (isMarkdownString(message)) {
                        elicitationContent += renderAsPlaintext(message, { includeCodeBlocksFences: true });
                    }
                    else {
                        elicitationContent += message;
                    }
                    if (elicitationContent.trim()) {
                        contentParts.push(elicitationContent);
                    }
                    break;
                }
                case 'toolInvocation': {
                    const state = part.state.get();
                    if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ && state.confirmationMessages?.title) {
                        const title = this._renderMessageAsPlaintext(state.confirmationMessages.title);
                        const message = state.confirmationMessages.message ? this._renderMessageAsPlaintext(state.confirmationMessages.message) : '';
                        const toolDataDesc = getToolSpecificDataDescription(part.toolSpecificData);
                        let toolContent = title;
                        if (toolDataDesc) {
                            toolContent += `: ${toolDataDesc}`;
                        }
                        if (message) {
                            toolContent += `\n${message}`;
                        }
                        contentParts.push(toolContent);
                    }
                    else if (state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                        const postApprovalDetails = isToolResultInputOutputDetails(state.resultDetails)
                            ? state.resultDetails.input
                            : isToolResultOutputDetails(state.resultDetails)
                                ? undefined
                                : toolContentToA11yString(state.contentForModel);
                        contentParts.push(localize('toolPostApprovalA11yView', "Approve results of {0}? Result: ", part.toolId) + (postApprovalDetails ?? ''));
                    }
                    else {
                        const resultDetails = IChatToolInvocation.resultDetails(part);
                        const isComplete = IChatToolInvocation.isComplete(part);
                        const description = getToolInvocationA11yDescription(this._renderMessageAsPlaintext(part.invocationMessage), part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : undefined, part.toolSpecificData, resultDetails, isComplete);
                        if (description) {
                            contentParts.push(description);
                        }
                    }
                    break;
                }
                case 'toolInvocationSerialized': {
                    const description = getToolInvocationA11yDescription(this._renderMessageAsPlaintext(part.invocationMessage), part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : undefined, part.toolSpecificData, part.resultDetails, part.isComplete);
                    if (description) {
                        contentParts.push(description);
                    }
                    break;
                }
            }
        }
        return this._normalizeWhitespace(contentParts.join('\n'));
    }
    _normalizeWhitespace(content) {
        const lines = content.split(/\r?\n/);
        const normalized = [];
        for (const line of lines) {
            if (line.trim().length === 0) {
                continue;
            }
            normalized.push(line);
        }
        return normalized.join('\n');
    }
    _shouldIncludeThinkingContent() {
        return isThinkingContentIncludedInAccessibleView(this._storageService);
    }
    onClose() {
        this._widget.reveal(this._focusedItem);
        if (this._wasOpenedFromInput) {
            this._widget.focusInput();
        }
        else {
            this._widget.focus(this._focusedItem);
        }
    }
    provideNextContent() {
        const next = this._widget.getSibling(this._focusedItem, 'next');
        if (next) {
            this._setFocusedItem(next);
            return this._getContent(next);
        }
        return;
    }
    providePreviousContent() {
        const previous = this._widget.getSibling(this._focusedItem, 'previous');
        if (previous) {
            this._setFocusedItem(previous);
            return this._getContent(previous);
        }
        return;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eS9jaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFtQixnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpELE9BQU8sRUFBRSxlQUFlLEVBQWdCLE1BQU0sbURBQW1ELENBQUM7QUFFbEcsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBNE8sbUJBQW1CLEVBQStHLHNDQUFzQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN2MsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBMkQsOEJBQThCLEVBQUUseUJBQXlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztB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