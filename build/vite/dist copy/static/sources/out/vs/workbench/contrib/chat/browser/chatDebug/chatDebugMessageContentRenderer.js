/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { renderSection, tokenizeContent } from './chatDebugToolCallContentRenderer.js';
const $ = DOM.$;
/**
 * Render a user message event with collapsible prompt sections.
 * JSON content in sections is syntax-highlighted.
 */
export async function renderUserMessageContent(event, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.userMessage', "User Message")));
    DOM.append(container, $('div.chat-debug-message-content-summary', undefined, event.message));
    if (event.sections.length > 0) {
        const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
        DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined, localize('chatDebug.promptSections', "Prompt Sections ({0})", event.sections.length)));
        for (const section of event.sections) {
            const { plainText, tokenizedHtml } = await tokenizeContent(section.content, languageService);
            renderSection(sectionsContainer, section.name, plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
        }
    }
    return { element: container, disposables };
}
/**
 * Render an agent response event with collapsible response sections.
 * JSON content in sections is syntax-highlighted.
 */
export async function renderAgentResponseContent(event, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.agentResponse', "Agent Response")));
    DOM.append(container, $('div.chat-debug-message-content-summary', undefined, event.message));
    if (event.sections.length > 0) {
        const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
        DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined, localize('chatDebug.responseSections', "Response Sections ({0})", event.sections.length)));
        for (const section of event.sections) {
            const { plainText, tokenizedHtml } = await tokenizeContent(section.content, languageService);
            renderSection(sectionsContainer, section.name, plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
        }
    }
    return { element: container, disposables };
}
/**
 * Convert a user message or agent response event to plain text for clipboard / editor output.
 */
export function messageEventToPlainText(event) {
    const lines = [];
    const label = event.kind === 'userMessage' ? localize('chatDebug.userMessage', "User Message") : localize('chatDebug.agentResponse', "Agent Response");
    lines.push(`${label}: ${event.message}`);
    lines.push('');
    for (const section of event.sections) {
        lines.push(`--- ${section.name} ---`);
        lines.push(section.content);
        lines.push('');
    }
    return lines.join('\n');
}
/**
 * Render a resolved message content (from resolveChatDebugLogEvent) with collapsible sections.
 * JSON content in sections is syntax-highlighted.
 */
export async function renderResolvedMessageContent(content, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    const title = content.type === 'user'
        ? localize('chatDebug.userMessage', "User Message")
        : localize('chatDebug.agentResponse', "Agent Response");
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, title));
    DOM.append(container, $('div.chat-debug-message-content-summary', undefined, content.message));
    if (content.sections.length > 0) {
        const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
        const label = content.type === 'user'
            ? localize('chatDebug.promptSections', "Prompt Sections ({0})", content.sections.length)
            : localize('chatDebug.responseSections', "Response Sections ({0})", content.sections.length);
        DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined, label));
        for (const section of content.sections) {
            const { plainText, tokenizedHtml } = await tokenizeContent(section.content, languageService);
            renderSection(sectionsContainer, section.name, plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
        }
    }
    return { element: container, disposables };
}
/**
 * Convert a resolved message content to plain text.
 */
export function resolvedMessageToPlainText(content) {
    const lines = [];
    const label = content.type === 'user'
        ? localize('chatDebug.userMessage', "User Message")
        : localize('chatDebug.agentResponse', "Agent Response");
    lines.push(`${label}: ${content.message}`);
    lines.push('');
    for (const section of content.sections) {
        lines.push(`--- ${section.name} ---`);
        lines.push(section.content);
        lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnTWVzc2FnZUNvbnRlbnRSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnTWVzc2FnZUNvbnRlbnRSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFJakQsT0FBTyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV2RixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsd0JBQXdCLENBQUMsS0FBaUMsRUFBRSxlQUFpQyxFQUFFLGdCQUFvQyxFQUFFLFVBQW9DO0lBQzlMLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFDdEQsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFFdkIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHNDQUFzQyxFQUFFLFNBQVMsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9ILEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyx3Q0FBd0MsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFFN0YsSUFBSSxL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