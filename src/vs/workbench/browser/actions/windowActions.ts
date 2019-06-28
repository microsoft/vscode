/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IsFullscreenContext, IsDevelopmentContext } from 'vs/workbench/browser/contextkeys';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ToggleFullScreenAction extends Action {

	static readonly ID = 'workbench.action.toggleFullScreen';
	static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(
		id: string,
		label: string,
		@IWindowService private readonly windowService: IWindowService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService) {
		super(id, label);
	}

	run(): Promise<void> {
		const container = this.layoutService.getWorkbenchElement();

		return this.windowService.toggleFullScreen(container);
	}
}

export class ReloadWindowAction extends Action {

	static readonly ID = 'workbench.action.reloadWindow';
	static LABEL = nls.localize('reloadWindow', "Reload Window");

	constructor(
		id: string,
		label: string,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		await this.windowService.reloadWindow();

		return true;
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

const viewCategory = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'View: Toggle Full Screen', viewCategory);

const developerCategory = nls.localize('developer', "Developer");
registry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL), 'Developer: Reload Window', developerCategory);

KeybindingsRegistry.registerKeybindingRule({
	id: ReloadWindowAction.ID,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: IsDevelopmentContext,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_R
});

// Appereance menu
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleFullScreenAction.ID,
		title: nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "&&Full Screen"),
		toggled: IsFullscreenContext
	},
	order: 1
});