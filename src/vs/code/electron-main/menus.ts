/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import * as arrays from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ipcMain as ipc, app, shell, dialog, Menu, MenuItem } from 'electron';
import { IWindowsMainService, OpenContext } from 'vs/code/electron-main/windows';
import { VSCodeWindow } from 'vs/code/electron-main/window';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/code/electron-main/storage';
import { IFilesConfiguration, AutoSaveConfiguration } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService, State as UpdateState } from 'vs/platform/update/common/update';
import { Keybinding } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import product from 'vs/platform/node/product';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Event, { Emitter, once } from 'vs/base/common/event';
import { ConfigWatcher } from 'vs/base/node/config';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';

interface IResolvedKeybinding {
	id: string;
	binding: number;
}

interface IExtensionViewlet {
	id: string;
	label: string;
}

interface IConfiguration extends IFilesConfiguration {
	workbench: {
		sideBar: {
			location: 'left' | 'right';
		},
		statusBar: {
			visible: boolean;
		},
		activityBar: {
			visible: boolean;
		}
	};
}

class KeybindingsResolver {

	private static lastKnownKeybindingsMapStorageKey = 'lastKnownKeybindings';

	private commandIds: Set<string>;
	private keybindings: { [commandId: string]: string };
	private keybindingsWatcher: ConfigWatcher<IUserFriendlyKeybinding[]>;

	private _onKeybindingsChanged = new Emitter<void>();
	onKeybindingsChanged: Event<void> = this._onKeybindingsChanged.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWindowsMainService private windowsService: IWindowsMainService
	) {
		this.commandIds = new Set<string>();
		this.keybindings = this.storageService.getItem<{ [id: string]: string; }>(KeybindingsResolver.lastKnownKeybindingsMapStorageKey) || Object.create(null);
		this.keybindingsWatcher = new ConfigWatcher<IUserFriendlyKeybinding[]>(environmentService.appKeybindingsPath, { changeBufferDelay: 1000 /* update after 1s */ });

		this.registerListeners();
	}

	private registerListeners(): void {

		// Resolve keybindings when any first window is loaded
		const onceOnWindowReady = once(this.windowsService.onWindowReady);
		onceOnWindowReady(win => this.resolveKeybindings(win));

		// Listen to resolved keybindings from window
		ipc.on('vscode:keybindingsResolved', (event, rawKeybindings: string) => {
			let keybindings: IResolvedKeybinding[] = [];
			try {
				keybindings = JSON.parse(rawKeybindings);
			} catch (error) {
				// Should not happen
			}

			// Fill hash map of resolved keybindings and check for changes
			let keybindingsChanged = false;
			let keybindingsCount = 0;
			const resolvedKeybindings: { [commandId: string]: string } = Object.create(null);
			keybindings.forEach(keybinding => {
				const accelerator = KeybindingLabels._toElectronAccelerator(new Keybinding(keybinding.binding));
				if (accelerator) {
					keybindingsCount++;

					resolvedKeybindings[keybinding.id] = accelerator;

					if (accelerator !== this.keybindings[keybinding.id]) {
						keybindingsChanged = true;
					}
				}
			});

			// A keybinding might have been unassigned, so we have to account for that too
			if (Object.keys(this.keybindings).length !== keybindingsCount) {
				keybindingsChanged = true;
			}

			if (keybindingsChanged) {
				this.keybindings = resolvedKeybindings;
				this.storageService.setItem(KeybindingsResolver.lastKnownKeybindingsMapStorageKey, this.keybindings); // keep to restore instantly after restart

				this._onKeybindingsChanged.fire();
			}
		});

		// Resolve keybindings again when keybindings.json changes
		this.keybindingsWatcher.onDidUpdateConfiguration(() => this.resolveKeybindings());

		// Resolve keybindings when window reloads because an installed extension could have an impact
		this.windowsService.onWindowReload(() => this.resolveKeybindings());
	}

	private resolveKeybindings(win: VSCodeWindow = this.windowsService.getLastActiveWindow()): void {
		if (this.commandIds.size && win) {
			const commandIds = [];
			this.commandIds.forEach(id => commandIds.push(id));
			win.sendWhenReady('vscode:resolveKeybindings', JSON.stringify(commandIds));
		}
	}

	public getKeybinding(commandId: string): string {
		if (!this.commandIds.has(commandId)) {
			this.commandIds.add(commandId);
		}

		return this.keybindings[commandId];
	}
}

export class VSCodeMenu {

	private static MAX_MENU_RECENT_ENTRIES = 10;

	private currentAutoSaveSetting: string;
	private currentSidebarLocation: 'left' | 'right';
	private currentStatusbarVisible: boolean;
	private currentActivityBarVisible: boolean;

	private isQuitting: boolean;
	private appMenuInstalled: boolean;

	private menuUpdater: RunOnceScheduler;

	private keybindingsResolver: KeybindingsResolver;

	private extensionViewlets: IExtensionViewlet[];

	constructor(
		@IUpdateService private updateService: IUpdateService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsMainService private windowsService: IWindowsMainService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.extensionViewlets = [];

		this.menuUpdater = new RunOnceScheduler(() => this.doUpdateMenu(), 0);
		this.keybindingsResolver = instantiationService.createInstance(KeybindingsResolver);

		this.onConfigurationUpdated(this.configurationService.getConfiguration<IConfiguration>());

		this.install();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Keep flag when app quits
		app.on('will-quit', () => {
			this.isQuitting = true;
		});

		// Listen to some events from window service
		this.windowsService.onPathsOpen(paths => this.updateMenu());
		this.windowsService.onRecentPathsChange(paths => this.updateMenu());
		this.windowsService.onWindowClose(_ => this.onClose(this.windowsService.getWindowCount()));

		// Listen to extension viewlets
		ipc.on('vscode:extensionViewlets', (event, rawExtensionViewlets) => {
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
		this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config, true /* update menu if changed */));

		// Listen to update service
		this.updateService.onStateChange(() => this.updateMenu());

		// Listen to keybindings change
		this.keybindingsResolver.onKeybindingsChanged(() => this.updateMenu());
	}

	private onConfigurationUpdated(config: IConfiguration, handleMenu?: boolean): void {
		let updateMenu = false;
		const newAutoSaveSetting = config && config.files && config.files.autoSave;
		if (newAutoSaveSetting !== this.currentAutoSaveSetting) {
			this.currentAutoSaveSetting = newAutoSaveSetting;
			updateMenu = true;
		}

		const newSidebarLocation = config && config.workbench && config.workbench.sideBar && config.workbench.sideBar.location || 'left';
		if (newSidebarLocation !== this.currentSidebarLocation) {
			this.currentSidebarLocation = newSidebarLocation;
			updateMenu = true;
		}

		let newStatusbarVisible = config && config.workbench && config.workbench.statusBar && config.workbench.statusBar.visible;
		if (typeof newStatusbarVisible !== 'boolean') {
			newStatusbarVisible = true;
		}
		if (newStatusbarVisible !== this.currentStatusbarVisible) {
			this.currentStatusbarVisible = newStatusbarVisible;
			updateMenu = true;
		}

		let newActivityBarVisible = config && config.workbench && config.workbench.activityBar && config.workbench.activityBar.visible;
		if (typeof newActivityBarVisible !== 'boolean') {
			newActivityBarVisible = true;
		}
		if (newActivityBarVisible !== this.currentActivityBarVisible) {
			this.currentActivityBarVisible = newActivityBarVisible;
			updateMenu = true;
		}

		if (handleMenu && updateMenu) {
			this.updateMenu();
		}
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

	private onClose(remainingWindowCount: number): void {
		if (remainingWindowCount === 0 && platform.isMacintosh) {
			this.updateMenu();
		}
	}

	private install(): void {

		// Menus
		const menubar = new Menu();

		// Mac: Application
		let macApplicationMenuItem: Electron.MenuItem;
		if (platform.isMacintosh) {
			const applicationMenu = new Menu();
			macApplicationMenuItem = new MenuItem({ label: product.nameShort, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
		}

		// File
		const fileMenu = new Menu();
		const fileMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File")), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// Edit
		const editMenu = new Menu();
		const editMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")), submenu: editMenu });
		this.setEditMenu(editMenu);

		// Selection
		const selectionMenu = new Menu();
		const selectionMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mSelection', comment: ['&& denotes a mnemonic'] }, "&&Selection")), submenu: selectionMenu });
		this.setSelectionMenu(selectionMenu);

		// View
		const viewMenu = new Menu();
		const viewMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")), submenu: viewMenu });
		this.setViewMenu(viewMenu);

		// Goto
		const gotoMenu = new Menu();
		const gotoMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")), submenu: gotoMenu });
		this.setGotoMenu(gotoMenu);

		// Mac: Window
		let macWindowMenuItem: Electron.MenuItem;
		if (platform.isMacintosh) {
			const windowMenu = new Menu();
			macWindowMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mWindow', "Window")), submenu: windowMenu, role: 'window' });
			this.setMacWindowMenu(windowMenu);
		}

		// Help
		const helpMenu = new Menu();
		const helpMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")), submenu: helpMenu, role: 'help' });
		this.setHelpMenu(helpMenu);

		// Menu Structure
		if (macApplicationMenuItem) {
			menubar.append(macApplicationMenuItem);
		}

		menubar.append(fileMenuItem);
		menubar.append(editMenuItem);
		menubar.append(selectionMenuItem);
		menubar.append(viewMenuItem);
		menubar.append(gotoMenuItem);

		if (macWindowMenuItem) {
			menubar.append(macWindowMenuItem);
		}

		menubar.append(helpMenuItem);

		Menu.setApplicationMenu(menubar);

		// Dock Menu
		if (platform.isMacintosh && !this.appMenuInstalled) {
			this.appMenuInstalled = true;

			const dockMenu = new Menu();
			dockMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsService.openNewWindow(OpenContext.DOCK) }));

			app.dock.setMenu(dockMenu);
		}
	}

	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		const about = new MenuItem({ label: nls.localize('mAbout', "About {0}", product.nameLong), role: 'about' });
		const checkForUpdates = this.getUpdateMenuItems();
		const preferences = this.getPreferencesMenu();
		const hide = new MenuItem({ label: nls.localize('mHide', "Hide {0}", product.nameLong), role: 'hide', accelerator: 'Command+H' });
		const hideOthers = new MenuItem({ label: nls.localize('mHideOthers', "Hide Others"), role: 'hideothers', accelerator: 'Command+Alt+H' });
		const showAll = new MenuItem({ label: nls.localize('mShowAll', "Show All"), role: 'unhide' });
		const quit = new MenuItem(this.likeAction('workbench.action.quit', { label: nls.localize('miQuit', "Quit {0}", product.nameLong), click: () => this.windowsService.quit(), accelerator: this.getAccelerator('workbench.action.quit', 'Command+Q') }));

		const actions = [about];
		actions.push(...checkForUpdates);
		actions.push(...[
			__separator__(),
			preferences,
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
		const hasNoWindows = (this.windowsService.getWindowCount() === 0);

		let newFile: Electron.MenuItem;
		if (hasNoWindows) {
			newFile = new MenuItem(this.likeAction('workbench.action.files.newUntitledFile', { label: mnemonicLabel(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")), click: () => this.windowsService.openNewWindow(OpenContext.MENU) }));
		} else {
			newFile = this.createMenuItem(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File"), 'workbench.action.files.newUntitledFile');
		}

		const open = new MenuItem(this.likeAction('workbench.action.files.openFileFolder', { label: mnemonicLabel(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")), click: (menuItem, win, event) => this.windowsService.openFileFolderPicker(this.isOptionClick(event)) }));
		const openFolder = new MenuItem(this.likeAction('workbench.action.files.openFolder', { label: mnemonicLabel(nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")), click: (menuItem, win, event) => this.windowsService.openFolderPicker(this.isOptionClick(event)) }));

		let openFile: Electron.MenuItem;
		if (hasNoWindows) {
			openFile = new MenuItem(this.likeAction('workbench.action.files.openFile', { label: mnemonicLabel(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")), click: (menuItem, win, event) => this.windowsService.openFilePicker(this.isOptionClick(event)) }));
		} else {
			openFile = this.createMenuItem(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File..."), ['workbench.action.files.openFile', 'workbench.action.files.openFileInNewWindow']);
		}

		const openRecentMenu = new Menu();
		this.setOpenRecentMenu(openRecentMenu);
		const openRecent = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent")), submenu: openRecentMenu, enabled: openRecentMenu.items.length > 0 });

		const saveFile = this.createMenuItem(nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"), 'workbench.action.files.save', this.windowsService.getWindowCount() > 0);
		const saveFileAs = this.createMenuItem(nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."), 'workbench.action.files.saveAs', this.windowsService.getWindowCount() > 0);
		const saveAllFiles = this.createMenuItem(nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll"), 'workbench.action.files.saveAll', this.windowsService.getWindowCount() > 0);

		const autoSaveEnabled = [AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some(s => this.currentAutoSaveSetting === s);
		const autoSave = new MenuItem(this.likeAction('vscode.toggleAutoSave', { label: mnemonicLabel(nls.localize('miAutoSave', "Auto Save")), type: 'checkbox', checked: autoSaveEnabled, enabled: this.windowsService.getWindowCount() > 0, click: () => this.windowsService.sendToFocused('vscode.toggleAutoSave') }, false));

		const preferences = this.getPreferencesMenu();

		const newWindow = new MenuItem(this.likeAction('workbench.action.newWindow', { label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), click: () => this.windowsService.openNewWindow(OpenContext.MENU) }));
		const revertFile = this.createMenuItem(nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Re&&vert File"), 'workbench.action.files.revert', this.windowsService.getWindowCount() > 0);
		const closeWindow = new MenuItem(this.likeAction('workbench.action.closeWindow', { label: mnemonicLabel(nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window")), click: () => this.windowsService.getLastActiveWindow().win.close(), enabled: this.windowsService.getWindowCount() > 0 }));

		const closeFolder = this.createMenuItem(nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"), 'workbench.action.closeFolder');
		const closeEditor = this.createMenuItem(nls.localize({ key: 'miCloseEditor', comment: ['&& denotes a mnemonic'] }, "&&Close Editor"), 'workbench.action.closeActiveEditor');

		const exit = new MenuItem(this.likeAction('workbench.action.quit', { label: mnemonicLabel(nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")), click: () => this.windowsService.quit() }));

		arrays.coalesce([
			newFile,
			newWindow,
			__separator__(),
			platform.isMacintosh ? open : null,
			!platform.isMacintosh ? openFile : null,
			!platform.isMacintosh ? openFolder : null,
			openRecent,
			__separator__(),
			saveFile,
			saveFileAs,
			saveAllFiles,
			__separator__(),
			autoSave,
			__separator__(),
			!platform.isMacintosh ? preferences : null,
			!platform.isMacintosh ? __separator__() : null,
			revertFile,
			closeEditor,
			closeFolder,
			!platform.isMacintosh ? closeWindow : null,
			!platform.isMacintosh ? __separator__() : null,
			!platform.isMacintosh ? exit : null
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

		return new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences")), submenu: preferencesMenu });
	}

	private setOpenRecentMenu(openRecentMenu: Electron.Menu): void {
		openRecentMenu.append(this.createMenuItem(nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"), 'workbench.action.reopenClosedEditor'));

		const {folders, files} = this.windowsService.getRecentPathsList();

		// Folders
		if (folders.length > 0) {
			openRecentMenu.append(__separator__());

			for (let i = 0; i < VSCodeMenu.MAX_MENU_RECENT_ENTRIES && i < folders.length; i++) {
				openRecentMenu.append(this.createOpenRecentMenuItem(folders[i], 'openRecentFolder'));
			}
		}

		// Files
		if (files.length > 0) {
			openRecentMenu.append(__separator__());

			for (let i = 0; i < VSCodeMenu.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
				openRecentMenu.append(this.createOpenRecentMenuItem(files[i], 'openRecentFile'));
			}
		}

		if (folders.length || files.length) {
			openRecentMenu.append(__separator__());
			openRecentMenu.append(new MenuItem(this.likeAction('clearRecentlyOpened', { label: mnemonicLabel(nls.localize({ key: 'miClearItems', comment: ['&& denotes a mnemonic'] }, "&&Clear Items")), click: () => this.windowsService.clearRecentPathsList() }, false)));
		}
	}

	private createOpenRecentMenuItem(path: string, actionId: string): Electron.MenuItem {
		let label = path;
		if ((platform.isMacintosh || platform.isLinux) && path.indexOf(this.environmentService.userHome) === 0) {
			label = `~${path.substr(this.environmentService.userHome.length)}`;
		}

		return new MenuItem(this.likeAction(actionId, {
			label: unMnemonicLabel(label), click: (menuItem, win, event) => {
				const openInNewWindow = this.isOptionClick(event);
				const success = !!this.windowsService.open({ context: OpenContext.MENU, cli: this.environmentService.args, pathsToOpen: [path], forceNewWindow: openInNewWindow });
				if (!success) {
					this.windowsService.removeFromRecentPathsList(path);
				}
			}
		}, false));
	}

	private isOptionClick(event: Electron.Event): boolean {
		return event && ((!platform.isMacintosh && (event.ctrlKey || event.shiftKey)) || (platform.isMacintosh && (event.metaKey || event.altKey)));
	}

	private createRoleMenuItem(label: string, actionId: string, role: Electron.MenuItemRole): Electron.MenuItem {
		const options: Electron.MenuItemOptions = {
			label: mnemonicLabel(label),
			accelerator: this.getAccelerator(actionId),
			role,
			enabled: true
		};

		return new MenuItem(options);
	}

	private setEditMenu(winLinuxEditMenu: Electron.Menu): void {
		let undo: Electron.MenuItem;
		let redo: Electron.MenuItem;
		let cut: Electron.MenuItem;
		let copy: Electron.MenuItem;
		let paste: Electron.MenuItem;

		if (platform.isMacintosh) {
			undo = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"), 'undo', devTools => devTools.undo());
			redo = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"), 'redo', devTools => devTools.redo());
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
		if (platform.isMacintosh) {
			selectAll = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"), 'editor.action.selectAll', (devTools) => devTools.selectAll());
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
		const git = this.createMenuItem(nls.localize({ key: 'miViewGit', comment: ['&& denotes a mnemonic'] }, "&&Git"), 'workbench.view.git');
		// const scm = this.createMenuItem(nls.localize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "S&&CM"), 'workbench.view.scm');
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

			additionalViewlets = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miAdditionalViews', comment: ['&& denotes a mnemonic'] }, "Additional &&Views")), submenu: additionalViewletsMenu, enabled: true });
		}

		const commands = this.createMenuItem(nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette..."), 'workbench.action.showCommands');

		const fullscreen = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")), accelerator: this.getAccelerator('workbench.action.toggleFullScreen'), click: () => this.windowsService.getLastActiveWindow().toggleFullScreen(), enabled: this.windowsService.getWindowCount() > 0 });
		const toggleZenMode = this.createMenuItem(nls.localize('miToggleZenMode', "Toggle Zen Mode"), 'workbench.action.toggleZenMode', this.windowsService.getWindowCount() > 0);
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
		const toggleRenderWhitespace = this.createMenuItem(nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace"), 'editor.action.toggleRenderWhitespace');
		const toggleRenderControlCharacters = this.createMenuItem(nls.localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Toggle &&Control Characters"), 'editor.action.toggleRenderControlCharacter');

		const zoomIn = this.createMenuItem(nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"), 'workbench.action.zoomIn');
		const zoomOut = this.createMenuItem(nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "Zoom O&&ut"), 'workbench.action.zoomOut');
		const resetZoom = this.createMenuItem(nls.localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom"), 'workbench.action.zoomReset');

		arrays.coalesce([
			commands,
			__separator__(),
			explorer,
			search,
			git,
			// scm,
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
			platform.isWindows || platform.isLinux ? toggleMenuBar : void 0,
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

		const switchEditor = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor")), submenu: switchEditorMenu, enabled: true });

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

		const switchGroup = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group")), submenu: switchGroupMenu, enabled: true });

		const gotoFile = this.createMenuItem(nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File..."), 'workbench.action.quickOpen');
		const gotoSymbolInFile = this.createMenuItem(nls.localize({ key: 'miGotoSymbolInFile', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol in File..."), 'workbench.action.gotoSymbol');
		const gotoSymbolInWorkspace = this.createMenuItem(nls.localize({ key: 'miGotoSymbolInWorkspace', comment: ['&& denotes a mnemonic'] }, "Go to Symbol in &&Workspace..."), 'workbench.action.showAllSymbols');
		const gotoDefinition = this.createMenuItem(nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"), 'editor.action.goToDeclaration');
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
			gotoLine
		].forEach(item => gotoMenu.append(item));
	}

	private setMacWindowMenu(macWindowMenu: Electron.Menu): void {
		const minimize = new MenuItem({ label: nls.localize('mMinimize', "Minimize"), role: 'minimize', accelerator: 'Command+M', enabled: this.windowsService.getWindowCount() > 0 });
		const close = new MenuItem({ label: nls.localize('mClose', "Close"), role: 'close', accelerator: 'Command+W', enabled: this.windowsService.getWindowCount() > 0 });
		const bringAllToFront = new MenuItem({ label: nls.localize('mBringToFront', "Bring All to Front"), role: 'front', enabled: this.windowsService.getWindowCount() > 0 });

		[
			minimize,
			close,
			__separator__(),
			bringAllToFront
		].forEach(item => macWindowMenu.append(item));
	}

	private toggleDevTools(): void {
		const w = this.windowsService.getFocusedWindow();
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
			label: mnemonicLabel(nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")),
			click: () => this.toggleDevTools(),
			enabled: (this.windowsService.getWindowCount() > 0)
		}));

		const showAccessibilityOptions = new MenuItem(this.likeAction('accessibilityOptions', {
			label: mnemonicLabel(nls.localize({ key: 'miAccessibilityOptions', comment: ['&& denotes a mnemonic'] }, "Accessibility &&Options")),
			accelerator: null,
			click: () => {
				this.windowsService.openAccessibilityOptions();
			}
		}, false));

		let reportIssuesItem: Electron.MenuItem = null;
		if (product.reportIssueUrl) {
			const label = nls.localize({ key: 'miReportIssues', comment: ['&& denotes a mnemonic'] }, "Report &&Issues");

			if (this.windowsService.getWindowCount() > 0) {
				reportIssuesItem = this.createMenuItem(label, 'workbench.action.reportIssues');
			} else {
				reportIssuesItem = new MenuItem({ label: mnemonicLabel(label), click: () => this.openUrl(product.reportIssueUrl, 'openReportIssues') });
			}
		}

		const keyboardShortcutsUrl = platform.isLinux ? product.keyboardShortcutsUrlLinux : platform.isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
		arrays.coalesce([
			new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miWelcome', comment: ['&& denotes a mnemonic'] }, "&&Welcome")), click: () => this.windowsService.sendToFocused('vscode:runAction', 'workbench.action.showWelcomePage') }),
			product.documentationUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")), click: () => this.windowsService.sendToFocused('vscode:runAction', 'workbench.action.openDocumentationUrl') }) : null,
			product.releaseNotesUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")), click: () => this.windowsService.sendToFocused('vscode:runAction', 'update.showCurrentReleaseNotes') }) : null,
			__separator__(),
			keyboardShortcutsUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")), click: () => this.windowsService.sendToFocused('vscode:runAction', 'workbench.action.keybindingsReference') }) : null,
			product.introductoryVideosUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")), click: () => this.windowsService.sendToFocused('vscode:runAction', 'workbench.action.openIntroductoryVideosUrl') }) : null,
			(product.introductoryVideosUrl || keyboardShortcutsUrl) ? __separator__() : null,
			product.twitterUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")), click: () => this.openUrl(product.twitterUrl, 'openTwitterUrl') }) : null,
			product.requestFeatureUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")), click: () => this.openUrl(product.requestFeatureUrl, 'openUserVoiceUrl') }) : null,
			reportIssuesItem,
			(product.twitterUrl || product.requestFeatureUrl || product.reportIssueUrl) ? __separator__() : null,
			product.licenseUrl ? new MenuItem({
				label: mnemonicLabel(nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")), click: () => {
					if (platform.language) {
						const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${product.licenseUrl}${queryArgChar}lang=${platform.language}`, 'openLicenseUrl');
					} else {
						this.openUrl(product.licenseUrl, 'openLicenseUrl');
					}
				}
			}) : null,
			product.privacyStatementUrl ? new MenuItem({
				label: mnemonicLabel(nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "&&Privacy Statement")), click: () => {
					if (platform.language) {
						const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${product.privacyStatementUrl}${queryArgChar}lang=${platform.language}`, 'openPrivacyStatement');
					} else {
						this.openUrl(product.privacyStatementUrl, 'openPrivacyStatement');
					}
				}
			}) : null,
			(product.licenseUrl || product.privacyStatementUrl) ? __separator__() : null,
			toggleDevToolsItem,
			platform.isWindows && product.quality !== 'stable' ? showAccessibilityOptions : null
		]).forEach(item => helpMenu.append(item));

		if (!platform.isMacintosh) {
			const updateMenuItems = this.getUpdateMenuItems();
			if (updateMenuItems.length) {
				helpMenu.append(__separator__());
				updateMenuItems.forEach(i => helpMenu.append(i));
			}

			helpMenu.append(__separator__());
			helpMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About")), click: () => this.openAboutDialog() }));
		}
	}

	private getUpdateMenuItems(): Electron.MenuItem[] {
		switch (this.updateService.state) {
			case UpdateState.Uninitialized:
				return [];

			case UpdateState.UpdateDownloaded:
				return [new MenuItem({
					label: nls.localize('miRestartToUpdate', "Restart To Update..."), click: () => {
						this.reportMenuActionTelemetry('RestartToUpdate');
						this.updateService.quitAndInstall();
					}
				})];

			case UpdateState.CheckingForUpdate:
				return [new MenuItem({ label: nls.localize('miCheckingForUpdates', "Checking For Updates..."), enabled: false })];

			case UpdateState.UpdateAvailable:
				if (platform.isLinux) {
					return [new MenuItem({
						label: nls.localize('miDownloadUpdate', "Download Available Update"), click: () => {
							this.updateService.quitAndInstall();
						}
					})];
				}

				const updateAvailableLabel = platform.isWindows
					? nls.localize('miDownloadingUpdate', "Downloading Update...")
					: nls.localize('miInstallingUpdate', "Installing Update...");

				return [new MenuItem({ label: updateAvailableLabel, enabled: false })];

			default:
				const result = [new MenuItem({
					label: nls.localize('miCheckForUpdates', "Check For Updates..."), click: () => setTimeout(() => {
						this.reportMenuActionTelemetry('CheckForUpdate');
						this.updateService.checkForUpdates(true);
					}, 0)
				})];

				return result;
		}
	}

	private createMenuItem(label: string, actionId: string | string[], enabled?: boolean, checked?: boolean): Electron.MenuItem;
	private createMenuItem(label: string, click: () => void, enabled?: boolean, checked?: boolean): Electron.MenuItem;
	private createMenuItem(arg1: string, arg2: any, arg3?: boolean, arg4?: boolean): Electron.MenuItem {
		const label = mnemonicLabel(arg1);
		const click: () => void = (typeof arg2 === 'function') ? arg2 : (menuItem, win, event) => {
			let actionId = arg2;
			if (Array.isArray(arg2)) {
				actionId = this.isOptionClick(event) ? arg2[1] : arg2[0]; // support alternative action if we got multiple action Ids and the option key was pressed while invoking
			}

			this.windowsService.sendToFocused('vscode:runAction', actionId);
		};
		const enabled = typeof arg3 === 'boolean' ? arg3 : this.windowsService.getWindowCount() > 0;
		const checked = typeof arg4 === 'boolean' ? arg4 : false;

		let actionId: string;
		if (typeof arg2 === 'string') {
			actionId = arg2;
		}

		const options: Electron.MenuItemOptions = {
			label,
			accelerator: this.getAccelerator(actionId),
			click,
			enabled
		};

		if (checked) {
			options['type'] = 'checkbox';
			options['checked'] = checked;
		}

		return new MenuItem(options);
	}

	private createDevToolsAwareMenuItem(label: string, actionId: string, devToolsFocusedFn: (contents: Electron.WebContents) => void): Electron.MenuItem {
		return new MenuItem({
			label: mnemonicLabel(label),
			accelerator: this.getAccelerator(actionId),
			enabled: this.windowsService.getWindowCount() > 0,
			click: () => {
				const windowInFocus = this.windowsService.getFocusedWindow();
				if (!windowInFocus) {
					return;
				}

				if (windowInFocus.win.webContents.isDevToolsFocused()) {
					devToolsFocusedFn(windowInFocus.win.webContents.devToolsWebContents);
				} else {
					this.windowsService.sendToFocused('vscode:runAction', actionId);
				}
			}
		});
	}

	private likeAction(actionId: string, options: Electron.MenuItemOptions, setAccelerator = !options.accelerator): Electron.MenuItemOptions {
		if (setAccelerator) {
			options.accelerator = this.getAccelerator(actionId);
		}
		const originalClick = options.click;
		options.click = (item, window, event) => {
			this.reportMenuActionTelemetry(actionId);
			if (originalClick) {
				originalClick(item, window, event);
			}
		};
		return options;
	}

	private getAccelerator(actionId: string, fallback?: string): string {
		if (actionId) {
			return this.keybindingsResolver.getKeybinding(actionId);
		}

		return fallback;
	}

	private openAboutDialog(): void {
		const lastActiveWindow = this.windowsService.getFocusedWindow() || this.windowsService.getLastActiveWindow();

		dialog.showMessageBox(lastActiveWindow && lastActiveWindow.win, {
			title: product.nameLong,
			type: 'info',
			message: product.nameLong,
			detail: nls.localize('aboutDetail',
				"\nVersion {0}\nCommit {1}\nDate {2}\nShell {3}\nRenderer {4}\nNode {5}",
				app.getVersion(),
				product.commit || 'Unknown',
				product.date || 'Unknown',
				process.versions['electron'],
				process.versions['chrome'],
				process.versions['node']
			),
			buttons: [nls.localize('okButton', "OK")],
			noLink: true
		}, result => null);

		this.reportMenuActionTelemetry('showAboutDialog');
	}

	private openUrl(url: string, id: string): void {
		shell.openExternal(url);
		this.reportMenuActionTelemetry(id);
	}

	private reportMenuActionTelemetry(id: string): void {
		this.telemetryService.publicLog('workbenchActionExecuted', { id, from: 'menu' });
	}
}

function __separator__(): Electron.MenuItem {
	return new MenuItem({ type: 'separator' });
}

function mnemonicLabel(label: string): string {
	if (platform.isMacintosh) {
		return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac
	}

	return label.replace(/&&/g, '&');
}

function unMnemonicLabel(label: string): string {
	if (platform.isMacintosh) {
		return label; // no mnemonic support on mac
	}

	return label.replace(/&/g, '&&');
}
