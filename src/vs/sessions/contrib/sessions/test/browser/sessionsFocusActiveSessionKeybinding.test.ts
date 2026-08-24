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
import { FOCUS_ACTIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import '../../browser/sessionsActions.js';

suite('Sessions - Focus Active Session keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getRule(os: OperatingSystem, keybinding: number) {
		const hash = decodeKeybinding(keybinding, os)!.getHashCode();
		return KeybindingsRegistry.getDefaultKeybindingsForOS(os)
			.find(item => item.command === FOCUS_ACTIVE_SESSION_COMMAND_ID && item.keybinding?.getHashCode() === hash);
	}

	test('aliases the platform Open Chat (Agent) keybinding', () => {
		const windowsRule = getRule(OperatingSystem.Windows, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI);
		const macRule = getRule(OperatingSystem.Macintosh, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI);
		const linuxRule = getRule(OperatingSystem.Linux, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI);
		const linuxFormatDocumentRule = getRule(OperatingSystem.Linux, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI);

		assert.deepStrictEqual({
			windows: { weight: windowsRule?.weight1, secondary: windowsRule?.weight2 },
			mac: { weight: macRule?.weight1, secondary: macRule?.weight2 },
			linux: { weight: linuxRule?.weight1, secondary: linuxRule?.weight2 },
			linuxFormatDocumentChordBound: !!linuxFormatDocumentRule,
		}, {
			windows: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
			mac: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
			linux: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
			linuxFormatDocumentChordBound: false,
		});
	});
});
