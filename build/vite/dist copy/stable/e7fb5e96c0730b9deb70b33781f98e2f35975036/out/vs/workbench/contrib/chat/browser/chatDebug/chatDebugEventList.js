/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { ChatDebugLogLevel } from '../../common/chatDebugService.js';
import { safeIntl } from '../../../../../base/common/date.js';
const $ = DOM.$;
/** Coerce a value to a string, returning a fallback for null/undefined/non-strings. */
function safeStr(value, fallback = '') {
    if (value === null || value === undefined || typeof value !== 'string') {
        return fallback;
    }
    return value;
}
const dateFormatter = safeIntl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
});
const numberFormatter = safeIntl.NumberFormat();
/** Returns the formatted creation timestamp for a debug event. */
export function getEventCreatedText(element) {
    return dateFormatter.value.format(element.created);
}
/** Returns the display name for a debug event. */
export function getEventNameText(element) {
    switch (element.kind) {
        case 'toolCall': return safeStr(element.toolName, localize('chatDebug.unknownEvent', "(unknown)"));
        case 'modelTurn': return safeStr(element.model) || localize('chatDebug.modelTurn', "Model Turn");
        case 'generic': return safeStr(element.name, localize('chatDebug.unknownEvent', "(unknown)"));
        case 'subagentInvocation': return safeStr(element.agentName, localize('chatDebug.unknownEvent', "(unknown)"));
        case 'userMessage': return localize('chatDebug.userMessage', "User Message");
        case 'agentResponse': return localize('chatDebug.agentResponse', "Agent Response");
    }
}
/** Returns the details text for a debug event. */
export function getEventDetailsText(element) {
    switch (element.kind) {
        case 'toolCall': return safeStr(element.result);
        case 'modelTurn': return [
            safeStr(element.requestName),
            element.totalTokens !== undefined ? localize('chatDebug.tokens', "{0} tokens", numberFormatter.value.format(element.totalTokens)) : '',
        ].filter(Boolean).join(' \u00b7 ');
        case 'generic': return safeStr(element.details);
        case 'subagentInvocation': return safeStr(element.description) || safeStr(element.status);
        case 'userMessage': return safeStr(element.message);
        case 'agentResponse': return safeStr(element.message);
    }
}
function renderEventToTemplate(element, templateData) {
    templateData.created.textContent = getEventCreatedText(element);
    templateData.name.textContent = getEventNameText(element);
    templateData.details.textContent = getEventDetailsText(element);
    const isError = element.kind === 'generic' && element.level === ChatDebugLogLevel.Error
        || element.kind === 'toolCall' && element.result === 'error';
    const isWarning = element.kind === 'generic' && element.level === ChatDebugLogLevel.Warning;
    const isTrace = element.kind === 'generic' && element.level === ChatDebugLogLevel.Trace;
    templateData.container.classList.toggle('chat-debug-log-error', isError);
    templateData.container.classList.toggle('chat-debug-log-warning', isWarning);
    templateData.container.classList.toggle('chat-debug-log-trace', isTrace);
}
function createEventTemplate(container) {
    container.classList.add('chat-debug-log-row');
    const created = DOM.append(container, $('span.chat-debug-log-created'));
    const name = DOM.append(container, $('span.chat-debug-log-name'));
    const details = DOM.append(container, $('span.chat-debug-log-details'));
    return { container, created, name, details };
}
export class ChatDebugEventRenderer {
    static { this.TEMPLATE_ID = 'chatDebugEvent'; }
    get templateId() {
        return ChatDebugEventRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        return createEventTemplate(container);
    }
    renderElement(element, index, templateData) {
        renderEventToTemplate(element, templateData);
    }
    disposeTemplate(_templateData) {
        // noop
    }
}
export class ChatDebugEventDelegate {
    getHeight(_element) {
        return 28;
    }
    getTemplateId(_element) {
        return ChatDebugEventRenderer.TEMPLATE_ID;
    }
}
export class ChatDebugEventTreeRenderer {
    static { this.TEMPLATE_ID = 'chatDebugEvent'; }
    get templateId() {
        return ChatDebugEventTreeRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        return createEventTemplate(container);
    }
    renderElement(node, index, templateData) {
        renderEventToTemplate(node.element, templateData);
    }
    disposeTemplate(_templateData) {
        // noop
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRXZlbnRMaXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdFdmVudExpc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUcxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGlCQUFpQixFQUFtQixNQUFNLGtDQUFrQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU5RCxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCLHVGQUF1RjtBQUN2RixTQUFTLE9BQU8sQ0FBQyxLQUFnQyxFQUFFLFdBQW1CLEVBQUU7SUFDdkUsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDeEUsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFO0lBQ3hELEtBQUssRUFBRSxPQUFPO0lBQ2QsR0FBRyxFQUFFLFNBQVM7SUFDZCxJQUFJLEVBQUUsU0FBUztJQUNmLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE1BQU0sRUFBRSxTQUFTO0NBQ2pCLENBQUMsQ0FBQztBQUVILE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQVNoRCxrRUFBa0U7QUFDbEUsTUFBTSxVQUFVLG1CQUFtQixDQUFDLE9BQXdCO0lBQzNELE9BQU8sYUFB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