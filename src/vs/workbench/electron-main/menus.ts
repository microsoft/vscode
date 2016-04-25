/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ipcMain as ipc, app, shell, dialog, Menu, MenuItem} from 'electron';

import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import arrays = require('vs/base/common/arrays');
import { IWindowsService, WindowsManager, IOpenedPathsList } from 'vs/workbench/electron-main/windows';
import window = require('vs/workbench/electron-main/window');
import env = require('vs/workbench/electron-main/env');
import { IStorageService } from 'vs/workbench/electron-main/storage';
import { IUpdateService, State as UpdateState } from 'vs/workbench/electron-main/update-manager';
import {Keybinding} from 'vs/base/common/keyCodes';

interface IResolvedKeybinding {
	id: string;
	binding: number;
}

export class VSCodeMenu {

	private static lastKnownKeybindingsMapStorageKey = 'lastKnownKeybindings';

	private static MAX_RECENT_ENTRIES = 10;

	private isQuitting: boolean;
	private appMenuInstalled: boolean;

	private actionIdKeybindingRequests: string[];
	private mapLastKnownKeybindingToActionId: { [id: string]: string; };
	private mapResolvedKeybindingToActionId: { [id: string]: string; };
	private keybindingsResolved: boolean;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IUpdateService private updateManager: IUpdateService,
		@IWindowsService private windowsManager: IWindowsService,
		@env.IEnvironmentService private envService: env.IEnvironmentService
	) {
		this.actionIdKeybindingRequests = [];

		this.mapResolvedKeybindingToActionId = Object.create(null);
		this.mapLastKnownKeybindingToActionId = this.storageService.getItem<{ [id: string]: string; }>(VSCodeMenu.lastKnownKeybindingsMapStorageKey) || Object.create(null);
	}

	public ready(): void {
		this.registerListeners();
		this.install();
	}

	private registerListeners(): void {

		// Keep flag when app quits
		app.on('will-quit', () => {
			this.isQuitting = true;
		});

		// Listen to "open" & "close" event from window manager
		this.windowsManager.onOpen((paths) => this.onOpen(paths));
		this.windowsManager.onClose(_ => this.onClose(this.windowsManager.getWindowCount()));

		// Resolve keybindings when any first workbench is loaded
		this.windowsManager.onReady((win) => this.resolveKeybindings(win));

		// Listen to resolved keybindings
		ipc.on('vscode:keybindingsResolved', (event, rawKeybindings) => {
			let keybindings: IResolvedKeybinding[] = [];
			try {
				keybindings = JSON.parse(rawKeybindings);
			} catch (error) {
				// Should not happen
			}

			// Fill hash map of resolved keybindings
			let needsMenuUpdate = false;
			keybindings.forEach((keybinding) => {
				let accelerator = new Keybinding(keybinding.binding)._toElectronAccelerator();
				if (accelerator) {
					this.mapResolvedKeybindingToActionId[keybinding.id] = accelerator;
					if (this.mapLastKnownKeybindingToActionId[keybinding.id] !== accelerator) {
						needsMenuUpdate = true; // we only need to update when something changed!
					}
				}
			});

			// A keybinding might have been unassigned, so we have to account for that too
			if (Object.keys(this.mapLastKnownKeybindingToActionId).length !== Object.keys(this.mapResolvedKeybindingToActionId).length) {
				needsMenuUpdate = true;
			}

			if (needsMenuUpdate) {
				this.storageService.setItem(VSCodeMenu.lastKnownKeybindingsMapStorageKey, this.mapResolvedKeybindingToActionId); // keep to restore instantly after restart
				this.mapLastKnownKeybindingToActionId = this.mapResolvedKeybindingToActionId; // update our last known map

				this.updateMenu();
			}
		});

		// Listen to update manager
		this.updateManager.on('change', () => this.updateMenu());
	}

	private resolveKeybindings(win: window.VSCodeWindow): void {
		if (this.keybindingsResolved) {
			return; // only resolve once
		}

		this.keybindingsResolved = true;

		// Resolve keybindings when workbench window is up
		if (this.actionIdKeybindingRequests.length) {
			win.send('vscode:resolveKeybindings', JSON.stringify(this.actionIdKeybindingRequests));
		}
	}

	private updateMenu(): void {

		// Due to limitations in Electron, it is not possible to update menu items dynamically. The suggested
		// workaround from Electron is to set the application menu again.
		// See also https://github.com/atom/electron/issues/846
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

	private onOpen(path: window.IPath): void {
		this.addToOpenedPathsList(path.filePath || path.workspacePath, !!path.filePath);
		this.updateMenu();
	}

	private onClose(remainingWindowCount: number): void {
		if (remainingWindowCount === 0 && platform.isMacintosh) {
			this.updateMenu();
		}
	}

	private install(): void {

		// Menus
		let menubar = new Menu();

		// Mac: Application
		let macApplicationMenuItem: Electron.MenuItem;
		if (platform.isMacintosh) {
			let applicationMenu = new Menu();
			macApplicationMenuItem = new MenuItem({ label: this.envService.product.nameShort, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
		}

		// File
		let fileMenu = new Menu();
		let fileMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File")), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// Edit
		let editMenu = new Menu();
		let editMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")), submenu: editMenu });
		this.setEditMenu(editMenu);

		// View
		let viewMenu = new Menu();
		let viewMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")), submenu: viewMenu });
		this.setViewMenu(viewMenu);

		// Goto
		let gotoMenu = new Menu();
		let gotoMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Goto")), submenu: gotoMenu });
		this.setGotoMenu(gotoMenu);

		// Mac: Window
		let macWindowMenuItem: Electron.MenuItem;
		if (platform.isMacintosh) {
			let windowMenu = new Menu();
			macWindowMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mWindow', "Window")), submenu: windowMenu, role: 'window' });
			this.setMacWindowMenu(windowMenu);
		}

		// Help
		let helpMenu = new Menu();
		let helpMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")), submenu: helpMenu, role: 'help' });
		this.setHelpMenu(helpMenu);

		// Menu Structure
		if (macApplicationMenuItem) {
			menubar.append(macApplicationMenuItem);
		}

		menubar.append(fileMenuItem);
		menubar.append(editMenuItem);
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

			let dockMenu = new Menu();
			dockMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window")), click: () => this.windowsManager.openNewWindow() }));

			app.dock.setMenu(dockMenu);
		}
	}

	private addToOpenedPathsList(path?: string, isFile?: boolean): void {
		if (!path) {
			return;
		}

		let mru = this.getOpenedPathsList();
		if (isFile) {
			mru.files.unshift(path);
			mru.files = arrays.distinct(mru.files, (f) => platform.isLinux ? f : f.toLowerCase());
		} else {
			mru.folders.unshift(path);
			mru.folders = arrays.distinct(mru.folders, (f) => platform.isLinux ? f : f.toLowerCase());
		}

		// Make sure its bounded
		mru.folders = mru.folders.slice(0, VSCodeMenu.MAX_RECENT_ENTRIES);
		mru.files = mru.files.slice(0, VSCodeMenu.MAX_RECENT_ENTRIES);

		this.storageService.setItem(WindowsManager.openedPathsListStorageKey, mru);
	}

	private removeFromOpenedPathsList(path: string): void {
		let mru = this.getOpenedPathsList();

		let index = mru.files.indexOf(path);
		if (index >= 0) {
			mru.files.splice(index, 1);
		}

		index = mru.folders.indexOf(path);
		if (index >= 0) {
			mru.folders.splice(index, 1);
		}

		this.storageService.setItem(WindowsManager.openedPathsListStorageKey, mru);
	}

	private clearOpenedPathsList(): void {
		this.storageService.setItem(WindowsManager.openedPathsListStorageKey, { folders: [], files: [] });
		app.clearRecentDocuments();

		this.updateMenu();
	}

	private getOpenedPathsList(): IOpenedPathsList {
		let mru = this.storageService.getItem<IOpenedPathsList>(WindowsManager.openedPathsListStorageKey);
		if (!mru) {
			mru = { folders: [], files: [] };
		}

		return mru;
	}

	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		let about = new MenuItem({ label: nls.localize('mAbout', "About {0}", this.envService.product.nameLong), role: 'about' });
		let checkForUpdates = this.getUpdateMenuItems();
		let preferences = this.getPreferencesMenu();
		let hide = new MenuItem({ label: nls.localize('mHide', "Hide {0}", this.envService.product.nameLong), role: 'hide', accelerator: 'Command+H' });
		let hideOthers = new MenuItem({ label: nls.localize('mHideOthers', "Hide Others"), role: 'hideothers', accelerator: 'Command+Alt+H' });
		let showAll = new MenuItem({ label: nls.localize('mShowAll', "Show All"), role: 'unhide' });
		let quit = new MenuItem({ label: nls.localize('miQuit', "Quit {0}", this.envService.product.nameLong), click: () => this.quit(), accelerator: 'Command+Q' });

		let actions = [about];
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
		let hasNoWindows = (this.windowsManager.getWindowCount() === 0);

		let newFile: Electron.MenuItem;
		if (hasNoWindows) {
			newFile = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")), accelerator: this.getAccelerator('workbench.action.files.newUntitledFile'), click: () => this.windowsManager.openNewWindow() });
		} else {
			newFile = this.createMenuItem(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File"), 'workbench.action.files.newUntitledFile');
		}

		let open = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")), accelerator: this.getAccelerator('workbench.action.files.openFileFolder'), click: () => this.windowsManager.openFileFolderPicker() });
		let openFile = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")), accelerator: this.getAccelerator('workbench.action.files.openFile'), click: () => this.windowsManager.openFilePicker() });
		let openFolder = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")), accelerator: this.getAccelerator('workbench.action.files.openFolder'), click: () => this.windowsManager.openFolderPicker() });

		let openRecentMenu = new Menu();
		this.setOpenRecentMenu(openRecentMenu);
		let openRecent = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent")), submenu: openRecentMenu, enabled: openRecentMenu.items.length > 0 });

		let saveFile = this.createMenuItem(nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"), 'workbench.action.files.save', this.windowsManager.getWindowCount() > 0);
		let saveFileAs = this.createMenuItem(nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."), 'workbench.action.files.saveAs', this.windowsManager.getWindowCount() > 0);
		let saveAllFiles = this.createMenuItem(nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll"), 'workbench.action.files.saveAll', this.windowsManager.getWindowCount() > 0);

		let preferences = this.getPreferencesMenu();

		let newWindow = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window")), accelerator: this.getAccelerator('workbench.action.newWindow'), click: () => this.windowsManager.openNewWindow() });
		let revertFile = this.createMenuItem(nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Revert F&&ile"), 'workbench.action.files.revert', this.windowsManager.getWindowCount() > 0);
		let closeWindow = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Close &&Window")), accelerator: this.getAccelerator('workbench.action.closeWindow'), click: () => this.windowsManager.getLastActiveWindow().win.close(), enabled: this.windowsManager.getWindowCount() > 0 });

		let closeFolder = this.createMenuItem(nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"), 'workbench.action.closeFolder');
		let closeEditor = this.createMenuItem(nls.localize({ key: 'miCloseEditor', comment: ['&& denotes a mnemonic'] }, "Close &&Editor"), 'workbench.action.closeActiveEditor');

		let exit = this.createMenuItem(nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit"), () => this.quit());

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
			!platform.isMacintosh ? preferences : null,
			!platform.isMacintosh ? __separator__() : null,
			revertFile,
			closeEditor,
			closeFolder,
			!platform.isMacintosh ? closeWindow : null,
			!platform.isMacintosh ? __separator__() : null,
			!platform.isMacintosh ? exit : null
		]).forEach((item) => fileMenu.append(item));
	}

	private getPreferencesMenu(): Electron.MenuItem {
		let userSettings = this.createMenuItem(nls.localize({ key: 'miOpenSettings', comment: ['&& denotes a mnemonic'] }, "&&User Settings"), 'workbench.action.openGlobalSettings');
		let workspaceSettings = this.createMenuItem(nls.localize({ key: 'miOpenWorkspaceSettings', comment: ['&& denotes a mnemonic'] }, "&&Workspace Settings"), 'workbench.action.openWorkspaceSettings');
		let kebindingSettings = this.createMenuItem(nls.localize({ key: 'miOpenKeymap', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts"), 'workbench.action.openGlobalKeybindings');
		let snippetsSettings = this.createMenuItem(nls.localize({ key: 'miOpenSnippets', comment: ['&& denotes a mnemonic'] }, "User &&Snippets"), 'workbench.action.openSnippets');
		let themeSelection = this.createMenuItem(nls.localize({ key: 'miSelectTheme', comment: ['&& denotes a mnemonic'] }, "&&Color Theme"), 'workbench.action.selectTheme');
		let preferencesMenu = new Menu();
		preferencesMenu.append(userSettings);
		preferencesMenu.append(workspaceSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(kebindingSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(snippetsSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(themeSelection);

		return new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences")), submenu: preferencesMenu });
	}

	private quit(): void {

		// If the user selected to exit from an extension development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		let vscodeWindow = this.windowsManager.getFocusedWindow();
		if (vscodeWindow && vscodeWindow.isPluginDevelopmentHost && this.windowsManager.getWindowCount() > 1) {
			vscodeWindow.win.close();
		}

		// Otherwise: normal quit
		else {
			setTimeout(() => {
				this.isQuitting = true;

				app.quit();
			}, 10 /* delay this because there is an issue with quitting while the menu is open */);
		}
	}

	private setOpenRecentMenu(openRecentMenu: Electron.Menu): void {
		openRecentMenu.append(this.createMenuItem(nls.localize({ key: 'miReopenClosedFile', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed File"), 'workbench.files.action.reopenClosedFile'));

		let recentList = this.getOpenedPathsList();

		// Folders
		if (recentList.folders.length > 0) {
			openRecentMenu.append(__separator__());
			recentList.folders.forEach((folder, index) => {
				if (index < VSCodeMenu.MAX_RECENT_ENTRIES) {
					openRecentMenu.append(this.createOpenRecentMenuItem(folder));
				}
			});
		}

		// Files
		let files = recentList.files;
		if (platform.isMacintosh && recentList.files.length > 0) {
			files = recentList.files.filter(f => recentList.folders.indexOf(f) < 0); // TODO@Ben migration (remove in the future)
		}

		if (files.length > 0) {
			openRecentMenu.append(__separator__());

			files.forEach((file, index) => {
				if (index < VSCodeMenu.MAX_RECENT_ENTRIES) {
					openRecentMenu.append(this.createOpenRecentMenuItem(file));
				}
			});
		}

		if (recentList.folders.length || files.length) {
			openRecentMenu.append(__separator__());
			openRecentMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miClearItems', comment: ['&& denotes a mnemonic'] }, "&&Clear Items")), click: () => this.clearOpenedPathsList() }));
		}
	}

	private createOpenRecentMenuItem(path: string): Electron.MenuItem {
		return new MenuItem({
			label: path, click: () => {
				let success = !!this.windowsManager.open({ cli: this.envService.cliArgs, pathsToOpen: [path] });
				if (!success) {
					this.removeFromOpenedPathsList(path);
					this.updateMenu();
				}
			}
		});
	}

	private createRoleMenuItem(label: string, actionId: string, role: string): Electron.MenuItem {
		let options: Electron.MenuItemOptions = {
			label: mnemonicLabel(label),
			accelerator: this.getAccelerator(actionId),
			role: role,
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
		let selectAll: Electron.MenuItem;

		if (platform.isMacintosh) {
			undo = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"), 'undo', (devTools) => devTools.undo());
			redo = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"), 'redo', (devTools) => devTools.redo());
			cut = this.createRoleMenuItem(nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "&&Cut"), 'editor.action.clipboardCutAction', 'cut');
			copy = this.createRoleMenuItem(nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "C&&opy"), 'editor.action.clipboardCopyAction', 'copy');
			paste = this.createRoleMenuItem(nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"), 'editor.action.clipboardPasteAction', 'paste');
			selectAll = this.createDevToolsAwareMenuItem(nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"), 'editor.action.selectAll', (devTools) => devTools.selectAll());
		} else {
			undo = this.createMenuItem(nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"), 'undo');
			redo = this.createMenuItem(nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"), 'redo');
			cut = this.createMenuItem(nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "&&Cut"), 'editor.action.clipboardCutAction');
			copy = this.createMenuItem(nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "C&&opy"), 'editor.action.clipboardCopyAction');
			paste = this.createMenuItem(nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"), 'editor.action.clipboardPasteAction');
			selectAll = this.createMenuItem(nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"), 'editor.action.selectAll');
		}

		let find = this.createMenuItem(nls.localize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find"), 'actions.find');
		let replace = this.createMenuItem(nls.localize({ key: 'miReplace', comment: ['&& denotes a mnemonic'] }, "&&Replace"), 'editor.action.startFindReplaceAction');
		let findInFiles = this.createMenuItem(nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files"), 'workbench.view.search');

		[
			undo,
			redo,
			__separator__(),
			cut,
			copy,
			paste,
			selectAll,
			__separator__(),
			find,
			replace,
			__separator__(),
			findInFiles
		].forEach((item) => winLinuxEditMenu.append(item));
	}

	private setViewMenu(viewMenu: Electron.Menu): void {
		let explorer = this.createMenuItem(nls.localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer"), 'workbench.view.explorer');
		let search = this.createMenuItem(nls.localize({ key: 'miViewSearch', comment: ['&& denotes a mnemonic'] }, "&&Search"), 'workbench.view.search');
		let git = this.createMenuItem(nls.localize({ key: 'miViewGit', comment: ['&& denotes a mnemonic'] }, "&&Git"), 'workbench.view.git');
		let debug = this.createMenuItem(nls.localize({ key: 'miViewDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug"), 'workbench.view.debug');

		let commands = this.createMenuItem(nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette..."), 'workbench.action.showCommands');
		let markers = this.createMenuItem(nls.localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Errors and Warnings..."), 'workbench.action.showErrorsWarnings');

		let output = this.createMenuItem(nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "Toggle &&Output"), 'workbench.action.output.toggleOutput');
		let debugConsole = this.createMenuItem(nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "Toggle De&&bug Console"), 'workbench.debug.action.toggleRepl');

		let fullscreen = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")), accelerator: this.getAccelerator('workbench.action.toggleFullScreen'), click: () => this.windowsManager.getLastActiveWindow().toggleFullScreen(), enabled: this.windowsManager.getWindowCount() > 0 });
		let toggleMenuBar = this.createMenuItem(nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar"), 'workbench.action.toggleMenuBar');
		let splitEditor = this.createMenuItem(nls.localize({ key: 'miSplitEditor', comment: ['&& denotes a mnemonic'] }, "Split &&Editor"), 'workbench.action.splitEditor');
		let toggleSidebar = this.createMenuItem(nls.localize({ key: 'miToggleSidebar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Side Bar"), 'workbench.action.toggleSidebarVisibility');
		let moveSidebar = this.createMenuItem(nls.localize({ key: 'miMoveSidebar', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar"), 'workbench.action.toggleSidebarPosition');
		let togglePanel = this.createMenuItem(nls.localize({ key: 'miTogglePanel', comment: ['&& denotes a mnemonic'] }, "Toggle &&Panel"), 'workbench.action.togglePanel');

		const toggleWordWrap = this.createMenuItem(nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Word Wrap"), 'editor.action.toggleWordWrap');
		const toggleRenderWhitespace = this.createMenuItem(nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace"), 'editor.action.toggleRenderWhitespace');


		let zoomIn = this.createMenuItem(nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom in"), 'workbench.action.zoomIn');
		let zoomOut = this.createMenuItem(nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "Zoom o&&ut"), 'workbench.action.zoomOut');

		arrays.coalesce([
			explorer,
			search,
			git,
			debug,
			__separator__(),
			commands,
			markers,
			__separator__(),
			output,
			debugConsole,
			__separator__(),
			fullscreen,
			platform.isWindows ||  platform.isLinux ? toggleMenuBar : void 0,
			__separator__(),
			splitEditor,
			toggleSidebar,
			moveSidebar,
			togglePanel,
			__separator__(),
			toggleWordWrap,
			toggleRenderWhitespace,
			__separator__(),
			zoomIn,
			zoomOut
		]).forEach((item) => viewMenu.append(item));
	}

	private setGotoMenu(gotoMenu: Electron.Menu): void {
		let back = this.createMenuItem(nls.localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back"), 'workbench.action.navigateBack');
		let forward = this.createMenuItem(nls.localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward"), 'workbench.action.navigateForward');
		let navigateHistory = this.createMenuItem(nls.localize({ key: 'miNavigateHistory', comment: ['&& denotes a mnemonic'] }, "&&Navigate History"), 'workbench.action.openPreviousEditor');
		let gotoFile = this.createMenuItem(nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File..."), 'workbench.action.quickOpen');
		let gotoSymbol = this.createMenuItem(nls.localize({ key: 'miGotoSymbol', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol..."), 'workbench.action.gotoSymbol');
		let gotoDefinition = this.createMenuItem(nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"), 'editor.action.goToDeclaration');
		let gotoLine = this.createMenuItem(nls.localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line..."), 'workbench.action.gotoLine');

		[
			back,
			forward,
			__separator__(),
			navigateHistory,
			__separator__(),
			gotoFile,
			gotoSymbol,
			gotoDefinition,
			gotoLine
		].forEach((item) => gotoMenu.append(item));
	}

	private setMacWindowMenu(macWindowMenu: Electron.Menu): void {
		let minimize = new MenuItem({ label: nls.localize('mMinimize', "Minimize"), role: 'minimize', accelerator: 'Command+M', enabled: this.windowsManager.getWindowCount() > 0 });
		let close = new MenuItem({ label: nls.localize('mClose', "Close"), role: 'close', accelerator: 'Command+W', enabled: this.windowsManager.getWindowCount() > 0 });
		let bringAllToFront = new MenuItem({ label: nls.localize('mBringToFront', "Bring All to Front"), role: 'front', enabled: this.windowsManager.getWindowCount() > 0 });

		[
			minimize,
			close,
			__separator__(),
			bringAllToFront
		].forEach((item) => macWindowMenu.append(item));
	}

	private toggleDevTools(): void {
		let w = this.windowsManager.getFocusedWindow();
		if (w && w.win) {
			w.win.webContents.toggleDevTools();
		}
	}

	private setHelpMenu(helpMenu: Electron.Menu): void {
		let toggleDevToolsItem = new MenuItem({
			label: mnemonicLabel(nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")),
			accelerator: this.getAccelerator('workbench.action.toggleDevTools'),
			click: () => this.toggleDevTools(),
			enabled: (this.windowsManager.getWindowCount() > 0)
		});

		arrays.coalesce([
			this.envService.product.documentationUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")), click: () => this.openUrl(this.envService.product.documentationUrl, 'openDocumentationUrl') }) : null,
			this.envService.product.releaseNotesUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")), click: () => this.openUrl(this.envService.product.releaseNotesUrl, 'openReleaseNotesUrl') }) : null,
			(this.envService.product.documentationUrl || this.envService.product.releaseNotesUrl) ? __separator__() : null,
			this.envService.product.twitterUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")), click: () => this.openUrl(this.envService.product.twitterUrl, 'openTwitterUrl') }) : null,
			this.envService.product.requestFeatureUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Request Features")), click: () => this.openUrl(this.envService.product.requestFeatureUrl, 'openUserVoiceUrl') }) : null,
			this.envService.product.reportIssueUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miReportIssues', comment: ['&& denotes a mnemonic'] }, "Report &&Issues")), click: () => this.openUrl(this.envService.product.reportIssueUrl, 'openReportIssues') }) : null,
			(this.envService.product.twitterUrl || this.envService.product.requestFeatureUrl || this.envService.product.reportIssueUrl) ? __separator__() : null,
			this.envService.product.licenseUrl ? new MenuItem({
				label: mnemonicLabel(nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "&&View License")), click: () => {
					if (platform.language) {
						let queryArgChar = this.envService.product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${this.envService.product.licenseUrl}${queryArgChar}lang=${platform.language}`, 'openLicenseUrl');
					} else {
						this.openUrl(this.envService.product.licenseUrl, 'openLicenseUrl');
					}
				}
			}) : null,
			this.envService.product.privacyStatementUrl ? new MenuItem({
				label: mnemonicLabel(nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "&&Privacy Statement")), click: () => {
					if (platform.language) {
						let queryArgChar = this.envService.product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
						this.openUrl(`${this.envService.product.privacyStatementUrl}${queryArgChar}lang=${platform.language}`, 'openPrivacyStatement');
					} else {
						this.openUrl(this.envService.product.privacyStatementUrl, 'openPrivacyStatement');
					}
				}
			}) : null,
			(this.envService.product.licenseUrl || this.envService.product.privacyStatementUrl) ? __separator__() : null,
			toggleDevToolsItem,
		]).forEach((item) => helpMenu.append(item));

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
		switch (this.updateManager.state) {
			case UpdateState.Uninitialized:
				return [];

			case UpdateState.UpdateDownloaded:
				let update = this.updateManager.availableUpdate;
				return [new MenuItem({
					label: nls.localize('miRestartToUpdate', "Restart To Update..."), click: () => {
						this.reportMenuActionTelemetry('RestartToUpdate');
						update.quitAndUpdate();
					}
				})];

			case UpdateState.CheckingForUpdate:
				return [new MenuItem({ label: nls.localize('miCheckingForUpdates', "Checking For Updates..."), enabled: false })];

			case UpdateState.UpdateAvailable:
				if (platform.isLinux) {
					const update = this.updateManager.availableUpdate;
					return [new MenuItem({
						label: nls.localize('miDownloadUpdate', "Download Available Update"), click: () => {
							update.quitAndUpdate();
						}
					})];
				}

				let updateAvailableLabel = platform.isWindows
					? nls.localize('miDownloadingUpdate', "Downloading Update...")
					: nls.localize('miInstallingUpdate', "Installing Update...");

				return [new MenuItem({ label: updateAvailableLabel, enabled: false })];

			default:
				let result = [new MenuItem({
					label: nls.localize('miCheckForUpdates', "Check For Updates..."), click: () => setTimeout(() => {
						this.reportMenuActionTelemetry('CheckForUpdate');
						this.updateManager.checkForUpdates(true);
					}, 0)
				})];

				if (this.updateManager.lastCheckDate) {
					result.push(new MenuItem({ label: nls.localize('miLastCheckedAt', "Last checked at {0}", this.updateManager.lastCheckDate.toLocaleTimeString()), enabled: false }));
				}

				return result;
		}
	}

	private createMenuItem(label: string, actionId: string, enabled?: boolean): Electron.MenuItem;
	private createMenuItem(label: string, click: () => void, enabled?: boolean): Electron.MenuItem;
	private createMenuItem(arg1: string, arg2: any, arg3?: boolean): Electron.MenuItem {
		let label = mnemonicLabel(arg1);
		let click: () => void = (typeof arg2 === 'function') ? arg2 : () => this.windowsManager.sendToFocused('vscode:runAction', arg2);
		let enabled = typeof arg3 === 'boolean' ? arg3 : this.windowsManager.getWindowCount() > 0;

		let actionId: string;
		if (typeof arg2 === 'string') {
			actionId = arg2;
		}

		let options: Electron.MenuItemOptions = {
			label: label,
			accelerator: this.getAccelerator(actionId),
			click: click,
			enabled: enabled
		};

		return new MenuItem(options);
	}

	private createDevToolsAwareMenuItem(label: string, actionId: string, devToolsFocusedFn: (contents: Electron.WebContents) => void): Electron.MenuItem {
		return new MenuItem({
			label: mnemonicLabel(label),
			accelerator: this.getAccelerator(actionId),
			enabled: this.windowsManager.getWindowCount() > 0,
			click: () => {
				let windowInFocus = this.windowsManager.getFocusedWindow();
				if (!windowInFocus) {
					return;
				}

				if (windowInFocus.win.isDevToolsFocused()) {
					devToolsFocusedFn(windowInFocus.win.devToolsWebContents);
				} else {
					this.windowsManager.sendToFocused('vscode:runAction', actionId);
				}
			}
		});
	}

	private getAccelerator(actionId: string): string {
		if (actionId) {
			let resolvedKeybinding = this.mapResolvedKeybindingToActionId[actionId];
			if (resolvedKeybinding) {
				return resolvedKeybinding; // keybinding is fully resolved
			}

			if (!this.keybindingsResolved) {
				this.actionIdKeybindingRequests.push(actionId); // keybinding needs to be resolved
			}

			let lastKnownKeybinding = this.mapLastKnownKeybindingToActionId[actionId];

			return lastKnownKeybinding; // return the last known keybining (chance of mismatch is very low unless it changed)
		}

		return void (0);
	}

	private openAboutDialog(): void {
		let lastActiveWindow = this.windowsManager.getFocusedWindow() || this.windowsManager.getLastActiveWindow();

		dialog.showMessageBox(lastActiveWindow && lastActiveWindow.win, {
			title: this.envService.product.nameLong,
			type: 'info',
			message: this.envService.product.nameLong,
			detail: nls.localize('aboutDetail',
				"\nVersion {0}\nCommit {1}\nDate {2}\nShell {3}\nRenderer {4}\nNode {5}",
				app.getVersion(),
				this.envService.product.commit || 'Unknown',
				this.envService.product.date || 'Unknown',
				process.versions['electron'],
				process.versions['chrome'],
				process.versions['node']
			),
			buttons: [nls.localize('okButton', "OK")],
			noLink: true
		}, (result) => null);

		this.reportMenuActionTelemetry('showAboutDialog');
	}

	private openUrl(url: string, id: string): void {
		shell.openExternal(url);
		this.reportMenuActionTelemetry(id);
	}

	private reportMenuActionTelemetry(id: string): void {
		this.windowsManager.sendToFocused('vscode:telemetry', { eventName: 'workbenchActionExecuted', data: { id, from: 'menu' } });
	}
}

function __separator__(): Electron.MenuItem {
	return new MenuItem({ type: 'separator' });
}

function mnemonicLabel(label: string): string {
	if (platform.isMacintosh) {
		return label.replace(/&&/g, ''); // no mnemonic support on mac
	}

	return label.replace(/&&/g, '&');
}
