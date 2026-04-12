/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ChatDebugHookResult } from '../../common/chatDebugService.js';
import { renderSection, tokenizeContent } from './chatDebugToolCallContentRenderer.js';
const $ = DOM.$;
/**
 * Render a resolved hook execution content with structured sections for
 * hook type, command, result, duration, input, and output.
 * When JSON is detected in input/output, renders it with syntax highlighting.
 */
export async function renderHookContent(content, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    // Header: hook type
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, content.hookType));
    // Status summary line
    const statusParts = [];
    if (content.result !== undefined) {
        statusParts.push(formatHookResult(content.result));
    }
    if (content.exitCode !== undefined) {
        statusParts.push(localize('chatDebug.hook.exitCode', "Exit Code: {0}", content.exitCode));
    }
    if (content.durationInMillis !== undefined) {
        statusParts.push(localize('chatDebug.hook.duration', "{0}ms", content.durationInMillis));
    }
    if (statusParts.length > 0) {
        DOM.append(container, $('div.chat-debug-message-content-summary', undefined, statusParts.join(' \u00b7 ')));
    }
    // Build collapsible sections for command, input, output, and error
    const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
    if (content.command) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.command, languageService);
        renderSection(sectionsContainer, localize('chatDebug.hook.command', "Command"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    if (content.input) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.input, languageService);
        renderSection(sectionsContainer, localize('chatDebug.hook.input', "Input"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    if (content.output) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.output, languageService);
        renderSection(sectionsContainer, localize('chatDebug.hook.output', "Output"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    if (content.errorMessage) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.errorMessage, languageService);
        renderSection(sectionsContainer, localize('chatDebug.hook.error', "Error"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    return { element: container, disposables };
}
function formatHookResult(result) {
    switch (result) {
        case ChatDebugHookResult.Success:
            return localize('chatDebug.hook.result.success', "Success");
        case ChatDebugHookResult.Error:
            return localize('chatDebug.hook.result.error', "Error");
        case ChatDebugHookResult.NonBlockingError:
            return localize('chatDebug.hook.result.nonBlockingError', "Non-blocking Error");
        default:
            return String(result);
    }
}
/**
 * Convert a resolved hook content to plain text for clipboard / editor output.
 */
export function hookContentToPlainText(content) {
    const lines = [];
    lines.push(localize('chatDebug.hook.typeLabel', "Hook Type: {0}", content.hookType));
    if (content.result !== undefined) {
        lines.push(localize('chatDebug.hook.resultLabel', "Result: {0}", formatHookResult(content.result)));
    }
    if (content.exitCode !== undefined) {
        lines.push(localize('chatDebug.hook.exitCodeLabel', "Exit Code: {0}", content.exitCode));
    }
    if (content.durationInMillis !== undefined) {
        lines.push(localize('chatDebug.hook.durationLabel', "Duration: {0}ms", content.durationInMillis));
    }
    if (content.command) {
        lines.push('');
        lines.push(`[${localize('chatDebug.hook.command', "Command")}]`);
        lines.push(content.command);
    }
    if (content.input) {
        lines.push('');
        lines.push(`[${localize('chatDebug.hook.input', "Input")}]`);
        try {
            const parsed = JSON.parse(content.input);
            lines.push(JSON.stringify(parsed, null, 2));
        }
        catch {
            lines.push(content.input);
        }
    }
    if (content.output) {
        lines.push('');
        lines.push(`[${localize('chatDebug.hook.output', "Output")}]`);
        try {
            const parsed = JSON.parse(content.output);
            lines.push(JSON.stringify(parsed, null, 2));
        }
        catch {
            lines.push(content.output);
        }
    }
    if (content.errorMessage) {
        lines.push('');
        lines.push(`[${localize('chatDebug.hook.error', "Error")}]`);
        lines.push(content.errorMessage);
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnSG9va0NvbnRlbnRSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnSG9va0NvbnRlbnRSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHakQsT0FBTyxFQUFFLG1CQUFtQixFQUE4QixNQUFNLGtDQUFrQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFdkYsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVoQjs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxPQUFtQyxFQUFFLGVBQWlDLEVBQUUsZ0JBQW9DLEVBQUUsVUFBb0M7SUFDekwsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztJQUN0RCxTQUFTLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUV2QixvQkFBb0I7SUFDcEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHNDQUFzQyxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUU5RixzQkFBc0I7SUFDdEIsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO0lBQ2pDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FB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LENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDMUIsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNmLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdELEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekIsQ0FBQyJ9