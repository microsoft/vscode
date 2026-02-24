/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IChatDebugMessageSection, IChatDebugUserMessageEvent, IChatDebugAgentResponseEvent, IChatDebugEventMessageContent } from '../../common/chatDebugService.js';

const $ = DOM.$;

/**
 * Wire up a collapsible toggle on a chevron+header+content triple.
 * Handles icon switching and display toggling.
 */
export function setupCollapsibleToggle(chevron: HTMLElement, header: HTMLElement, contentEl: HTMLElement, disposables: DisposableStore, initiallyCollapsed: boolean = false): void {
	let collapsed = initiallyCollapsed;

	// Accessibility: make header keyboard-focusable and expose toggle semantics
	header.tabIndex = 0;
	header.role = 'button';
	chevron.setAttribute('aria-hidden', 'true');

	const updateState = () => {
		DOM.clearNode(chevron);
		const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
		chevron.classList.add(...ThemeIcon.asClassName(icon).split(' '));
		contentEl.style.display = collapsed ? 'none' : 'block';
		header.style.borderRadius = collapsed ? '' : '3px 3px 0 0';
		header.setAttribute('aria-expanded', String(!collapsed));
	};

	updateState();

	disposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => {
		collapsed = !collapsed;
		chevron.className = 'chat-debug-message-section-chevron';
		updateState();
	}));

	disposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			header.click();
		}
	}));
}

/**
 * Render a collapsible section with a clickable header and pre-formatted content.
 */
function renderCollapsibleSection(parent: HTMLElement, section: IChatDebugMessageSection, disposables: DisposableStore, initiallyCollapsed: boolean = false): void {
	const sectionEl = DOM.append(parent, $('div.chat-debug-message-section'));

	const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));

	const chevron = DOM.append(header, $(`span.chat-debug-message-section-chevron`));
	DOM.append(header, $('span.chat-debug-message-section-title', undefined, section.name));

	const contentEl = $('pre.chat-debug-message-section-content');
	contentEl.textContent = section.content;
	contentEl.tabIndex = 0;

	const scrollable = new DomScrollableElement(contentEl, {});
	disposables.add(scrollable);

	const wrapper = scrollable.getDomNode();
	wrapper.classList.add('chat-debug-message-section-content-wrapper');
	DOM.append(sectionEl, wrapper);

	setupCollapsibleToggle(chevron, header, wrapper, disposables, initiallyCollapsed);

	// Scan after toggle so scrollbar dimensions are correct when expanded
	disposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => {
		scrollable.scanDomNode();
	}));
}

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
