/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { isMacintosh, isLinux, isWindows, language } from 'vs/base/common/platform';
import * as arrays from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ipcMain as ipc, app, shell, Menu, MenuItem, BrowserWindow } from 'electron';
import { OpenContext, IRunActionInWindowRequest, IWindowsService } from 'vs/platform/windows/common/windows';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { AutoSaveConfiguration } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import product from 'vs/platform/node/product';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { mnemonicMenuLabel as baseMnemonicLabel, unmnemonicLabel, getPathLabel } from 'vs/base/common/labels';
import { KeybindingsResolver } from 'vs/code/electron-main/keyboard';
import { IWindowsMainService, IWindowsCountChangedEvent } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

interface IExtensionViewlet {
	id: string;
	label: string;
}

interface IMenuItemClickHandler {
	inDevTools: (contents: Electron.WebContents) => void;
	inNoWindow: () => void;
}

const telemetryFrom = 'menu';

export class CodeMenu {

	private static readonly MAX_MENU_RECENT_ENTRIES = 10;

	private keys = [
		'files.autoSave',
		'editor.multiCursorModifier',
		'workbench.sideBar.location',
		'workbench.statusBar.visible',
		'workbench.activityBar.visible',
		'window.enableMenuBarMnemonics',
		'window.nativeTabs'
	];

	private isQuitting: boolean;
	private appMenuInstalled: boolean;

	private menuUpdater: RunOnceScheduler;

	private keybindingsResolver: KeybindingsResolver;

	private extensionViewlets: IExtensionViewlet[];

	private closeFolder: Electron.MenuItem;
	private closeWorkspace: Electron.MenuItem;

	private nativeTabMenuItems: Electron.MenuItem[];

	constructor(
		@IUpdateService private updateService: IUpdateService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@IWindowsService private windowsService: IWindowsService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IHistoryMainService private historyMainService: IHistoryMainService
	) {
		this.extensionViewlets = [];
		this.nativeTabMenuItems = [];

		this.menuUpdater = new RunOnceScheduler(() => this.doUpdateMenu(), 0);
		this.keybindingsResolver = instantiationService.createInstance(KeybindingsResolver);

		this.install();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Keep flag when app quits
		app.on('will-quit', () => {
			this.isQuitting = true;
		});

		// Listen to some events from window service to update menu
		this.historyMainService.onRecentlyOpenedChange(() => this.updateMenu());
		this.windowsMainService.onWindowsCountChanged(e => this.onWindowsCountChanged(e));
		this.windowsMainService.onActiveWindowChanged(() => this.updateWorkspaceMenuItems());
		this.windowsMainService.onWindowReady(() => this.updateWorkspaceMenuItems());
		this.windowsMainService.onWindowClose(() => this.updateWorkspaceMenuItems());

		// Listen to extension viewlets
		ipc.on('vscode:extensionViewlets', (_event: any, rawExtensionViewlets: string) => {
			let extensionViewlets: IExtensionViewlet[] = [];
			try {
				extensionViewlets = JSON.parse(rawExtensionViewlets);
			} catch (error) {
				// Should not happen
			}

			if (extensionViewlets.length) {
				this.extensionViewlets = extensionViewlets;
				this.updateMenu();
			}
		});

		// Update when auto save config changes
		this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e));

		// Listen to update service
		this.updateService.onStateChange(() => this.updateMenu());

		// Listen to keybindings change
		this.keybindingsResolver.onKeybindingsChanged(() => this.updateMenu());
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (this.keys.some(key => event.affectsConfiguration(key))) {
			this.updateMenu();
		}
	}

	private get currentAutoSaveSetting(): string {
		return this.configurationService.getValue<string>('files.autoSave');
	}

	private get currentMultiCursorModifierSetting(): string {
		return this.configurationService.getValue<string>('editor.multiCursorModifier');
	}

	private get currentSidebarLocation(): string {
		return this.configurationService.getValue<string>('workbench.sideBar.location') || 'left';
	}

	private get currentStatusbarVisible(): boolean {
		let statusbarVisible = this.configurationService.getValue<boolean>('workbench.statusBar.visible');
		if (typeof statusbarVisible !== 'boolean') {
			statusbarVisible = true;
		}
		return statusbarVisible;
	}

	private get currentActivityBarVisible(): boolean {
		let activityBarVisible = this.configurationService.getValue<boolean>('workbench.activityBar.visible');
		if (typeof activityBarVisible !== 'boolean') {
			activityBarVisible = true;
		}
		return activityBarVisible;
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

	private updateMenu(): void {
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
			this.updateMenu();
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

	private updateWorkspaceMenuItems(): void {
		const window = this.windowsMainService.getLastActiveWindow();
		const isInWorkspaceContext = window && !!window.openedWorkspace;
		const isInFolderContext = window && !!window.openedFolderPath;

		this.closeWorkspace.visible = isInWorkspaceContext;
		this.closeFolder.visible = !isInWorkspaceContext;
		this.closeFolder.enabled = isInFolderContext || isLinux /* https://github.com/Microsoft/vscode/issues/36431 */;
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
		}

		// File
		const fileMenu = new Menu();
		const fileMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File")), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// Edit
		const editMenu = new Menu();
		const editMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")), submenu: editMenu });
		this.setEditMenu(editMenu);

		// Selection
		const selectionMenu = new Menu();
		const selectionMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mSelection', comment: ['&& denotes a mnemonic'] }, "&&Selection")), submenu: selectionMenu });
		this.setSelectionMenu(selectionMenu);

		// View
		const viewMenu = new Menu();
		const viewMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")), submenu: viewMenu });
		this.setViewMenu(viewMenu);

		// Goto
		const gotoMenu = new Menu();
		const gotoMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")), submenu: gotoMenu });
		this.setGotoMenu(gotoMenu);

		// Debug
		const debugMenu = new Menu();
		const debugMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug")), submenu: debugMenu });
		this.setDebugMenu(debugMenu);

		// Mac: Window
		let macWindowMenuItem: Electron.MenuItem;
		if (isMacintosh) {
			const windowMenu = new Menu();
			macWindowMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize('mWindow', "Window")), submenu: windowMenu, role: 'window' });
			this.setMacWindowMenu(windowMenu);
		}

		// Help
		const helpMenu = new Menu();
		const helpMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")), submenu: helpMenu, role: 'help' });
		this.setHelpMenu(helpMenu);

		// Tasks
		const taskMenu = new Menu();
		const taskMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'mTask', comment: ['&& denotes a mnemonic'] }, "&&Tasks")), submenu: taskMenu });
		this.setTaskMenu(taskMenu);

		// Menu Structure
		if (macApplicationMenuItem) {
			menubar.append(macApplicationMenuItem);
		}

		menubar.append(fileMenuItem);
		menubar.append(editMenuItem);
		menubar.append(selectionMenuItem);
		menubar.append(viewMenuItem);
		menubar.append(gotoMenuItem);
		menubar.append(debugMenuItem);
		menubar.append(taskMenuItem);

		if (macWindowMenuItem) {
			menubar.append(macWindowMenuItem);
		}

		menubar.append(helpMenuItem);

		Menu.setApplicationMenu(menubar);

		// Dock Menu
		if (isMacintosh && !this.appMenuInstalled) {
			this.appMenuInstalled = true;

			const dockMenu = new Menu();
			dockMenu.append(new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsMainService.openNewWindow(OpenContext.DOCK) }));

			app.dock.setMenu(dockMenu);
		}
	}

	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		const about = new MenuItem({ label: nls.localize('mAbout', "About {0}", product.nameLong), role: 'about' });
		const checkForUpdates = this.getUpdateMenuItems();
		const preferences = this.getPreferencesMenu();
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
		actions.push(...[
			__separator__(),
			preferences,
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

	private setFileMenu(fileMenu: Electron.Menu): void {
		const hasNoWindows = (this.windowsMainService.getWindowCount() === 0);

		let newFile: Electron.MenuItem;
		if (hasNoWindows) {
			newFile = new MenuItem(this.likeAction('workbench.action.files.newUntitledFile', { label: this.mnemonicLabel(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")), click: () => this.windowsMainService.openNewWindow(OpenContext.MENU) }));
		} else {
			newFile = this.createMenuItem(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File"), 'workbench.action.files.newUntitledFile');
		}

		let open: Electron.MenuItem;
		if (hasNoWindows) {
			open = new MenuItem(this.likeAction('workbench.action.files.openFileFolder', { label: this.mnemonicLabel(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")), click: (menuItem, win, event) => this.windowsMainService.pickFileFolderAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));
		} else {
			open = this.createMenuItem(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open..."), ['workbench.action.files.openFileFolder', 'workbench.action.files.openFileFolderInNewWindow']);
		}

		let openWorkspace: Electron.MenuItem;
		if (hasNoWindows) {
			openWorkspace = new MenuItem(this.likeAction('workbench.action.openWorkspace', { label: this.mnemonicLabel(nls.localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace...")), click: (menuItem, win, event) => this.windowsMainService.pickWorkspaceAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));
		} else {
			openWorkspace = this.createMenuItem(nls.localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace..."), ['workbench.action.openWorkspace', 'workbench.action.openWorkspaceInNewWindow']);
		}

		let openFolder: Electron.MenuItem;
		if (hasNoWindows) {
			openFolder = new MenuItem(this.likeAction('workbench.action.files.openFolder', { label: this.mnemonicLabel(nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")), click: (menuItem, win, event) => this.windowsMainService.pickFolderAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));
		} else {
			openFolder = this.createMenuItem(nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder..."), ['workbench.action.files.openFolder', 'workbench.action.files.openFolderInNewWindow']);
		}

		let openFile: Electron.MenuItem;
		if (hasNoWindows) {
			openFile = new MenuItem(this.likeAction('workbench.action.files.openFile', { label: this.mnemonicLabel(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")), click: (menuItem, win, event) => this.windowsMainService.pickFileAndOpen({ forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } }) }));
		} else {
			openFile = this.createMenuItem(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File..."), ['workbench.action.files.openFile', 'workbench.action.files.openFileInNewWindow']);
		}

		const openRecentMenu = new Menu();
		this.setOpenRecentMenu(openRecentMenu);
		const openRecent = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent")), submenu: openRecentMenu, enabled: openRecentMenu.items.length > 0 });

		const saveWorkspaceAs = this.createMenuItem(nls.localize('miSaveWorkspaceAs', "Save Workspace As..."), 'workbench.action.saveWorkspaceAs');
		const addFolder = this.createMenuItem(nls.localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace..."), 'workbench.action.addRootFolder');

		const saveFile = this.createMenuItem(nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"), 'workbench.action.files.save');
		const saveFileAs = this.createMenuItem(nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."), 'workbench.action.files.saveAs');
		const saveAllFiles = this.createMenuItem(nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll"), 'workbench.action.files.saveAll');

		const autoSaveEnabled = [AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some(s => this.currentAutoSaveSetting === s);
		const autoSave = new MenuItem(this.likeAction('vscode.toggleAutoSave', { label: this.mnemonicLabel(nls.localize('miAutoSave', "Auto Save")), type: 'checkbox', checked: autoSaveEnabled, enabled: this.windowsMainService.getWindowCount() > 0, click: () => this.windowsMainService.sendToFocused('vscode.toggleAutoSave') }, false));

		const preferences = this.getPreferencesMenu();

		const newWindow = new MenuItem(this.likeAction('workbench.action.newWindow', { label: this.mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsMainService.openNewWindow(OpenContext.MENU) }));
		const revertFile = this.createMenuItem(nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Re&&vert File"), 'workbench.action.files.revert');
		const closeWindow = new MenuItem(this.likeAction('workbench.action.closeWindow', { label: this.mnemonicLabel(nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window")), click: () => this.windowsMainService.getLastActiveWindow().win.close(), enabled: this.windowsMainService.getWindowCount() > 0 }));

		this.closeWorkspace = this.createMenuItem(nls.localize({ key: 'miCloseWorkspace', comment: ['&& denotes a mnemonic'] }, "Close &&Workspace"), 'workbench.action.closeFolder');
		this.closeFolder = this.createMenuItem(nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"), 'workbench.action.closeFolder');

		const closeEditor = this.createMenuItem(nls.localize({ key: 'miCloseEditor', comment: ['&& denotes a mnemonic'] }, "&&Close Editor"), 'workbench.action.closeActiveEditor');

		const exit = new MenuItem(this.likeAction('workbench.action.quit', { label: this.mnemonicLabel(nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")), click: () => this.windowsMainService.quit() }));

		this.updateWorkspaceMenuItems();

		arrays.coalesce([
			newFile,
			newWindow,
			__separator__(),
			isMacintosh ? open : null,
			!isMacintosh ? openFile : null,
			!isMacintosh ? openFolder : null,
			openWorkspace,
			openRecent,
			__separator__(),
			addFolder,
			saveWorkspaceAs,
			__separator__(),
			saveFile,
			saveFileAs,
			saveAllFiles,
			__separator__(),
			autoSave,
			__separator__(),
			!isMacintosh ? preferences : null,
			!isMacintosh ? __separator__() : null,
			revertFile,
			closeEditor,
			this.closeWorkspace,
			this.closeFolder,
			closeWindow,
			!isMacintosh ? __separator__() : null,
			!isMacintosh ? exit : null
		]).forEach(item => fileMenu.append(item));
	}

	private getPreferencesMenu(): Electron.MenuItem {
		const settings = this.createMenuItem(nls.localize({ key: 'miOpenSettings', comment: ['&& denotes a mnemonic'] }, "&&Settings"), 'workbench.action.openGlobalSettings');
		const kebindingSettings = this.createMenuItem(nls.localize({ key: 'miOpenKeymap', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts"), 'workbench.action.openGlobalKeybindings');
		const keymapExtensions = this.createMenuItem(nls.localize({ key: 'miOpenKeymapExtensions', comment: ['&& denotes a mnemonic'] }, "&&Keymap Extensions"), 'workbench.extensions.action.showRecommendedKeymapExtensions');
		const snippetsSettings = this.createMenuItem(nls.localize({ key: 'miOpenSnippets', comment: ['&& denotes a mnemonic'] }, "User &&Snippets"), 'workbench.action.openSnippets');
		const colorThemeSelection = this.createMenuItem(nls.localize({ key: 'miSelectColorTheme', comment: ['&& denotes a mnemonic'] }, "&&Color Theme"), 'workbench.action.selectTheme');
		const iconThemeSelection = this.createMenuItem(nls.localize({ key: 'miSelectIconTheme', comment: ['&& denotes a mnemonic'] }, "File &&Icon Theme"), 'workbench.action.selectIconTheme');

		const preferencesMenu = new Menu();
		preferencesMenu.append(settings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(kebindingSettings);
		preferencesMenu.append(keymapExtensions);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(snippetsSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(colorThemeSelection);
		preferencesMenu.append(iconThemeSelection);

		return new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences")), submenu: preferencesMenu });
	}

	private setOpenRecentMenu(openRecentMenu: Electron.Menu): void {
		openRecentMenu.append(this.createMenuItem(nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"), 'workbench.action.reopenClosedEditor'));

		const { workspaces, files } = this.historyMainService.getRecentlyOpened();

		// Workspaces
		if (workspaces.length > 0) {
			openRecentMenu.append(__separator__());

			for (let i = 0; i < CodeMenu.MAX_MENU_RECENT_ENTRIES && i < workspaces.length; i++) {
				openRecentMenu.append(this.createOpenRecentMenuItem(workspaces[i], 'openRecentWorkspace', false));
			}
		}

		// Files
		if (files.length > 0) {
			openRecentMenu.append(__separator__());

			for (let i = 0; i < CodeMenu.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
				openRecentMenu.append(this.createOpenRecentMenuItem(files[i], 'openRecentFile', true));
			}
		}

		if (workspaces.length || files.length) {
			openRecentMenu.append(__separator__());
			openRecentMenu.append(this.createMenuItem(nls.localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More..."), 'workbench.action.openRecent'));
			openRecentMenu.append(__separator__());
			openRecentMenu.append(new MenuItem(this.likeAction('workbench.action.clearRecentFiles', { label: this.mnemonicLabel(nls.localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened")), click: () => this.historyMainService.clearRecentlyOpened() })));
		}
	}

	private createOpenRecentMenuItem(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | string, commandId: string, isFile: boolean): Electron.MenuItem {
		let label: string;
		let path: string;
		if (isSingleFolderWorkspaceIdentifier(workspace) || typeof workspace === 'string') {
			label = unmnemonicLabel(getPathLabel(workspace, null, this.environmentService));
			path = workspace;
		} else {
			label = getWorkspaceLabel(workspace, this.environmentService, { verbose: true });
			path = workspace.configPath;
		}

		return new MenuItem(this.likeAction(commandId, {
			label,
			click: (menuItem, win, event) => {
				const openInNewWindow = this.isOptionClick(event);
				const success = this.windowsMainService.open({
					context: OpenContext.MENU,
					cli: this.environmentService.args,
					pathsToOpen: [path], forceNewWindow: openInNewWindow,
					forceOpenWorkspaceAsFile: isFile
				}).length > 0;

				if (!success) {
					this.historyMainService.removeFromRecentlyOpened([isSingleFolderWorkspaceIdentifier(workspace) ? workspace : workspace.configPath]);
				}
			}
		}, false));
	}

	private isOptionClick(event: Electron.Event): boolean {
		return event && ((!isMacintosh && (event.ctrlKey || event.shiftKey)) || (isMacintosh && (event.metaKey || event.altKey)));
	}

	private createRoleMenuItem(label: string, commandId: string, role: Electron.MenuItemRole): Electron.MenuItem {
		const options: Electron.MenuItemConstructorOptions = {
			label: this.mnemonicLabel(label),
			role,
			enabled: true
		};

		return new MenuItem(this.withKeybinding(commandId, options));
	}

	private setEditMenu(winLinuxEditMenu: Electron.Menu): void {
		let undo: Electron.MenuItem;
		let redo: Electron.MenuItem;
		let cut: Electron.MenuItem;
		let copy: Electron.MenuItem;
		let paste: Electron.MenuItem;

		if (isMacintosh) {
			undo = this.createContextAwareMenuItem(nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"), 'undo', {
				inDevTools: devTools => devTools.undo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('undo:')
			});
			redo = this.createContextAwareMenuItem(nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"), 'redo', {
				inDevTools: devTools => devTools.redo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('redo:')
			});
			cut = this.createRoleMenuItem(nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t"), 'editor.action.clipboardCutAction', 'cut');
			copy = this.createRoleMenuItem(nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy"), 'editor.action.clipboardCopyAction', 'copy');
			paste = this.createRoleMenuItem(nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"), 'editor.action.clipboardPasteAction', 'paste');
		} else {
			undo = this.createMenuItem(nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"), 'undo');
			redo = this.createMenuItem(nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"), 'redo');
			cut = this.createMenuItem(nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t"), 'editor.action.clipboardCutAction');
			copy = this.createMenuItem(nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy"), 'editor.action.clipboardCopyAction');
			paste = this.createMenuItem(nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"), 'editor.action.clipboardPasteAction');
		}

		const find = this.createMenuItem(nls.localize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find"), 'actions.find');
		const replace = this.createMenuItem(nls.localize({ key: 'miReplace', comment: ['&& denotes a mnemonic'] }, "&&Replace"), 'editor.action.startFindReplaceAction');
		const findInFiles = this.createMenuItem(nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files"), 'workbench.action.findInFiles');
		const replaceInFiles = this.createMenuItem(nls.localize({ key: 'miReplaceInFiles', comment: ['&& denotes a mnemonic'] }, "Replace &&in Files"), 'workbench.action.replaceInFiles');

		const emmetExpandAbbreviation = this.createMenuItem(nls.localize({ key: 'miEmmetExpandAbbreviation', comment: ['&& denotes a mnemonic'] }, "Emmet: E&&xpand Abbreviation"), 'editor.emmet.action.expandAbbreviation');
		const showEmmetCommands = this.createMenuItem(nls.localize({ key: 'miShowEmmetCommands', comment: ['&& denotes a mnemonic'] }, "E&&mmet..."), 'workbench.action.showEmmetCommands');
		const toggleLineComment = this.createMenuItem(nls.localize({ key: 'miToggleLineComment', comment: ['&& denotes a mnemonic'] }, "&&Toggle Line Comment"), 'editor.action.commentLine');
		const toggleBlockComment = this.createMenuItem(nls.localize({ key: 'miToggleBlockComment', comment: ['&& denotes a mnemonic'] }, "Toggle &&Block Comment"), 'editor.action.blockComment');

		[
			undo,
			redo,
			__separator__(),
			cut,
			copy,
			paste,
			__separator__(),
			find,
			replace,
			__separator__(),
			findInFiles,
			replaceInFiles,
			__separator__(),
			toggleLineComment,
			toggleBlockComment,
			emmetExpandAbbreviation,
			showEmmetCommands
		].forEach(item => winLinuxEditMenu.append(item));
	}

	private setSelectionMenu(winLinuxEditMenu: Electron.Menu): void {
		let multiCursorModifierLabel: string;
		if (this.currentMultiCursorModifierSetting === 'ctrlCmd') {
			multiCursorModifierLabel = nls.localize('miMultiCursorAlt', "Switch to Alt+Click for Multi-Cursor"); // The default has been overwritten
		} else {
			multiCursorModifierLabel = (
				isMacintosh
					? nls.localize('miMultiCursorCmd', "Switch to Cmd+Click for Multi-Cursor")
					: nls.localize('miMultiCursorCtrl', "Switch to Ctrl+Click for Multi-Cursor")
			);
		}

		const multicursorModifier = this.createMenuItem(multiCursorModifierLabel, 'workbench.action.toggleMultiCursorModifier');
		const insertCursorAbove = this.createMenuItem(nls.localize({ key: 'miInsertCursorAbove', comment: ['&& denotes a mnemonic'] }, "&&Add Cursor Above"), 'editor.action.insertCursorAbove');
		const insertCursorBelow = this.createMenuItem(nls.localize({ key: 'miInsertCursorBelow', comment: ['&& denotes a mnemonic'] }, "A&&dd Cursor Below"), 'editor.action.insertCursorBelow');
		const insertCursorAtEndOfEachLineSelected = this.createMenuItem(nls.localize({ key: 'miInsertCursorAtEndOfEachLineSelected', comment: ['&& denotes a mnemonic'] }, "Add C&&ursors to Line Ends"), 'editor.action.insertCursorAtEndOfEachLineSelected');
		const addSelectionToNextFindMatch = this.createMenuItem(nls.localize({ key: 'miAddSelectionToNextFindMatch', comment: ['&& denotes a mnemonic'] }, "Add &&Next Occurrence"), 'editor.action.addSelectionToNextFindMatch');
		const addSelectionToPreviousFindMatch = this.createMenuItem(nls.localize({ key: 'miAddSelectionToPreviousFindMatch', comment: ['&& denotes a mnemonic'] }, "Add P&&revious Occurrence"), 'editor.action.addSelectionToPreviousFindMatch');
		const selectHighlights = this.createMenuItem(nls.localize({ key: 'miSelectHighlights', comment: ['&& denotes a mnemonic'] }, "Select All &&Occurrences"), 'editor.action.selectHighlights');

		const copyLinesUp = this.createMenuItem(nls.localize({ key: 'miCopyLinesUp', comment: ['&& denotes a mnemonic'] }, "&&Copy Line Up"), 'editor.action.copyLinesUpAction');
		const copyLinesDown = this.createMenuItem(nls.localize({ key: 'miCopyLinesDown', comment: ['&& denotes a mnemonic'] }, "Co&&py Line Down"), 'editor.action.copyLinesDownAction');
		const moveLinesUp = this.createMenuItem(nls.localize({ key: 'miMoveLinesUp', comment: ['&& denotes a mnemonic'] }, "Mo&&ve Line Up"), 'editor.action.moveLinesUpAction');
		const moveLinesDown = this.createMenuItem(nls.localize({ key: 'miMoveLinesDown', comment: ['&& denotes a mnemonic'] }, "Move &&Line Down"), 'editor.action.moveLinesDownAction');

		let selectAll: Electron.MenuItem;
		if (isMacintosh) {
			selectAll = this.createContextAwareMenuItem(nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"), 'editor.action.selectAll', {
				inDevTools: devTools => devTools.selectAll(),
				inNoWindow: () => Menu.sendActionToFirstResponder('selectAll:')
			});
		} else {
			selectAll = this.createMenuItem(nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"), 'editor.action.selectAll');
		}
		const smartSelectGrow = this.createMenuItem(nls.localize({ key: 'miSmartSelectGrow', comment: ['&& denotes a mnemonic'] }, "&&Expand Selection"), 'editor.action.smartSelect.grow');
		const smartSelectshrink = this.createMenuItem(nls.localize({ key: 'miSmartSelectShrink', comment: ['&& denotes a mnemonic'] }, "&&Shrink Selection"), 'editor.action.smartSelect.shrink');

		[
			selectAll,
			smartSelectGrow,
			smartSelectshrink,
			__separator__(),
			copyLinesUp,
			copyLinesDown,
			moveLinesUp,
			moveLinesDown,
			__separator__(),
			multicursorModifier,
			insertCursorAbove,
			insertCursorBelow,
			insertCursorAtEndOfEachLineSelected,
			addSelectionToNextFindMatch,
			addSelectionToPreviousFindMatch,
			selectHighlights,
		].forEach(item => winLinuxEditMenu.append(item));
	}

	private setViewMenu(viewMenu: Electron.Menu): void {
		const explorer = this.createMenuItem(nls.localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer"), 'workbench.view.explorer');
		const search = this.createMenuItem(nls.localize({ key: 'miViewSearch', comment: ['&& denotes a mnemonic'] }, "&&Search"), 'workbench.view.search');
		const scm = this.createMenuItem(nls.localize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "S&&CM"), 'workbench.view.scm');
		const debug = this.createMenuItem(nls.localize({ key: 'miViewDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug"), 'workbench.view.debug');
		const extensions = this.createMenuItem(nls.localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions"), 'workbench.view.extensions');
		const output = this.createMenuItem(nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output"), 'workbench.action.output.toggleOutput');
		const debugConsole = this.createMenuItem(nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console"), 'workbench.debug.action.toggleRepl');
		const integratedTerminal = this.createMenuItem(nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Integrated Terminal"), 'workbench.action.terminal.toggleTerminal');
		const problems = this.createMenuItem(nls.localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems"), 'workbench.actions.view.problems');

		let additionalViewlets: Electron.MenuItem;
		if (this.extensionViewlets.length) {
			const additionalViewletsMenu = new Menu();

			this.extensionViewlets.forEach(viewlet => {
				additionalViewletsMenu.append(this.createMenuItem(viewlet.label, viewlet.id));
			});

			additionalViewlets = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miAdditionalViews', comment: ['&& denotes a mnemonic'] }, "Additional &&Views")), submenu: additionalViewletsMenu, enabled: true });
		}

		const commands = this.createMenuItem(nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette..."), 'workbench.action.showCommands');
		const openView = this.createMenuItem(nls.localize({ key: 'miOpenView', comment: ['&& denotes a mnemonic'] }, "&&Open View..."), 'workbench.action.openView');

		const fullscreen = new MenuItem(this.withKeybinding('workbench.action.toggleFullScreen', { label: this.mnemonicLabel(nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")), click: () => this.windowsMainService.getLastActiveWindow().toggleFullScreen(), enabled: this.windowsMainService.getWindowCount() > 0 }));
		const toggleZenMode = this.createMenuItem(nls.localize('miToggleZenMode', "Toggle Zen Mode"), 'workbench.action.toggleZenMode');
		const toggleCenteredLayout = this.createMenuItem(nls.localize('miToggleCenteredLayout', "Toggle Centered Layout"), 'workbench.action.toggleCenteredLayout');
		const toggleMenuBar = this.createMenuItem(nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar"), 'workbench.action.toggleMenuBar');
		const splitEditor = this.createMenuItem(nls.localize({ key: 'miSplitEditor', comment: ['&& denotes a mnemonic'] }, "Split &&Editor"), 'workbench.action.splitEditor');
		const toggleEditorLayout = this.createMenuItem(nls.localize({ key: 'miToggleEditorLayout', comment: ['&& denotes a mnemonic'] }, "Toggle Editor Group &&Layout"), 'workbench.action.toggleEditorGroupLayout');
		const toggleSidebar = this.createMenuItem(nls.localize({ key: 'miToggleSidebar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Side Bar"), 'workbench.action.toggleSidebarVisibility');

		let moveSideBarLabel: string;
		if (this.currentSidebarLocation !== 'right') {
			moveSideBarLabel = nls.localize({ key: 'miMoveSidebarRight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Right");
		} else {
			moveSideBarLabel = nls.localize({ key: 'miMoveSidebarLeft', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Left");
		}

		const moveSidebar = this.createMenuItem(moveSideBarLabel, 'workbench.action.toggleSidebarPosition');

		const togglePanel = this.createMenuItem(nls.localize({ key: 'miTogglePanel', comment: ['&& denotes a mnemonic'] }, "Toggle &&Panel"), 'workbench.action.togglePanel');

		let statusBarLabel: string;
		if (this.currentStatusbarVisible) {
			statusBarLabel = nls.localize({ key: 'miHideStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Hide Status Bar");
		} else {
			statusBarLabel = nls.localize({ key: 'miShowStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Show Status Bar");
		}
		const toggleStatusbar = this.createMenuItem(statusBarLabel, 'workbench.action.toggleStatusbarVisibility');

		let activityBarLabel: string;
		if (this.currentActivityBarVisible) {
			activityBarLabel = nls.localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "Hide &&Activity Bar");
		} else {
			activityBarLabel = nls.localize({ key: 'miShowActivityBar', comment: ['&& denotes a mnemonic'] }, "Show &&Activity Bar");
		}
		const toggleActivtyBar = this.createMenuItem(activityBarLabel, 'workbench.action.toggleActivityBarVisibility');

		const toggleWordWrap = this.createMenuItem(nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Word Wrap"), 'editor.action.toggleWordWrap');
		const toggleMinimap = this.createMenuItem(nls.localize({ key: 'miToggleMinimap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Minimap"), 'editor.action.toggleMinimap');
		const toggleRenderWhitespace = this.createMenuItem(nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace"), 'editor.action.toggleRenderWhitespace');
		const toggleRenderControlCharacters = this.createMenuItem(nls.localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Toggle &&Control Characters"), 'editor.action.toggleRenderControlCharacter');

		const zoomIn = this.createMenuItem(nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"), 'workbench.action.zoomIn');
		const zoomOut = this.createMenuItem(nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "Zoom O&&ut"), 'workbench.action.zoomOut');
		const resetZoom = this.createMenuItem(nls.localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom"), 'workbench.action.zoomReset');

		arrays.coalesce([
			commands,
			openView,
			__separator__(),
			explorer,
			search,
			scm,
			debug,
			extensions,
			additionalViewlets,
			__separator__(),
			output,
			problems,
			debugConsole,
			integratedTerminal,
			__separator__(),
			fullscreen,
			toggleZenMode,
			toggleCenteredLayout,
			isWindows || isLinux ? toggleMenuBar : void 0,
			__separator__(),
			splitEditor,
			toggleEditorLayout,
			moveSidebar,
			toggleSidebar,
			togglePanel,
			toggleStatusbar,
			toggleActivtyBar,
			__separator__(),
			toggleWordWrap,
			toggleMinimap,
			toggleRenderWhitespace,
			toggleRenderControlCharacters,
			__separator__(),
			zoomIn,
			zoomOut,
			resetZoom
		]).forEach(item => viewMenu.append(item));
	}

	private setGotoMenu(gotoMenu: Electron.Menu): void {
		const back = this.createMenuItem(nls.localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back"), 'workbench.action.navigateBack');
		const forward = this.createMenuItem(nls.localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward"), 'workbench.action.navigateForward');

		const switchEditorMenu = new Menu();

		const nextEditor = this.createMenuItem(nls.localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor"), 'workbench.action.nextEditor');
		const previousEditor = this.createMenuItem(nls.localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor"), 'workbench.action.previousEditor');
		const nextEditorInGroup = this.createMenuItem(nls.localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group"), 'workbench.action.openNextRecentlyUsedEditorInGroup');
		const previousEditorInGroup = this.createMenuItem(nls.localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group"), 'workbench.action.openPreviousRecentlyUsedEditorInGroup');

		[
			nextEditor,
			previousEditor,
			__separator__(),
			nextEditorInGroup,
			previousEditorInGroup
		].forEach(item => switchEditorMenu.append(item));

		const switchEditor = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor")), submenu: switchEditorMenu, enabled: true });

		const switchGroupMenu = new Menu();

		const focusFirstGroup = this.createMenuItem(nls.localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "&&First Group"), 'workbench.action.focusFirstEditorGroup');
		const focusSecondGroup = this.createMenuItem(nls.localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "&&Second Group"), 'workbench.action.focusSecondEditorGroup');
		const focusThirdGroup = this.createMenuItem(nls.localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "&&Third Group"), 'workbench.action.focusThirdEditorGroup');
		const nextGroup = this.createMenuItem(nls.localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group"), 'workbench.action.focusNextGroup');
		const previousGroup = this.createMenuItem(nls.localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group"), 'workbench.action.focusPreviousGroup');

		[
			focusFirstGroup,
			focusSecondGroup,
			focusThirdGroup,
			__separator__(),
			nextGroup,
			previousGroup
		].forEach(item => switchGroupMenu.append(item));

		const switchGroup = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group")), submenu: switchGroupMenu, enabled: true });

		const gotoFile = this.createMenuItem(nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File..."), 'workbench.action.quickOpen');
		const gotoSymbolInFile = this.createMenuItem(nls.localize({ key: 'miGotoSymbolInFile', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol in File..."), 'workbench.action.gotoSymbol');
		const gotoSymbolInWorkspace = this.createMenuItem(nls.localize({ key: 'miGotoSymbolInWorkspace', comment: ['&& denotes a mnemonic'] }, "Go to Symbol in &&Workspace..."), 'workbench.action.showAllSymbols');
		const gotoDefinition = this.createMenuItem(nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"), 'editor.action.goToDeclaration');
		const gotoTypeDefinition = this.createMenuItem(nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definition"), 'editor.action.goToTypeDefinition');
		const goToImplementation = this.createMenuItem(nls.localize({ key: 'miGotoImplementation', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementation"), 'editor.action.goToImplementation');
		const gotoLine = this.createMenuItem(nls.localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line..."), 'workbench.action.gotoLine');

		[
			back,
			forward,
			__separator__(),
			switchEditor,
			switchGroup,
			__separator__(),
			gotoFile,
			gotoSymbolInFile,
			gotoSymbolInWorkspace,
			gotoDefinition,
			gotoTypeDefinition,
			goToImplementation,
			gotoLine
		].forEach(item => gotoMenu.append(item));
	}

	private setDebugMenu(debugMenu: Electron.Menu): void {
		const start = this.createMenuItem(nls.localize({ key: 'miStartDebugging', comment: ['&& denotes a mnemonic'] }, "&&Start Debugging"), 'workbench.action.debug.start');
		const startWithoutDebugging = this.createMenuItem(nls.localize({ key: 'miStartWithoutDebugging', comment: ['&& denotes a mnemonic'] }, "Start &&Without Debugging"), 'workbench.action.debug.run');
		const stop = this.createMenuItem(nls.localize({ key: 'miStopDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging"), 'workbench.action.debug.stop');
		const restart = this.createMenuItem(nls.localize({ key: 'miRestart Debugging', comment: ['&& denotes a mnemonic'] }, "&&Restart Debugging"), 'workbench.action.debug.restart');

		const openConfigurations = this.createMenuItem(nls.localize({ key: 'miOpenConfigurations', comment: ['&& denotes a mnemonic'] }, "Open &&Configurations"), 'workbench.action.debug.configure');
		const addConfiguration = this.createMenuItem(nls.localize({ key: 'miAddConfiguration', comment: ['&& denotes a mnemonic'] }, "Add Configuration..."), 'debug.addConfiguration');

		const stepOver = this.createMenuItem(nls.localize({ key: 'miStepOver', comment: ['&& denotes a mnemonic'] }, "Step &&Over"), 'workbench.action.debug.stepOver');
		const stepInto = this.createMenuItem(nls.localize({ key: 'miStepInto', comment: ['&& denotes a mnemonic'] }, "Step &&Into"), 'workbench.action.debug.stepInto');
		const stepOut = this.createMenuItem(nls.localize({ key: 'miStepOut', comment: ['&& denotes a mnemonic'] }, "Step O&&ut"), 'workbench.action.debug.stepOut');
		const continueAction = this.createMenuItem(nls.localize({ key: 'miContinue', comment: ['&& denotes a mnemonic'] }, "&&Continue"), 'workbench.action.debug.continue');

		const toggleBreakpoint = this.createMenuItem(nls.localize({ key: 'miToggleBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Breakpoint"), 'editor.debug.action.toggleBreakpoint');
		const breakpointsMenu = new Menu();
		breakpointsMenu.append(this.createMenuItem(nls.localize({ key: 'miConditionalBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Conditional Breakpoint..."), 'editor.debug.action.conditionalBreakpoint'));
		breakpointsMenu.append(this.createMenuItem(nls.localize({ key: 'miColumnBreakpoint', comment: ['&& denotes a mnemonic'] }, "C&&olumn Breakpoint"), 'editor.debug.action.toggleColumnBreakpoint'));
		breakpointsMenu.append(this.createMenuItem(nls.localize({ key: 'miFunctionBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Function Breakpoint..."), 'workbench.debug.viewlet.action.addFunctionBreakpointAction'));
		const newBreakpoints = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miNewBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&New Breakpoint")), submenu: breakpointsMenu });
		const enableAllBreakpoints = this.createMenuItem(nls.localize({ key: 'miEnableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Enable All Breakpoints"), 'workbench.debug.viewlet.action.enableAllBreakpoints');
		const disableAllBreakpoints = this.createMenuItem(nls.localize({ key: 'miDisableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Disable A&&ll Breakpoints"), 'workbench.debug.viewlet.action.disableAllBreakpoints');
		const removeAllBreakpoints = this.createMenuItem(nls.localize({ key: 'miRemoveAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Remove &&All Breakpoints"), 'workbench.debug.viewlet.action.removeAllBreakpoints');

		const installAdditionalDebuggers = this.createMenuItem(nls.localize({ key: 'miInstallAdditionalDebuggers', comment: ['&& denotes a mnemonic'] }, "&&Install Additional Debuggers..."), 'debug.installAdditionalDebuggers');
		[
			start,
			startWithoutDebugging,
			stop,
			restart,
			__separator__(),
			openConfigurations,
			addConfiguration,
			__separator__(),
			stepOver,
			stepInto,
			stepOut,
			continueAction,
			__separator__(),
			toggleBreakpoint,
			newBreakpoints,
			enableAllBreakpoints,
			disableAllBreakpoints,
			removeAllBreakpoints,
			__separator__(),
			installAdditionalDebuggers
		].forEach(item => debugMenu.append(item));
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

	private toggleDevTools(): void {
		const w = this.windowsMainService.getFocusedWindow();
		if (w && w.win) {
			const contents = w.win.webContents;
			if (w.hasHiddenTitleBarStyle() && !w.win.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		}
	}

	private setHelpMenu(helpMenu: Electron.Menu): void {
		const toggleDevToolsItem = new MenuItem(this.likeAction('workbench.action.toggleDevTools', {
			label: this.mnemonicLabel(nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")),
			click: () => this.toggleDevTools(),
			enabled: (this.windowsMainService.getWindowCount() > 0)
		}));

		const showAccessibilityOptions = new MenuItem(this.likeAction('accessibilityOptions', {
			label: this.mnemonicLabel(nls.localize({ key: 'miAccessibilityOptions', comment: ['&& denotes a mnemonic'] }, "Accessibility &&Options")),
			accelerator: null,
			click: () => {
				this.openAccessibilityOptions();
			}
		}, false));

		let reportIssuesItem: Electron.MenuItem = null;
		if (product.reportIssueUrl) {
			const label = nls.localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue");

			if (this.windowsMainService.getWindowCount() > 0) {
				reportIssuesItem = this.createMenuItem(label, 'workbench.action.openIssueReporter');
			} else {
				reportIssuesItem = new MenuItem({ label: this.mnemonicLabel(label), click: () => this.openUrl(product.reportIssueUrl, 'openReportIssues') });
			}
		}

		const keyboardShortcutsUrl = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
		arrays.coalesce([
			new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miWelcome', comment: ['&& denotes a mnemonic'] }, "&&Welcome")), click: () => this.runActionInRenderer('workbench.action.showWelcomePage'), enabled: (this.windowsMainService.getWindowCount() > 0) }),
			new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miInteractivePlayground', comment: ['&& denotes a mnemonic'] }, "&&Interactive Playground")), click: () => this.runActionInRenderer('workbench.action.showInteractivePlayground'), enabled: (this.windowsMainService.getWindowCount() > 0) }),
			product.documentationUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")), click: () => this.runActionInRenderer('workbench.action.openDocumentationUrl'), enabled: (this.windowsMainService.getWindowCount() > 0) }) : null,
			product.releaseNotesUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")), click: () => this.runActionInRenderer('update.showCurrentReleaseNotes'), enabled: (this.windowsMainService.getWindowCount() > 0) }) : null,
			__separator__(),
			keyboardShortcutsUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")), click: () => this.runActionInRenderer('workbench.action.keybindingsReference'), enabled: (this.windowsMainService.getWindowCount() > 0) }) : null,
			product.introductoryVideosUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")), click: () => this.runActionInRenderer('workbench.action.openIntroductoryVideosUrl'), enabled: (this.windowsMainService.getWindowCount() > 0) }) : null,
			product.tipsAndTricksUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "&&Tips and Tricks")), click: () => this.runActionInRenderer('workbench.action.openTipsAndTricksUrl'), enabled: (this.windowsMainService.getWindowCount() > 0) }) : null,
			(product.introductoryVideosUrl || keyboardShortcutsUrl) ? __separator__() : null,
			product.twitterUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")), click: () => this.openUrl(product.twitterUrl, 'openTwitterUrl') }) : null,
			product.requestFeatureUrl ? new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")), click: () => this.openUrl(product.requestFeatureUrl, 'openUserVoiceUrl') }) : null,
			reportIssuesItem,
			(product.twitterUrl || product.requestFeatureUrl || product.reportIssueUrl) ? __separator__() : null,
			product.licenseUrl ? new MenuItem({
				label: this.mnemonicLabel(nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")), click: () => {
					if (language) {
						const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${product.licenseUrl}${queryArgChar}lang=${language}`, 'openLicenseUrl');
					} else {
						this.openUrl(product.licenseUrl, 'openLicenseUrl');
					}
				}
			}) : null,
			product.privacyStatementUrl ? new MenuItem({
				label: this.mnemonicLabel(nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "&&Privacy Statement")), click: () => {
					if (language) {
						const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`, 'openPrivacyStatement');
					} else {
						this.openUrl(product.privacyStatementUrl, 'openPrivacyStatement');
					}
				}
			}) : null,
			(product.licenseUrl || product.privacyStatementUrl) ? __separator__() : null,
			toggleDevToolsItem,
			isWindows && product.quality !== 'stable' ? showAccessibilityOptions : null
		]).forEach(item => helpMenu.append(item));

		if (!isMacintosh) {
			const updateMenuItems = this.getUpdateMenuItems();
			if (updateMenuItems.length) {
				helpMenu.append(__separator__());
				updateMenuItems.forEach(i => helpMenu.append(i));
			}

			helpMenu.append(__separator__());
			helpMenu.append(new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About")), click: () => this.windowsService.openAboutDialog() }));
		}
	}

	private setTaskMenu(taskMenu: Electron.Menu): void {
		const runTask = this.createMenuItem(nls.localize({ key: 'miRunTask', comment: ['&& denotes a mnemonic'] }, "&&Run Task..."), 'workbench.action.tasks.runTask');
		const buildTask = this.createMenuItem(nls.localize({ key: 'miBuildTask', comment: ['&& denotes a mnemonic'] }, "Run &&Build Task..."), 'workbench.action.tasks.build');
		const showTasks = this.createMenuItem(nls.localize({ key: 'miRunningTask', comment: ['&& denotes a mnemonic'] }, "Show Runnin&&g Tasks..."), 'workbench.action.tasks.showTasks');
		const restartTask = this.createMenuItem(nls.localize({ key: 'miRestartTask', comment: ['&& denotes a mnemonic'] }, "R&&estart Running Task..."), 'workbench.action.tasks.restartTask');
		const terminateTask = this.createMenuItem(nls.localize({ key: 'miTerminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task..."), 'workbench.action.tasks.terminate');
		const configureTask = this.createMenuItem(nls.localize({ key: 'miConfigureTask', comment: ['&& denotes a mnemonic'] }, "&&Configure Tasks..."), 'workbench.action.tasks.configureTaskRunner');
		const configureBuildTask = this.createMenuItem(nls.localize({ key: 'miConfigureBuildTask', comment: ['&& denotes a mnemonic'] }, "Configure De&&fault Build Task..."), 'workbench.action.tasks.configureDefaultBuildTask');

		[
			//__separator__(),
			runTask,
			buildTask,
			__separator__(),
			terminateTask,
			restartTask,
			showTasks,
			__separator__(),
			configureTask,
			configureBuildTask
		].forEach(item => taskMenu.append(item));
	}

	private openAccessibilityOptions(): void {
		let win = new BrowserWindow({
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			width: 450,
			height: 300,
			show: true,
			title: nls.localize('accessibilityOptionsWindowTitle', "Accessibility Options")
		});

		win.setMenuBarVisibility(false);

		win.loadURL('chrome://accessibility');
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
						this.updateService.checkForUpdates(true);
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

		return new MenuItem(this.withKeybinding(commandId, options));
	}

	private createContextAwareMenuItem(label: string, commandId: string, clickHandler: IMenuItemClickHandler): Electron.MenuItem {
		return new MenuItem(this.withKeybinding(commandId, {
			label: this.mnemonicLabel(label),
			enabled: this.windowsMainService.getWindowCount() > 0,
			click: () => {

				// No Active Window
				const activeWindow = this.windowsMainService.getFocusedWindow();
				if (!activeWindow) {
					return clickHandler.inNoWindow();
				}

				// DevTools focused
				if (activeWindow.win.webContents.isDevToolsFocused()) {
					return clickHandler.inDevTools(activeWindow.win.webContents.devToolsWebContents);
				}

				// Finally execute command in Window
				this.runActionInRenderer(commandId);
			}
		}));
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
		const binding = this.keybindingsResolver.getKeybinding(commandId);

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
