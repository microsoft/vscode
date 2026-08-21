/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from '../../base/common/keyCodes.js';
import { localize, localize2 } from '../../nls.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { InEditorZenModeContext, IsAuxiliaryWindowFocusedContext } from '../common/contextkeys.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { ZenHideEditorTabsAction, ZenShowMultipleEditorTabsAction, ZenShowSingleEditorTabAction } from './actions/layoutActions.js';

// --- Configuration

(function registerZenModeConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	registry.registerConfiguration({
		'id': 'zenMode',
		'order': 9,
		'title': localize('zenModeConfigurationTitle', "Zen Mode"),
		'type': 'object',
		'properties': {
			'zenMode.fullScreen': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.fullScreen', "Controls whether turning on Zen Mode also puts the workbench into full screen mode.")
			},
			'zenMode.centerLayout': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.centerLayout', "Controls whether turning on Zen Mode also centers the layout.")
			},
			'zenMode.showTabs': {
				'type': 'string',
				'enum': ['multiple', 'single', 'none'],
				'description': localize('zenMode.showTabs', "Controls whether turning on Zen Mode should show multiple editor tabs, a single editor tab, or hide the editor title area completely."),
				'enumDescriptions': [
					localize('zenMode.showTabs.multiple', "Each editor is displayed as a tab in the editor title area."),
					localize('zenMode.showTabs.single', "The active editor is displayed as a single large tab in the editor title area."),
					localize('zenMode.showTabs.none', "The editor title area is not displayed."),
				],
				'default': 'multiple'
			},
			'zenMode.hideStatusBar': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.hideStatusBar', "Controls whether turning on Zen Mode also hides the status bar at the bottom of the workbench.")
			},
			'zenMode.hideActivityBar': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.hideActivityBar', "Controls whether turning on Zen Mode also hides the activity bar either at the left or right of the workbench.")
			},
			'zenMode.hideLineNumbers': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.hideLineNumbers', "Controls whether turning on Zen Mode also hides the editor line numbers.")
			},
			'zenMode.restore': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.restore', "Controls whether a window should restore to Zen Mode if it was exited in Zen Mode.")
			},
			'zenMode.silentNotifications': {
				'type': 'boolean',
				'default': true,
				'description': localize('zenMode.silentNotifications', "Controls whether notifications do not disturb mode should be enabled while in Zen Mode. If true, only error notifications will pop out.")
			}
		}
	});
})();

// --- Zen Mode Editor Tabs Actions

registerAction2(ZenHideEditorTabsAction);
registerAction2(ZenShowMultipleEditorTabsAction);
registerAction2(ZenShowSingleEditorTabAction);

// --- Tab Bar Submenu in View Appearance Menu (Zen Mode variant)

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.EditorTabsBarShowTabsZenModeSubmenu,
	title: localize('tabBar', "Tab Bar"),
	group: '3_workbench_layout_move',
	order: 10,
	when: InEditorZenModeContext
});

// --- Toggle Zen Mode

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleZenMode',
			title: {
				...localize2('toggleZenMode', "Toggle Zen Mode"),
				mnemonicTitle: localize({ key: 'miToggleZenMode', comment: ['&& denotes a mnemonic'] }, "Zen Mode"),
			},
			precondition: IsAuxiliaryWindowFocusedContext.toNegated(),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyZ)
			},
			toggled: InEditorZenModeContext,
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '1_toggle_view',
				order: 2
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		return accessor.get(IWorkbenchLayoutService).toggleZenMode();
	}
});

// --- Exit Zen Mode

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.exitZenMode',
	weight: KeybindingWeight.EditorContrib - 1000,
	handler(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const contextKeyService = accessor.get(IContextKeyService);
		if (InEditorZenModeContext.getValue(contextKeyService)) {
			layoutService.toggleZenMode();
		}
	},
	when: InEditorZenModeContext,
	primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
});
