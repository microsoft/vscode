/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

export class ToggleDevToolsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleDevTools',
			title: { value: localize('toggleDevTools', "Toggle Developer Tools"), original: 'Toggle Developer Tools' },
			category: CATEGORIES.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: IsDevelopmentContext,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I }
			},
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '5_tools',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		return nativeHostService.toggleDevTools();
	}
}

export class ConfigureRuntimeArgumentsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.configureRuntimeArguments',
			title: { value: localize('configureRuntimeArguments', "Configure Runtime Arguments"), original: 'Configure Runtime Arguments' },
			category: CATEGORIES.Preferences,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);

		await editorService.openEditor({
			resource: environmentService.argvResource,
			options: { pinned: true }
		});
	}
}


export class ToggleSharedProcessAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleSharedProcess',
			title: { value: localize('toggleSharedProcess', "Toggle Shared Process"), original: 'Toggle Shared Process' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(INativeHostService).toggleSharedProcessWindow();
	}
}

export class ReloadWindowWithExtensionsDisabledAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.reloadWindowWithExtensionsDisabled',
			title: { value: localize('reloadWindowWithExtensionsDisabled', "Reload With Extensions Disabled"), original: 'Reload With Extensions Disabled' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(INativeHostService).reload({ disableExtensions: true });
	}
}
