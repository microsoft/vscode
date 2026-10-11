/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseViewModel, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';

export interface IResolvedResponseSelection extends IResolvedResponseSelectionFocus {
	readonly response: IChatResponseViewModel;
	readonly text: string;
	/** Live selected range, used to re-paint the affordance and recover its focus endpoint after DOM changes. */
	readonly range: Range;
	/** Direction from the selection anchor to its active focus endpoint. */
	readonly direction: 'forward' | 'backward';
}

export interface IResolvedResponseSelectionFocus {
	readonly focusRange: Range;
	readonly focusEdge: 'left' | 'right';
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

interface IContributingTextEndpoint {
	readonly node: Text;
	readonly startOffset: number;
	readonly endOffset: number;
}

function isIgnoredEndpointCharacter(value: string): boolean {
	return /[\s\p{Cf}]/u.test(value);
}

function nextCodePointOffset(text: string, offset: number): number {
	const codePoint = text.codePointAt(offset);
	return offset + (codePoint !== undefined && codePoint > 0xFFFF ? 2 : 1);
}

function previousCodePointOffset(text: string, offset: number): number {
	let result = offset - 1;
	if (result > 0
		&& text.charCodeAt(result) >= 0xDC00
		&& text.charCodeAt(result) <= 0xDFFF
		&& text.charCodeAt(result - 1) >= 0xD800
		&& text.charCodeAt(result - 1) <= 0xDBFF) {
		result--;
	}
	return result;
}

/**
 * Returns the first and last text characters that actually contribute to
 * `range`. Browsers routinely park a selection boundary outside the visible
 * selected text, so the raw anchor/focus nodes are not usable endpoints.
 */
function contributingTextEndpoints(range: Range, widgetDomNode?: HTMLElement): { first: IContributingTextEndpoint; last: IContributingTextEndpoint } | undefined {
	if (range.collapsed) {
		return undefined;
	}
	const container = range.commonAncestorContainer;
	const scope = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
	const doc = scope?.ownerDocument;
	if (!scope || !doc) {
		return undefined;
	}

	// Prune unrendered subtrees: the transcript contains `<style>` elements and
	// display:none metadata (a response's file-change summary) that the range
	// spans but the user cannot see or select. Their text would otherwise look
	// like an endpoint outside the response's markdown and reject the selection.
	// Rejecting at the element level also skips their subtrees wholesale.
	const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
		acceptNode: node => {
			if (node.nodeType !== Node.ELEMENT_NODE) {
				return NodeFilter.FILTER_ACCEPT;
			}
			const element = node as Element;
			if (element.checkVisibility()) {
				return NodeFilter.FILTER_SKIP;
			}
			// A `display: contents` element has no box of its own — so it reads
			// as invisible — but its descendants do render and are selectable.
			// Only read the computed style on this rare branch.
			const display = dom.getWindow(element).getComputedStyle(element).display;
			return display === 'contents' ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
		},
	});
	let first: IContributingTextEndpoint | undefined;
	let last: IContributingTextEndpoint | undefined;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node as Text;
		if (!range.intersectsNode(text) || (widgetDomNode && !isAssistantMarkdownEndpoint(text, widgetDomNode))) {
			continue;
		}
		const start = text === range.startContainer ? range.startOffset : 0;
		const end = text === range.endContainer ? range.endOffset : text.data.length;
		let firstOffset = start;
		while (firstOffset < end) {
			const nextOffset = nextCodePointOffset(text.data, firstOffset);
			if (!isIgnoredEndpointCharacter(text.data.slice(firstOffset, nextOffset))) {
				break;
			}
			firstOffset = nextOffset;
		}
		if (firstOffset === end) {
			continue;
		}
		const firstEndOffset = nextCodePointOffset(text.data, firstOffset);
		let trimmedEndOffset = end;
		let lastOffset = previousCodePointOffset(text.data, trimmedEndOffset);
		while (lastOffset >= start && isIgnoredEndpointCharacter(text.data.slice(lastOffset, trimmedEndOffset))) {
			trimmedEndOffset = lastOffset;
			lastOffset = previousCodePointOffset(text.data, trimmedEndOffset);
		}
		first ??= { node: text, startOffset: firstOffset, endOffset: firstEndOffset };
		last = { node: text, startOffset: lastOffset, endOffset: trimmedEndOffset };
	}

	return first && last ? { first, last } : undefined;
}

function getFocusEdge(range: Range, direction: IResolvedResponseSelection['direction']): IResolvedResponseSelection['focusEdge'] {
	const characterRect = Array.from(range.getClientRects()).find(rect => rect.height > 0) ?? range.getBoundingClientRect();
	const sameLineRects = (candidate: Range) => Array.from(candidate.getClientRects()).filter(rect =>
		rect.height > 0
		&& rect.bottom > characterRect.top
		&& rect.top < characterRect.bottom
	);
	const focusCaret = range.cloneRange();
	focusCaret.collapse(direction === 'backward');
	const focusRects = sameLineRects(focusCaret);
	const oppositeCaret = range.cloneRange();
	oppositeCaret.collapse(direction === 'forward');
	const oppositeRects = sameLineRects(oppositeCaret);
	const edgeDistance = (rect: DOMRect) => Math.min(
		Math.abs(rect.left - characterRect.left),
		Math.abs(rect.left - characterRect.right),
	);
	const candidates = focusRects.toSorted((a, b) => edgeDistance(a) - edgeDistance(b));
	const focusRect = candidates.find(candidate =>
		!oppositeRects.some(opposite => Math.abs(opposite.left - candidate.left) < 0.5)
	) ?? candidates[0];
	const focusLeft = focusRect?.left ?? (direction === 'forward' ? characterRect.right : characterRect.left);
	return Math.abs(focusLeft - characterRect.left) <= Math.abs(focusLeft - characterRect.right) ? 'left' : 'right';
}

function createResolvedFocus(endpoints: { first: IContributingTextEndpoint; last: IContributingTextEndpoint }, direction: IResolvedResponseSelection['direction']): IResolvedResponseSelectionFocus {
	const focusEndpoint = direction === 'backward' ? endpoints.first : endpoints.last;
	const focusRange = focusEndpoint.node.ownerDocument.createRange();
	focusRange.setStart(focusEndpoint.node, focusEndpoint.startOffset);
	focusRange.setEnd(focusEndpoint.node, focusEndpoint.endOffset);
	return { focusRange, focusEdge: getFocusEdge(focusRange, direction) };
}

export function resolveResponseSelectionFocus(range: Range, direction: IResolvedResponseSelection['direction'], widgetDomNode?: HTMLElement): IResolvedResponseSelectionFocus | undefined {
	const endpoints = contributingTextEndpoints(range, widgetDomNode);
	return endpoints ? createResolvedFocus(endpoints, direction) : undefined;
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
		|| !isAssistantMarkdownEndpoint(endpoints.first.node, widget.domNode)
		|| !isAssistantMarkdownEndpoint(endpoints.last.node, widget.domNode)) {
		return undefined;
	}

	const firstElement = closestElement(endpoints.first.node);
	const lastElement = closestElement(endpoints.last.node);
	if (!firstElement || !lastElement) {
		return undefined;
	}
	const firstItem = widget.getElementFromNode(firstElement);
	const lastItem = widget.getElementFromNode(lastElement);
	if (!firstItem || firstItem !== lastItem || !isResponseVM(firstItem)) {
		return undefined;
	}

	// Browsers extend a line selection past the block it belongs to, leaving a
	// trailing newline that adds nothing to the quoted snippet. Only the end is
	// trimmed: leading whitespace is part of what the user actually selected.
	const direction = nativeSelection.focusNode === range.startContainer && nativeSelection.focusOffset === range.startOffset ? 'backward' : 'forward';
	const focus = createResolvedFocus(endpoints, direction);
	const resolved: IResolvedResponseSelection = {
		response: firstItem,
		text: nativeSelection.toString().trimEnd(),
		range: range.cloneRange(),
		...focus,
		direction,
	};
	return resolved;
}
