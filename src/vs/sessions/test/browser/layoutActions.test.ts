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
import { Menus } from '../../browser/menus.js';

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

	test('auxiliary bar toggle reuses the core command with state-dependent icons on the editor title', () => {
		// The editor-title menu items reference the core toggle command rather than registering
		// their own; assert it is actually registered so the contribution cannot silently break.
		assert.ok(CommandsRegistry.getCommand(ToggleAuxiliaryBarAction.ID), 'core toggle auxiliary bar command should be registered');

		// Original layout: two mutually-exclusive right-panel icons on the layout group.
		const layoutToggleIcons = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === ToggleAuxiliaryBarAction.ID)
			.map(item => ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined)
			.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
		assert.deepStrictEqual(layoutToggleIcons, [Codicon.rightPanelHide.id, Codicon.rightPanelShow.id]);

		// Single-pane redesign: one toggled list-selection item grouped with the editor-title actions.
		const titleToggles = MenuRegistry.getMenuItems(MenuId.EditorTitle)
			.filter(isIMenuItem)
			.filter(item => item.command.id === ToggleAuxiliaryBarAction.ID);
		assert.strictEqual(titleToggles.length, 1);
		assert.strictEqual(ThemeIcon.isThemeIcon(titleToggles[0].command.icon) ? titleToggles[0].command.icon.id : undefined, Codicon.listSelection.id);
		assert.ok(titleToggles[0].command.toggled, 'single-pane toggle should render its open/closed state');
	});
});
