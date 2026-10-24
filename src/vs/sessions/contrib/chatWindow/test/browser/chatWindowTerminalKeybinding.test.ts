/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { CHAT_WINDOW_TERMINAL_KEYBINDING_WHEN } from '../../browser/chatWindowActivityBar.js';

suite('Chat window terminal keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function context(values: Record<string, boolean>): IContext {
		return { getValue: <T>(key: string) => values[key] as T };
	}

	function rules() {
		return KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID);
	}

	test('is bound to the keys of the panel and the terminal, above the rules of the workbench', () => {
		const found = rules().map(rule => ({ weight: rule.weight1, key: (rule.keybinding?.chords[0] as KeyCodeChord | undefined)?.keyCode }));

		assert.ok(found.some(rule => rule.key === KeyCode.KeyJ), 'the panel key');
		assert.ok(found.some(rule => rule.key === KeyCode.Backquote), 'the terminal key');
		assert.ok(found.every(rule => rule.weight > 200), 'above the workbench rules');
	});

	test('applies in a chat window with an editor area, and not in the main window, a docked one or one without an editor area', () => {
		const when = CHAT_WINDOW_TERMINAL_KEYBINDING_WHEN;

		assert.deepStrictEqual({
			chatWindow: when.evaluate(context({ 'sessions.chatWindowHasEditorArea': true })),
			main: when.evaluate(context({})),
			docked: when.evaluate(context({ 'sessions.chatWindowHasEditorArea': true, 'sessions.chatWindowDocked': true })),
			noEditorArea: when.evaluate(context({ 'sessions.chatWindowHasEditorArea': false })),
		}, { chatWindow: true, main: false, docked: false, noEditorArea: false });
	});
});
