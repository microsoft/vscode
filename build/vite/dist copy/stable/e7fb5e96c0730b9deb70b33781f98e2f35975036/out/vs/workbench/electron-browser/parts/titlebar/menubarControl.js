/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Separator } from '../../../../base/common/actions.js';
import { IMenuService, SubmenuItemAction, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { MenubarControl } from '../../../browser/parts/titlebar/menubarControl.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IMenubarService } from '../../../../platform/menubar/electron-browser/menubar.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { OpenRecentAction } from '../../../browser/actions/windowActions.js';
import { isICommandActionToggleInfo } from '../../../../platform/action/common/action.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
let NativeMenubarControl = class NativeMenubarControl extends MenubarControl {
    constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, menubarService, hostService, nativeHostService, commandService) {
        super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
        this.menubarService = menubarService;
        this.nativeHostService = nativeHostService;
        (async () => {
            this.recentlyOpened = await this.workspacesService.getRecentlyOpened();
            this.doUpdateMenubar();
        })();
        this.registerListeners();
    }
    setupMainMenu() {
        super.setupMainMenu();
        for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
            const menu = this.menus[topLevelMenuName];
            if (menu) {
                this.mainMenuDisposables.add(menu.onDidChange(() => this.updateMenubar()));
            }
        }
    }
    doUpdateMenubar() {
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
    getMenubarMenus(menubarData) {
        if (!menubarData) {
            return false;
        }
        menubarData.keybindings = this.getAdditionalKeybindings();
        for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
            const menu = this.menus[topLevelMenuName];
            if (menu) {
                const menubarMenu = { items: [] };
                const menuActions = getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
                this.populateMenuItems(menuActions, menubarMenu, menubarData.keybindings);
                if (menubarMenu.items.length === 0) {
                    return false; // Menus are incomplete
                }
                menubarData.menus[topLevelMenuName] = menubarMenu;
            }
        }
        return true;
    }
    populateMenuItems(menuActions, menuToPopulate, keybindings) {
        for (const menuItem of menuActions) {
            if (menuItem instanceof Separator) {
                menuToPopulate.items.push({ id: 'vscode.menubar.separator' });
            }
            else if (menuItem instanceof MenuItemAction || menuItem instanceof SubmenuItemAction) {
                // use mnemonicTitle whenever possible
                const title = typeof menuItem.item.title === 'string'
                    ? menuItem.item.title
                    : menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;
                if (menuItem instanceof SubmenuItemAction) {
                    const submenu = { items: [] };
                    this.populateMenuItems(menuItem.actions, submenu, keybindings);
                    if (submenu.items.length > 0) {
                        const menubarSubmenuItem = {
                            id: menuItem.id,
                            label: title,
                            submenu
                        };
                        menuToPopulate.items.push(menubarSubmenuItem);
                    }
                }
                else {
                    if (menuItem.id === OpenRecentAction.ID) {
                        const actions = this.getOpenRecentActions().map(this.transformOpenRecentAction);
                        menuToPopulate.items.push(...actions);
                    }
                    const menubarMenuItem = {
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
    transformOpenRecentAction(action) {
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
    getAdditionalKeybindings() {
        const keybindings = {};
        if (isMacintosh) {
            const keybinding = this.getMenubarKeybinding('workbench.action.quit');
            if (keybinding) {
                keybindings['workbench.action.quit'] = keybinding;
            }
        }
        return keybindings;
    }
    getMenubarKeybinding(id) {
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
};
NativeMenubarControl = __decorate([
    __param(0, IMenuService),
    __param(1, IWorkspacesService),
    __param(2, IContextKeyService),
    __param(3, IKeybindingService),
    __param(4, IConfigurationService),
    __param(5, ILabelService),
    __param(6, IUpdateService),
    __param(7, IStorageService),
    __param(8, INotificationService),
    __param(9, IPreferencesService),
    __param(10, INativeWorkbenchEnvironmentService),
    __param(11, IAccessibilityService),
    __param(12, IMenubarService),
    __param(13, IHostService),
    __param(14, INativeHostService),
    __param(15, ICommandService)
], NativeMenubarControl);
export { NativeMenubarControl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudWJhckNvbnRyb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvZWxlY3Ryb24tYnJvd3Nlci9wYXJ0cy90aXRsZWJhci9tZW51YmFyQ29udHJvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQVcsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDMUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQXFCLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7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