/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';

// Side-effect import to trigger module-level menu registrations.
// Only import runScriptAction which registers the Run dropdown submenu;
// avoid chat.contribution.js and sessionsTerminalContribution.js which
// bootstrap heavy workbench contributions and leak disposables from
// KeybindingsRegistry in this lightweight test context.
import '../../browser/runScriptAction.js';

const titleBarSessionMenu = MenuId.for('SessionsTitleBarSessionMenu');

suite('RunScriptContribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes run dropdown to TitleBarSessionMenu', () => {
		const items = MenuRegistry.getMenuItems(titleBarSessionMenu);

		const runAction = items.find(item => isISubmenuItem(item) && item.submenu.id === 'AgentSessionsRunScriptDropdown');

		assert.ok(runAction, 'run dropdown should be contributed to TitleBarSessionMenu');
		assert.strictEqual(runAction.order, 8);
	});
});
