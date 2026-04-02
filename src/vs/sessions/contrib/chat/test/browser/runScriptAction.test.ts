/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';

import '../../browser/runScriptAction.js';

const titleBarSessionMenu = MenuId.for('SessionsTitleBarSessionMenu');

suite('RunScriptContribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes run dropdown without standalone terminal or VS Code items', () => {
		const items = MenuRegistry.getMenuItems(titleBarSessionMenu);

		const runAction = items.find(item => isISubmenuItem(item) && item.submenu.id === 'AgentSessionsRunScriptDropdown');
		const terminalAction = items.find(item => isIMenuItem(item) && item.command.id === 'agentSession.openInTerminal');
		const vscodeAction = items.find(item => isIMenuItem(item) && item.command.id === 'chat.openSessionWorktreeInVSCode');

		assert.ok(runAction, 'run dropdown should be contributed to TitleBarSessionMenu');
		assert.ok(!terminalAction, 'open terminal should not be contributed as a standalone TitleBarSessionMenu item');
		assert.ok(!vscodeAction, 'open in VS Code should not be contributed as a standalone TitleBarSessionMenu item');
		assert.strictEqual(runAction.order, 8);
	});
});
