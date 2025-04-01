/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { Action2, MenuId } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { KeybindingWeight } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsDevelopmentContext } from '../../../platform/contextkey/common/contextkeys.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { INativeWorkbenchEnvironmentService } from '../../services/environment/electron-sandbox/environmentService.js';
import { URI } from '../../../base/common/uri.js';
import { getActiveWindow } from '../../../base/browser/dom.js';

export class ToggleDevToolsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleDevTools',
			title: localize2('toggleDevTools', 'Toggle Developer Tools'),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: IsDevelopmentContext,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI }
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

		return nativeHostService.toggleDevTools({ targetWindowId: getActiveWindow().vscodeWindowId });
	}
}

export class ConfigureRuntimeArgumentsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.configureRuntimeArguments',
			title: localize2('configureRuntimeArguments', 'Configure Runtime Arguments'),
			category: Categories.Preferences,
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

export class ReloadWindowWithExtensionsDisabledAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.reloadWindowWithExtensionsDisabled',
			title: localize2('reloadWindowWithExtensionsDisabled', 'Reload with Extensions Disabled'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(INativeHostService).reload({ disableExtensions: true });
	}
}

export class OpenUserDataFolderAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.revealUserDataFolder',
			title: localize2('revealUserDataFolder', 'Reveal User Data Folder'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const environmentService = accessor.get(INativeWorkbenchEnvironmentService);

		return nativeHostService.showItemInFolder(URI.file(environmentService.userDataPath).fsPath);
	}
}

export class ShowGPUInfoAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.showGPUInfo',
			title: localize2('showGPUInfo', 'Show GPU Info'),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const nativeHostService = accessor.get(INativeHostService);
		nativeHostService.openGPUInfoWindow();
	}
}
