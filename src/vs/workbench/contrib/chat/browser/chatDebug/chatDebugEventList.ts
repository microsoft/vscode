/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { localize } from '../../../../../nls.js';
import { ChatDebugLogLevel, IChatDebugEvent } from '../../common/chatDebugService.js';
import { safeIntl } from '../../../../../base/common/date.js';

const $ = DOM.$;

/** Coerce a value to a string, returning a fallback for null/undefined/non-strings. */
function safeStr(value: string | undefined | null, fallback: string = ''): string {
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

export interface IChatDebugEventTemplate {
	readonly container: HTMLElement;
	readonly created: HTMLElement;
	readonly name: HTMLElement;
	readonly details: HTMLElement;
}

/** Returns the formatted creation timestamp for a debug event. */
export function getEventCreatedText(element: IChatDebugEvent): string {
	return dateFormatter.value.format(element.created);
}

/** Returns the display name for a debug event. */
export function getEventNameText(element: IChatDebugEvent): string {
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
export function getEventDetailsText(element: IChatDebugEvent): string {
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

function renderEventToTemplate(element: IChatDebugEvent, templateData: IChatDebugEventTemplate): void {
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

function createEventTemplate(container: HTMLElement): IChatDebugEventTemplate {
	container.classList.add('chat-debug-log-row');
	const created = DOM.append(container, $('span.chat-debug-log-created'));
	const name = DOM.append(container, $('span.chat-debug-log-name'));
	const details = DOM.append(container, $('span.chat-debug-log-details'));
	return { container, created, name, details };
}

export class ChatDebugEventRenderer implements IListRenderer<IChatDebugEvent, IChatDebugEventTemplate> {
	static readonly TEMPLATE_ID = 'chatDebugEvent';

	get templateId(): string {
		return ChatDebugEventRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IChatDebugEventTemplate {
		return createEventTemplate(container);
	}

	renderElement(element: IChatDebugEvent, index: number, templateData: IChatDebugEventTemplate): void {
		renderEventToTemplate(element, templateData);
	}

	disposeTemplate(_templateData: IChatDebugEventTemplate): void {
		// noop
	}
}

export class ChatDebugEventDelegate implements IListVirtualDelegate<IChatDebugEvent> {
	getHeight(_element: IChatDebugEvent): number {
		return 28;
	}

	getTemplateId(_element: IChatDebugEvent): string {
		return ChatDebugEventRenderer.TEMPLATE_ID;
	}
}

export class ChatDebugEventTreeRenderer implements ITreeRenderer<IChatDebugEvent, void, IChatDebugEventTemplate> {
	static readonly TEMPLATE_ID = 'chatDebugEvent';

	get templateId(): string {
		return ChatDebugEventTreeRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IChatDebugEventTemplate {
		return createEventTemplate(container);
	}

	renderElement(node: ITreeNode<IChatDebugEvent, void>, index: number, templateData: IChatDebugEventTemplate): void {
		renderEventToTemplate(node.element, templateData);
	}

	disposeTemplate(_templateData: IChatDebugEventTemplate): void {
		// noop
	}
}
