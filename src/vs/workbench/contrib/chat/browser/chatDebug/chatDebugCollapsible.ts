/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IChatDebugMessageSection } from '../../common/chatDebugService.js';

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
 * Render a collapsible section with a clickable header and pre-formatted content
 * wrapped in a scrollable element.
 */
export function renderCollapsibleSection(parent: HTMLElement, section: IChatDebugMessageSection, disposables: DisposableStore, initiallyCollapsed: boolean = false): void {
	const sectionEl = DOM.append(parent, $('div.chat-debug-message-section'));

	const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));

	const chevron = DOM.append(header, $(`span.chat-debug-message-section-chevron`));
	DOM.append(header, $('span.chat-debug-message-section-title', undefined, section.name));

	const contentEl = $('pre.chat-debug-message-section-content');
	contentEl.textContent = section.content;
	contentEl.tabIndex = 0;

	const wrapper = DOM.append(sectionEl, $('div.chat-debug-message-section-content-wrapper'));
	wrapper.appendChild(contentEl);

	setupCollapsibleToggle(chevron, header, wrapper, disposables, initiallyCollapsed);
}
