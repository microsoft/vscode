/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { hasKey } from '../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, ContextKeyValue, IContext } from '../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../platform/accessibility/common/accessibility.js';
import { ToggleAuxiliaryBarAction } from '../../../workbench/browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { LayoutDensityMenu } from '../../../workbench/browser/actions/layoutDensityActions.js';
import { SecondarySideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { TogglePanelAction } from '../../../workbench/browser/parts/panel/panelActions.js';
import { LayoutSettings, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../browser/menus.js';
import { TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID, TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID } from '../../browser/layoutActions.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { upcastPartial } from '../../../base/test/common/mock.js';

const TOGGLE_PANEL_ACTION_ID = 'workbench.action.togglePanel';
const LEGACY_TOGGLE_PANEL_ALIGNMENT_ACTION_ID = 'workbench.action.agentSessions.togglePanelAlignment';

suite('Sessions - Layout Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// Dynamic import in `suiteSetup` (not a static top-level import, which layering
	// rules disallow here) so its permanent registrations predate any per-test leak tracking.
	suiteSetup(async () => {
		await Promise.all([
			import('../../contrib/editor/browser/editor.contribution.js'),
			import('../../contrib/terminal/browser/sessionsTerminalContribution.js'),
			import('../../contrib/chat/browser/chat.contribution.js'),
			// Every browser contribution to the shared View > Appearance menu, so that an
			// entry that does not apply to the Agents window fails the menu snapshot below.
			import('../../../workbench/browser/actions/layoutActions.js'),
			import('../../../workbench/browser/workbench.zenMode.contribution.js'),
			import('../../../workbench/browser/parts/activitybar/activitybarPart.js'),
			import('../../../editor/contrib/stickyScroll/browser/stickyScrollContribution.js'),
			import('../../../workbench/browser/actions/windowActions.js'),
			import('../../../workbench/browser/parts/titlebar/titlebarActions.js'),
			import('../../../workbench/browser/parts/editor/breadcrumbsControl.js'),
			import('../../../workbench/contrib/codeEditor/browser/toggleMinimap.js'),
			import('../../../workbench/contrib/codeEditor/browser/toggleRenderWhitespace.js'),
			import('../../../workbench/contrib/codeEditor/browser/toggleRenderControlCharacter.js'),
		]);
	});

	test('offers shared layout density commands in the title bar menu and the desktop View > Appearance menu', () => {
		const parents = [Menus.TitleBarContext, MenuId.MenubarAppearanceMenu, MenuId.MenubarViewMenu].map(menu =>
			MenuRegistry.getMenuItems(menu).filter(isISubmenuItem).find(item => item.submenu === LayoutDensityMenu));
		const options = MenuRegistry.getMenuItems(LayoutDensityMenu).filter(isIMenuItem);

		assert.deepStrictEqual({
			parents: parents.map(item => item && ({ title: item.title, group: item.group, when: item.when?.serialize() })),
			options: options.map(item => ({
				id: item.command.id,
				registered: !!CommandsRegistry.getCommand(item.command.id),
				toggled: item.command.toggled,
			})),
		}, {
			parents: [
				{ title: 'Layout Density', group: '2_configuration', when: '!sessionsIsPhoneLayout' },
				{ title: 'Layout &&Density', group: '3_workbench_layout_move', when: undefined },
				undefined,
			],
			options: ['default', 'compact'].map(density => ({
				id: `workbench.action.setLayoutDensity.${density}`,
				registered: true,
				toggled: ContextKeyExpr.equals(`config.${LayoutSettings.MODERN_UI_DENSITY}`, density),
			})),
		});
	});

	// The side panel toggle registers with its layout controller; see baseSessionLayoutController.test.ts.
	test('shared View > Appearance menu shows only the entries that apply to the desktop Agents window', () => {
		const agentsWindow: Record<string, ContextKeyValue> = { isSessionsWindow: true, agentSessionsDesktopLayout: true };
		const context: IContext = { getValue: <T extends ContextKeyValue>(key: string) => agentsWindow[key] as T | undefined };
		const describe = (menu: MenuId) => MenuRegistry.getMenuItems(menu)
			.filter(item => item.when?.evaluate(context) !== false)
			.map(item => isIMenuItem(item)
				? `${item.group}: ${item.command.id}${CommandsRegistry.getCommand(item.command.id) ? '' : ' (unregistered)'}`
				: `${item.group}: submenu ${item.submenu.id}`)
			.sort();

		assert.deepStrictEqual({
			viewMenu: MenuRegistry.getMenuItems(MenuId.MenubarViewMenu).filter(isISubmenuItem).filter(item => item.submenu === MenuId.MenubarAppearanceMenu && item.when?.evaluate(context) !== false).map(item => item.when?.serialize()),
			appearance: describe(MenuId.MenubarAppearanceMenu),
			panelAlignment: describe(MenuId.PanelAlignmentMenu),
		}, {
			viewMenu: ['agentSessionsDesktopLayout'],
			appearance: [
				'1_toggle_view: workbench.action.toggleFullScreen',
				`2_workbench_layout: ${TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID}`,
				'2_workbench_layout: workbench.action.agentToggleSidebarVisibility',
				`2_workbench_layout: ${TOGGLE_PANEL_ACTION_ID}`,
				`3_workbench_layout_move: submenu ${LayoutDensityMenu.id}`,
				`3_workbench_layout_move: submenu ${MenuId.PanelAlignmentMenu.id}`,
				'4_editor: breadcrumbs.toggle',
				'4_editor: editor.action.toggleMinimap',
				'4_editor: editor.action.toggleRenderControlCharacter',
				'4_editor: editor.action.toggleStickyScroll',
				`4_editor: submenu ${MenuId.EditorRenderWhitespaceSubmenu.id}`,
			],
			panelAlignment: [
				'undefined: workbench.action.alignPanelCenter',
				'undefined: workbench.action.alignPanelJustify',
			],
		});
	});

	test('toggles the session activity bar setting from the desktop View > Appearance menu', async () => {
		const item = MenuRegistry.getMenuItems(MenuId.MenubarAppearanceMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID);
		const appearance = MenuRegistry.getMenuItems(MenuId.MenubarViewMenu).filter(isISubmenuItem).find(item => item.submenu === MenuId.MenubarAppearanceMenu);
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				return this.setUserConfiguration(key, value);
			}
		}({ [SESSION_ACTIVITY_BAR_SETTING]: true });
		const accessor = upcastPartial<ServicesAccessor>({ get: <T>() => configurationService as T });
		const run = async () => {
			await CommandsRegistry.getCommand(TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID)!.handler(accessor);
			return configurationService.getValue(SESSION_ACTIVITY_BAR_SETTING);
		};

		assert.deepStrictEqual({
			appearance: { title: appearance?.title, group: appearance?.group, when: appearance?.when?.serialize() },
			group: item?.group,
			when: item?.when?.serialize(),
			toggled: item?.command.toggled,
			afterFirstRun: await run(),
			afterSecondRun: await run(),
		}, {
			appearance: { title: '&&Appearance', group: '2_appearance', when: 'agentSessionsDesktopLayout' },
			group: '2_workbench_layout',
			when: 'agentSessionsDesktopLayout',
			toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true),
			afterFirstRun: false,
			afterSecondRun: true,
		});
	});

	test('toggles the session activity bar layout actions from its context menu', async () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionActivityBarContext).filter(isIMenuItem)
			.map(item => ({ id: item.command.id, title: item.command.title, toggled: item.command.toggled, order: item.order }))
			.sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				return this.setUserConfiguration(key, value);
			}
		}({ [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: true });
		const accessor = upcastPartial<ServicesAccessor>({ get: <T>() => configurationService as T });
		const run = async () => {
			await CommandsRegistry.getCommand(TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID)!.handler(accessor);
			return configurationService.getValue(SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING);
		};

		assert.deepStrictEqual({ items, afterFirstRun: await run(), afterSecondRun: await run() }, {
			items: [
				{ id: TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID, title: 'Show Layout Actions', toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`, true), order: 0 },
				{ id: TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID, title: 'Hide Session Activity Bar', toggled: undefined, order: 1 },
			],
			afterFirstRun: false,
			afterSecondRun: true,
		});
	});

	test('hides the session activity bar from its context menu and toggles it from the chat background menus', () => {
		const find = (menu: MenuId) => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID);
		const describe = (item: ReturnType<typeof find>) => ({ title: item?.command.title, toggled: item?.command.toggled, group: item?.group, when: item?.when?.serialize() });

		assert.deepStrictEqual({
			activityBar: describe(find(Menus.SessionActivityBarContext)),
			chat: describe(find(MenuId.ChatContext)),
			newSession: describe(find(Menus.SessionChatBackgroundContext)),
		}, {
			activityBar: { title: 'Hide Session Activity Bar', toggled: undefined, group: 'navigation', when: undefined },
			chat: { title: 'Session Activity Bar', toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true), group: 'zz_view', when: 'agentSessionsDesktopLayout && chatContextMenuIsBackground && isSessionsWindow && !sessionsIsPhoneLayout' },
			newSession: { title: 'Session Activity Bar', toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true), group: 'zz_view', when: 'agentSessionsDesktopLayout && isSessionsWindow && !sessionsIsPhoneLayout' },
		});
	});

	test('shows the panel toggle below the tab entries of the session activity bar only while it can show there', () => {
		const find = (menu: MenuId) => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => item.command.id === TogglePanelAction.ID);
		const titleBar = find(Menus.TitleBarSessionMenu).find(item => item.command.title === 'Show Panel');
		const activityBar = find(Menus.SessionActivityBar).find(item => item.command.title === 'Show Panel');
		// Where the toggle shows in each layout, for a hidden panel and a closed welcome view in the main window.
		const base: Record<string, ContextKeyValue> = { agentSessionsDesktopLayout: true, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true };
		const scenarios: Record<string, Record<string, ContextKeyValue>> = {
			layoutActions: base,
			layoutActionsOff: { ...base, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: false },
			activityBarOff: { ...base, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: false },
			// The activity bar is hidden with the Sessions part while the editor is maximized, and in the phone layout.
			editorMaximized: { ...base, editorMaximized: true },
			phoneLayout: { ...base, sessionsIsPhoneLayout: true },
		};
		const shows = (item: IMenuItem | undefined, values: Record<string, ContextKeyValue>) => !!item && item.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
		const placement = Object.fromEntries(Object.entries(scenarios).map(([name, values]) => [name, [
			...(shows(titleBar, values) ? ['titleBar'] : []),
			...(shows(activityBar, values) ? ['activityBar'] : []),
		]]));

		assert.deepStrictEqual({ activityBarItems: find(Menus.SessionActivityBar).map(item => ({ title: item.command.title, group: item.group, order: item.order })), placement }, {
			activityBarItems: [{ title: 'Show Panel', group: '3_panel', order: 0 }, { title: 'Hide Panel', group: '3_panel', order: 0 }],
			placement: {
				layoutActions: ['activityBar'],
				layoutActionsOff: ['titleBar'],
				activityBarOff: ['titleBar'],
				editorMaximized: ['titleBar'],
				// The phone layout has its own panel controls.
				phoneLayout: [],
			},
		});
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
					// Hidden while the Session Activity Bar shows its layout actions.
					when: 'editorMaximized && panelVisible && !isAuxiliaryWindow && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || panelVisible && !agentSessionsDesktopLayout && !isAuxiliaryWindow && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || panelVisible && !config.sessions.sessionActivityBar.showLayoutActions && !isAuxiliaryWindow && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || panelVisible && !config.sessions.showSessionActivityBar && !isAuxiliaryWindow && !sessionsIsPhoneLayout && !sessionsWelcomeVisible',
				},
				{
					group: 'navigation',
					order: 10,
					icon: Codicon.layoutPanelOff.id,
					hasToggledState: false,
					when: 'editorMaximized && !isAuxiliaryWindow && !panelVisible && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || !agentSessionsDesktopLayout && !isAuxiliaryWindow && !panelVisible && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || !config.sessions.sessionActivityBar.showLayoutActions && !isAuxiliaryWindow && !panelVisible && !sessionsIsPhoneLayout && !sessionsWelcomeVisible || !config.sessions.showSessionActivityBar && !isAuxiliaryWindow && !panelVisible && !sessionsIsPhoneLayout && !sessionsWelcomeVisible',
				},
			],
			terminalActionPresent: false,
		});
	});

	test('bottom panel does not expose the legacy alignment toggle in the overflow menu', () => {
		const alignmentItems = MenuRegistry.getMenuItems(MenuId.ViewTitle)
			.filter(isIMenuItem)
			.filter(item => item.command.id === LEGACY_TOGGLE_PANEL_ALIGNMENT_ACTION_ID);
		const panelTitleAlignmentItems = MenuRegistry.getMenuItems(Menus.PanelTitle)
			.filter(isIMenuItem)
			.filter(item => item.command.id === LEGACY_TOGGLE_PANEL_ALIGNMENT_ACTION_ID);

		assert.deepStrictEqual({
			commandRegistered: Boolean(CommandsRegistry.getCommand(LEGACY_TOGGLE_PANEL_ALIGNMENT_ACTION_ID)),
			viewTitleAlignmentItemCount: alignmentItems.length,
			panelTitleAlignmentItemCount: panelTitleAlignmentItems.length,
		}, {
			commandRegistered: false,
			viewTitleAlignmentItemCount: 0,
			panelTitleAlignmentItemCount: 0,
		});
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

	test('desktop Hide/Show Editor remain registered but are always hidden', () => {
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
