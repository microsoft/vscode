/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IChatSideChatSelection } from '../common/chatSideChatService.js';
import { IChatWidget } from './chat.js';

/**
 * Captures the user's current text selection within `widget`'s transcript so a
 * side chat can be anchored to it. Returns `undefined` when there is no
 * meaningful selection, when it falls outside the widget, or when it lives in
 * the input editor (which holds the question being asked, not the source text).
 */
export function captureSideChatSelection(widget: IChatWidget | undefined): IChatSideChatSelection | undefined {
	if (!widget) {
		return undefined;
	}
	const nativeSelection = dom.getActiveWindow().getSelection();
	const selectedText = nativeSelection?.toString();
	if (!nativeSelection || !selectedText || !selectedText.trim()) {
		return undefined;
	}
	const { anchorNode, focusNode } = nativeSelection;
	if (!anchorNode || !focusNode || !dom.isAncestor(anchorNode, widget.domNode) || !dom.isAncestor(focusNode, widget.domNode)) {
		return undefined;
	}
	const inputEditorDomNode = widget.inputEditor.getDomNode();
	if (inputEditorDomNode && (dom.isAncestor(anchorNode, inputEditorDomNode) || dom.isAncestor(focusNode, inputEditorDomNode))) {
		return undefined;
	}
	return { text: selectedText };
}
