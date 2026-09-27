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
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../platform/accessibility/common/accessibility.js';
import { ToggleAuxiliaryBarAction } from '../../../workbench/browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { PanelVisibleContext, SecondarySideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../browser/menus.js';

// Import layout actions to trigger menu registration
import '../../browser/layoutActions.js';

const TOGGLE_PANEL_ACTION_ID = 'workbench.action.togglePanel';

suite('Sessions - Layout Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// Dynamic import in `suiteSetup` (not a static top-level import, which layering
	// rules disallow here) so its permanent registrations predate any per-test leak tracking.
	suiteSetup(async () => {
		await Promise.all([
			import('../../contrib/editor/browser/editor.contribution.js'),
			import('../../contrib/terminal/browser/sessionsTerminalContribution.js')
		]);
	});

	test('always-on-top toggle action is contributed to TitleBarRight', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout);
		const menuItems = items.filter(isIMenuItem);

		const toggleAlwaysOnTop = menuItems.find(item => item.command.id === 'workbench.action.toggleWindowAlwaysOnTop');

		assert.ok(toggleAlwaysOnTop, 'toggleWindowAlwaysOnTop should be contributed to TitleBarRight');
		assert.strictEqual(toggleAlwaysOnTop.group, 'navigation');
	});

	test('screen reader optimized action uses a title bar toolbar menu', () => {
		const item = MenuRegistry.getMenuItems(Menus.TitleBarAccessibility)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'editor.action.toggleScreenReaderAccessibilityMode');

		assert.deepStrictEqual({
			title: item?.command.title,
			tooltip: item?.command.tooltip,
			when: item?.when?.serialize(),
		}, {
			title: 'Screen Reader Optimized',
			tooltip: 'Disable Screen Reader Optimized Mode',
			when: `${CONTEXT_ACCESSIBILITY_MODE_ENABLED.key} && !sessionsIsPhoneLayout`,
		});
	});

	test('bottom panel layout action replaces the terminal action in the session title bar', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarSessionMenu).filter(isIMenuItem);
		const panelActions = items
			.filter(item => item.command.id === TOGGLE_PANEL_ACTION_ID)
			.map(item => ({
				group: item.group,
				order: item.order,
				icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
				hasToggledState: Boolean(item.command.toggled),
				when: item.when?.serialize(),
			}))
			.sort((a, b) => (a.icon ?? '').localeCompare(b.icon ?? ''));

		assert.deepStrictEqual({
			commandRegistered: Boolean(CommandsRegistry.getCommand(TOGGLE_PANEL_ACTION_ID)),
			panelActions,
			terminalActionPresent: items.some(item => item.command.id === 'agentSession.openInTerminal'),
		}, {
			commandRegistered: true,
			panelActions: [
				{
					group: 'navigation',
					order: 10,
					icon: Codicon.layoutPanel.id,
					hasToggledState: false,
					when: `${PanelVisibleContext.key} && !isAuxiliaryWindow && !sessionsIsPhoneLayout && !sessionsWelcomeVisible`,
				},
				{
					group: 'navigation',
					order: 10,
					icon: Codicon.layoutPanelOff.id,
					hasToggledState: false,
					when: `!isAuxiliaryWindow && !${PanelVisibleContext.key} && !sessionsIsPhoneLayout && !sessionsWelcomeVisible`,
				},
			],
			terminalActionPresent: false,
		});
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

	test('single-pane Hide/Show Editor remain registered but are always hidden', () => {
		const layoutItems = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem);
		const actionState = (id: string) => layoutItems
			.filter(item => item.command.id === id)
			.map(item => ({
				group: item.group,
				order: item.order,
				icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
				when: item.when?.serialize(),
			}));

		assert.deepStrictEqual({
			hideCommandRegistered: Boolean(CommandsRegistry.getCommand('workbench.action.agentSessions.hideMainEditorPart')),
			showCommandRegistered: Boolean(CommandsRegistry.getCommand('workbench.action.agentSessions.showMainEditorPart')),
			hide: actionState('workbench.action.agentSessions.hideMainEditorPart'),
			show: actionState('workbench.action.agentSessions.showMainEditorPart'),
		}, {
			hideCommandRegistered: true,
			showCommandRegistered: true,
			hide: [{ group: 'navigation', order: 20, icon: Codicon.rightPanelHide.id, when: 'false' }],
			show: [{ group: 'navigation', order: 20, icon: Codicon.rightPanelShow.id, when: 'false' }],
		});

		const headerIds = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout).filter(isIMenuItem).map(item => item.command.id);
		assert.ok(!headerIds.includes('workbench.action.agentSessions.hideMainEditorPart'));
		assert.ok(!headerIds.includes('workbench.action.agentSessions.showMainEditorPart'));

		// Add File as Context stays an editor action, not a group-header layout action.
		const editorTitleIds = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle).filter(isIMenuItem).map(item => item.command.id);
		assert.ok(editorTitleIds.includes('workbench.action.agentSessions.addFileAsContext'));
		assert.ok(!layoutItems.some(item => item.command.id === 'workbench.action.agentSessions.addFileAsContext'));
	});

	test('Hide Editor unconditionally reveals the auxiliary bar so the pane always lands in Detail only', async () => {
		const command = CommandsRegistry.getCommand('workbench.action.agentSessions.hideMainEditorPart');
		assert.ok(command);

		const calls: Array<{ hidden: boolean; part: Parts }> = [];
		const layoutService = {
			setPartHidden: (hidden: boolean, part: Parts) => calls.push({ hidden, part }),
		};
		const accessor = { get: () => layoutService } as ServicesAccessor;

		await command.handler(accessor);

		// The New/Existing Session strategy's detail-panel mapping, not this action, decides what the panel shows.
		assert.deepStrictEqual(calls, [
			{ hidden: false, part: Parts.AUXILIARYBAR_PART },
			{ hidden: true, part: Parts.EDITOR_PART },
			{ hidden: false, part: Parts.SIDEBAR_PART },
		]);
	});
});
