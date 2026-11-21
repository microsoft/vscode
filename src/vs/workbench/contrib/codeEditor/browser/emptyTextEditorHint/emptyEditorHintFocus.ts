/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../../nls.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

export const focusEmptyEditorHintCommandId = 'editor.action.focusEmptyEditorHint';

export const EmptyEditorHintVisible = new RawContextKey<boolean>('emptyEditorHintVisible', false, localize('emptyEditorHintVisible', "Whether the empty editor hint is shown"));

export function getFocusEmptyEditorHintAriaLabel(keybindingService: IKeybindingService): string {
	const keybinding = keybindingService.lookupKeybinding(focusEmptyEditorHintCommandId)?.getAriaLabel();
	return keybinding ? localize('emptyEditorHint.focusAriaLabel', " Press {0} to focus the hint.", keybinding) : '';
}

/**
 * While focus is in the hint, typing moves focus back to the editor. The key is not prevented,
 * so the browser inserts the character into the editor, which then dismisses the hint.
 */
export function forwardTypingToEditor(hintNode: HTMLElement, editor: ICodeEditor): IDisposable {
	return addDisposableListener(hintNode, EventType.KEY_DOWN, e => {
		if (startsTextInput(new StandardKeyboardEvent(e))) {
			editor.focus();
		}
	});
}

export function startsTextInput(e: StandardKeyboardEvent): boolean {
	if (e.keyCode === KeyCode.KEY_IN_COMPOSITION || e.browserEvent.key === 'Dead') {
		return true; // IME or dead key
	}
	if (e.keyCode === KeyCode.Space) {
		return false; // runs the focused link
	}
	const typesCharacter = e.browserEvent.key.length === 1;
	const isShortcut = (e.ctrlKey || e.metaKey) && !e.browserEvent.getModifierState('AltGraph'); // AltGr types e.g. @
	return typesCharacter && !isShortcut;
}
