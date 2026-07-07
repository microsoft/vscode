/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ToggleAuxiliaryBarAction } from '../../../workbench/browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { MainEditorAreaVisibleContext } from '../../../workbench/common/contextkeys.js';
import { Menus } from '../../browser/menus.js';
import { SinglePaneDetailChangesOrFilesActiveContext } from '../../common/contextkeys.js';

// Import layout actions to trigger menu registration
import '../../browser/layoutActions.js';

suite('Sessions - Layout Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('always-on-top toggle action is contributed to TitleBarRight', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout);
		const menuItems = items.filter(isIMenuItem);

		const toggleAlwaysOnTop = menuItems.find(item => item.command.id === 'workbench.action.toggleWindowAlwaysOnTop');

		assert.ok(toggleAlwaysOnTop, 'toggleWindowAlwaysOnTop should be contributed to TitleBarRight');
		assert.strictEqual(toggleAlwaysOnTop.group, 'navigation');
	});

	test('original-layout auxiliary bar toggle reuses the core command with state-dependent icons on the editor title layout menu', () => {
		// The original (non-single-pane) editor-title menu items reference the core toggle command
		// rather than registering their own; assert it is actually registered so the contribution
		// cannot silently break. (The single-pane "Toggle Details" item is a dedicated command
		// registered by SinglePaneLayoutController and is asserted in its own suite.)
		assert.ok(CommandsRegistry.getCommand(ToggleAuxiliaryBarAction.ID), 'core toggle auxiliary bar command should be registered');

		// Original layout: two mutually-exclusive right-panel icons on the layout group.
		const layoutToggleIcons = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === ToggleAuxiliaryBarAction.ID)
			.map(item => ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined)
			.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
		assert.deepStrictEqual(layoutToggleIcons, [Codicon.rightPanelHide.id, Codicon.rightPanelShow.id]);
	});

	test('single-pane editor title layout actions are ordered at the end', async () => {
		await import('../../contrib/editor/browser/editor.contribution.js');

		const menuItems = MenuRegistry.getMenuItems(MenuId.EditorTitle).filter(isIMenuItem);
		const orders = (id: string) => menuItems
			.filter(item => item.command.id === id)
			.map(item => item.order);
		const groupOrders = (id: string) => menuItems
			.filter(item => item.command.id === id)
			.map(item => ({ group: item.group, order: item.order }));
		const whens = (id: string) => menuItems
			.filter(item => item.command.id === id)
			.map(item => item.when?.serialize() ?? '');

		assert.deepStrictEqual(orders('workbench.action.agentSessions.maximizeMainEditorPart'), [1000000]);
		assert.deepStrictEqual(orders('workbench.action.agentSessions.restoreMainEditorPart'), [1000000]);
		assert.deepStrictEqual(groupOrders('workbench.action.agentSessions.hideMainEditorPart'), [{ group: 'navigation', order: 999999 }]);
		assert.ok(orders('workbench.action.agentSessions.hideMainEditorPart').every(order => typeof order === 'number' && order < 1000000));
		assert.ok(whens('workbench.action.agentSessions.maximizeMainEditorPart').every(when => when.includes(MainEditorAreaVisibleContext.key)));
		assert.ok(whens('workbench.action.agentSessions.restoreMainEditorPart').every(when => when.includes(MainEditorAreaVisibleContext.key)));
		assert.ok(whens('workbench.action.agentSessions.hideMainEditorPart').every(when => when.includes(MainEditorAreaVisibleContext.key)));
		assert.ok(whens('workbench.action.agentSessions.hideMainEditorPart').every(when => when.includes(SinglePaneDetailChangesOrFilesActiveContext.key)));
		assert.ok(orders('workbench.action.agentSessions.addFileAsContext').every(order => typeof order === 'number' && order < 1000000));
	});
});
