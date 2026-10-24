/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { Menus } from '../../../../browser/menus.js';
import { describeMenuGroup } from '../../../../test/browser/sessionLayoutModeTestUtils.js';
import '../../browser/chatWindow.contribution.js';

suite('Chat window - terminal position', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('is chosen from a Terminal Position menu in the More Actions menu of the terminal row only, the current position checked', () => {
		const row: Record<string, ContextKeyValue> = {
			chatIsEnabled: true,
			'sessions.chatWindow': 'test',
			'sessions.chatWindowHasEditorArea': true,
			'sessions.chatWindowTerminalRow': true,
			'sessions.chatWindowTerminalPosition': 'underEditor',
		};
		const terminalPosition = (contextKeys: Record<string, ContextKeyValue>) => describeMenuGroup(store, MenuId.EditorTitle, '9_chatWindowTerminalPosition', contextKeys, {});
		const entry = (id: string, label: string, checked = false) => ({ id: `sessions.chatWindow.terminalPosition.${id}`, label, checked, enabled: true });

		assert.deepStrictEqual({
			row: terminalPosition(row),
			otherGroup: terminalPosition({ ...row, 'sessions.chatWindowTerminalRow': false }),
			aiDisabled: terminalPosition({ ...row, chatIsEnabled: false }),
			inLayoutMenu: MenuRegistry.getMenuItems(Menus.SessionLayout).filter(isIMenuItem).filter(item => item.command.id.startsWith('sessions.chatWindow.terminalPosition.')).length,
		}, {
			row: [{ label: 'Terminal Position', icon: undefined, entries: [entry('fullWidth', 'Across Full Width'), entry('underEditor', 'Under Editor', true), entry('underChat', 'Under Chat')] }],
			otherGroup: [],
			aiDisabled: [],
			inLayoutMenu: 0,
		});
	});
});
