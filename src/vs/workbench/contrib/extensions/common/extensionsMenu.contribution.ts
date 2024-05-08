/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import {
	IWorkbenchContribution,
	registerWorkbenchContribution2,
	WorkbenchPhase
} from 'vs/workbench/common/contributions';
import { IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { Action2, MenuId, MenuRegistry, registerAction2, } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';


export class ExtensionsMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionsMenuContribution';
	private extensionMenuItems: DisposableMap<MenuId, IDisposable>;

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IGlobalExtensionEnablementService private readonly globalExtensionEnablementService: IGlobalExtensionEnablementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super();
		void this.createExtensionMenu();
		this.extensionManagementService.onDidInstallExtensions(() => this.updateExtensionMenu());
		this.extensionManagementService.onDidUninstallExtension(() => this.updateExtensionMenu());
		this.globalExtensionEnablementService.onDidChangeEnablement(() => this.updateExtensionMenu());

		this.extensionMenuItems = new DisposableMap<MenuId, IDisposable>();
	}

	private createExtensionActionItem(actionId: string, actionKey: string, actionTitle: string, actionOrder: number, extensionName: string) {
		return class extends Action2 {
			constructor() {
				super({
					id: actionId,
					title: {
						value: actionKey,
						original: actionKey,
						mnemonicTitle: `&&${actionTitle}`,
					},
					category: Categories.Extension,
					menu: {
						id: MenuId.for(extensionName),
						order: actionOrder
					}
				});
			}
			run(): void { }
		};
	}

	private updateExtensionMenu(): void {
		this.extensionMenuItems.clearAndDisposeAll();
		void this.createExtensionMenu();
	}

	private async createExtensionMenu(): Promise<void> {
		await this.listExtensions();
		const mainMenuLength = MenuRegistry.getMenuItems(MenuId.MenubarMainMenu).length;
		const extMenu = MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
			submenu: MenuId.MenubarExtensionMenu,
			title: {
				value: 'Extension',
				original: 'Extension',
				mnemonicTitle: localize({ key: 'mExtension', comment: ['&& denotes a mnemonic'] }, "&&Extension")
			},
			order: mainMenuLength
		});
		this.extensionMenuItems.set(MenuId.MenubarExtensionMenu, extMenu);
	}

	private listExtensionCommands(extension: ILocalExtension): void {
		const commands = extension.manifest.contributes?.commands;
		const extName = extension.manifest.displayName;
		if (extName && commands && commands.length > 0) {
			let extensionCommandOrderIndex = 1;
			commands.forEach(command => {
				if (!CommandsRegistry.getCommand(command.command)) {
					const action = this.createExtensionActionItem(command.command, command.command.toString(), command.title.toString(), extensionCommandOrderIndex, extName);
					registerAction2(action);
					extensionCommandOrderIndex++;
				}
			});
		}
	}

	private async listExtensions(): Promise<void> {
		const extensions = await this.extensionManagementService.getInstalled(ExtensionType.User);

		let extensionOrderIndex = 1;
		extensions.forEach(extension => {
			const extName = extension.manifest.displayName;
			const isEnabledExtension = this.extensionEnablementService.isEnabled(extension);
			if (extName && isEnabledExtension) {
				const menu = MenuRegistry.appendMenuItem(MenuId.MenubarExtensionMenu, {
					submenu: MenuId.for(extName),
					title: {
						value: extName,
						original: extName,
						mnemonicTitle: `&&${extName}`
					},
					order: extensionOrderIndex
				});
				this.extensionMenuItems.set(MenuId.for(extName), menu);
				this.listExtensionCommands(extension);
				extensionOrderIndex++;
			}
		});
	}
}

registerWorkbenchContribution2(ExtensionsMenuContribution.ID, ExtensionsMenuContribution, WorkbenchPhase.BlockStartup);
