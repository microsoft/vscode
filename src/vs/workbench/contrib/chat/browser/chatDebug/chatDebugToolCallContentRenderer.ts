/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { IChatDebugEventToolCallContent } from '../../common/chatDebugService.js';
import { setupCollapsibleToggle } from './chatDebugCollapsible.js';

const $ = DOM.$;

const _ttpPolicy = createTrustedTypesPolicy('chatDebugTokenizer', {
	createHTML(html: string) {
		return html;
	}
});

function tryParseJSON(text: string): { parsed: unknown; isJSON: true } | { isJSON: false } {
	try {
		return { parsed: JSON.parse(text), isJSON: true };
	} catch {
		return { isJSON: false };
	}
}

/**
 * Render a collapsible section. When `tokenizedHtml` is provided the content
 * is rendered as syntax-highlighted HTML; otherwise plain-text is used.
 */
function renderSection(
	parent: HTMLElement,
	label: string,
	plainText: string,
	tokenizedHtml: string | undefined,
	disposables: DisposableStore,
	initiallyCollapsed: boolean = false,
): void {
	const sectionEl = DOM.append(parent, $('div.chat-debug-message-section'));
	const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));
	const chevron = DOM.append(header, $('span.chat-debug-message-section-chevron'));
	DOM.append(header, $('span.chat-debug-message-section-title', undefined, label));

	const wrapper = DOM.append(sectionEl, $('div.chat-debug-message-section-content-wrapper'));
	const contentEl = DOM.append(wrapper, $('pre.chat-debug-message-section-content'));
	contentEl.tabIndex = 0;

	if (tokenizedHtml) {
		const trustedHtml = _ttpPolicy?.createHTML(tokenizedHtml) ?? tokenizedHtml;
		contentEl.innerHTML = trustedHtml as string;
	} else {
		contentEl.textContent = plainText;
	}

	setupCollapsibleToggle(chevron, header, wrapper, disposables, initiallyCollapsed);
}

/**
 * Render a resolved tool call content with structured sections for
 * tool name, status, duration, arguments, and output.
 * Reuses the existing message content and collapsible section components.
 * When JSON is detected in input/output, renders it with syntax highlighting
 * using the editor's tokenization.
 */
export async function renderToolCallContent(content: IChatDebugEventToolCallContent, languageService: ILanguageService): Promise<{ element: HTMLElement; disposables: DisposableStore }> {
	const disposables = new DisposableStore();
	const container = $('div.chat-debug-message-content');
	container.tabIndex = 0;

	// Header: tool name
	DOM.append(container, $('div.chat-debug-message-content-title', undefined, content.toolName));

	// Status summary line
	const statusParts: string[] = [];
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
		const result = tryParseJSON(content.input);
		const plainText = result.isJSON ? JSON.stringify(result.parsed, null, 2) : content.input;
		const tokenizedHtml = result.isJSON
			? await tokenizeToString(languageService, plainText, 'json')
			: undefined;
		renderSection(sectionsContainer, localize('chatDebug.toolCall.arguments', "Arguments"), plainText, tokenizedHtml, disposables);
	}

	if (content.output) {
		const result = tryParseJSON(content.output);
		const plainText = result.isJSON ? JSON.stringify(result.parsed, null, 2) : content.output;
		const tokenizedHtml = result.isJSON
			? await tokenizeToString(languageService, plainText, 'json')
			: undefined;
		renderSection(sectionsContainer, localize('chatDebug.toolCall.output', "Output"), plainText, tokenizedHtml, disposables);
	}

	return { element: container, disposables };
}

/**
 * Convert a resolved tool call content to plain text for clipboard / editor output.
 */
export function toolCallContentToPlainText(content: IChatDebugEventToolCallContent): string {
	const lines: string[] = [];
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
		} catch {
			lines.push(content.input);
		}
	}

	if (content.output) {
		lines.push('');
		lines.push(`[${localize('chatDebug.toolCall.output', "Output")}]`);
		try {
			const parsed = JSON.parse(content.output);
			lines.push(JSON.stringify(parsed, null, 2));
		} catch {
			lines.push(content.output);
		}
	}

	return lines.join('\n');
}
