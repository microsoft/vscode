/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import '../../../../../editor/contrib/format/browser/formatActions.js';
import { FOCUS_ACTIVE_SESSION_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import '../../browser/sessionsActions.js';

suite('Sessions - Focus Active Session keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getKeybindings(os: OperatingSystem) {
		return KeybindingsRegistry.getDefaultKeybindingsForOS(os)
			.filter(item => item.command === FOCUS_ACTIVE_SESSION_COMMAND_ID)
			.map(item => ({ keybinding: item.keybinding?.getHashCode(), weight: item.weight1 }));
	}

	function expected(keybinding: number, os: OperatingSystem) {
		return [{ keybinding: decodeKeybinding(keybinding, os)!.getHashCode(), weight: KeybindingWeight.SessionsContrib }];
	}

	test('aliases the platform Open Chat (Agent) keybinding, leaving the Open Chat keybinding to the Sessions view', () => {
		assert.deepStrictEqual({
			windows: getKeybindings(OperatingSystem.Windows),
			mac: getKeybindings(OperatingSystem.Macintosh),
			linux: getKeybindings(OperatingSystem.Linux),
		}, {
			windows: expected(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI, OperatingSystem.Windows),
			mac: expected(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI, OperatingSystem.Macintosh),
			linux: expected(KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI, OperatingSystem.Linux),
		});
	});

	test('preserves the Linux Format Document keybinding', () => {
		const hash = decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI, OperatingSystem.Linux)!.getHashCode();
		const rules = KeybindingsRegistry.getDefaultKeybindingsForOS(OperatingSystem.Linux)
			.filter(item => item.keybinding?.getHashCode() === hash);

		assert.deepStrictEqual({
			formatDocument: rules.some(item => item.command === 'editor.action.formatDocument'),
			focusActiveSession: rules.some(item => item.command === FOCUS_ACTIVE_SESSION_COMMAND_ID),
		}, {
			formatDocument: true,
			focusActiveSession: false,
		});
	});
});
