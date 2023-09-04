/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ByteSize, IFileService } from 'vs/platform/files/common/files';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { URI } from 'vs/base/common/uri';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export class ToggleDevToolsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleDevTools',
			title: { value: localize('toggleDevTools', "Toggle Developer Tools"), original: 'Toggle Developer Tools' },
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

		return nativeHostService.toggleDevTools();
	}
}

export class ConfigureRuntimeArgumentsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.configureRuntimeArguments',
			title: { value: localize('configureRuntimeArguments', "Configure Runtime Arguments"), original: 'Configure Runtime Arguments' },
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
			title: { value: localize('reloadWindowWithExtensionsDisabled', "Reload With Extensions Disabled"), original: 'Reload With Extensions Disabled' },
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
			id: 'workbench.action.openUserDataFolder',
			title: { value: localize('openUserDataFolder', "Open User Data Folder"), original: 'Open User Data Folder' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const fileService = accessor.get(IFileService);
		const environmentService = accessor.get(INativeWorkbenchEnvironmentService);

		const userDataHome = URI.file(environmentService.userDataPath);
		const file = await fileService.resolve(userDataHome);

		let itemToShow: URI;
		if (file.children && file.children.length > 0) {
			itemToShow = file.children[0].resource;
		} else {
			itemToShow = userDataHome;
		}

		return nativeHostService.showItemInFolder(itemToShow.fsPath);
	}
}

export class RemoveLargeStorageEntriesAction extends Action2 {

	private static SIZE_THRESHOLD = 1024 * 16; // 16kb

	constructor() {
		super({
			id: 'workbench.action.removeLargeStorageDatabaseEntries',
			title: { value: localize('removeLargeStorageDatabaseEntries', "Remove Large Storage Database Entries..."), original: 'Remove Large Storage Database Entries...' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const dialogService = accessor.get(IDialogService);

		interface IStorageItem extends IQuickPickItem {
			readonly key: string;
			readonly scope: StorageScope;
			readonly target: StorageTarget;
			readonly size: number;
		}

		const items: IStorageItem[] = [];

		for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
			if (scope === StorageScope.PROFILE && userDataProfileService.currentProfile.isDefault) {
				continue; // avoid duplicates
			}

			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				for (const key of storageService.keys(scope, target)) {
					const value = storageService.get(key, scope);
					if (value && value.length > RemoveLargeStorageEntriesAction.SIZE_THRESHOLD) {
						items.push({
							key,
							scope,
							target,
							size: value.length,
							label: key,
							description: ByteSize.formatSize(value.length),
							detail: localize('largeStorageItemDetail', "Scope: {0}, Target: {1}", scope === StorageScope.APPLICATION ? localize('global', "Global") : scope === StorageScope.PROFILE ? localize('profile', "Profile") : localize('workspace', "Workspace"), target === StorageTarget.MACHINE ? localize('machine', "Machine") : localize('user', "User")),
						});
					}
				}
			}
		}

		items.sort((itemA, itemB) => itemB.size - itemA.size);

		const selectedItems = await new Promise<readonly IStorageItem[]>(resolve => {
			const disposables = new DisposableStore();

			const picker = disposables.add(quickInputService.createQuickPick<IStorageItem>());
			picker.items = items;
			picker.canSelectMany = true;
			picker.ok = false;
			picker.customButton = true;
			picker.hideCheckAll = true;
			picker.customLabel = localize('remove', "Remove");
			picker.placeholder = localize('selectEntries', "Select large entries to remove from storage");

			if (items.length === 0) {
				picker.description = localize('noLargeStorageEntries', "There are no large storage entries to remove.");
			}

			picker.show();

			disposables.add(picker.onDidCustom(() => {
				resolve(picker.selectedItems);
				picker.hide();
			}));

			disposables.add(picker.onDidHide(() => disposables.dispose()));
		});

		if (selectedItems.length === 0) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('confirmRemove', "Do you want to remove the selected storage entries from the database?"),
			detail: localize('confirmRemoveDetail', "{0}\n\nThis action is irreversible and may result in data loss!", selectedItems.map(item => item.key).join('\n')),
			primaryButton: localize({ key: 'removeButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Remove")
		});

		if (!confirmed) {
			return;
		}

		for (const item of selectedItems) {
			storageService.remove(item.key, item.scope);
		}
	}
}
