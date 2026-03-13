/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatDebugUserMessageEvent, IChatDebugAgentResponseEvent, IChatDebugEventMessageContent } from '../../common/chatDebugService.js';
import { renderCollapsibleSection } from './chatDebugCollapsible.js';

const $ = DOM.$;

/**
 * Render a user message event with collapsible prompt sections.
 */
export function renderUserMessageContent(event: IChatDebugUserMessageEvent): { element: HTMLElement; disposables: DisposableStore } {
	const disposables = new DisposableStore();
	const container = $('div.chat-debug-message-content');
	container.tabIndex = 0;

	DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.userMessage', "User Message")));
	DOM.append(container, $('div.chat-debug-message-content-summary', undefined, event.message));

	if (event.sections.length > 0) {
		const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
		DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined,
			localize('chatDebug.promptSections', "Prompt Sections ({0})", event.sections.length)));

		for (const section of event.sections) {
			renderCollapsibleSection(sectionsContainer, section, disposables);
		}
	}

	return { element: container, disposables };
}

/**
 * Render an agent response event with collapsible response sections.
 */
export function renderAgentResponseContent(event: IChatDebugAgentResponseEvent): { element: HTMLElement; disposables: DisposableStore } {
	const disposables = new DisposableStore();
	const container = $('div.chat-debug-message-content');
	container.tabIndex = 0;

	DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.agentResponse', "Agent Response")));
	DOM.append(container, $('div.chat-debug-message-content-summary', undefined, event.message));

	if (event.sections.length > 0) {
		const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
		DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined,
			localize('chatDebug.responseSections', "Response Sections ({0})", event.sections.length)));

		for (const section of event.sections) {
			renderCollapsibleSection(sectionsContainer, section, disposables);
		}
	}

	return { element: container, disposables };
}

/**
 * Convert a user message or agent response event to plain text for clipboard / editor output.
 */
export function messageEventToPlainText(event: IChatDebugUserMessageEvent | IChatDebugAgentResponseEvent): string {
	const lines: string[] = [];
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
 */
export function renderResolvedMessageContent(content: IChatDebugEventMessageContent): { element: HTMLElement; disposables: DisposableStore } {
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
			renderCollapsibleSection(sectionsContainer, section, disposables);
		}
	}

	return { element: container, disposables };
}

/**
 * Convert a resolved message content to plain text.
 */
export function resolvedMessageToPlainText(content: IChatDebugEventMessageContent): string {
	const lines: string[] = [];
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
