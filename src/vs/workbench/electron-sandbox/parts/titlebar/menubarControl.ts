/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from 'vs/base/common/actions';
import { IMenuService, SubmenuItemAction, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { isMacintosh } from 'vs/base/common/platform';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUpdateService } from 'vs/platform/update/common/update';
import { IOpenRecentAction, MenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IMenubarData, IMenubarMenu, IMenubarKeybinding, IMenubarMenuItemSubmenu, IMenubarMenuItemAction, MenubarMenuItem } from 'vs/platform/menubar/common/menubar';
import { IMenubarService } from 'vs/platform/menubar/electron-sandbox/menubar';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { OpenRecentAction } from 'vs/workbench/browser/actions/windowActions';
import { isICommandActionToggleInfo } from 'vs/platform/action/common/action';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

export class NativeMenubarControl extends MenubarControl {

	constructor(
		@IMenuService menuService: IMenuService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILabelService labelService: ILabelService,
		@IUpdateService updateService: IUpdateService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IPreferencesService preferencesService: IPreferencesService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IMenubarService private readonly menubarService: IMenubarService,
		@IHostService hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ICommandService commandService: ICommandService,
	) {
		super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);

		(async () => {
			this.recentlyOpened = await this.workspacesService.getRecentlyOpened();

			this.doUpdateMenubar();
		})();

		this.registerListeners();
	}

	protected override setupMainMenu(): void {
		super.setupMainMenu();

		for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
			const menu = this.menus[topLevelMenuName];
			if (menu) {
				this.mainMenuDisposables.add(menu.onDidChange(() => this.updateMenubar()));
			}
		}
	}

	protected doUpdateMenubar(): void {
		// Since the native menubar is shared between windows (main process)
		// only allow the focused window to update the menubar
		if (!this.hostService.hasFocus) {
			return;
		}

		// Send menus to main process to be rendered by Electron
		const menubarData = { menus: {}, keybindings: {} };
		if (this.getMenubarMenus(menubarData)) {
			this.menubarService.updateMenubar(this.nativeHostService.windowId, menubarData);
		}
	}

	private getMenubarMenus(menubarData: IMenubarData): boolean {
		if (!menubarData) {
			return false;
		}

		menubarData.keybindings = this.getAdditionalKeybindings();
		for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
			const menu = this.menus[topLevelMenuName];
			if (menu) {
				const menubarMenu: IMenubarMenu = { items: [] };
				const menuActions: IAction[] = [];
				createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, menuActions);
				this.populateMenuItems(menuActions, menubarMenu, menubarData.keybindings);
				if (menubarMenu.items.length === 0) {
					return false; // Menus are incomplete
				}
				menubarData.menus[topLevelMenuName] = menubarMenu;
			}
		}

		return true;
	}

	private populateMenuItems(menuActions: readonly IAction[], menuToPopulate: IMenubarMenu, keybindings: { [id: string]: IMenubarKeybinding | undefined }) {
		for (const menuItem of menuActions) {
			if (menuItem instanceof Separator) {
				menuToPopulate.items.push({ id: 'vscode.menubar.separator' });
			} else if (menuItem instanceof MenuItemAction || menuItem instanceof SubmenuItemAction) {

				// use mnemonicTitle whenever possible
				const title = typeof menuItem.item.title === 'string'
					? menuItem.item.title
					: menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;

				if (menuItem instanceof SubmenuItemAction) {
					const submenu = { items: [] };

					this.populateMenuItems(menuItem.actions, submenu, keybindings);

					if (submenu.items.length > 0) {
						const menubarSubmenuItem: IMenubarMenuItemSubmenu = {
							id: menuItem.id,
							label: title,
							submenu: submenu
						};

						menuToPopulate.items.push(menubarSubmenuItem);
					}
				} else {
					if (menuItem.id === OpenRecentAction.ID) {
						const actions = this.getOpenRecentActions().map(this.transformOpenRecentAction);
						menuToPopulate.items.push(...actions);
					}

					const menubarMenuItem: IMenubarMenuItemAction = {
						id: menuItem.id,
						label: title
					};

					if (isICommandActionToggleInfo(menuItem.item.toggled)) {
						menubarMenuItem.label = menuItem.item.toggled.mnemonicTitle ?? menuItem.item.toggled.title ?? title;
					}

					if (menuItem.checked) {
						menubarMenuItem.checked = true;
					}

					if (!menuItem.enabled) {
						menubarMenuItem.enabled = false;
					}

					keybindings[menuItem.id] = this.getMenubarKeybinding(menuItem.id);
					menuToPopulate.items.push(menubarMenuItem);
				}
			}
		}
	}

	private transformOpenRecentAction(action: Separator | IOpenRecentAction): MenubarMenuItem {
		if (action instanceof Separator) {
			return { id: 'vscode.menubar.separator' };
		}

		return {
			id: action.id,
			uri: action.uri,
			remoteAuthority: action.remoteAuthority,
			enabled: action.enabled,
			label: action.label
		};
	}

	private getAdditionalKeybindings(): { [id: string]: IMenubarKeybinding } {
		const keybindings: { [id: string]: IMenubarKeybinding } = {};
		if (isMacintosh) {
			const keybinding = this.getMenubarKeybinding('workbench.action.quit');
			if (keybinding) {
				keybindings['workbench.action.quit'] = keybinding;
			}
		}

		return keybindings;
	}

	private getMenubarKeybinding(id: string): IMenubarKeybinding | undefined {
		const binding = this.keybindingService.lookupKeybinding(id);
		if (!binding) {
			return undefined;
		}

		// first try to resolve a native accelerator
		const electronAccelerator = binding.getElectronAccelerator();
		if (electronAccelerator) {
			return { label: electronAccelerator, userSettingsLabel: binding.getUserSettingsLabel() ?? undefined };
		}

		// we need this fallback to support keybindings that cannot show in electron menus (e.g. chords)
		const acceleratorLabel = binding.getLabel();
		if (acceleratorLabel) {
			return { label: acceleratorLabel, isNative: false, userSettingsLabel: binding.getUserSettingsLabel() ?? undefined };
		}

		return undefined;
	}
}
