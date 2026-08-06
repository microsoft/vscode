/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { hasKey } from '../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ToggleAuxiliaryBarAction } from '../../../workbench/browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { AuxiliaryBarVisibleContext, MainEditorAreaVisibleContext, SecondarySideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { Menus } from '../../browser/menus.js';
import { HasDockedDetailsContext } from '../../common/contextkeys.js';

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

	test('core auxiliary bar command delegates to the layout service', async () => {
		let calls = 0;
		const command = CommandsRegistry.getCommand(ToggleAuxiliaryBarAction.ID);
		assert.ok(command);
		const layoutService = {
			toggleSecondarySideBar: () => {
				calls++;
			},
		};
		const accessor = {
			get: () => layoutService,
		} as ServicesAccessor;

		await command.handler(accessor);

		assert.strictEqual(calls, 1);
	});

	test('core auxiliary bar command toggled state uses semantic secondary sidebar visibility', () => {
		const action = new ToggleAuxiliaryBarAction();
		const toggled = action.desc.toggled;
		assert.ok(toggled && hasKey(toggled, { condition: true }));

		assert.strictEqual(toggled.condition.serialize(), SecondarySideBarVisibleContext.key);
	});

	test('single-pane editor layout actions render in their respective title and header clusters', async () => {
		await import('../../contrib/editor/browser/editor.contribution.js');

		const layoutItems = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => (item.when?.serialize() ?? '').includes(MainEditorAreaVisibleContext.key));
		const headerItems = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout)
			.filter(isIMenuItem);
		const groupOrder = (id: string) => layoutItems
			.filter(item => item.command.id === id)
			.map(item => ({ group: item.group, order: item.order }));

		assert.deepStrictEqual({
			maximize: groupOrder('workbench.action.agentSessions.maximizeMainEditorPart'),
			restore: groupOrder('workbench.action.agentSessions.restoreMainEditorPart'),
			hide: headerItems
				.filter(item => item.command.id === 'workbench.action.agentSessions.hideMainEditorPart')
				.map(item => ({
					group: item.group,
					order: item.order,
					precondition: item.command.precondition?.serialize(),
				})),
			show: headerItems
				.filter(item => item.command.id === 'workbench.action.agentSessions.showMainEditorPart')
				.map(item => ({
					group: item.group,
					order: item.order,
					precondition: item.command.precondition?.serialize(),
				})),
		}, {
			maximize: [{ group: 'navigation', order: 20 }],
			restore: [{ group: 'navigation', order: 20 }],
			hide: [{
				group: 'navigation',
				order: 20,
				precondition: AuxiliaryBarVisibleContext.key,
			}],
			show: [{
				group: 'navigation',
				order: 20,
				precondition: undefined,
			}],
		});

		const hideWhen = headerItems.find(item => item.command.id === 'workbench.action.agentSessions.hideMainEditorPart')?.when?.serialize() ?? '';
		assert.ok(hideWhen.includes(HasDockedDetailsContext.key));
		assert.ok(!hideWhen.includes(AuxiliaryBarVisibleContext.key));
		assert.ok(hideWhen.includes(MainEditorAreaVisibleContext.key));
		assert.ok(!hideWhen.includes(`!${MainEditorAreaVisibleContext.key}`));

		const showWhen = headerItems.find(item => item.command.id === 'workbench.action.agentSessions.showMainEditorPart')?.when?.serialize() ?? '';
		assert.ok(showWhen.includes(HasDockedDetailsContext.key));
		assert.ok(showWhen.includes(`!${MainEditorAreaVisibleContext.key}`));

		// Add File as Context stays a right-header action, not a layout action.
		const headerIds = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary).filter(isIMenuItem).map(item => item.command.id);
		assert.ok(headerIds.includes('workbench.action.agentSessions.addFileAsContext'));
		assert.ok(!layoutItems.some(item => item.command.id === 'workbench.action.agentSessions.addFileAsContext'));
	});
});
