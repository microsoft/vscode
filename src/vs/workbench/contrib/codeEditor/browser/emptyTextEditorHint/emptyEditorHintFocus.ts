/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../../nls.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

/** Moves keyboard focus from the editor into the empty editor hint (Tab). */
export const focusEmptyEditorHintCommandId = 'editor.action.focusEmptyEditorHint';

/** Set in the editor while an empty editor hint (classic or list of actions) is shown, so that Tab can move focus into it. */
export const EmptyEditorHintVisible = new RawContextKey<boolean>('emptyEditorHintVisible', false, localize('emptyEditorHintVisible', "Whether the empty editor hint is shown"));

/**
 * The screen reader hint that tells how to reach the empty editor hint from the editor, e.g. " Press Tab to focus the hint.".
 */
export function getFocusEmptyEditorHintAriaLabel(keybindingService: IKeybindingService): string {
	const keybinding = keybindingService.lookupKeybinding(focusEmptyEditorHintCommandId)?.getAriaLabel();
	return keybinding ? localize('emptyEditorHint.focusAriaLabel', " Press {0} to focus the hint.", keybinding) : '';
}

/**
 * While focus is in the hint, typing a character moves focus back to the editor. The key is not
 * prevented, so the browser inserts the character into the editor, which then dismisses the hint.
 * The same applies to the start of an IME composition or a dead key (e.g. `?` before `e`).
 */
export function forwardTypingToEditor(hintNode: HTMLElement, editor: ICodeEditor): IDisposable {
	const store = new DisposableStore();
	store.add(addDisposableListener(hintNode, EventType.KEY_DOWN, e => {
		if (startsTextInput(e)) {
			editor.focus();
		}
	}));
	store.add(addDisposableListener(hintNode, 'compositionstart', () => editor.focus()));
	return store;
}

/**
 * Whether the key down starts text input: a character, a dead key or IME processing (key `Process`, key code 229).
 * Space is not text input: it runs the focused action. AltGr (Ctrl+Alt on Windows) types characters such as `@`.
 */
export function startsTextInput(e: KeyboardEvent): boolean {
	if (e.key === 'Dead' || e.key === 'Process' || e.keyCode === 229 || e.isComposing) {
		return true;
	}
	const isShortcut = (e.ctrlKey || e.metaKey) && !e.getModifierState('AltGraph');
	return e.key.length === 1 && e.key !== ' ' && !isShortcut;
}
