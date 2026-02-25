/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatDebugEventModelTurnContent } from '../../common/chatDebugService.js';
import { renderCollapsibleSection } from './chatDebugCollapsible.js';

const $ = DOM.$;

/**
 * Render a resolved model turn content with structured display of
 * request metadata, token usage, and timing.
 */
export function renderModelTurnContent(content: IChatDebugEventModelTurnContent): { element: HTMLElement; disposables: DisposableStore } {
	const disposables = new DisposableStore();
	const container = $('div.chat-debug-message-content');
	container.tabIndex = 0;

	// Header: Model Turn
	DOM.append(container, $('div.chat-debug-message-content-title', undefined, localize('chatDebug.modelTurn.title', "Model Turn")));

	// Status summary line
	const statusParts: string[] = [];
	if (content.requestName) {
		statusParts.push(content.requestName);
	}
	if (content.model) {
		statusParts.push(content.model);
	}
	if (content.status) {
		statusParts.push(content.status);
	}
	if (content.durationInMillis !== undefined) {
		statusParts.push(localize('chatDebug.modelTurn.duration', "{0}ms", content.durationInMillis));
	}
	if (statusParts.length > 0) {
		DOM.append(container, $('div.chat-debug-message-content-summary', undefined, statusParts.join(' \u00b7 ')));
	}

	// Token usage details
	const detailsContainer = DOM.append(container, $('div.chat-debug-model-turn-details'));

	if (content.inputTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.inputTokens', "Input tokens: {0}", content.inputTokens)));
	}
	if (content.outputTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.outputTokens', "Output tokens: {0}", content.outputTokens)));
	}
	if (content.cachedTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.cachedTokens', "Cached tokens: {0}", content.cachedTokens)));
	}
	if (content.totalTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.totalTokens', "Total tokens: {0}", content.totalTokens)));
	}
	if (content.timeToFirstTokenInMillis !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.ttft', "Time to first token: {0}ms", content.timeToFirstTokenInMillis)));
	}
	if (content.maxInputTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.maxInputTokens', "Max input tokens: {0}", content.maxInputTokens)));
	}
	if (content.maxOutputTokens !== undefined) {
		DOM.append(detailsContainer, $('div', undefined, localize('chatDebug.modelTurn.maxOutputTokens', "Max output tokens: {0}", content.maxOutputTokens)));
	}
	if (content.errorMessage) {
		DOM.append(detailsContainer, $('div.chat-debug-model-turn-error', undefined, localize('chatDebug.modelTurn.error', "Error: {0}", content.errorMessage)));
	}

	// Collapsible sections (e.g., system prompt, user prompt, tools, response)
	if (content.sections && content.sections.length > 0) {
		const sectionsContainer = DOM.append(container, $('div.chat-debug-message-sections'));
		DOM.append(sectionsContainer, $('div.chat-debug-message-sections-label', undefined,
			localize('chatDebug.modelTurn.sections', "Sections ({0})", content.sections.length)));

		for (const section of content.sections) {
			renderCollapsibleSection(sectionsContainer, section, disposables);
		}
	}

	return { element: container, disposables };
}

/**
 * Convert a resolved model turn content to plain text for clipboard / editor output.
 */
export function modelTurnContentToPlainText(content: IChatDebugEventModelTurnContent): string {
	const lines: string[] = [];
	lines.push(localize('chatDebug.modelTurn.requestLabel', "Request: {0}", content.requestName));

	if (content.model) {
		lines.push(localize('chatDebug.modelTurn.modelLabel', "Model: {0}", content.model));
	}
	if (content.status) {
		lines.push(localize('chatDebug.modelTurn.statusLabel', "Status: {0}", content.status));
	}
	if (content.durationInMillis !== undefined) {
		lines.push(localize('chatDebug.modelTurn.durationLabel', "Duration: {0}ms", content.durationInMillis));
	}
	if (content.timeToFirstTokenInMillis !== undefined) {
		lines.push(localize('chatDebug.modelTurn.ttftLabel', "Time to first token: {0}ms", content.timeToFirstTokenInMillis));
	}
	if (content.inputTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.inputTokensLabel', "Input tokens: {0}", content.inputTokens));
	}
	if (content.outputTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.outputTokensLabel', "Output tokens: {0}", content.outputTokens));
	}
	if (content.cachedTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.cachedTokensLabel', "Cached tokens: {0}", content.cachedTokens));
	}
	if (content.totalTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.totalTokensLabel', "Total tokens: {0}", content.totalTokens));
	}
	if (content.maxInputTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.maxInputTokensLabel', "Max input tokens: {0}", content.maxInputTokens));
	}
	if (content.maxOutputTokens !== undefined) {
		lines.push(localize('chatDebug.modelTurn.maxOutputTokensLabel', "Max output tokens: {0}", content.maxOutputTokens));
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
