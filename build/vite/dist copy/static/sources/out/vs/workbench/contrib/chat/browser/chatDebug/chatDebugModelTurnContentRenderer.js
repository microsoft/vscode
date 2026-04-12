/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { renderSection, tokenizeContent } from './chatDebugToolCallContentRenderer.js';
import { safeIntl } from '../../../../../base/common/date.js';
const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
/**
 * Render a resolved model turn content with structured display of
 * request metadata, token usage, and timing.
 * When JSON is detected in section content, renders it with syntax highlighting.
 */
export async function renderModelTurnContent(content, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    // Header: Model Turn
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.modelTurn.title', "Model Turn")));
    // Status summary line
    const statusParts = [];
    if (content.requestName) {
        statusParts.push(content.requestName);
    }
    if (content.model) {
        statusParts.push(content.model);
    }
    if (content.status && content.status !== 'unknown') {
        statusParts.push(content.status);
    }
    if (content.durationInMillis !== undefined) {
        statusParts.push(localize('chatDebug.modelTurn.duration', "{0}ms", numberFormatter.value.format(content.durationInMillis)));
    }
    if (statusParts.length > 0) {
        DOM.append(container, $('div.chat-debug-message-content-summary', undefined, statusParts.join(' \u00b7 ')));
    }
    // Token usage details
    const detailsContainer = DOM.append(container, $('div.chat-debug-model-turn-details'));
    if (content.inputTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.inputTokens', "Input tokens: {0}", numberFormatter.value.format(content.inputTokens))));
    }
    if (content.outputTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.outputTokens', "Output tokens: {0}", numberFormatter.value.format(content.outputTokens))));
    }
    if (content.cachedTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.cachedTokens', "Cached tokens: {0}", numberFormatter.value.format(content.cachedTokens))));
    }
    if (content.totalTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.totalTokens', "Total tokens: {0}", numberFormatter.value.format(content.totalTokens))));
    }
    if (content.timeToFirstTokenInMillis !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.ttft', "Time to first token: {0}ms", numberFormatter.value.format(content.timeToFirstTokenInMillis))));
    }
    if (content.maxInputTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.maxInputTokens', "Max input tokens: {0}", numberFormatter.value.format(content.maxInputTokens))));
    }
    if (content.maxOutputTokens !== undefined) {
        DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.maxOutputTokens', "Max output tokens: {0}", numberFormatter.value.format(content.maxOutputTokens))));
    }
    if (content.errorMessage) {
        DOM.append(detailsContainer, $('div.chat-debug-model-turn-error', undefined, localize('chatDebug.modelTurn.error', "Error: {0}", content.errorMessage)));
    }
    // Collapsible sections (e.g., system prompt, user prompt, tools, response)
    if (content.sections && content.sections.length > 0) {
        const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
        DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined, localize('chatDebug.modelTurn.sections', "Sections ({0})", content.sections.length)));
        for (const section of content.sections) {
            const { plainText, tokenizedHtml } = await tokenizeContent(section.content, languageService);
            renderSection(sectionsContainer, section.name, plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
        }
    }
    return { element: container, disposables };
}
/**
 * Convert a resolved model turn content to plain text for clipboard / editor output.
 */
export function modelTurnContentToPlainText(content) {
    const lines = [];
    lines.push(localize('chatDebug.modelTurn.requestLabel', "Request: {0}", content.requestName));
    if (content.model) {
        lines.push(localize('chatDebug.modelTurn.modelLabel', "Model: {0}", content.model));
    }
    if (content.status && content.status !== 'unknown') {
        lines.push(localize('chatDebug.modelTurn.statusLabel', "Status: {0}", content.status));
    }
    if (content.durationInMillis !== undefined) {
        lines.push(localize('chatDebug.modelTurn.durationLabel', "Duration: {0}ms", numberFormatter.value.format(content.durationInMillis)));
    }
    if (content.timeToFirstTokenInMillis !== undefined) {
        lines.push(localize('chatDebug.modelTurn.ttftLabel', "Time to first token: {0}ms", numberFormatter.value.format(content.timeToFirstTokenInMillis)));
    }
    if (content.inputTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.inputTokensLabel', "Input tokens: {0}", numberFormatter.value.format(content.inputTokens)));
    }
    if (content.outputTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.outputTokensLabel', "Output tokens: {0}", numberFormatter.value.format(content.outputTokens)));
    }
    if (content.cachedTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.cachedTokensLabel', "Cached tokens: {0}", numberFormatter.value.format(content.cachedTokens)));
    }
    if (content.totalTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.totalTokensLabel', "Total tokens: {0}", numberFormatter.value.format(content.totalTokens)));
    }
    if (content.maxInputTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.maxInputTokensLabel', "Max input tokens: {0}", numberFormatter.value.format(content.maxInputTokens)));
    }
    if (content.maxOutputTokens !== undefined) {
        lines.push(localize('chatDebug.modelTurn.maxOutputTokensLabel', "Max output tokens: {0}", numberFormatter.value.format(content.maxOutputTokens)));
    }
    if (content.errorMessage) {
        lines.push(localize('chatDebug.modelTurn.errorLabel', "Error: {0}", content.errorMessage));
    }
    if (content.sections && content.sections.length > 0) {
        lines.push('');
        for (const section of content.sections) {
            lines.push(`--- ${section.name} ---`);
            lines.push(section.content);
            lines.push('');
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnTW9kZWxUdXJuQ29udGVudFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdNb2RlbFR1cm5Db250ZW50UmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpELE9BQU8sRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDdkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTlELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEIsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDO0FBRWhEOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHNCQUFzQixDQUFDLE9BQXdDLEVBQUUsZUFBaUMsRUFBRSxnQkFBb0MsRUFBRSxVQUFvQztJQUNuTSxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQzFDLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0lBQ3RELFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBRXZCLHFCQUFxQjtJQUNyQixHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsc0NBQXNDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFF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