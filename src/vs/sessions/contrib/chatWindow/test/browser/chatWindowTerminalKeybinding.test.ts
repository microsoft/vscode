/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, ChatWindowTerminalKeysContext, ChatWindowTerminalKeysContribution, isChatWindowTerminalKeysWindow } from '../../browser/chatWindowActivityBar.js';

suite('Chat window terminal keybinding', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('the focus of elements inside a window does not update the key, only the focus of the window does', () => {
		const windows = observableValue<readonly IChatWindow[]>('windows', []);
		let reads = 0;
		const get = windows.get.bind(windows);
		windows.get = () => { reads++; return get(); };
		const contribution = store.add(new ChatWindowTerminalKeysContribution(
			store.add(new MockContextKeyService()),
			new class extends mock<IChatWindowService>() { override readonly windows = windows; }(),
			new class extends mock<IHostService>() { override readonly onDidChangeActiveWindow = Event.None; override readonly onDidChangeFocus = store.add(new Emitter<boolean>()).event; }(),
		));
		const elements = [0, 1, 2].map(() => mainWindow.document.body.appendChild(mainWindow.document.createElement('div')));
		const before = reads;
		for (const element of elements) {
			element.dispatchEvent(new FocusEvent('focus'));
		}
		const afterElements = reads;
		mainWindow.dispatchEvent(new FocusEvent('focus'));

		assert.deepStrictEqual({ elementFocusUpdates: afterElements - before, windowFocusUpdates: reads - afterElements }, { elementFocusUpdates: 0, windowFocusUpdates: 1 });
		elements.forEach(element => element.remove());
		contribution.dispose();
	});
});
