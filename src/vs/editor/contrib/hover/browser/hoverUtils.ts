/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IEditorMouseEvent } from '../../../browser/editorBrowser.js';

export function isMousePositionWithinElement(element: HTMLElement, posx: number, posy: number): boolean {
	const elementRect = dom.getDomNodePagePosition(element);
	if (posx < elementRect.left
		|| posx > elementRect.left + elementRect.width
		|| posy < elementRect.top
		|| posy > elementRect.top + elementRect.height) {
		return false;
	}
	return true;
}
/**
 * Determines whether hover should be shown based on the hover setting and current keyboard modifiers.
 * When `hoverEnabled` is 'onKeyboardModifier', hover is shown when the user presses the opposite
 * modifier key from the multi-cursor modifier (e.g., if multi-cursor uses Alt, hover shows on Ctrl/Cmd).
 *
 * @param hoverEnabled - The hover enabled setting
 * @param multiCursorModifier - The modifier key used for multi-cursor operations
 * @param mouseEvent - The current mouse event containing modifier key states
 * @returns true if hover should be shown, false otherwise
 */
export function shouldShowHover(
	hoverEnabled: 'on' | 'off' | 'onKeyboardModifier',
	multiCursorModifier: 'altKey' | 'ctrlKey' | 'metaKey',
	mouseEvent: IEditorMouseEvent
): boolean {
	if (hoverEnabled === 'on') {
		return true;
	}
	if (hoverEnabled === 'off') {
		return false;
	}
	return isTriggerModifierPressed(multiCursorModifier, mouseEvent.event);
}

/**
 * Returns true if the trigger modifier (inverse of multi-cursor modifier) is pressed.
 * This works with both mouse and keyboard events by relying only on the modifier flags.
 */
export function isTriggerModifierPressed(
	multiCursorModifier: 'altKey' | 'ctrlKey' | 'metaKey',
	event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }
): boolean {
	if (multiCursorModifier === 'altKey') {
		return event.ctrlKey || event.metaKey;
	}
	return event.altKey; // multiCursorModifier is ctrlKey or metaKey
}
