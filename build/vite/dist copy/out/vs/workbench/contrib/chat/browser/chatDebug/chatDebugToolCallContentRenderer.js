/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { setupCollapsibleToggle } from './chatDebugCollapsible.js';
const $ = DOM.$;
const _ttpPolicy = createTrustedTypesPolicy('chatDebugTokenizer', {
    createHTML(html) {
        return html;
    }
});
export function tryParseJSON(text) {
    try {
        return { parsed: JSON.parse(text), isJSON: true };
    }
    catch {
        return { isJSON: false };
    }
}
/**
 * Format and syntax-highlight a content string.
 * When the content is valid JSON it is pretty-printed and tokenized as JSON;
 * otherwise it is tokenized as markdown.
 */
export async function tokenizeContent(text, languageService) {
    const result = tryParseJSON(text);
    const plainText = result.isJSON ? JSON.stringify(result.parsed, null, 2) : text;
    const language = result.isJSON ? 'json' : 'markdown';
    const tokenizedHtml = await tokenizeToString(languageService, plainText, language);
    return { plainText, tokenizedHtml };
}
/**
 * Render a collapsible section. When `tokenizedHtml` is provided the content
 * is rendered as syntax-highlighted HTML; otherwise plain-text is used.
 * Optionally adds a copy button when `clipboardService` is provided.
 */
export function renderSection(parent, label, plainText, tokenizedHtml, disposables, initiallyCollapsed = false, clipboardService, scrollable) {
    const sectionEl = DOM.append(parent, $('div.chat-debug-message-section'));
    const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));
    const chevron = DOM.append(header, $('span.chat-debug-message-section-chevron'));
    DOM.append(header, $('span.chat-debug-message-section-title', undefined, label));
    if (clipboardService) {
        const copyBtn = disposables.add(new Button(header, {
            title: localize('chatDebug.section.copy', "Copy"),
            ariaLabel: localize('chatDebug.section.copy', "Copy"),
            hoverDelegate: getDefaultHoverDelegate('mouse'),
        }));
        copyBtn.icon = Codicon.copy;
        copyBtn.element.classList.add('chat-debug-section-copy-btn');
        disposables.add(DOM.addDisposableListener(copyBtn.element, DOM.EventType.MOUSE_ENTER, () => {
            header.classList.add('chat-debug-section-copy-header-passthrough');
        }));
        disposables.add(DOM.addDisposableListener(copyBtn.element, DOM.EventType.MOUSE_LEAVE, () => {
            header.classList.remove('chat-debug-section-copy-header-passthrough');
        }));
        disposables.add(copyBtn.onDidClick(e => {
            if (e) {
                DOM.EventHelper.stop(e, true);
            }
            clipboardService.writeText(plainText);
        }));
    }
    const wrapper = DOM.append(sectionEl, $('div.chat-debug-message-section-content-wrapper'));
    const contentEl = DOM.append(wrapper, $('pre.chat-debug-message-section-content'));
    contentEl.tabIndex = 0;
    if (tokenizedHtml) {
        const trustedHtml = _ttpPolicy?.createHTML(tokenizedHtml) ?? tokenizedHtml;
        contentEl.innerHTML = trustedHtml;
    }
    else {
        contentEl.textContent = plainText;
    }
    setupCollapsibleToggle(chevron, header, wrapper, disposables, initiallyCollapsed, scrollable);
}
/**
 * Render a resolved tool call content with structured sections for
 * tool name, status, duration, arguments, and output.
 * Reuses the existing message content and collapsible section components.
 * When JSON is detected in input/output, renders it with syntax highlighting
 * using the editor's tokenization.
 */
export async function renderToolCallContent(content, languageService, clipboardService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-message-content');
    container.tabIndex = 0;
    // Header: tool name
    DOM.append(container, $('div.chat-debug-message-content-title', undefined, content.toolName));
    // Status summary line
    const statusParts = [];
    if (content.result) {
        statusParts.push(content.result === 'success'
            ? localize('chatDebug.toolCall.success', "Success")
            : localize('chatDebug.toolCall.error', "Error"));
    }
    if (content.durationInMillis !== undefined) {
        statusParts.push(localize('chatDebug.toolCall.duration', "{0}ms", content.durationInMillis));
    }
    if (statusParts.length > 0) {
        DOM.append(container, $('div.chat-debug-message-content-summary', undefined, statusParts.join(' \u00b7 ')));
    }
    // Build collapsible sections for arguments and output
    const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
    if (content.input) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.input, languageService);
        renderSection(sectionsContainer, localize('chatDebug.toolCall.arguments', "Arguments"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    if (content.output) {
        const { plainText, tokenizedHtml } = await tokenizeContent(content.output, languageService);
        renderSection(sectionsContainer, localize('chatDebug.toolCall.output', "Output"), plainText, tokenizedHtml, disposables, false, clipboardService, scrollable);
    }
    return { element: container, disposables };
}
/**
 * Convert a resolved tool call content to plain text for clipboard / editor output.
 */
export function toolCallContentToPlainText(content) {
    const lines = [];
    lines.push(localize('chatDebug.toolCall.toolLabel', "Tool: {0}", content.toolName));
    if (content.result) {
        lines.push(localize('chatDebug.toolCall.statusLabel', "Status: {0}", content.result));
    }
    if (content.durationInMillis !== undefined) {
        lines.push(localize('chatDebug.toolCall.durationLabel', "Duration: {0}ms", content.durationInMillis));
    }
    if (content.input) {
        lines.push('');
        lines.push(`[${localize('chatDebug.toolCall.arguments', "Arguments")}]`);
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
        lines.push(`[${localize('chatDebug.toolCall.output', "Output")}]`);
        try {
            const parsed = JSON.parse(content.output);
            lines.push(JSON.stringify(parsed, null, 2));
        }
        catch {
            lines.push(content.output);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnVG9vbENhbGxDb250ZW50UmVuZGVyZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z1Rvb2xDYWxsQ29udGVudFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBR2pELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRW5FLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFaEIsTUFBTSxVQUFVLEdBQUcsd0JBQXdCLENBQUMsb0JBQW9CLEVBQUU7SUFDakUsVUFBVSxDQUFDLElBQVk7UUFDdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsTUFBTSxVQUFVLFlBQVksQ0FBQyxJQUFZO0lBQ3hDLElBQUksQ0FBQztRQUNKLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDbkQsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNSLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDMUIsQ0FBQztBQUNGLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSxlQUFlLENBQUMsSUFBWSxFQUFFLGVBQWlDO0lBQ3BGLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDaEYsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7SUFDckQsTUFBTSxhQUFhLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ25GLE9BQU8sRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLENBQUM7QUFDckMsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUM1QixNQUFtQixFQUNuQixLQUFhLEVBQ2IsU0FBaUIsRUFDakIsYUFBaUMsRUFDakMsV0FBNEIsRUFDNUIscUJBQThCLEtBQUssRUFDbkMsZ0JBQW9DLEVBQ3BDLFVBQW9DO0lBRXBDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7SUFDMUUsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHVDQUF1QyxDQUFDLENBQUMsQ0FBQztJQUNqRixNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMseUNBQXlDLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyx1Q0FBdUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUVqRixJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDdEIsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUU7WUFDbEQsS0FBSyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNLENBQUM7WUFDakQsU0FBUyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNLENBQUM7WUFDckQsYUFBYSxFQUFFLHVCQUF1QixDQUFDLE9BQU8sQ0FBQztTQUMvQyxDQUFDLENBQUMsQ0FBQztRQUNKLE9BQU8sQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUM1QixPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUM3RCxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtZQUMxRixNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtZQUMxRixNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ3ZFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDdEMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDUCxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0IsQ0FBQztZQUNELGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDLENBQUM7SUFDM0YsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztJQUNuRixTQUFTLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUV2QixJQUFJLGFBQWEsRUFBRSxDQUFDO1FBQ25CLE1BQU0sV0FBVyxHQUFHLFVBQVUsRUFBRSxVQUFVLENBQUMsYUFBYSxDQUFDLElBQUksYUFBYSxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxTQUFTLEdBQUcsV0FBcUIsQ0FBQztJQUM3QyxDQUFDO1NBQU0sQ0FBQztRQUNQLFNBQVMsQ0FBQyxXQUFXLEdBQUcsU0FBUyxDQUFDO0lBQ25DLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDL0YsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUscUJBQXFCLENBQUMsT0FBdUMsRUFBRSxlQUFpQyxFQUFFLGdCQUFvQyxFQUFFLFVBQW9DO0lBQ2pNLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFDdEQsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFFdkIsb0JBQW9CO0lBQ3BCLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxzQ0FBc0MsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFFOUYsc0JBQXNCO0lBQ3RCLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssU0FBUztZQUM1QyxDQUFDLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLFNBQVMsQ0FBQztZQUNuRCxDQUFDLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUNELElBQUksT0FBTyxDQUFDLGdCQUFnQixLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzVDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQzlGLENBQUM7SUFDRCxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDNUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHdDQUF3QyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RyxDQUFDO0lBRUQsc0RBQXNEO0lBQ3RELE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQztJQUV0RixJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixNQUFNLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxHQUFHLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDM0YsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxXQUFXLENBQUMsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDckssQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3BCLE1BQU0sRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLEdBQUcsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM1RixhQUFhLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUMvSixDQUFDO0lBRUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDNUMsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLDBCQUEwQixDQUFDLE9BQXVDO0lBQ2pGLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUMzQixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxXQUFXLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFFcEYsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3ZGLENBQUM7SUFDRCxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUM1QyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxpQkFBaUIsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ3ZHLENBQUM7SUFFRCxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2YsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2YsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekIsQ0FBQyJ9