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

export interface IChatDebugEventTemplate {
	readonly container: HTMLElement;
	readonly created: HTMLElement;
	readonly name: HTMLElement;
	readonly details: HTMLElement;
}

function renderEventToTemplate(element: IChatDebugEvent, templateData: IChatDebugEventTemplate): void {
	templateData.created.textContent = dateFormatter.value.format(element.created);

	switch (element.kind) {
		case 'toolCall':
			templateData.name.textContent = safeStr(element.toolName, localize('chatDebug.unknownEvent', "(unknown)"));
			templateData.details.textContent = safeStr(element.result);
			break;
		case 'modelTurn':
			templateData.name.textContent = safeStr(element.model) || localize('chatDebug.modelTurn', "Model Turn");
			templateData.details.textContent = element.totalTokens !== undefined
				? localize('chatDebug.tokens', "{0} tokens", element.totalTokens)
				: '';
			break;
		case 'generic':
			templateData.name.textContent = safeStr(element.name, localize('chatDebug.unknownEvent', "(unknown)"));
			templateData.details.textContent = safeStr(element.details);
			break;
		case 'subagentInvocation':
			templateData.name.textContent = safeStr(element.agentName, localize('chatDebug.unknownEvent', "(unknown)"));
			templateData.details.textContent = safeStr(element.description) || safeStr(element.status);
			break;
		case 'userMessage':
			templateData.name.textContent = localize('chatDebug.userMessage', "User Message");
			templateData.details.textContent = safeStr(element.message);
			break;
		case 'agentResponse':
			templateData.name.textContent = localize('chatDebug.agentResponse', "Agent Response");
			templateData.details.textContent = safeStr(element.message);
			break;
	}

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
