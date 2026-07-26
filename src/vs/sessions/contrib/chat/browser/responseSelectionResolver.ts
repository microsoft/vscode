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
 * Resolves the widget's current native DOM selection to the single assistant
 * response it lies entirely within, scoped to rendered markdown only (embedded
 * code editors and tool-invocation UI are excluded). Returns `undefined` for an
 * empty/collapsed selection, a selection spanning more than one response, or
 * one that touches non-markdown content.
 */
export function resolveResponseSelection(widget: IChatWidget): IResolvedResponseSelection | undefined {
	const nativeSelection = dom.getWindow(widget.domNode).getSelection();
	const text = nativeSelection?.toString();
	if (!nativeSelection || nativeSelection.isCollapsed || !text?.trim()) {
		return undefined;
	}

	const { anchorNode, focusNode } = nativeSelection;
	if (!anchorNode || !focusNode
		|| !isAssistantMarkdownEndpoint(anchorNode, widget.domNode)
		|| !isAssistantMarkdownEndpoint(focusNode, widget.domNode)) {
		return undefined;
	}

	const anchorElement = closestElement(anchorNode);
	const focusElement = closestElement(focusNode);
	if (!anchorElement || !focusElement) {
		return undefined;
	}
	const anchorItem = widget.getElementFromNode(anchorElement);
	const focusItem = widget.getElementFromNode(focusElement);
	if (!anchorItem || anchorItem !== focusItem || !isResponseVM(anchorItem)) {
		return undefined;
	}

	return { response: anchorItem, text };
}
