/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import {
	IWorkbenchContribution,
	registerWorkbenchContribution2,
	WorkbenchPhase
} from 'vs/workbench/common/contributions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';


export class ExtensionsMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionsMenuContribution';

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService
	) {
		super();
		void this.listExtensions();
	}

	private createExtensionActionItem(actionId: string, actionKey: string, actionTitle: string, actionOrder: number, extensionName: string) {
		return class extends Action2 {
			constructor() {
				super({
					id: actionId,
					title: {
						...localize2(actionKey, 'extension action'),
						mnemonicTitle: localize({ key: `mi${actionKey}`, comment: ['&& denotes a mnemonic'] }, `&&${actionTitle}`),
					},
					category: Categories.Extension,
					f1: true,
					menu: {
						id: MenuId.for('menu_' + extensionName),
						order: actionOrder
					}
				});
			}

			run(accessor: ServicesAccessor): void { }
		};
	}

	private async listExtensions(): Promise<void> {
		const extensions = await this.extensionManagementService.getInstalled(ExtensionType.User);

		extensions.forEach((extension, index) => {
			const extName = extension.manifest.displayName;

			if (extName) {
				MenuRegistry.appendMenuItem(MenuId.MenubarExtensionMenu, {
					submenu: new MenuId('menu_' + extName),
					title: {
						value: extName,
						original: extName,
						mnemonicTitle: localize({ key: `m${extName}`, comment: ['&& denotes a mnemonic'] }, `&&${extName}`)
					},
					order: index
				});


				const commands = extension.manifest.contributes?.commands;

				if (commands && commands.length > 0) {
					commands.forEach((command, index) => {
						if (!CommandsRegistry.getCommand(command.command)) {
							const action = this.createExtensionActionItem(command.command, command.command.toString(), command.title.toString(), index, extName);
							registerAction2(action);
						}
					});
				}

			}
		});

		const mainMenuLength = MenuRegistry.getMenuItems(MenuId.MenubarMainMenu).length;

		MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
			submenu: MenuId.MenubarExtensionMenu,
			title: {
				value: 'Extension',
				original: 'Extension',
				mnemonicTitle: localize({ key: 'mExtension', comment: ['&& denotes a mnemonic'] }, "&&Extension")
			},
			order: mainMenuLength
		});

	}

}

registerWorkbenchContribution2(ExtensionsMenuContribution.ID, ExtensionsMenuContribution, WorkbenchPhase.BlockStartup);
