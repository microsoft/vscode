/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import {ipcMain as ipc, app, shell, dialog, Menu, MenuItem} from 'electron';

import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import arrays = require('vs/base/common/arrays');
import windows = require('vs/workbench/electron-main/windows');
import window = require('vs/workbench/electron-main/window');
import env = require('vs/workbench/electron-main/env');
import storage = require('vs/workbench/electron-main/storage');
import um = require('vs/workbench/electron-main/update-manager');
import {Keybinding} from 'vs/base/common/keyCodes';

let UpdateManager = um.Instance;

interface IResolvedKeybinding {
	id:string;
	binding:number;
}

export class VSCodeMenu {

	private static lastKnownKeybindingsMapStorageKey = 'lastKnownKeybindings';

	private static MAX_RECENT_ENTRIES = 10;

	private isQuitting:boolean;
	private appMenuInstalled: boolean;

	private actionIdKeybindingRequests: string[];
	private mapLastKnownKeybindingToActionId: { [id: string]: string; };
	private mapResolvedKeybindingToActionId: { [id: string]: string; };
	private keybindingsResolved: boolean;

	constructor() {
		this.actionIdKeybindingRequests = [];

		this.mapResolvedKeybindingToActionId = Object.create(null);
		this.mapLastKnownKeybindingToActionId = storage.getItem<{ [id: string]: string; }>(VSCodeMenu.lastKnownKeybindingsMapStorageKey) || Object.create(null);
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
		windows.onOpen((paths) => this.onOpen(paths));
		windows.onClose((remainingWindowCount) => this.onClose(remainingWindowCount));

		// Resolve keybindings when any first workbench is loaded
		windows.onReady((win) => this.resolveKeybindings(win));

		// Listen to resolved keybindings
		ipc.on('vscode:keybindingsResolved', (event, rawKeybindings) => {
			let keybindings:IResolvedKeybinding[] = [];
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
				storage.setItem(VSCodeMenu.lastKnownKeybindingsMapStorageKey, this.mapResolvedKeybindingToActionId); // keep to restore instantly after restart
				this.mapLastKnownKeybindingToActionId = this.mapResolvedKeybindingToActionId; // update our last known map

				this.updateMenu();
			}
		});

		// Listen to update manager
		UpdateManager.on('change',() => this.updateMenu());
	}

	private resolveKeybindings(win:window.VSCodeWindow): void {
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

	private onOpen(path:window.IPath): void {
		this.addToOpenedPathsList(path.filePath || path.workspacePath, !!path.filePath);
		this.updateMenu();
	}

	private onClose(remainingWindowCount:number): void {
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
			macApplicationMenuItem = new MenuItem({ label: env.product.nameShort, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
		}

		// File
		let fileMenu = new Menu();
		let fileMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mFile', "&&File")), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// Edit
		let editMenu = new Menu();
		let editMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mEdit', "&&Edit")), submenu: editMenu });
		this.setEditMenu(editMenu);

		// View
		let viewMenu = new Menu();
		let viewMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mView', "&&View")), submenu: viewMenu });
		this.setViewMenu(viewMenu);

		// Goto
		let gotoMenu = new Menu();
		let gotoMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mGoto', "&&Goto")), submenu: gotoMenu });
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
		let helpMenuItem = new MenuItem({ label: mnemonicLabel(nls.localize('mHelp', "&&Help")), submenu: helpMenu, role: 'help' });
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
			dockMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize('miNewWindow', "&&New Window")), click: () => windows.manager.openNewWindow() }));

			app.dock.setMenu(dockMenu);
		}
	}

	private addToOpenedPathsList(path?:string, isFile?:boolean): void {
		if (!path) {
			return;
		}

		let mru = this.getOpenedPathsList();
		if (isFile || platform.isMacintosh /* on mac we don't treat files any different from folders */) {
			mru.files.unshift(path);
			mru.files = arrays.distinct(mru.files, (f) => platform.isLinux ? f : f.toLowerCase());
		} else {
			mru.folders.unshift(path);
			mru.folders = arrays.distinct(mru.folders, (f) => platform.isLinux ? f : f.toLowerCase());
		}

		// Make sure its bounded
		mru.folders = mru.folders.slice(0, VSCodeMenu.MAX_RECENT_ENTRIES);
		mru.files = mru.files.slice(0, VSCodeMenu.MAX_RECENT_ENTRIES);

		storage.setItem(windows.WindowsManager.openedPathsListStorageKey, mru);
	}

	private removeFromOpenedPathsList(path:string): void {
		let mru = this.getOpenedPathsList();

		let index = mru.files.indexOf(path);
		if (index >= 0) {
			mru.files.splice(index, 1);
		}

		index = mru.folders.indexOf(path);
		if (index >= 0) {
			mru.folders.splice(index, 1);
		}

		storage.setItem(windows.WindowsManager.openedPathsListStorageKey, mru);
	}

	private clearOpenedPathsList(): void {
		storage.setItem(windows.WindowsManager.openedPathsListStorageKey, { folders: [], files: [] });
		app.clearRecentDocuments();

		this.updateMenu();
	}

	private getOpenedPathsList(): windows.IOpenedPathsList {
		let mru = storage.getItem<windows.IOpenedPathsList>(windows.WindowsManager.openedPathsListStorageKey);
		if (!mru) {
			mru = { folders: [], files: [] };
		}

		return mru;
	}

	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		let about = new MenuItem({ label: nls.localize('mAbout', "About {0}", env.product.nameLong), role: 'about' });
		let checkForUpdates = this.getUpdateMenuItems();
		let preferences = this.getPreferencesMenu();
		let hide = new MenuItem({ label: nls.localize('mHide', "Hide {0}", env.product.nameLong), role: 'hide', accelerator: 'Command+H' });
		let hideOthers = new MenuItem({ label: nls.localize('mHideOthers', "Hide Others"), role: 'hideothers', accelerator: 'Command+Alt+H' });
		let showAll = new MenuItem({ label: nls.localize('mShowAll', "Show All"), role: 'unhide' });
		let quit = new MenuItem({ label: nls.localize('miQuit', "Quit {0}", env.product.nameLong), click: () => this.quit(), accelerator: 'Command+Q' });

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
		let hasNoWindows = (windows.manager.getWindowCount() === 0);

		let newFile: Electron.MenuItem;
		if (hasNoWindows) {
			newFile = new MenuItem({ label: mnemonicLabel(nls.localize('miNewFile', "&&New File")), accelerator: this.getAccelerator('workbench.action.files.newUntitledFile'), click: () => windows.manager.openNewWindow() });
		} else {
			newFile = this.createMenuItem(nls.localize('miNewFile', "&&New File"), 'workbench.action.files.newUntitledFile');
		}

		let open = new MenuItem({ label: mnemonicLabel(nls.localize('miOpen', "&&Open...")), accelerator: this.getAccelerator('workbench.action.files.openFileFolder'), click: () => windows.manager.openFolderPicker() });
		let openFile = new MenuItem({ label: mnemonicLabel(nls.localize('miOpenFile', "&&Open File...")), accelerator: this.getAccelerator('workbench.action.files.openFile'), click: () => windows.manager.openFilePicker() });
		let openFolder = new MenuItem({ label: mnemonicLabel(nls.localize('miOpenFolder', "Open &&Folder...")), accelerator: this.getAccelerator('workbench.action.files.openFolder'), click: () => windows.manager.openFolderPicker() });

		let openRecentMenu = new Menu();
		this.setOpenRecentMenu(openRecentMenu);
		let openRecent = new MenuItem({ label: mnemonicLabel(nls.localize('miOpenRecent', "Open &&Recent")), submenu: openRecentMenu, enabled: openRecentMenu.items.length > 0 });

		let saveFile = this.createMenuItem(nls.localize('miSave', "&&Save"), 'workbench.action.files.save', windows.manager.getWindowCount() > 0);
		let saveFileAs = this.createMenuItem(nls.localize('miSaveAs', "Save As..."), 'workbench.action.files.saveAs', windows.manager.getWindowCount() > 0);
		let saveAllFiles = this.createMenuItem(nls.localize('miSaveAll', "Save &&All"), 'workbench.action.files.saveAll', windows.manager.getWindowCount() > 0);

		let preferences = this.getPreferencesMenu();

		let newWindow = new MenuItem({ label: mnemonicLabel(nls.localize('miNewWindow', "&&New Window")), accelerator: this.getAccelerator('workbench.action.newWindow'), click: () => windows.manager.openNewWindow() });
		let revertFile = this.createMenuItem(nls.localize('miRevert', "Revert File"), 'workbench.action.files.revert', windows.manager.getWindowCount() > 0);
		let closeWindow = new MenuItem({ label: mnemonicLabel(nls.localize('miCloseWindow', "Close &&Window")), accelerator: this.getAccelerator('workbench.action.closeWindow'), click: () => windows.manager.getLastActiveWindow().win.close(), enabled: windows.manager.getWindowCount() > 0 });

		let closeFolder = this.createMenuItem(nls.localize('miCloseFolder', "Close &&Folder"), 'workbench.action.closeFolder');
		let closeEditor = this.createMenuItem(nls.localize('miCloseEditor', "Close &&Editor"), 'workbench.action.closeActiveEditor');

		let exit = this.createMenuItem(nls.localize('miExit', "E&&xit"), () => this.quit());

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
		let userSettings = this.createMenuItem(nls.localize('miOpenSettings', "&&User Settings"), 'workbench.action.openGlobalSettings');
		let workspaceSettings = this.createMenuItem(nls.localize('miOpenWorkspaceSettings', "&&Workspace Settings"), 'workbench.action.openWorkspaceSettings');
		let kebindingSettings = this.createMenuItem(nls.localize('miOpenKeymap', "&&Keyboard Shortcuts"), 'workbench.action.openGlobalKeybindings');
		let snippetsSettings = this.createMenuItem(nls.localize('miOpenSnippets', "User &&Snippets"), 'workbench.action.openSnippets');
		let themeSelection = this.createMenuItem(nls.localize('miSelectTheme', "&&Color Theme"), 'workbench.action.selectTheme');
		let preferencesMenu = new Menu();
		preferencesMenu.append(userSettings);
		preferencesMenu.append(workspaceSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(kebindingSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(snippetsSettings);
		preferencesMenu.append(__separator__());
		preferencesMenu.append(themeSelection);

		return new MenuItem({ label: mnemonicLabel(nls.localize('miPreferences', "&&Preferences")), submenu: preferencesMenu });
	}

	private quit(): void {

		// If the user selected to exit from a plugin development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		let vscodeWindow = windows.manager.getFocusedWindow();
		if (vscodeWindow && vscodeWindow.isPluginDevelopmentHost && windows.manager.getWindowCount() > 1) {
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
		let recentList = this.getOpenedPathsList();

		// Folders
		recentList.folders.forEach((folder, index) => {
			if (index < VSCodeMenu.MAX_RECENT_ENTRIES) {
				openRecentMenu.append(this.createOpenRecentMenuItem(folder));
			}
		});

		// Files
		if (recentList.files.length > 0) {
			if (recentList.folders.length > 0) {
				openRecentMenu.append(__separator__());
			}

			recentList.files.forEach((file, index) => {
				if (index < VSCodeMenu.MAX_RECENT_ENTRIES) {
					openRecentMenu.append(this.createOpenRecentMenuItem(file));
				}
			});
		}

		if (recentList.folders.length || recentList.files.length) {
			openRecentMenu.append(__separator__());
			openRecentMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize('miClearItems', "&&Clear Items")), click: () => this.clearOpenedPathsList() }));
		}
	}

	private createOpenRecentMenuItem(path:string): Electron.MenuItem {
		return new MenuItem({ label: path, click: () => {
			let success = windows.manager.open({ cli: env.cliArgs, pathsToOpen: [path] });
			if (!success) {
				this.removeFromOpenedPathsList(path);
				this.updateMenu();
			}
		}});
	}

	private createRoleMenuItem(label:string, actionId:string, role:string): Electron.MenuItem {
		let options:Electron.MenuItemOptions = {
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
			undo = this.createDevToolsAwareMenuItem(nls.localize('miUndo', "&&Undo"), 'undo', (devTools) => devTools.undo());
			redo = this.createDevToolsAwareMenuItem(nls.localize('miRedo', "&&Redo"), 'redo', (devTools) => devTools.redo());
			cut = this.createRoleMenuItem(nls.localize('miCut', "&&Cut"), 'editor.action.clipboardCutAction', 'cut');
			copy = this.createRoleMenuItem(nls.localize('miCopy', "C&&opy"), 'editor.action.clipboardCopyAction', 'copy');
			paste = this.createRoleMenuItem(nls.localize('miPaste', "&&Paste"), 'editor.action.clipboardPasteAction', 'paste');
			selectAll = this.createDevToolsAwareMenuItem(nls.localize('miSelectAll', "&&Select All"), 'editor.action.selectAll', (devTools) => devTools.selectAll());
		} else {
			undo = this.createMenuItem(nls.localize('miUndo', "&&Undo"), 'undo');
			redo = this.createMenuItem(nls.localize('miRedo', "&&Redo"), 'redo');
			cut = this.createMenuItem(nls.localize('miCut', "&&Cut"), 'editor.action.clipboardCutAction');
			copy = this.createMenuItem(nls.localize('miCopy', "C&&opy"), 'editor.action.clipboardCopyAction');
			paste = this.createMenuItem(nls.localize('miPaste', "&&Paste"), 'editor.action.clipboardPasteAction');
			selectAll = this.createMenuItem(nls.localize('miSelectAll', "&&Select All"), 'editor.action.selectAll');
		}

		let find = this.createMenuItem(nls.localize('miFind', "&&Find"), 'actions.find');
		let replace = this.createMenuItem(nls.localize('miReplace', "&&Replace"), 'editor.action.startFindReplaceAction');
		let findInFiles = this.createMenuItem(nls.localize('miFindInFiles', "Find &&in Files"), 'workbench.view.search');

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
		let explorer = this.createMenuItem(nls.localize('miViewExplorer', "&&Explorer"), 'workbench.view.explorer');
		let search = this.createMenuItem(nls.localize('miViewSearch', "&&Search"), 'workbench.view.search');
		let git = this.createMenuItem(nls.localize('miViewGit', "&&Git"), 'workbench.view.git');
		let debug = this.createMenuItem(nls.localize('miViewDebug', "&&Debug"), 'workbench.view.debug');

		let commands = this.createMenuItem(nls.localize('miCommandPalette', "&&Command Palette..."), 'workbench.action.showCommands');
		let markers = this.createMenuItem(nls.localize('miMarker', "&&Errors and Warnings..."), 'workbench.action.showErrorsWarnings');

		let output = this.createMenuItem(nls.localize('miToggleOutput', "Toggle &&Output"), 'workbench.action.output.toggleOutput');
		let debugConsole = this.createMenuItem(nls.localize('miToggleDebugConsole', "Toggle De&&bug Console"), 'workbench.debug.action.toggleRepl');

		let fullscreen = new MenuItem({ label: mnemonicLabel(nls.localize('miToggleFullScreen', "Toggle &&Full Screen")), accelerator: this.getAccelerator('workbench.action.toggleFullScreen'), click: () => windows.manager.getLastActiveWindow().toggleFullScreen(), enabled: windows.manager.getWindowCount() > 0 });
		let toggleMenuBar = this.createMenuItem(nls.localize('miToggleMenuBar', "Toggle Menu &&Bar"), 'workbench.action.toggleMenuBar');
		let splitEditor = this.createMenuItem(nls.localize('miSplitEditor', "Split &&Editor"), 'workbench.action.splitEditor');
		let toggleSidebar = this.createMenuItem(nls.localize('miToggleSidebar', "&&Toggle Side Bar"), 'workbench.action.toggleSidebarVisibility');
		let moveSidebar = this.createMenuItem(nls.localize('miMoveSidebar', "&&Move Side Bar"), 'workbench.action.toggleSidebarPosition');
		let togglePanel = this.createMenuItem(nls.localize('miTogglePanel', "Toggle &&Panel"), 'workbench.action.togglePanel');

		let zoomIn = this.createMenuItem(nls.localize('miZoomIn', "&&Zoom in"), 'workbench.action.zoomIn');
		let zoomOut = this.createMenuItem(nls.localize('miZoomOut', "Zoom o&&ut"), 'workbench.action.zoomOut');

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
			platform.isWindows || platform.isLinux ? toggleMenuBar : void 0,
			__separator__(),
			splitEditor,
			toggleSidebar,
			moveSidebar,
			togglePanel,
			__separator__(),
			zoomIn,
			zoomOut
		]).forEach((item) => viewMenu.append(item));
	}

	private setGotoMenu(gotoMenu: Electron.Menu): void {
		let back = this.createMenuItem(nls.localize('miBack', "&&Back"), 'workbench.action.navigateBack');
		let forward = this.createMenuItem(nls.localize('miForward', "&&Forward"), 'workbench.action.navigateForward');
		let navigateHistory = this.createMenuItem(nls.localize('miNavigateHistory', "&&Navigate History"), 'workbench.action.openPreviousEditor');
		let gotoFile = this.createMenuItem(nls.localize('miGotoFile', "Go to &&File..."), 'workbench.action.quickOpen');
		let gotoSymbol = this.createMenuItem(nls.localize('miGotoSymbol', "Go to &&Symbol..."), 'workbench.action.gotoSymbol');
		let gotoDefinition = this.createMenuItem(nls.localize('miGotoDefinition', "Go to &&Definition"), 'editor.action.goToDeclaration');
		let gotoLine = this.createMenuItem(nls.localize('miGotoLine', "Go to &&Line..."), 'workbench.action.gotoLine');

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
		let minimize = new MenuItem({ label: nls.localize('mMinimize', "Minimize"), role: 'minimize', accelerator: 'Command+M', enabled: windows.manager.getWindowCount() > 0 });
		let close = new MenuItem({ label: nls.localize('mClose', "Close"), role: 'close', accelerator: 'Command+W', enabled: windows.manager.getWindowCount() > 0 });
		let bringAllToFront = new MenuItem({ label: nls.localize('mBringToFront', "Bring All to Front"), role: 'front', enabled: windows.manager.getWindowCount() > 0 });

		[
			minimize,
			close,
			__separator__(),
			bringAllToFront
		].forEach((item) => macWindowMenu.append(item));
	}

	private setHelpMenu(helpMenu: Electron.Menu): void {
		let toggleDevToolsItem = new MenuItem({
			label: mnemonicLabel(nls.localize('miToggleDevTools', "&&Toggle Developer Tools")),
			accelerator: this.getAccelerator('workbench.action.toggleDevTools'),
			click: toggleDevTools,
			enabled: (windows.manager.getWindowCount() > 0)
		});

		arrays.coalesce([
			env.product.documentationUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miDocumentation', "&&Documentation")), click: () => openUrl(env.product.documentationUrl, 'openDocumentationUrl') }) : null,
			env.product.releaseNotesUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miReleaseNotes', "&&Release Notes")), click: () => openUrl(env.product.releaseNotesUrl, 'openReleaseNotesUrl') }) : null,
			(env.product.documentationUrl || env.product.releaseNotesUrl) ? __separator__() : null,
			env.product.twitterUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miTwitter', "&&Join us on Twitter")), click: () => openUrl(env.product.twitterUrl, 'openTwitterUrl') }) : null,
			env.product.requestFeatureUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miUserVoice', "&&Request Features")), click: () => openUrl(env.product.requestFeatureUrl, 'openUserVoiceUrl') }) : null,
			env.product.reportIssueUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miReportIssues', "Report &&Issues")), click: () => openUrl(env.product.reportIssueUrl, 'openReportIssues') }) : null,
			(env.product.twitterUrl || env.product.requestFeatureUrl || env.product.reportIssueUrl) ? __separator__() : null,
			env.product.licenseUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miLicense', "&&View License")), click: () => openUrl(env.product.licenseUrl, 'openLicenseUrl') }) : null,
			env.product.privacyStatementUrl ? new MenuItem({ label: mnemonicLabel(nls.localize('miPrivacyStatement', "&&Privacy Statement")), click: () => openUrl(env.product.privacyStatementUrl, 'openPrivacyStatement') }) : null,
			(env.product.licenseUrl || env.product.privacyStatementUrl) ? __separator__() : null,
			toggleDevToolsItem,
		]).forEach((item) => helpMenu.append(item));

		if (!platform.isMacintosh) {
			const updateMenuItems = this.getUpdateMenuItems();
			if (updateMenuItems.length) {
				helpMenu.append(__separator__());
				updateMenuItems.forEach(i => helpMenu.append(i));
			}

			helpMenu.append(__separator__());
			helpMenu.append(new MenuItem({ label: mnemonicLabel(nls.localize('miAbout', "&&About")), click: openAboutDialog }));
		}
	}

	private getUpdateMenuItems(): Electron.MenuItem[]{
		switch (UpdateManager.state) {
			case um.State.Uninitialized:
				return [];

			case um.State.UpdateDownloaded:
				let update = UpdateManager.availableUpdate;
				return [new MenuItem({ label: nls.localize('miRestartToUpdate', "Restart To Update..."), click: () => {
					reportMenuActionTelemetry('RestartToUpdate');
					update.quitAndUpdate();
			}})];

			case um.State.CheckingForUpdate:
				return [new MenuItem({ label: nls.localize('miCheckingForUpdates', "Checking For Updates..."), enabled: false })];

			case um.State.UpdateAvailable:
				let updateAvailableLabel = platform.isWindows
					? nls.localize('miDownloadingUpdate', "Downloading Update...")
					: nls.localize('miInstallingUpdate', "Installing Update...");

				return [new MenuItem({ label: updateAvailableLabel, enabled: false })];

			default:
				let result = [new MenuItem({ label: nls.localize('miCheckForUpdates', "Check For Updates..."), click: () => setTimeout(() => {
					reportMenuActionTelemetry('CheckForUpdate');
					UpdateManager.checkForUpdates(true);
				}, 0)})];

				if (UpdateManager.lastCheckDate) {
					result.push(new MenuItem({ label: nls.localize('miLastCheckedAt', "Last checked at {0}", UpdateManager.lastCheckDate.toLocaleTimeString()), enabled: false }));
				}

				return result;
		}
	}

	private createMenuItem(label:string, actionId: string, enabled?:boolean): Electron.MenuItem;
	private createMenuItem(label:string, click:() => void, enabled?:boolean): Electron.MenuItem;
	private createMenuItem(arg1:string, arg2:any, arg3?:boolean): Electron.MenuItem {
		let label = mnemonicLabel(arg1);
		let click:() => void = (typeof arg2 === 'function') ? arg2 : () => windows.manager.sendToFocused('vscode:runAction', arg2);
		let enabled = typeof arg3 === 'boolean' ? arg3 : windows.manager.getWindowCount() > 0;

		let actionId:string;
		if (typeof arg2 === 'string') {
			actionId = arg2;
		}

		let options:Electron.MenuItemOptions = {
			label: label,
			accelerator: this.getAccelerator(actionId),
			click: click,
			enabled: enabled
		};

		return new MenuItem(options);
	}

	private createDevToolsAwareMenuItem(label:string, actionId: string, devToolsFocusedFn: (contents: Electron.WebContents) => void): Electron.MenuItem {
		return new MenuItem({
			label: mnemonicLabel(label),
			accelerator: this.getAccelerator(actionId),
			enabled: windows.manager.getWindowCount() > 0,
			click: () => {
				let windowInFocus = windows.manager.getFocusedWindow();
				if (!windowInFocus) {
					return;
				}

				if (windowInFocus.win.isDevToolsFocused()) {
					devToolsFocusedFn(windowInFocus.win.devToolsWebContents);
				} else {
					windows.manager.sendToFocused('vscode:runAction', actionId);
				}
			}
		});
	}

	private getAccelerator(actionId:string): string {
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

		return void(0);
	}
}

function openAboutDialog(): void {
	let lastActiveWindow = windows.manager.getFocusedWindow() || windows.manager.getLastActiveWindow();

	dialog.showMessageBox(lastActiveWindow && lastActiveWindow.win, {
		title: env.product.nameLong,
		type: 'info',
		message: env.product.nameLong,
		detail: nls.localize('aboutDetail',
			"\nVersion {0}\nCommit {1}\nDate {2}\nShell {3}\nRenderer {4}\nNode {5}",
			app.getVersion(),
			env.product.commit || 'Unknown',
			env.product.date || 'Unknown',
			process.versions['electron'],
			process.versions['chrome'],
			process.versions['node']
		),
		buttons: [nls.localize('okButton', "OK")],
		noLink: true
	}, (result) => null);

	reportMenuActionTelemetry('showAboutDialog');
}

function openUrl(url: string, id: string): void {
	shell.openExternal(url);
	reportMenuActionTelemetry(id);
}

function toggleDevTools(): void {
	let w = windows.manager.getFocusedWindow();
	if (w && w.win) {
		w.win.webContents.toggleDevTools();
	}
}

function reportMenuActionTelemetry(id: string): void {
	windows.manager.sendToFocused('vscode:telemetry', { eventName: 'workbenchActionExecuted', data: { id, from: 'menu' } });
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

export const manager = new VSCodeMenu();
