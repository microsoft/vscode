/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseViewModel, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';

export interface IResolvedResponseSelection {
	readonly response: IChatResponseViewModel;
	readonly text: string;
	/** Snapshot of the selected range, used to position and re-paint the affordance after the native selection is gone. */
	readonly range: Range;
}

/** Ancestor of a valid selection endpoint: rendered assistant markdown. */
const markdownScopeSelector = '.chat-markdown-part';
/** Ancestors that exclude an endpoint even inside markdown (embedded code editors, tool UI). */
const excludedAncestorSelectors = ['.monaco-editor', '.chat-tool-invocation-part'];

function closestElement(node: Node): HTMLElement | undefined {
	return node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement ?? undefined;
}

function isAssistantMarkdownEndpoint(node: Node, widgetDomNode: HTMLElement): boolean {
	const element = closestElement(node);
	if (!element || !widgetDomNode.contains(element) || !element.closest(markdownScopeSelector)) {
		return false;
	}
	return !excludedAncestorSelectors.some(selector => element.closest(selector));
}

/**
 * Returns the first and last text nodes that actually contribute characters to
 * `range`. Browsers routinely park a selection boundary at offset 0 of the node
 * *following* the selected text — notably a triple-click, which selects a whole
 * line and ends at the start of the next block, landing outside the response's
 * markdown when the line is the last one — so the raw anchor/focus nodes are
 * not usable endpoints on their own.
 */
function contributingTextEndpoints(range: Range): { first: Text; last: Text } | undefined {
	const container = range.commonAncestorContainer;
	const scope = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
	const doc = scope?.ownerDocument;
	if (!scope || !doc) {
		return undefined;
	}

	const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
	let first: Text | undefined;
	let last: Text | undefined;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node as Text;
		if (!range.intersectsNode(text)) {
			continue;
		}
		const start = text === range.startContainer ? range.startOffset : 0;
		const end = text === range.endContainer ? range.endOffset : text.data.length;
		if (!text.data.slice(start, end).trim()) {
			continue;
		}
		first ??= text;
		last = text;
	}

	return first && last ? { first, last } : undefined;
}

/**
 * Resolves the widget's current native DOM selection to the single assistant
 * response it lies entirely within, scoped to rendered markdown only (embedded
 * code editors and tool-invocation UI are excluded). Returns `undefined` for an
 * empty/collapsed selection, a selection spanning more than one response, or
 * one that touches non-markdown content.
 */
export function resolveResponseSelection(widget: IChatWidget): IResolvedResponseSelection | undefined {
	const nativeSelection = dom.getWindow(widget.domNode).getSelection();
	if (!nativeSelection || nativeSelection.isCollapsed || !nativeSelection.rangeCount || !nativeSelection.toString().trim()) {
		return undefined;
	}

	const range = nativeSelection.getRangeAt(0);
	const endpoints = contributingTextEndpoints(range);
	if (!endpoints
		|| !isAssistantMarkdownEndpoint(endpoints.first, widget.domNode)
		|| !isAssistantMarkdownEndpoint(endpoints.last, widget.domNode)) {
		return undefined;
	}

	const firstElement = closestElement(endpoints.first);
	const lastElement = closestElement(endpoints.last);
	if (!firstElement || !lastElement) {
		return undefined;
	}
	const firstItem = widget.getElementFromNode(firstElement);
	const lastItem = widget.getElementFromNode(lastElement);
	if (!firstItem || firstItem !== lastItem || !isResponseVM(firstItem)) {
		return undefined;
	}

	// Trailing newlines are an artifact of how browsers extend line selections
	// past the block they belong to; they add nothing to the quoted snippet.
	return { response: firstItem, text: nativeSelection.toString().trim(), range: range.cloneRange() };
}
