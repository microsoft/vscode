/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IKeybindings, KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import '../../../../../editor/contrib/format/browser/formatActions.js';
import { OPEN_CHAT_AGENT_KEYBINDING } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { FOCUS_ACTIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import '../../browser/sessionsActions.js';

suite('Sessions - Focus Active Session keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getPrimaryKeybindingForOS(keybinding: IKeybindings, os: OperatingSystem): number | undefined {
		switch (os) {
			case OperatingSystem.Windows:
				return keybinding.win?.primary ?? keybinding.primary;
			case OperatingSystem.Macintosh:
				return keybinding.mac?.primary ?? keybinding.primary;
			case OperatingSystem.Linux:
				return keybinding.linux?.primary ?? keybinding.primary;
		}
	}

	function getAgentAlias(os: OperatingSystem) {
		const rules = KeybindingsRegistry.getDefaultKeybindingsForOS(os);
		const openAgentKeybinding = getPrimaryKeybindingForOS(OPEN_CHAT_AGENT_KEYBINDING, os);
		const hash = openAgentKeybinding && decodeKeybinding(openAgentKeybinding, os)?.getHashCode();
		return rules.find(item => item.command === FOCUS_ACTIVE_SESSION_COMMAND_ID && item.keybinding?.getHashCode() === hash);
	}

	test('aliases the platform Open Chat (Agent) keybinding', () => {
		const windowsRule = getAgentAlias(OperatingSystem.Windows);
		const macRule = getAgentAlias(OperatingSystem.Macintosh);
		const linuxRule = getAgentAlias(OperatingSystem.Linux);

		assert.deepStrictEqual({
			windows: { weight: windowsRule?.weight1, secondary: windowsRule?.weight2 },
			mac: { weight: macRule?.weight1, secondary: macRule?.weight2 },
			linux: { weight: linuxRule?.weight1, secondary: linuxRule?.weight2 },
		}, {
			windows: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
			mac: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
			linux: { weight: KeybindingWeight.SessionsContrib, secondary: -1 },
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
