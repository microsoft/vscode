/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { isMacintosh, language } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { app, shell, Menu, MenuItem, BrowserWindow } from 'electron';
import { OpenContext, IRunActionInWindowRequest } from 'vs/platform/windows/common/windows';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import product from 'vs/platform/node/product';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { mnemonicMenuLabel as baseMnemonicLabel, unmnemonicLabel } from 'vs/base/common/labels';
import { IWindowsMainService, IWindowsCountChangedEvent } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IMenubarData, IMenubarKeybinding, MenubarMenuItem, isMenubarMenuItemSeparator, isMenubarMenuItemSubmenu, isMenubarMenuItemAction } from 'vs/platform/menubar/common/menubar';
import URI from 'vs/base/common/uri';
import { IUriDisplayService } from 'vs/platform/uriDisplay/common/uriDisplay';

const telemetryFrom = 'menu';

export class Menubar {

	private static readonly MAX_MENU_RECENT_ENTRIES = 10;
	private isQuitting: boolean;
	private appMenuInstalled: boolean;

	private menuUpdater: RunOnceScheduler;

	private nativeTabMenuItems: Electron.MenuItem[];

	private menubarMenus: IMenubarData = {};

	private keybindings: { [commandId: string]: IMenubarKeybinding };

	constructor(
		@IUpdateService private updateService: IUpdateService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IHistoryMainService private historyMainService: IHistoryMainService,
		@IUriDisplayService private uriDisplayService: IUriDisplayService
	) {
		this.menuUpdater = new RunOnceScheduler(() => this.doUpdateMenu(), 0);

		this.keybindings = Object.create(null);

		this.install();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Keep flag when app quits
		app.on('will-quit', () => {
			this.isQuitting = true;
		});

		// // Listen to some events from window service to update menu
		this.historyMainService.onRecentlyOpenedChange(() => this.scheduleUpdateMenu());
		this.windowsMainService.onWindowsCountChanged(e => this.onWindowsCountChanged(e));
		// this.windowsMainService.onActiveWindowChanged(() => this.updateWorkspaceMenuItems());
		// this.windowsMainService.onWindowReady(() => this.updateWorkspaceMenuItems());
		// this.windowsMainService.onWindowClose(() => this.updateWorkspaceMenuItems());

		// Listen to extension viewlets
		// ipc.on('vscode:extensionViewlets', (event: any, rawExtensionViewlets: string) => {
		// 	let extensionViewlets: IExtensionViewlet[] = [];
		// 	try {
		// 		extensionViewlets = JSON.parse(rawExtensionViewlets);
		// 	} catch (error) {
		// 		// Should not happen
		// 	}

		// 	if (extensionViewlets.length) {
		// 		this.extensionViewlets = extensionViewlets;
		// 		this.updateMenu();
		// 	}
		// });

		// Update when auto save config changes
		// this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e));

		// Listen to update service
		// this.updateService.onStateChange(() => this.updateMenu());
	}

	private get currentEnableMenuBarMnemonics(): boolean {
		let enableMenuBarMnemonics = this.configurationService.getValue<boolean>('window.enableMenuBarMnemonics');
		if (typeof enableMenuBarMnemonics !== 'boolean') {
			enableMenuBarMnemonics = true;
		}

		return enableMenuBarMnemonics;
	}

	private get currentEnableNativeTabs(): boolean {
		let enableNativeTabs = this.configurationService.getValue<boolean>('window.nativeTabs');
		if (typeof enableNativeTabs !== 'boolean') {
			enableNativeTabs = false;
		}
		return enableNativeTabs;
	}

	updateMenu(menus: IMenubarData, windowId: number, additionalKeybindings?: Array<IMenubarKeybinding>) {
		this.menubarMenus = menus;
		if (additionalKeybindings) {
			additionalKeybindings.forEach(keybinding => {
				this.keybindings[keybinding.id] = keybinding;
			});
		}

		this.scheduleUpdateMenu();
	}


	private scheduleUpdateMenu(): void {
		this.menuUpdater.schedule(); // buffer multiple attempts to update the menu
	}

	private doUpdateMenu(): void {

		// Due to limitations in Electron, it is not possible to update menu items dynamically. The suggested
		// workaround from Electron is to set the application menu again.
		// See also https://github.com/electron/electron/issues/846
		//
		// Run delayed to prevent updating menu while it is open
		if (!this.isQuitting) {
			setTimeout(() => {
				if (!this.isQuitting) {
					this.install();
				}
			}, 10 /* delay this because there is an issue with updating a menu when it is open */);
		}
	}

	private onWindowsCountChanged(e: IWindowsCountChangedEvent): void {
		if (!isMacintosh) {
			return;
		}


		// Update menu if window count goes from N > 0 or 0 > N to update menu item enablement
		if ((e.oldCount === 0 && e.newCount > 0) || (e.oldCount > 0 && e.newCount === 0)) {
			this.scheduleUpdateMenu();
		}

		// Update specific items that are dependent on window count
		else if (this.currentEnableNativeTabs) {
			this.nativeTabMenuItems.forEach(item => {
				if (item) {
					item.enabled = e.newCount > 1;
				}
			});
		}
	}

	private install(): void {

		// Menus
		const menubar = new Menu();

		// Mac: Application
		let macApplicationMenuItem: Electron.MenuItem;
		if (isMacintosh) {
			const applicationMenu = new Menu();
			macApplicationMenuItem = new MenuItem({ label: product.nameShort, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
			menubar.append(macApplicationMenuItem);
		}

		// Mac: Dock
		if (isMacintosh && !this.appMenuInstalled) {
			this.appMenuInstalled = true;

			const dockMenu = new Menu();
			dockMenu.append(new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsMainService.openNewWindow(OpenContext.DOCK) }));

			app.dock.setMenu(dockMenu);
		}

		// File
		const fileMenu = new Menu();
		const fileMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File")), submenu: fileMenu });

		if (this.shouldDrawMenu('File')) {
			if (this.shouldFallback('File')) {
				this.setFallbackMenuById(fileMenu, 'File');
			} else {
				this.setMenuById(fileMenu, 'File');
			}

			menubar.append(fileMenuItem);
		}


		// Edit
		const editMenu = new Menu();
		const editMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")), submenu: editMenu });

		if (this.shouldDrawMenu('Edit')) {
			this.setMenuById(editMenu, 'Edit');
			menubar.append(editMenuItem);
		}

		// Selection
		const selectionMenu = new Menu();
		const selectionMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mSelection', comment: ['&& denotes a mnemonic'] }, "&&Selection")), submenu: selectionMenu });

		if (this.shouldDrawMenu('Selection')) {
			this.setMenuById(selectionMenu, 'Selection');
			menubar.append(selectionMenuItem);
		}

		// View
		const viewMenu = new Menu();
		const viewMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")), submenu: viewMenu });

		if (this.shouldDrawMenu('View')) {
			this.setMenuById(viewMenu, 'View');
			menubar.append(viewMenuItem);
		}

		// Layout
		const layoutMenu = new Menu();
		const layoutMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mLayout', comment: ['&& denotes a mnemonic'] }, "&&Layout")), submenu: layoutMenu });

		if (this.shouldDrawMenu('Layout')) {
			this.setMenuById(layoutMenu, 'Layout');
			menubar.append(layoutMenuItem);
		}

		// Go
		const gotoMenu = new Menu();
		const gotoMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")), submenu: gotoMenu });

		if (this.shouldDrawMenu('Go')) {
			this.setMenuById(gotoMenu, 'Go');
			menubar.append(gotoMenuItem);
		}

		// Terminal
		const terminalMenu = new Menu();
		const terminalMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mTerminal', comment: ['&& denotes a mnemonic'] }, "Ter&&minal")), submenu: terminalMenu });

		if (this.shouldDrawMenu('Terminal')) {
			this.setMenuById(terminalMenu, 'Terminal');
			menubar.append(terminalMenuItem);
		}

		// Debug
		const debugMenu = new Menu();
		const debugMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug")), submenu: debugMenu });

		if (this.shouldDrawMenu('Debug')) {
			this.setMenuById(debugMenu, 'Debug');
			menubar.append(debugMenuItem);
		}

		// Tasks
		const taskMenu = new Menu();
		const taskMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mTask', comment: ['&& denotes a mnemonic'] }, "&&Tasks")), submenu: taskMenu });

		if (this.shouldDrawMenu('Tasks')) {
			this.setMenuById(taskMenu, 'Tasks');
			menubar.append(taskMenuItem);
		}

		// Mac: Window
		let macWindowMenuItem: Electron.MenuItem;
		if (isMacintosh) {
			const windowMenu = new Menu();
			macWindowMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize('mWindow', "Window")), submenu: windowMenu, role: 'window' });
			this.setMacWindowMenu(windowMenu);
		}

		if (macWindowMenuItem) {
			menubar.append(macWindowMenuItem);
		}

		// Preferences
		if (!isMacintosh) {
			const preferencesMenu = new Menu();
			const preferencesMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences")), submenu: preferencesMenu });

			if (this.shouldDrawMenu('Preferences')) {
				if (this.shouldFallback('Preferences')) {
					this.setFallbackMenuById(preferencesMenu, 'Preferences');
				} else {
					this.setMenuById(preferencesMenu, 'Preferences');
				}
				menubar.append(preferencesMenuItem);
			}
		}

		// Help
		const helpMenu = new Menu();
		const helpMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")), submenu: helpMenu, role: 'help' });

		if (this.shouldDrawMenu('Help')) {
			if (this.shouldFallback('Help')) {
				this.setFallbackMenuById(helpMenu, 'Help');
			} else {
				this.setMenuById(helpMenu, 'Help');
			}
			menubar.append(helpMenuItem);
		}

		if (menubar.items && menubar.items.length > 0) {
			Menu.setApplicationMenu(menubar);
		} else {
			Menu.setApplicationMenu(null);
		}
	}

	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		const about = new MenuItem({ label: nls.localize('mAbout', "About {0}", product.nameLong), role: 'about' });
		const checkForUpdates = this.getUpdateMenuItems();

		let preferences;
		if (this.shouldDrawMenu('Preferences')) {
			const preferencesMenu = new Menu();
			this.setMenuById(preferencesMenu, 'Preferences');
			preferences = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences")), submenu: preferencesMenu });
		}

		const servicesMenu = new Menu();
		const services = new MenuItem({ label: nls.localize('mServices', "Services"), role: 'services', submenu: servicesMenu });
		const hide = new MenuItem({ label: nls.localize('mHide', "Hide {0}", product.nameLong), role: 'hide', accelerator: 'Command+H' });
		const hideOthers = new MenuItem({ label: nls.localize('mHideOthers', "Hide Others"), role: 'hideothers', accelerator: 'Command+Alt+H' });
		const showAll = new MenuItem({ label: nls.localize('mShowAll', "Show All"), role: 'unhide' });
		const quit = new MenuItem(this.likeAction('workbench.action.quit', {
			label: nls.localize('miQuit', "Quit {0}", product.nameLong), click: () => {
				if (this.windowsMainService.getWindowCount() === 0 || !!BrowserWindow.getFocusedWindow()) {
					this.windowsMainService.quit(); // fix for https://github.com/Microsoft/vscode/issues/39191
				}
			}
		}));

		const actions = [about];
		actions.push(...checkForUpdates);

		if (preferences) {
			actions.push(...[
				__separator__(),
				preferences
			]);
		}

		actions.push(...[
			__separator__(),
			services,
			__separator__(),
			hide,
			hideOthers,
			showAll,
			__separator__(),
			quit
		]);

		actions.forEach(i => macApplicationMenu.append(i));
	}

	private shouldDrawMenu(menuId: string): boolean {
		// We need to draw an empty menu to override the electron default
		if (!isMacintosh && this.configurationService.getValue('window.titleBarStyle') === 'custom') {
			return false;
		}

		switch (menuId) {
			case 'File':
			case 'Help':
				return isMacintosh || !!this.menubarMenus[menuId];
			default:
				return this.windowsMainService.getWindowCount() > 0 && !!this.menubarMenus[menuId];
		}
	}

	private shouldFallback(menuId: string): boolean {
		return this.shouldDrawMenu(menuId) && (this.windowsMainService.getWindowCount() === 0 && isMacintosh);
	}

	private setFallbackMenuById(menu: Electron.Menu, menuId: string): void {
		switch (menuId) {
			case 'File':
				const newFile = new MenuItem(this.likeAction('workbench.action.files.newUntitledFile', { label: this.mnemonicLabel(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")), click: () => this.windowsMainService.openNewWindow(OpenContext.MENU) }));

				const newWindow = new MenuItem(this.likeAction('workbench.action.newWindow', { label: this.mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsMainService.openNewWindow(OpenContext.MENU) }));

				const open = new MenuItem(this.likeAction('workbench.action.files.openFileFolder', { label: this.mnemonicLabel(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")), click: (menuItem, win, event) => this.windowsMainService.pickFileFolderAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));

				const openWorkspace = new MenuItem(this.likeAction('workbench.action.openWorkspace', { label: this.mnemonicLabel(nls.localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace...")), click: (menuItem, win, event) => this.windowsMainService.pickWorkspaceAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));

				const openRecentMenu = new Menu();
				this.setFallbackMenuById(openRecentMenu, 'Recent');
				const openRecent = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent")), submenu: openRecentMenu });

				menu.append(newFile);
				menu.append(newWindow);
				menu.append(__separator__());
				menu.append(open);
				menu.append(openWorkspace);
				menu.append(openRecent);

				break;

			case 'Recent':
				menu.append(this.createMenuItem(nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"), 'workbench.action.reopenClosedEditor'));

				this.insertRecentMenuItems(menu);

				menu.append(__separator__());
				menu.append(this.createMenuItem(nls.localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More..."), 'workbench.action.openRecent'));
				menu.append(__separator__());
				menu.append(new MenuItem(this.likeAction('workbench.action.clearRecentFiles', { label: this.mnemonicLabel(nls.localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened")), click: () => this.historyMainService.clearRecentlyOpened() })));

				break;

			case 'Help':
				let twitterItem: MenuItem;
				if (product.twitterUrl) {
					twitterItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")), click: () => this.openUrl(product.twitterUrl, 'openTwitterUrl') });
				}

				let featureRequestsItem: MenuItem;
				if (product.requestFeatureUrl) {
					featureRequestsItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")), click: () => this.openUrl(product.requestFeatureUrl, 'openUserVoiceUrl') });
				}

				let reportIssuesItem: MenuItem;
				if (product.reportIssueUrl) {
					const label = nls.localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue");

					reportIssuesItem = new MenuItem({ label: this.mnemonicLabel(label), click: () => this.openUrl(product.reportIssueUrl, 'openReportIssues') });
				}

				let licenseItem: MenuItem;
				if (product.privacyStatementUrl) {
					licenseItem = new MenuItem({
						label: this.mnemonicLabel(nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")), click: () => {
							if (language) {
								const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
								this.openUrl(`${product.licenseUrl}${queryArgChar}lang=${language}`, 'openLicenseUrl');
							} else {
								this.openUrl(product.licenseUrl, 'openLicenseUrl');
							}
						}
					});
				}

				let privacyStatementItem: MenuItem;
				if (product.privacyStatementUrl) {
					privacyStatementItem = new MenuItem({
						label: this.mnemonicLabel(nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "&&Privacy Statement")), click: () => {
							if (language) {
								const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
								this.openUrl(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`, 'openPrivacyStatement');
							} else {
								this.openUrl(product.privacyStatementUrl, 'openPrivacyStatement');
							}
						}
					});
				}

				const openProcessExplorer = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")), click: () => this.runActionInRenderer('workbench.action.openProcessExplorer') });

				if (twitterItem) { menu.append(twitterItem); }
				if (featureRequestsItem) { menu.append(featureRequestsItem); }
				if (reportIssuesItem) { menu.append(reportIssuesItem); }
				if (twitterItem || featureRequestsItem || reportIssuesItem) { menu.append(__separator__()); }
				if (licenseItem) { menu.append(licenseItem); }
				if (privacyStatementItem) { menu.append(privacyStatementItem); }
				if (licenseItem || privacyStatementItem) { menu.append(__separator__()); }
				menu.append(openProcessExplorer);

				break;
		}
	}

	private setMenu(menu: Electron.Menu, items: Array<MenubarMenuItem>) {
		items.forEach((item: MenubarMenuItem) => {
			if (isMenubarMenuItemSeparator(item)) {
				menu.append(__separator__());
			} else if (isMenubarMenuItemSubmenu(item)) {
				const submenu = new Menu();
				const submenuItem = new MenuItem({ label: this.mnemonicLabel(item.label), submenu: submenu });
				this.setMenu(submenu, item.submenu.items);
				menu.append(submenuItem);
			} else if (isMenubarMenuItemAction(item)) {
				if (item.id === 'workbench.action.openRecent') {
					this.insertRecentMenuItems(menu);
				}

				// Store the keybinding
				if (item.keybinding) {
					this.keybindings[item.id] = item.keybinding;
				} else if (this.keybindings[item.id]) {
					this.keybindings[item.id] = undefined;
				}

				const menuItem = this.createMenuItem(item.label, item.id, item.enabled, item.checked);
				menu.append(menuItem);
			}
		});
	}

	private setMenuById(menu: Electron.Menu, menuId: string): void {
		if (this.menubarMenus[menuId]) {
			this.setMenu(menu, this.menubarMenus[menuId].items);
		}
	}

	private insertRecentMenuItems(menu: Electron.Menu) {
		const { workspaces, files } = this.historyMainService.getRecentlyOpened();

		// Workspaces
		if (workspaces.length > 0) {
			for (let i = 0; i < Menubar.MAX_MENU_RECENT_ENTRIES && i < workspaces.length; i++) {
				menu.append(this.createOpenRecentMenuItem(workspaces[i], 'openRecentWorkspace', false));
			}

			menu.append(__separator__());
		}

		// Files
		if (files.length > 0) {
			for (let i = 0; i < Menubar.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
				menu.append(this.createOpenRecentMenuItem(files[i], 'openRecentFile', true));
			}

			menu.append(__separator__());
		}
	}

	private createOpenRecentMenuItem(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | string, commandId: string, isFile: boolean): Electron.MenuItem {
		let label: string;
		let uri: URI;
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			label = unmnemonicLabel(getWorkspaceLabel(workspace, this.environmentService, this.uriDisplayService, { verbose: true }));
			uri = workspace;
		} else if (isWorkspaceIdentifier(workspace)) {
			label = getWorkspaceLabel(workspace, this.environmentService, this.uriDisplayService, { verbose: true });
			uri = URI.file(workspace.configPath);
		} else {
			uri = URI.file(workspace);
			label = unmnemonicLabel(this.uriDisplayService.getLabel(uri));
		}

		return new MenuItem(this.likeAction(commandId, {
			label,
			click: (menuItem, win, event) => {
				const openInNewWindow = this.isOptionClick(event);
				const success = this.windowsMainService.open({
					context: OpenContext.MENU,
					cli: this.environmentService.args,
					urisToOpen: [uri],
					forceNewWindow: openInNewWindow,
					forceOpenWorkspaceAsFile: isFile
				}).length > 0;

				if (!success) {
					this.historyMainService.removeFromRecentlyOpened([workspace]);
				}
			}
		}, false));
	}

	private isOptionClick(event: Electron.Event): boolean {
		return event && ((!isMacintosh && (event.ctrlKey || event.shiftKey)) || (isMacintosh && (event.metaKey || event.altKey)));
	}

	private setMacWindowMenu(macWindowMenu: Electron.Menu): void {
		const minimize = new MenuItem({ label: nls.localize('mMinimize', "Minimize"), role: 'minimize', accelerator: 'Command+M', enabled: this.windowsMainService.getWindowCount() > 0 });
		const zoom = new MenuItem({ label: nls.localize('mZoom', "Zoom"), role: 'zoom', enabled: this.windowsMainService.getWindowCount() > 0 });
		const bringAllToFront = new MenuItem({ label: nls.localize('mBringToFront', "Bring All to Front"), role: 'front', enabled: this.windowsMainService.getWindowCount() > 0 });
		const switchWindow = this.createMenuItem(nls.localize({ key: 'miSwitchWindow', comment: ['&& denotes a mnemonic'] }, "Switch &&Window..."), 'workbench.action.switchWindow');

		this.nativeTabMenuItems = [];
		const nativeTabMenuItems: Electron.MenuItem[] = [];
		if (this.currentEnableNativeTabs) {
			const hasMultipleWindows = this.windowsMainService.getWindowCount() > 1;

			this.nativeTabMenuItems.push(this.createMenuItem(nls.localize('mShowPreviousTab', "Show Previous Tab"), 'workbench.action.showPreviousWindowTab', hasMultipleWindows));
			this.nativeTabMenuItems.push(this.createMenuItem(nls.localize('mShowNextTab', "Show Next Tab"), 'workbench.action.showNextWindowTab', hasMultipleWindows));
			this.nativeTabMenuItems.push(this.createMenuItem(nls.localize('mMoveTabToNewWindow', "Move Tab to New Window"), 'workbench.action.moveWindowTabToNewWindow', hasMultipleWindows));
			this.nativeTabMenuItems.push(this.createMenuItem(nls.localize('mMergeAllWindows', "Merge All Windows"), 'workbench.action.mergeAllWindowTabs', hasMultipleWindows));

			nativeTabMenuItems.push(__separator__(), ...this.nativeTabMenuItems);
		} else {
			this.nativeTabMenuItems = [];
		}

		[
			minimize,
			zoom,
			switchWindow,
			...nativeTabMenuItems,
			__separator__(),
			bringAllToFront
		].forEach(item => macWindowMenu.append(item));
	}

	private getUpdateMenuItems(): Electron.MenuItem[] {
		const state = this.updateService.state;

		switch (state.type) {
			case StateType.Uninitialized:
				return [];

			case StateType.Idle:
				return [new MenuItem({
					label: nls.localize('miCheckForUpdates', "Check for Updates..."), click: () => setTimeout(() => {
						this.reportMenuActionTelemetry('CheckForUpdate');

						const focusedWindow = this.windowsMainService.getFocusedWindow();
						const context = focusedWindow ? { windowId: focusedWindow.id } : null;
						this.updateService.checkForUpdates(context);
					}, 0)
				})];

			case StateType.CheckingForUpdates:
				return [new MenuItem({ label: nls.localize('miCheckingForUpdates', "Checking For Updates..."), enabled: false })];

			case StateType.AvailableForDownload:
				return [new MenuItem({
					label: nls.localize('miDownloadUpdate', "Download Available Update"), click: () => {
						this.updateService.downloadUpdate();
					}
				})];

			case StateType.Downloading:
				return [new MenuItem({ label: nls.localize('miDownloadingUpdate', "Downloading Update..."), enabled: false })];

			case StateType.Downloaded:
				return [new MenuItem({
					label: nls.localize('miInstallUpdate', "Install Update..."), click: () => {
						this.reportMenuActionTelemetry('InstallUpdate');
						this.updateService.applyUpdate();
					}
				})];

			case StateType.Updating:
				return [new MenuItem({ label: nls.localize('miInstallingUpdate', "Installing Update..."), enabled: false })];

			case StateType.Ready:
				return [new MenuItem({
					label: nls.localize('miRestartToUpdate', "Restart to Update..."), click: () => {
						this.reportMenuActionTelemetry('RestartToUpdate');
						this.updateService.quitAndInstall();
					}
				})];
		}
	}

	private createMenuItem(label: string, commandId: string | string[], enabled?: boolean, checked?: boolean): Electron.MenuItem;
	private createMenuItem(label: string, click: () => void, enabled?: boolean, checked?: boolean): Electron.MenuItem;
	private createMenuItem(arg1: string, arg2: any, arg3?: boolean, arg4?: boolean): Electron.MenuItem {
		const label = this.mnemonicLabel(arg1);
		const click: () => void = (typeof arg2 === 'function') ? arg2 : (menuItem: Electron.MenuItem, win: Electron.BrowserWindow, event: Electron.Event) => {
			let commandId = arg2;
			if (Array.isArray(arg2)) {
				commandId = this.isOptionClick(event) ? arg2[1] : arg2[0]; // support alternative action if we got multiple action Ids and the option key was pressed while invoking
			}

			this.runActionInRenderer(commandId);
		};
		const enabled = typeof arg3 === 'boolean' ? arg3 : this.windowsMainService.getWindowCount() > 0;
		const checked = typeof arg4 === 'boolean' ? arg4 : false;

		const options: Electron.MenuItemConstructorOptions = {
			label,
			click,
			enabled
		};

		if (checked) {
			options['type'] = 'checkbox';
			options['checked'] = checked;
		}

		let commandId: string;
		if (typeof arg2 === 'string') {
			commandId = arg2;
		} else if (Array.isArray(arg2)) {
			commandId = arg2[0];
		}

		// Add role for special case menu items
		if (isMacintosh) {
			if (commandId === 'editor.action.clipboardCutAction') {
				options['role'] = 'cut';
			} else if (commandId === 'editor.action.clipboardCopyAction') {
				options['role'] = 'copy';
			} else if (commandId === 'editor.action.clipboardPasteAction') {
				options['role'] = 'paste';
			}
		}

		return new MenuItem(this.withKeybinding(commandId, options));
	}

	private runActionInRenderer(id: string): void {
		// We make sure to not run actions when the window has no focus, this helps
		// for https://github.com/Microsoft/vscode/issues/25907 and specifically for
		// https://github.com/Microsoft/vscode/issues/11928
		const activeWindow = this.windowsMainService.getFocusedWindow();
		if (activeWindow) {
			this.windowsMainService.sendToFocused('vscode:runAction', { id, from: 'menu' } as IRunActionInWindowRequest);
		}
	}

	private withKeybinding(commandId: string, options: Electron.MenuItemConstructorOptions): Electron.MenuItemConstructorOptions {
		const binding = this.keybindings[commandId];

		// Apply binding if there is one
		if (binding && binding.label) {

			// if the binding is native, we can just apply it
			if (binding.isNative) {
				options.accelerator = binding.label;
			}

			// the keybinding is not native so we cannot show it as part of the accelerator of
			// the menu item. we fallback to a different strategy so that we always display it
			else {
				const bindingIndex = options.label.indexOf('[');
				if (bindingIndex >= 0) {
					options.label = `${options.label.substr(0, bindingIndex)} [${binding.label}]`;
				} else {
					options.label = `${options.label} [${binding.label}]`;
				}
			}
		}

		// Unset bindings if there is none
		else {
			options.accelerator = void 0;
		}

		return options;
	}

	private likeAction(commandId: string, options: Electron.MenuItemConstructorOptions, setAccelerator = !options.accelerator): Electron.MenuItemConstructorOptions {
		if (setAccelerator) {
			options = this.withKeybinding(commandId, options);
		}

		const originalClick = options.click;
		options.click = (item, window, event) => {
			this.reportMenuActionTelemetry(commandId);
			if (originalClick) {
				originalClick(item, window, event);
			}
		};

		return options;
	}

	private openUrl(url: string, id: string): void {
		shell.openExternal(url);
		this.reportMenuActionTelemetry(id);
	}

	private reportMenuActionTelemetry(id: string): void {
		/* __GDPR__
			"workbenchActionExecuted" : {
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('workbenchActionExecuted', { id, from: telemetryFrom });
	}

	private mnemonicLabel(label: string): string {
		return baseMnemonicLabel(label, !this.currentEnableMenuBarMnemonics);
	}
}

function __separator__(): Electron.MenuItem {
	return new MenuItem({ type: 'separator' });
}
