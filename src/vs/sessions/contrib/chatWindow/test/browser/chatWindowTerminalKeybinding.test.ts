/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, ChatWindowTerminalKeysContext, isChatWindowTerminalKeysWindow } from '../../browser/chatWindowActivityBar.js';

suite('Chat window terminal keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function rules() {
		return KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID);
	}

	test('is bound to the keys of the panel and the terminal, above the rules of the workbench', () => {
		const found = rules().map(rule => ({ weight: rule.weight1, key: (rule.keybinding?.chords[0] as KeyCodeChord | undefined)?.keyCode }));

		assert.ok(found.some(rule => rule.key === KeyCode.KeyJ), 'the panel key');
		assert.ok(found.some(rule => rule.key === KeyCode.Backquote), 'the terminal key');
		assert.ok(found.every(rule => rule.weight > 200), 'above the workbench rules');
	});

	test('applies while the focused window is a chat window of its own with an editor area, wherever the focus is in it', () => {
		const own = { docked: false, windowId: 2, hasEditorArea: true };

		assert.deepStrictEqual({
			chatWindowFocused: isChatWindowTerminalKeysWindow([own], 2),
			mainWindowFocused: isChatWindowTerminalKeysWindow([own], 1),
			otherChatWindowFocused: isChatWindowTerminalKeysWindow([own, { docked: false, windowId: 3, hasEditorArea: true }], 3),
			docked: isChatWindowTerminalKeysWindow([{ docked: true, windowId: 1, hasEditorArea: true }], 1),
			noEditorArea: isChatWindowTerminalKeysWindow([{ ...own, hasEditorArea: false }], 2),
			noWindows: isChatWindowTerminalKeysWindow([], 1),
		}, { chatWindowFocused: true, mainWindowFocused: false, otherChatWindowFocused: true, docked: false, noEditorArea: false, noWindows: false });
	});

	test('is not sent to the shell while the focus is in the terminal', () => {
		assert.deepStrictEqual([CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID].map(id => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(id)), [true, true]);
	});

	test('the key of the side panel toggles the editor area of the focused chat window, above the rule of the main window', () => {
		const found = KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID);

		assert.deepStrictEqual(found.map(rule => {
			const chord = rule.keybinding?.chords[0] as KeyCodeChord | undefined;
			return { key: chord?.keyCode, ctrlCmd: chord?.ctrlKey || chord?.metaKey, alt: chord?.altKey, above: rule.weight1 > KeybindingWeight.SessionsContrib, followsFocusedWindow: !!rule.when?.keys().includes(ChatWindowTerminalKeysContext.key) };
		}), [{ key: KeyCode.KeyB, ctrlCmd: true, alt: true, above: true, followsFocusedWindow: true }]);
	});
});
