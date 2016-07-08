/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as arrays from 'vs/base/common/arrays';
import * as env from 'vs/code/electron-main/env';
import { ipcMain as ipc, app, shell, dialog, Menu, MenuItem } from 'electron';
import { IWindowsService, WindowsManager, IOpenedPathsList } from 'vs/code/electron-main/windows';
import { IPath, VSCodeWindow } from 'vs/code/electron-main/window';
import { IStorageService } from 'vs/code/electron-main/storage';
import { IUpdateService, State as UpdateState } from 'vs/code/electron-main/update-manager';
import { Keybinding } from 'vs/base/common/keyCodes';
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';

export function generateNewIssueUrl(baseUrl: string, name: string, version: string, commit: string, date: string): string {
	const osVersion = `${ os.type() } ${ os.arch() } ${ os.release() }`;
	const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
	const body = encodeURIComponent(
`- VSCode Version: ${name} ${version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})
- OS Version: ${osVersion}

Steps to Reproduce:

1.
2.`
	);

	return `${ baseUrl }${queryStringPrefix}body=${body}`;
}

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
		@IUpdateService private updateService: IUpdateService,
		@IWindowsService private windowsService: IWindowsService,
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

		// Listen to "open" & "close" event from window service
		this.windowsService.onOpen((paths) => this.onOpen(paths));
		this.windowsService.onClose(_ => this.onClose(this.windowsService.getWindowCount()));

		// Resolve keybindings when any first workbench is loaded
		this.windowsService.onReady((win) => this.resolveKeybindings(win));

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

		// Listen to update service
		this.updateService.on('change', () => this.updateMenu());
	}

	private resolveKeybindings(win: VSCodeWindow): void {
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

	private onOpen(path: IPath): void {
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
		let gotoMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")), submenu: gotoMenu });
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
			dockMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window")), click: () => this.windowsService.openNewWindow() }));

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
		let hasNoWindows = (this.windowsService.getWindowCount() === 0);

		let newFile: Electron.MenuItem;
		if (hasNoWindows) {
			newFile = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")), accelerator: this.getAccelerator('workbench.action.files.newUntitledFile'), click: () => this.windowsService.openNewWindow() });
		} else {
			newFile = this.createMenuItem(nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File"), 'workbench.action.files.newUntitledFile');
		}

		let open = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")), accelerator: this.getAccelerator('workbench.action.files.openFileFolder'), click: () => this.windowsService.openFileFolderPicker() });
		let openFolder = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")), accelerator: this.getAccelerator('workbench.action.files.openFolder'), click: () => this.windowsService.openFolderPicker() });

		let openFile: Electron.MenuItem;
		if (hasNoWindows) {
			openFile = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")), accelerator: this.getAccelerator('workbench.action.files.openFile'), click: () => this.windowsService.openFilePicker() });
		} else {
			openFile = this.createMenuItem(nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File..."), 'workbench.action.files.openFile');
		}

		let openRecentMenu = new Menu();
		this.setOpenRecentMenu(openRecentMenu);
		let openRecent = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent")), submenu: openRecentMenu, enabled: openRecentMenu.items.length > 0 });

		let saveFile = this.createMenuItem(nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"), 'workbench.action.files.save', this.windowsService.getWindowCount() > 0);
		let saveFileAs = this.createMenuItem(nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."), 'workbench.action.files.saveAs', this.windowsService.getWindowCount() > 0);
		let saveAllFiles = this.createMenuItem(nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll"), 'workbench.action.files.saveAll', this.windowsService.getWindowCount() > 0);

		let preferences = this.getPreferencesMenu();

		let newWindow = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window")), accelerator: this.getAccelerator('workbench.action.newWindow'), click: () => this.windowsService.openNewWindow() });
		let revertFile = this.createMenuItem(nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Revert F&&ile"), 'workbench.action.files.revert', this.windowsService.getWindowCount() > 0);
		let closeWindow = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Close &&Window")), accelerator: this.getAccelerator('workbench.action.closeWindow'), click: () => this.windowsService.getLastActiveWindow().win.close(), enabled: this.windowsService.getWindowCount() > 0 });

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
		let vscodeWindow = this.windowsService.getFocusedWindow();
		if (vscodeWindow && vscodeWindow.isPluginDevelopmentHost && this.windowsService.getWindowCount() > 1) {
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
		openRecentMenu.append(this.createMenuItem(nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"), 'workbench.action.reopenClosedEditor'));

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
				let success = !!this.windowsService.open({ cli: this.envService.cliArgs, pathsToOpen: [path] });
				if (!success) {
					this.removeFromOpenedPathsList(path);
					this.updateMenu();
				}
			}
		});
	}

	private createRoleMenuItem(label: string, actionId: string, role: Electron.MenuItemRole): Electron.MenuItem {
		let options: Electron.MenuItemOptions = {
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
		let replaceInFiles = this.createMenuItem(nls.localize({ key: 'miReplaceInFiles', comment: ['&& denotes a mnemonic'] }, "Replace &&in Files"), 'workbench.action.replaceInFiles');

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
			findInFiles,
			replaceInFiles
		].forEach(item => winLinuxEditMenu.append(item));
	}

	private setViewMenu(viewMenu: Electron.Menu): void {
		let explorer = this.createMenuItem(nls.localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer"), 'workbench.view.explorer');
		let search = this.createMenuItem(nls.localize({ key: 'miViewSearch', comment: ['&& denotes a mnemonic'] }, "&&Search"), 'workbench.view.search');
		let git = this.createMenuItem(nls.localize({ key: 'miViewGit', comment: ['&& denotes a mnemonic'] }, "&&Git"), 'workbench.view.git');
		let debug = this.createMenuItem(nls.localize({ key: 'miViewDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug"), 'workbench.view.debug');
		let extensions = this.createMenuItem(nls.localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions"), 'workbench.view.extensions');
		let output = this.createMenuItem(nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output"), 'workbench.action.output.toggleOutput');
		let debugConsole = this.createMenuItem(nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console"), 'workbench.debug.action.toggleRepl');
		let integratedTerminal = this.createMenuItem(nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Integrated Terminal"), 'workbench.action.terminal.toggleTerminal');
		let problems = this.createMenuItem(nls.localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems"), 'workbench.actions.view.problems');

		let commands = this.createMenuItem(nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette..."), 'workbench.action.showCommands');

		let fullscreen = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")), accelerator: this.getAccelerator('workbench.action.toggleFullScreen'), click: () => this.windowsService.getLastActiveWindow().toggleFullScreen(), enabled: this.windowsService.getWindowCount() > 0 });
		let toggleMenuBar = this.createMenuItem(nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar"), 'workbench.action.toggleMenuBar');
		let splitEditor = this.createMenuItem(nls.localize({ key: 'miSplitEditor', comment: ['&& denotes a mnemonic'] }, "Split &&Editor"), 'workbench.action.splitEditor');
		let toggleSidebar = this.createMenuItem(nls.localize({ key: 'miToggleSidebar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Side Bar"), 'workbench.action.toggleSidebarVisibility');
		let moveSidebar = this.createMenuItem(nls.localize({ key: 'miMoveSidebar', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar"), 'workbench.action.toggleSidebarPosition');
		let togglePanel = this.createMenuItem(nls.localize({ key: 'miTogglePanel', comment: ['&& denotes a mnemonic'] }, "Toggle &&Panel"), 'workbench.action.togglePanel');
		let toggleStatusbar = this.createMenuItem(nls.localize({ key: 'miToggleStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Status Bar"), 'workbench.action.toggleStatusbarVisibility');

		const toggleWordWrap = this.createMenuItem(nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Word Wrap"), 'editor.action.toggleWordWrap');
		const toggleRenderWhitespace = this.createMenuItem(nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace"), 'editor.action.toggleRenderWhitespace');
		const toggleRenderControlCharacters = this.createMenuItem(nls.localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Toggle &&Control Characters"), 'editor.action.toggleRenderControlCharacter');


		let zoomIn = this.createMenuItem(nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"), 'workbench.action.zoomIn');
		let zoomOut = this.createMenuItem(nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "Zoom O&&ut"), 'workbench.action.zoomOut');
		let resetZoom = this.createMenuItem(nls.localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom"), 'workbench.action.zoomReset');

		arrays.coalesce([
			explorer,
			search,
			git,
			debug,
			extensions,
			__separator__(),
			output,
			problems,
			debugConsole,
			integratedTerminal,
			__separator__(),
			commands,
			__separator__(),
			fullscreen,
			platform.isWindows || platform.isLinux ? toggleMenuBar : void 0,
			__separator__(),
			splitEditor,
			moveSidebar,
			toggleSidebar,
			togglePanel,
			toggleStatusbar,
			__separator__(),
			toggleWordWrap,
			toggleRenderWhitespace,
			toggleRenderControlCharacters,
			__separator__(),
			zoomIn,
			zoomOut,
			resetZoom
		]).forEach((item) => viewMenu.append(item));
	}

	private setGotoMenu(gotoMenu: Electron.Menu): void {
		let back = this.createMenuItem(nls.localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back"), 'workbench.action.navigateBack');
		let forward = this.createMenuItem(nls.localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward"), 'workbench.action.navigateForward');

		let switchEditorMenu = new Menu();

		let nextEditor = this.createMenuItem(nls.localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor"), 'workbench.action.nextEditor');
		let previousEditor = this.createMenuItem(nls.localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor"), 'workbench.action.previousEditor');
		let nextEditorInGroup = this.createMenuItem(nls.localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group"), 'workbench.action.openNextRecentlyUsedEditorInGroup');
		let previousEditorInGroup = this.createMenuItem(nls.localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group"), 'workbench.action.openPreviousRecentlyUsedEditorInGroup');

		[
			nextEditor,
			previousEditor,
			__separator__(),
			nextEditorInGroup,
			previousEditorInGroup
		].forEach(item => switchEditorMenu.append(item));

		let switchEditor = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor")), submenu: switchEditorMenu, enabled: true });

		let switchGroupMenu = new Menu();

		let focusFirstGroup = this.createMenuItem(nls.localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "&&Left Group"), 'workbench.action.focusFirstEditorGroup');
		let focusSecondGroup = this.createMenuItem(nls.localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "&&Side Group"), 'workbench.action.focusSecondEditorGroup');
		let focusThirdGroup = this.createMenuItem(nls.localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "&&Right Group"), 'workbench.action.focusThirdEditorGroup');
		let nextGroup = this.createMenuItem(nls.localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group"), 'workbench.action.focusNextGroup');
		let previousGroup = this.createMenuItem(nls.localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group"), 'workbench.action.focusPreviousGroup');

		[
			focusFirstGroup,
			focusSecondGroup,
			focusThirdGroup,
			__separator__(),
			nextGroup,
			previousGroup
		].forEach(item => switchGroupMenu.append(item));

		let switchGroup = new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group")), submenu: switchGroupMenu, enabled: true });

		let gotoFile = this.createMenuItem(nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File..."), 'workbench.action.quickOpen');
		let gotoSymbol = this.createMenuItem(nls.localize({ key: 'miGotoSymbol', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol..."), 'workbench.action.gotoSymbol');
		let gotoDefinition = this.createMenuItem(nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"), 'editor.action.goToDeclaration');
		let gotoLine = this.createMenuItem(nls.localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line..."), 'workbench.action.gotoLine');

		[
			back,
			forward,
			__separator__(),
			switchEditor,
			switchGroup,
			__separator__(),
			gotoFile,
			gotoSymbol,
			gotoDefinition,
			gotoLine
		].forEach(item => gotoMenu.append(item));
	}

	private setMacWindowMenu(macWindowMenu: Electron.Menu): void {
		let minimize = new MenuItem({ label: nls.localize('mMinimize', "Minimize"), role: 'minimize', accelerator: 'Command+M', enabled: this.windowsService.getWindowCount() > 0 });
		let close = new MenuItem({ label: nls.localize('mClose', "Close"), role: 'close', accelerator: 'Command+W', enabled: this.windowsService.getWindowCount() > 0 });
		let bringAllToFront = new MenuItem({ label: nls.localize('mBringToFront', "Bring All to Front"), role: 'front', enabled: this.windowsService.getWindowCount() > 0 });

		[
			minimize,
			close,
			__separator__(),
			bringAllToFront
		].forEach(item => macWindowMenu.append(item));
	}

	private toggleDevTools(): void {
		let w = this.windowsService.getFocusedWindow();
		if (w && w.win) {
			w.win.webContents.toggleDevTools();
		}
	}

	private setHelpMenu(helpMenu: Electron.Menu): void {
		let toggleDevToolsItem = new MenuItem({
			label: mnemonicLabel(nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")),
			accelerator: this.getAccelerator('workbench.action.toggleDevTools'),
			click: () => this.toggleDevTools(),
			enabled: (this.windowsService.getWindowCount() > 0)
		});

		const issueUrl = generateNewIssueUrl(product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date);

		arrays.coalesce([
			this.envService.product.documentationUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")), click: () => this.openUrl(this.envService.product.documentationUrl, 'openDocumentationUrl') }) : null,
			this.envService.product.releaseNotesUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")), click: () => this.openUrl(this.envService.product.releaseNotesUrl, 'openReleaseNotesUrl') }) : null,
			(this.envService.product.documentationUrl || this.envService.product.releaseNotesUrl) ? __separator__() : null,
			this.envService.product.twitterUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")), click: () => this.openUrl(this.envService.product.twitterUrl, 'openTwitterUrl') }) : null,
			this.envService.product.requestFeatureUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Request Features")), click: () => this.openUrl(this.envService.product.requestFeatureUrl, 'openUserVoiceUrl') }) : null,
			this.envService.product.reportIssueUrl ? new MenuItem({ label: mnemonicLabel(nls.localize({ key: 'miReportIssues', comment: ['&& denotes a mnemonic'] }, "Report &&Issues")), click: () => this.openUrl(issueUrl, 'openReportIssues') }) : null,
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
		switch (this.updateService.state) {
			case UpdateState.Uninitialized:
				return [];

			case UpdateState.UpdateDownloaded:
				let update = this.updateService.availableUpdate;
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
					const update = this.updateService.availableUpdate;
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
						this.updateService.checkForUpdates(true);
					}, 0)
				})];

				if (this.updateService.lastCheckDate) {
					result.push(new MenuItem({ label: nls.localize('miLastCheckedAt', "Last checked at {0}", this.updateService.lastCheckDate.toLocaleTimeString()), enabled: false }));
				}

				return result;
		}
	}

	private createMenuItem(label: string, actionId: string, enabled?: boolean): Electron.MenuItem;
	private createMenuItem(label: string, click: () => void, enabled?: boolean): Electron.MenuItem;
	private createMenuItem(arg1: string, arg2: any, arg3?: boolean): Electron.MenuItem {
		let label = mnemonicLabel(arg1);
		let click: () => void = (typeof arg2 === 'function') ? arg2 : () => this.windowsService.sendToFocused('vscode:runAction', arg2);
		let enabled = typeof arg3 === 'boolean' ? arg3 : this.windowsService.getWindowCount() > 0;

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
			enabled: this.windowsService.getWindowCount() > 0,
			click: () => {
				let windowInFocus = this.windowsService.getFocusedWindow();
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
		let lastActiveWindow = this.windowsService.getFocusedWindow() || this.windowsService.getLastActiveWindow();

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
		this.windowsService.sendToFocused('vscode:telemetry', { eventName: 'workbenchActionExecuted', data: { id, from: 'menu' } });
	}
}

function __separator__(): Electron.MenuItem {
	return new MenuItem({ type: 'separator' });
}

function mnemonicLabel(label: string): string {
	if (platform.isMacintosh) {
		return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
	}

	return label.replace(/&&/g, '&');
}
