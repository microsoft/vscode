/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN } from '../../browser/newChatPickerKeybinding.js';

suite('New chat picker keybindings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keep Ctrl/Cmd held for both chord strokes', () => {
		assert.deepStrictEqual({
			workspace: FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING,
			harness: FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING,
		}, {
			workspace: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyF),
			harness: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH),
		});
	});

	test('only enable picker shortcuts with the unified workspace picker', () => {
		assert.deepStrictEqual({
			workspace: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN.serialize(),
			harness: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN.serialize(),
		}, {
			workspace: 'chatInputHasFocus && config.sessions.chat.unifiedWorkspacePicker.enabled && isNewChatSession && isSessionsWindow && sessionWorkspacePickerVisible',
			harness: 'chatInputHasFocus && config.sessions.chat.unifiedWorkspacePicker.enabled && isNewChatSession && isSessionsWindow && sessionHarnessPickerVisible',
		});
	});
});
