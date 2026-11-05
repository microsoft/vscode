/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { PART_GRID_TOP_EDGE_CLASS, PART_GRID_TOP_EDGE_GROUP_CLASS } from '../../../../workbench/browser/parts/partGrid/partGrid.js';

/** The class of the element of an Agents chat window. */
export const AGENTS_CHAT_WINDOW_CLASS = 'agents-chat-window';

/** The elements of a tab row that are its empty space, rather than its tabs or actions. */
const TITLE_SPACE_SELECTOR = '.tabs-and-actions-container, .tabs-container, .editor-actions';

/**
 * Whether `target` is the empty space of a tab row at the top edge of a chat window: that row shares the title bar of the
 * window and moves the window, so a double-click on it does what a double-click on the title bar does.
 */
export function isChatWindowTitleSpace(target: EventTarget | null): boolean {
	if (!isHTMLElement(target)) {
		return false;
	}
	const title = target.closest('.title');
	const group = title?.parentElement;
	if (!title || !group?.classList.contains('editor-group-container') || !group.classList.contains(PART_GRID_TOP_EDGE_GROUP_CLASS)) {
		return false;
	}
	if (!group.closest(`.${PART_GRID_TOP_EDGE_CLASS}`)?.closest(`.${AGENTS_CHAT_WINDOW_CLASS}`)) {
		return false;
	}
	return target === title || (target.matches(TITLE_SPACE_SELECTOR) && title.contains(target));
}

/**
 * Lets a double-click on the empty space of a tab row at the top edge of a chat window in `targetWindow` do what one on
 * its title bar does, rather than what one on a tab row does, such as opening an untitled editor.
 */
export function registerChatWindowTitleDoubleClick(targetWindow: Window, onTitleDoubleClick: () => void): IDisposable {
	return addDisposableListener(targetWindow.document, EventType.DBLCLICK, e => {
		if (isChatWindowTitleSpace(e.target)) {
			EventHelper.stop(e, true);
			onTitleDoubleClick();
		}
	}, true);
}
