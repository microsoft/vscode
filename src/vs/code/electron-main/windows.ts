/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as fs from 'original-fs';
import * as platform from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import * as arrays from 'vs/base/common/arrays';
import { assign, mixin } from 'vs/base/common/objects';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { trim } from 'vs/base/common/strings';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/code/electron-main/storage';
import { IPath, VSCodeWindow, IWindowConfiguration, IWindowState as ISingleWindowState, defaultWindowState, WindowMode } from 'vs/code/electron-main/window';
import { ipcMain as ipc, app, screen, BrowserWindow, dialog } from 'electron';
import { IPathWithLineAndColumn, parseLineAndColumnAware } from 'vs/code/electron-main/paths';
import { ILifecycleService, UnloadReason } from 'vs/code/electron-main/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/code/electron-main/log';
import { getPathLabel } from 'vs/base/common/labels';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWindowSettings } from 'vs/platform/windows/common/windows';
import { getLastActiveWindow, findBestWindowOrFolder } from 'vs/code/node/windowsUtils';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import product from 'vs/platform/node/product';
import { OpenContext } from 'vs/code/common/windows';
import { ITelemetryService, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

enum WindowError {
	UNRESPONSIVE,
	CRASHED
}

export interface IOpenConfiguration {
	context: OpenContext;
	cli: ParsedArgs;
	userEnv?: platform.IProcessEnvironment;
	pathsToOpen?: string[];
	preferNewWindow?: boolean;
	forceNewWindow?: boolean;
	forceReuseWindow?: boolean;
	forceEmpty?: boolean;
	windowToUse?: VSCodeWindow;
	diffMode?: boolean;
	initialStartup?: boolean;
}

interface INewWindowState extends ISingleWindowState {
	hasDefaultState?: boolean;
}

interface IWindowState {
	workspacePath?: string;
	uiState: ISingleWindowState;
}

interface IWindowsState {
	lastActiveWindow?: IWindowState;
	lastPluginDevelopmentHostWindow?: IWindowState;
	openedFolders: IWindowState[];
}

export interface IRecentPathsList {
	folders: string[];
	files: string[];
}

interface INativeOpenDialogOptions {
	pickFolders?: boolean;
	pickFiles?: boolean;
	path?: string;
	forceNewWindow?: boolean;
	window?: VSCodeWindow;
}

const ReopenFoldersSetting = {
	ALL: 'all',
	ONE: 'one',
	NONE: 'none'
};

export const IWindowsMainService = createDecorator<IWindowsMainService>('windowsMainService');

export interface IWindowsMainService {
	_serviceBrand: any;

	// events
	onWindowReady: CommonEvent<VSCodeWindow>;
	onWindowClose: CommonEvent<number>;
	onWindowReload: CommonEvent<number>;
	onPathsOpen: CommonEvent<IPath[]>;
	onRecentPathsChange: CommonEvent<void>;

	// methods
	ready(initialUserEnv: platform.IProcessEnvironment): void;
	reload(win: VSCodeWindow, cli?: ParsedArgs): void;
	open(openConfig: IOpenConfiguration): VSCodeWindow[];
	openExtensionDevelopmentHostWindow(openConfig: IOpenConfiguration): void;
	openFileFolderPicker(forceNewWindow?: boolean, data?: ITelemetryData): void;
	openFilePicker(forceNewWindow?: boolean, path?: string, window?: VSCodeWindow, data?: ITelemetryData): void;
	openFolderPicker(forceNewWindow?: boolean, window?: VSCodeWindow, data?: ITelemetryData): void;
	openAccessibilityOptions(): void;
	focusLastActive(cli: ParsedArgs, context: OpenContext): VSCodeWindow;
	getLastActiveWindow(): VSCodeWindow;
	findWindow(workspacePath: string, filePath?: string, extensionDevelopmentPath?: string): VSCodeWindow;
	openNewWindow(context: OpenContext): void;
	sendToFocused(channel: string, ...args: any[]): void;
	sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void;
	getFocusedWindow(): VSCodeWindow;
	getWindowById(windowId: number): VSCodeWindow;
	getWindows(): VSCodeWindow[];
	getWindowCount(): number;
	addToRecentPathsList(paths: { path: string; isFile?: boolean; }[]): void;
	getRecentPathsList(workspacePath?: string, filesToOpen?: IPath[]): IRecentPathsList;
	removeFromRecentPathsList(path: string): void;
	removeFromRecentPathsList(paths: string[]): void;
	clearRecentPathsList(): void;
	updateWindowsJumpList(): void;
	quit(): void;
}

export class WindowsManager implements IWindowsMainService {

	_serviceBrand: any;

	private static MAX_TOTAL_RECENT_ENTRIES = 100;

	private static recentPathsListStorageKey = 'openedPathsList';
	private static workingDirPickerStorageKey = 'pickerWorkingDir';
	private static windowsStateStorageKey = 'windowsState';

	private static WINDOWS: VSCodeWindow[] = [];

	private initialUserEnv: platform.IProcessEnvironment;

	private windowsState: IWindowsState;
	private lastClosedWindowState: IWindowState;

	private _onRecentPathsChange = new Emitter<void>();
	onRecentPathsChange: CommonEvent<void> = this._onRecentPathsChange.event;

	private _onWindowReady = new Emitter<VSCodeWindow>();
	onWindowReady: CommonEvent<VSCodeWindow> = this._onWindowReady.event;

	private _onWindowClose = new Emitter<number>();
	onWindowClose: CommonEvent<number> = this._onWindowClose.event;

	private _onWindowReload = new Emitter<number>();
	onWindowReload: CommonEvent<number> = this._onWindowReload.event;

	private _onPathsOpen = new Emitter<IPath[]>();
	onPathsOpen: CommonEvent<IPath> = this._onPathsOpen.event;

	constructor(
		@ILogService private logService: ILogService,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IBackupMainService private backupService: IBackupMainService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) { }

	public ready(initialUserEnv: platform.IProcessEnvironment): void {
		this.registerListeners();

		this.initialUserEnv = initialUserEnv;
		this.windowsState = this.storageService.getItem<IWindowsState>(WindowsManager.windowsStateStorageKey) || { openedFolders: [] };
	}

	private registerListeners(): void {
		app.on('activate', (event: Event, hasVisibleWindows: boolean) => {
			this.logService.log('App#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows) {
				this.openNewWindow(OpenContext.DOCK);
			}
		});

		let macOpenFiles: string[] = [];
		let runningTimeout: number = null;
		app.on('open-file', (event: Event, path: string) => {
			this.logService.log('App#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFiles.push(path);

			// Clear previous handler if any
			if (runningTimeout !== null) {
				clearTimeout(runningTimeout);
				runningTimeout = null;
			}

			// Handle paths delayed in case more are coming!
			runningTimeout = setTimeout(() => {
				this.open({
					context: OpenContext.DOCK /* can also be opening from finder while app is running */,
					cli: this.environmentService.args,
					pathsToOpen: macOpenFiles,
					preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
				});
				macOpenFiles = [];
				runningTimeout = null;
			}, 100);
		});

		ipc.on('vscode:workbenchLoaded', (event, windowId: number) => {
			this.logService.log('IPC#vscode-workbenchLoaded');

			const win = this.getWindowById(windowId);
			if (win) {
				win.setReady();

				// Event
				this._onWindowReady.fire(win);
			}
		});

		ipc.on('vscode:broadcast', (event, windowId: number, target: string, broadcast: { channel: string; payload: any; }) => {
			if (broadcast.channel && !types.isUndefinedOrNull(broadcast.payload)) {
				this.logService.log('IPC#vscode:broadcast', target, broadcast.channel, broadcast.payload);

				// Handle specific events on main side
				this.onBroadcast(broadcast.channel, broadcast.payload);

				// Send to windows
				if (target) {
					const otherWindowsWithTarget = WindowsManager.WINDOWS.filter(w => w.id !== windowId && typeof w.openedWorkspacePath === 'string');
					const directTargetMatch = otherWindowsWithTarget.filter(w => this.isPathEqual(target, w.openedWorkspacePath));
					const parentTargetMatch = otherWindowsWithTarget.filter(w => paths.isEqualOrParent(target, w.openedWorkspacePath));

					const targetWindow = directTargetMatch.length ? directTargetMatch[0] : parentTargetMatch[0]; // prefer direct match over parent match
					if (targetWindow) {
						targetWindow.send('vscode:broadcast', broadcast);
					}
				} else {
					this.sendToAll('vscode:broadcast', broadcast, [windowId]);
				}
			}
		});

		// Update our windows state before quitting and before closing windows
		this.lifecycleService.onBeforeWindowClose(win => this.onBeforeWindowClose(win));
		this.lifecycleService.onBeforeQuit(() => this.onBeforeQuit());
	}

	// Note that onBeforeQuit() and onBeforeWindowClose() are fired in different order depending on the OS:
	// - macOS: since the app will not quit when closing the last window, you will always first get
	//          the onBeforeQuit() event followed by N onbeforeWindowClose() events for each window
	// - other: on other OS, closing the last window will quit the app so the order depends on the
	//          user interaction: closing the last window will first trigger onBeforeWindowClose()
	//          and then onBeforeQuit(). Using the quit action however will first issue onBeforeQuit()
	//          and then onBeforeWindowClose().
	private onBeforeQuit(): void {
		const currentWindowsState: IWindowsState = {
			openedFolders: [],
			lastPluginDevelopmentHostWindow: this.windowsState.lastPluginDevelopmentHostWindow,
			lastActiveWindow: this.lastClosedWindowState //will be set on Win/Linux if last window was closed, resulting in an exit
		};

		// 1.) Find a last active window (pick any other first window otherwise)
		if (!currentWindowsState.lastActiveWindow) {
			let activeWindow = this.getLastActiveWindow();
			if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
				activeWindow = WindowsManager.WINDOWS.filter(w => !w.isExtensionDevelopmentHost)[0];
			}

			if (activeWindow) {
				currentWindowsState.lastActiveWindow = { workspacePath: activeWindow.openedWorkspacePath, uiState: activeWindow.serializeWindowState() };
			}
		}

		// 2.) Find extension host window
		const extensionHostWindow = WindowsManager.WINDOWS.filter(w => w.isExtensionDevelopmentHost && !w.isExtensionTestHost)[0];
		if (extensionHostWindow) {
			currentWindowsState.lastPluginDevelopmentHostWindow = { workspacePath: extensionHostWindow.openedWorkspacePath, uiState: extensionHostWindow.serializeWindowState() };
		}

		// 3.) All windows with opened folders for N >= 2 to support reopenFolders: all or for auto update
		//
		// Carefull here: asking a window for its window state after it has been closed returns bogus values (width: 0, height: 0)
		// so if we ever want to persist the UI state of the last closed window (window count === 1), it has
		// to come from the stored lastClosedWindowState on Win/Linux at least
		if (this.getWindowCount() > 1) {
			currentWindowsState.openedFolders = WindowsManager.WINDOWS.filter(w => !!w.openedWorkspacePath && !w.isExtensionDevelopmentHost).map(w => {
				return <IWindowState>{
					workspacePath: w.openedWorkspacePath,
					uiState: w.serializeWindowState()
				};
			});
		}

		// Persist
		this.storageService.setItem(WindowsManager.windowsStateStorageKey, currentWindowsState);
	}

	// See note on #onBeforeQuit() for details how these events are flowing
	private onBeforeWindowClose(win: VSCodeWindow): void {
		if (this.lifecycleService.isQuitRequested()) {
			return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
		}

		// On Window close, update our stored UI state of this window
		const state: IWindowState = { workspacePath: win.openedWorkspacePath, uiState: win.serializeWindowState() };
		if (win.isExtensionDevelopmentHost && !win.isExtensionTestHost) {
			this.windowsState.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
		}

		// Any non extension host window with same workspace
		else if (!win.isExtensionDevelopmentHost && !!win.openedWorkspacePath) {
			this.windowsState.openedFolders.forEach(o => {
				if (this.isPathEqual(o.workspacePath, win.openedWorkspacePath)) {
					o.uiState = state.uiState;
				}
			});
		}

		// On Windows and Linux closing the last window will trigger quit. Since we are storing all UI state
		// before quitting, we need to remember the UI state of this window to be able to persist it.
		if (!platform.isMacintosh && this.getWindowCount() === 1) {
			this.lastClosedWindowState = state;
		}
	}

	private onBroadcast(event: string, payload: any): void {

		// Theme changes
		if (event === 'vscode:changeColorTheme' && typeof payload === 'string') {
			this.storageService.setItem(VSCodeWindow.themeStorageKey, payload);
		}
	}
	public reload(win: VSCodeWindow, cli?: ParsedArgs): void {

		// Only reload when the window has not vetoed this
		this.lifecycleService.unload(win, UnloadReason.RELOAD).done(veto => {
			if (!veto) {
				win.reload(cli);

				// Emit
				this._onWindowReload.fire(win.id);
			}
		});
	}

	public open(openConfig: IOpenConfiguration): VSCodeWindow[] {
		const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');

		let iPathsToOpen: IPath[];
		const usedWindows: VSCodeWindow[] = [];

		// Find paths from provided paths if any
		if (openConfig.pathsToOpen && openConfig.pathsToOpen.length > 0) {
			iPathsToOpen = openConfig.pathsToOpen.map(pathToOpen => {
				const iPath = this.toIPath(pathToOpen, false, openConfig.cli && openConfig.cli.goto);

				// Warn if the requested path to open does not exist
				if (!iPath) {
					const options: Electron.ShowMessageBoxOptions = {
						title: product.nameLong,
						type: 'info',
						buttons: [nls.localize('ok', "OK")],
						message: nls.localize('pathNotExistTitle', "Path does not exist"),
						detail: nls.localize('pathNotExistDetail', "The path '{0}' does not seem to exist anymore on disk.", pathToOpen),
						noLink: true
					};

					const activeWindow = BrowserWindow.getFocusedWindow();
					if (activeWindow) {
						dialog.showMessageBox(activeWindow, options);
					} else {
						dialog.showMessageBox(options);
					}
				}

				return iPath;
			});

			// get rid of nulls
			iPathsToOpen = arrays.coalesce(iPathsToOpen);

			if (iPathsToOpen.length === 0) {
				return null; // indicate to outside that open failed
			}
		}

		// Check for force empty
		else if (openConfig.forceEmpty) {
			iPathsToOpen = [Object.create(null)];
		}

		// Otherwise infer from command line arguments
		else {
			const ignoreFileNotFound = openConfig.cli._.length > 0; // we assume the user wants to create this file from command line
			iPathsToOpen = this.cliToPaths(openConfig.cli, ignoreFileNotFound);
		}

		let foldersToOpen = arrays.distinct(iPathsToOpen.filter(iPath => iPath.workspacePath && !iPath.filePath).map(iPath => iPath.workspacePath), folder => platform.isLinux ? folder : folder.toLowerCase()); // prevent duplicates
		let foldersToRestore = (openConfig.initialStartup && !openConfig.cli.extensionDevelopmentPath) ? this.backupService.getWorkspaceBackupPaths() : [];
		let filesToOpen: IPath[] = [];
		let filesToDiff: IPath[] = [];
		let emptyToOpen = iPathsToOpen.filter(iPath => !iPath.workspacePath && !iPath.filePath);
		let emptyToRestore = (openConfig.initialStartup && !openConfig.cli.extensionDevelopmentPath) ? this.backupService.getEmptyWorkspaceBackupPaths() : [];
		let filesToCreate = iPathsToOpen.filter(iPath => !!iPath.filePath && iPath.createFilePath);

		// Diff mode needs special care
		const candidates = iPathsToOpen.filter(iPath => !!iPath.filePath && !iPath.createFilePath);
		if (openConfig.diffMode) {
			if (candidates.length === 2) {
				filesToDiff = candidates;
			} else {
				emptyToOpen = [Object.create(null)]; // improper use of diffMode, open empty
			}

			foldersToOpen = []; 	// diff is always in empty workspace
			foldersToRestore = [];	// diff is always in empty workspace
			filesToCreate = []; 	// diff ignores other files that do not exist
		} else {
			filesToOpen = candidates;
		}

		// let the user settings override how folders are open in a new window or same window unless we are forced
		let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
		if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && windowConfig && (windowConfig.openFoldersInNewWindow === 'on' || windowConfig.openFoldersInNewWindow === 'off')) {
			openFolderInNewWindow = (windowConfig.openFoldersInNewWindow === 'on');
		}

		// Handle files to open/diff or to create when we dont open a folder and we do not restore any folder/untitled from hot-exit
		if (!foldersToOpen.length && !foldersToRestore.length && !emptyToRestore.length && (filesToOpen.length > 0 || filesToCreate.length > 0 || filesToDiff.length > 0)) {

			// let the user settings override how files are open in a new window or same window unless we are forced (not for extension development though)
			let openFilesInNewWindow: boolean;
			if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
				openFilesInNewWindow = openConfig.forceNewWindow && !openConfig.forceReuseWindow;
			} else {
				if (openConfig.context === OpenContext.DOCK) {
					openFilesInNewWindow = true; // only on macOS do we allow to open files in a new window if this is triggered via DOCK context
				}

				if (!openConfig.cli.extensionDevelopmentPath && windowConfig && (windowConfig.openFilesInNewWindow === 'on' || windowConfig.openFilesInNewWindow === 'off')) {
					openFilesInNewWindow = (windowConfig.openFilesInNewWindow === 'on');
				}
			}

			// Open Files in last instance if any and flag tells us so
			const fileToCheck = filesToOpen[0] || filesToCreate[0] || filesToDiff[0];
			const windowOrFolder = findBestWindowOrFolder({
				windows: WindowsManager.WINDOWS,
				newWindow: openFilesInNewWindow,
				reuseWindow: openConfig.forceReuseWindow,
				context: openConfig.context,
				filePath: fileToCheck && fileToCheck.filePath,
				userHome: this.environmentService.userHome
			});
			if (windowOrFolder instanceof VSCodeWindow) {
				windowOrFolder.focus();
				const files = { filesToOpen, filesToCreate, filesToDiff }; // copy to object because they get reset shortly after
				windowOrFolder.ready().then(readyWindow => {
					readyWindow.send('vscode:openFiles', files);
				});

				usedWindows.push(windowOrFolder);
			}

			// Otherwise open instance with files
			else {
				const configuration = this.toConfiguration(openConfig, windowOrFolder, filesToOpen, filesToCreate, filesToDiff);
				const browserWindow = this.openInBrowserWindow(configuration, true /* new window */);
				usedWindows.push(browserWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Reset these because we handled them
			filesToOpen = [];
			filesToCreate = [];
			filesToDiff = [];
		}

		// Handle folders to open (instructed and to restore)
		let allFoldersToOpen = arrays.distinct([...foldersToOpen, ...foldersToRestore], folder => platform.isLinux ? folder : folder.toLowerCase()); // prevent duplicates
		if (allFoldersToOpen.length > 0) {

			// Check for existing instances
			const windowsOnWorkspacePath = arrays.coalesce(allFoldersToOpen.map(folderToOpen => this.findWindow(folderToOpen)));
			if (windowsOnWorkspacePath.length > 0) {
				const browserWindow = windowsOnWorkspacePath[0];
				browserWindow.focus(); // just focus one of them
				const files = { filesToOpen, filesToCreate, filesToDiff }; // copy to object because they get reset shortly after
				browserWindow.ready().then(readyWindow => {
					readyWindow.send('vscode:openFiles', files);
				});

				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			allFoldersToOpen.forEach(folderToOpen => {
				if (windowsOnWorkspacePath.some(win => this.isPathEqual(win.openedWorkspacePath, folderToOpen))) {
					return; // ignore folders that are already open
				}

				const configuration = this.toConfiguration(openConfig, folderToOpen, filesToOpen, filesToCreate, filesToDiff);
				const browserWindow = this.openInBrowserWindow(configuration, openFolderInNewWindow, openFolderInNewWindow ? void 0 : openConfig.windowToUse);
				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty
		if (emptyToRestore.length > 0) {
			emptyToRestore.forEach(emptyWorkspaceBackupFolder => {
				const configuration = this.toConfiguration(openConfig, void 0, filesToOpen, filesToCreate, filesToDiff);
				const browserWindow = this.openInBrowserWindow(configuration, true /* new window */, null, emptyWorkspaceBackupFolder);
				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Only open empty if no empty workspaces were restored
		else if (emptyToOpen.length > 0) {
			emptyToOpen.forEach(() => {
				const configuration = this.toConfiguration(openConfig);
				const browserWindow = this.openInBrowserWindow(configuration, openFolderInNewWindow, openFolderInNewWindow ? void 0 : openConfig.windowToUse);
				usedWindows.push(browserWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Remember in recent document list (unless this opens for extension development)
		// Also do not add paths when files are opened for diffing, only if opened individually
		if (!usedWindows.some(w => w.isExtensionDevelopmentHost) && !openConfig.cli.diff) {
			const recentPaths: { path: string; isFile?: boolean; }[] = [];

			iPathsToOpen.forEach(iPath => {
				if (iPath.filePath || iPath.workspacePath) {
					app.addRecentDocument(iPath.filePath || iPath.workspacePath);
					recentPaths.push({ path: iPath.filePath || iPath.workspacePath, isFile: !!iPath.filePath });
				}
			});

			if (recentPaths.length) {
				this.addToRecentPathsList(recentPaths);
			}
		}

		// Emit events
		this._onPathsOpen.fire(iPathsToOpen);

		return arrays.distinct(usedWindows);
	}

	public addToRecentPathsList(paths: { path: string; isFile?: boolean; }[]): void {
		if (!paths || !paths.length) {
			return;
		}

		const mru = this.getRecentPathsList();
		paths.forEach(p => {
			const { path, isFile } = p;

			if (isFile) {
				mru.files.unshift(path);
				mru.files = arrays.distinct(mru.files, (f) => platform.isLinux ? f : f.toLowerCase());
			} else {
				mru.folders.unshift(path);
				mru.folders = arrays.distinct(mru.folders, (f) => platform.isLinux ? f : f.toLowerCase());
			}

			// Make sure its bounded
			mru.folders = mru.folders.slice(0, WindowsManager.MAX_TOTAL_RECENT_ENTRIES);
			mru.files = mru.files.slice(0, WindowsManager.MAX_TOTAL_RECENT_ENTRIES);
		});

		this.storageService.setItem(WindowsManager.recentPathsListStorageKey, mru);
		this._onRecentPathsChange.fire();
	}

	public removeFromRecentPathsList(path: string): void;
	public removeFromRecentPathsList(paths: string[]): void;
	public removeFromRecentPathsList(arg1: any): void {
		let paths: string[];
		if (Array.isArray(arg1)) {
			paths = arg1;
		} else {
			paths = [arg1];
		}

		const mru = this.getRecentPathsList();
		let update = false;

		paths.forEach(path => {
			let index = mru.files.indexOf(path);
			if (index >= 0) {
				mru.files.splice(index, 1);
				update = true;
			}

			index = mru.folders.indexOf(path);
			if (index >= 0) {
				mru.folders.splice(index, 1);
				update = true;
			}
		});

		if (update) {
			this.storageService.setItem(WindowsManager.recentPathsListStorageKey, mru);
			this._onRecentPathsChange.fire();
		}
	}

	public clearRecentPathsList(): void {
		this.storageService.setItem(WindowsManager.recentPathsListStorageKey, { folders: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentPathsChange.fire();
	}

	public getRecentPathsList(workspacePath?: string, filesToOpen?: IPath[]): IRecentPathsList {
		let files: string[];
		let folders: string[];

		// Get from storage
		const storedRecents = this.storageService.getItem<IRecentPathsList>(WindowsManager.recentPathsListStorageKey);
		if (storedRecents) {
			files = storedRecents.files || [];
			folders = storedRecents.folders || [];
		} else {
			files = [];
			folders = [];
		}

		// Add currently files to open to the beginning if any
		if (filesToOpen) {
			files.unshift(...filesToOpen.map(f => f.filePath));
		}

		// Add current workspace path to beginning if set
		if (workspacePath) {
			folders.unshift(workspacePath);
		}

		// Clear those dupes
		files = arrays.distinct(files);
		folders = arrays.distinct(folders);

		return { files, folders };
	}

	private getWindowUserEnv(openConfig: IOpenConfiguration): platform.IProcessEnvironment {
		return assign({}, this.initialUserEnv, openConfig.userEnv || {});
	}

	public openExtensionDevelopmentHostWindow(openConfig: IOpenConfiguration): void {

		// Reload an existing extension development host window on the same path
		// We currently do not allow more than one extension development window
		// on the same extension path.
		let res = WindowsManager.WINDOWS.filter(w => w.config && this.isPathEqual(w.config.extensionDevelopmentPath, openConfig.cli.extensionDevelopmentPath));
		if (res && res.length === 1) {
			this.reload(res[0], openConfig.cli);
			res[0].focus(); // make sure it gets focus and is restored

			return;
		}

		// Fill in previously opened workspace unless an explicit path is provided and we are not unit testing
		if (openConfig.cli._.length === 0 && !openConfig.cli.extensionTestsPath) {
			const workspaceToOpen = this.windowsState.lastPluginDevelopmentHostWindow && this.windowsState.lastPluginDevelopmentHostWindow.workspacePath;
			if (workspaceToOpen) {
				openConfig.cli._ = [workspaceToOpen];
			}
		}

		// Make sure we are not asked to open a path that is already opened
		if (openConfig.cli._.length > 0) {
			res = WindowsManager.WINDOWS.filter(w => w.openedWorkspacePath && openConfig.cli._.indexOf(w.openedWorkspacePath) >= 0);
			if (res.length) {
				openConfig.cli._ = [];
			}
		}

		// Open it
		this.open({ context: openConfig.context, cli: openConfig.cli, forceNewWindow: true, forceEmpty: openConfig.cli._.length === 0, userEnv: openConfig.userEnv });
	}

	private toConfiguration(config: IOpenConfiguration, workspacePath?: string, filesToOpen?: IPath[], filesToCreate?: IPath[], filesToDiff?: IPath[]): IWindowConfiguration {
		const configuration: IWindowConfiguration = mixin({}, config.cli); // inherit all properties from CLI
		configuration.appRoot = this.environmentService.appRoot;
		configuration.execPath = process.execPath;
		configuration.userEnv = this.getWindowUserEnv(config);
		configuration.isInitialStartup = config.initialStartup;
		configuration.workspacePath = workspacePath;
		configuration.filesToOpen = filesToOpen;
		configuration.filesToCreate = filesToCreate;
		configuration.filesToDiff = filesToDiff;
		configuration.nodeCachedDataDir = this.environmentService.isBuilt && this.environmentService.nodeCachedDataDir;

		return configuration;
	}

	private toIPath(anyPath: string, ignoreFileNotFound?: boolean, gotoLineMode?: boolean): IPath {
		if (!anyPath) {
			return null;
		}

		let parsedPath: IPathWithLineAndColumn;
		if (gotoLineMode) {
			parsedPath = parseLineAndColumnAware(anyPath);
			anyPath = parsedPath.path;
		}

		const candidate = path.normalize(anyPath);
		try {
			const candidateStat = fs.statSync(candidate);
			if (candidateStat) {
				return candidateStat.isFile() ?
					{
						filePath: candidate,
						lineNumber: gotoLineMode ? parsedPath.line : void 0,
						columnNumber: gotoLineMode ? parsedPath.column : void 0
					} :
					{ workspacePath: candidate };
			}
		} catch (error) {
			this.removeFromRecentPathsList(candidate); // since file does not seem to exist anymore, remove from recent

			if (ignoreFileNotFound) {
				return { filePath: candidate, createFilePath: true }; // assume this is a file that does not yet exist
			}
		}

		return null;
	}

	private cliToPaths(cli: ParsedArgs, ignoreFileNotFound?: boolean): IPath[] {

		// Check for pass in candidate or last opened path
		let candidates: string[] = [];
		if (cli._.length > 0) {
			candidates = cli._;
		}

		// No path argument, check settings for what to do now
		else {
			let reopenFolders: string;
			if (this.lifecycleService.wasUpdated) {
				reopenFolders = ReopenFoldersSetting.ALL; // always reopen all folders when an update was applied
			} else {
				const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
				reopenFolders = (windowConfig && windowConfig.reopenFolders) || ReopenFoldersSetting.ONE;
			}

			const lastActiveFolder = this.windowsState.lastActiveWindow && this.windowsState.lastActiveWindow.workspacePath;

			// Restore all
			if (reopenFolders === ReopenFoldersSetting.ALL) {
				const lastOpenedFolders = this.windowsState.openedFolders.map(o => o.workspacePath);

				// If we have a last active folder, move it to the end
				if (lastActiveFolder) {
					lastOpenedFolders.splice(lastOpenedFolders.indexOf(lastActiveFolder), 1);
					lastOpenedFolders.push(lastActiveFolder);
				}

				candidates.push(...lastOpenedFolders);
			}

			// Restore last active
			else if (lastActiveFolder && (reopenFolders === ReopenFoldersSetting.ONE || reopenFolders !== ReopenFoldersSetting.NONE)) {
				candidates.push(lastActiveFolder);
			}
		}

		const iPaths = candidates.map(candidate => this.toIPath(candidate, ignoreFileNotFound, cli.goto)).filter(path => !!path);
		if (iPaths.length > 0) {
			return iPaths;
		}

		// No path provided, return empty to open empty
		return [Object.create(null)];
	}

	private openInBrowserWindow(configuration: IWindowConfiguration, forceNewWindow?: boolean, windowToUse?: VSCodeWindow, emptyWorkspaceBackupFolder?: string): VSCodeWindow {
		let vscodeWindow: VSCodeWindow;

		if (!forceNewWindow) {
			vscodeWindow = windowToUse || this.getLastActiveWindow();

			if (vscodeWindow) {
				vscodeWindow.focus();
			}
		}

		// New window
		if (!vscodeWindow) {
			const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
			const state = this.getNewWindowState(configuration);

			// Window state is not from a previous session: only allow fullscreen if we inherit it or user wants fullscreen
			let allowFullscreen: boolean;
			if (state.hasDefaultState) {
				allowFullscreen = (windowConfig && windowConfig.newWindowDimensions && ['fullscreen', 'inherit'].indexOf(windowConfig.newWindowDimensions) >= 0);
			}

			// Window state is from a previous session: only allow fullscreen when we got updated or user wants to restore
			else {
				allowFullscreen = this.lifecycleService.wasUpdated || (windowConfig && windowConfig.restoreFullscreen);
			}

			if (state.mode === WindowMode.Fullscreen && !allowFullscreen) {
				state.mode = WindowMode.Normal;
			}

			vscodeWindow = new VSCodeWindow({
				state,
				extensionDevelopmentPath: configuration.extensionDevelopmentPath,
				isExtensionTestHost: !!configuration.extensionTestsPath,
				titleBarStyle: windowConfig ? windowConfig.titleBarStyle : void 0
			},
				this.logService,
				this.environmentService,
				this.configurationService,
				this.storageService
			);

			WindowsManager.WINDOWS.push(vscodeWindow);

			// Window Events
			vscodeWindow.win.webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			vscodeWindow.win.webContents.on('devtools-reload-page', () => this.reload(vscodeWindow));
			vscodeWindow.win.webContents.on('crashed', () => this.onWindowError(vscodeWindow, WindowError.CRASHED));
			vscodeWindow.win.on('unresponsive', () => this.onWindowError(vscodeWindow, WindowError.UNRESPONSIVE));
			vscodeWindow.win.on('closed', () => this.onWindowClosed(vscodeWindow));

			// Lifecycle
			this.lifecycleService.registerWindow(vscodeWindow);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in extension development host mode. These options are all development related.
			const currentWindowConfig = vscodeWindow.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
				configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
				configuration.verbose = currentWindowConfig.verbose;
				configuration.debugBrkPluginHost = currentWindowConfig.debugBrkPluginHost;
				configuration.debugPluginHost = currentWindowConfig.debugPluginHost;
				configuration['extensions-dir'] = currentWindowConfig['extensions-dir'];
			}
		}

		// Only load when the window has not vetoed this
		this.lifecycleService.unload(vscodeWindow, UnloadReason.LOAD).done(veto => {
			if (!veto) {

				// Register window for backups
				if (!configuration.extensionDevelopmentPath) {
					this.backupService.registerWindowForBackupsSync(vscodeWindow.id, !configuration.workspacePath, emptyWorkspaceBackupFolder, configuration.workspacePath);
				}

				// Load it
				vscodeWindow.load(configuration);
			}
		});

		return vscodeWindow;
	}

	private getNewWindowState(configuration: IWindowConfiguration): INewWindowState {

		// extension development host Window - load from stored settings if any
		if (!!configuration.extensionDevelopmentPath && this.windowsState.lastPluginDevelopmentHostWindow) {
			return this.windowsState.lastPluginDevelopmentHostWindow.uiState;
		}

		// Known Folder - load from stored settings if any
		if (configuration.workspacePath) {
			const stateForWorkspace = this.windowsState.openedFolders.filter(o => this.isPathEqual(o.workspacePath, configuration.workspacePath)).map(o => o.uiState);
			if (stateForWorkspace.length) {
				return stateForWorkspace[0];
			}
		}

		// First Window
		const lastActive = this.getLastActiveWindow();
		if (!lastActive && this.windowsState.lastActiveWindow) {
			return this.windowsState.lastActiveWindow.uiState;
		}

		//
		// In any other case, we do not have any stored settings for the window state, so we come up with something smart
		//

		// We want the new window to open on the same display that the last active one is in
		let displayToUse: Electron.Display;
		const displays = screen.getAllDisplays();

		// Single Display
		if (displays.length === 1) {
			displayToUse = displays[0];
		}

		// Multi Display
		else {

			// on mac there is 1 menu per window so we need to use the monitor where the cursor currently is
			if (platform.isMacintosh) {
				const cursorPoint = screen.getCursorScreenPoint();
				displayToUse = screen.getDisplayNearestPoint(cursorPoint);
			}

			// if we have a last active window, use that display for the new window
			if (!displayToUse && lastActive) {
				displayToUse = screen.getDisplayMatching(lastActive.getBounds());
			}

			// fallback to primary display or first display
			if (!displayToUse) {
				displayToUse = screen.getPrimaryDisplay() || displays[0];
			}
		}

		let state = defaultWindowState() as INewWindowState;
		state.x = displayToUse.bounds.x + (displayToUse.bounds.width / 2) - (state.width / 2);
		state.y = displayToUse.bounds.y + (displayToUse.bounds.height / 2) - (state.height / 2);

		// Check for newWindowDimensions setting and adjust accordingly
		const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
		let ensureNoOverlap = true;
		if (windowConfig && windowConfig.newWindowDimensions) {
			if (windowConfig.newWindowDimensions === 'maximized') {
				state.mode = WindowMode.Maximized;
				ensureNoOverlap = false;
			} else if (windowConfig.newWindowDimensions === 'fullscreen') {
				state.mode = WindowMode.Fullscreen;
				ensureNoOverlap = false;
			} else if (windowConfig.newWindowDimensions === 'inherit' && lastActive) {
				const lastActiveState = lastActive.serializeWindowState();
				if (lastActiveState.mode === WindowMode.Fullscreen) {
					state.mode = WindowMode.Fullscreen; // only take mode (fixes https://github.com/Microsoft/vscode/issues/19331)
				} else {
					state = lastActiveState;
				}

				ensureNoOverlap = false;
			}
		}

		if (ensureNoOverlap) {
			state = this.ensureNoOverlap(state);
		}

		state.hasDefaultState = true; // flag as default state

		return state;
	}

	private ensureNoOverlap(state: ISingleWindowState): ISingleWindowState {
		if (WindowsManager.WINDOWS.length === 0) {
			return state;
		}

		const existingWindowBounds = WindowsManager.WINDOWS.map(win => win.getBounds());
		while (existingWindowBounds.some(b => b.x === state.x || b.y === state.y)) {
			state.x += 30;
			state.y += 30;
		}

		return state;
	}

	public openFileFolderPicker(forceNewWindow?: boolean, data?: ITelemetryData): void {
		this.doPickAndOpen({ pickFolders: true, pickFiles: true, forceNewWindow }, 'openFileFolder', data);
	}

	public openFilePicker(forceNewWindow?: boolean, path?: string, window?: VSCodeWindow, data?: ITelemetryData): void {
		this.doPickAndOpen({ pickFiles: true, forceNewWindow, path, window }, 'openFile', data);
	}

	public openFolderPicker(forceNewWindow?: boolean, window?: VSCodeWindow, data?: ITelemetryData): void {
		this.doPickAndOpen({ pickFolders: true, forceNewWindow, window }, 'openFolder', data);
	}

	public openAccessibilityOptions(): void {
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

	private doPickAndOpen(options: INativeOpenDialogOptions, eventName: string, data?: ITelemetryData): void {
		this.getFileOrFolderPaths(options, (paths: string[]) => {
			const nOfPaths = paths ? paths.length : 0;
			if (nOfPaths) {
				this.open({ context: OpenContext.DIALOG, cli: this.environmentService.args, pathsToOpen: paths, forceNewWindow: options.forceNewWindow });
			}
			this.telemetryService.publicLog(eventName, {
				...data,
				outcome: nOfPaths ? 'success' : 'canceled',
				nOfPaths
			});
		});
	}

	private getFileOrFolderPaths(options: INativeOpenDialogOptions, clb: (paths: string[]) => void): void {
		const workingDir = options.path || this.storageService.getItem<string>(WindowsManager.workingDirPickerStorageKey);
		const focussedWindow = options.window || this.getFocusedWindow();

		let pickerProperties: ('openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory')[];
		if (options.pickFiles && options.pickFolders) {
			pickerProperties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
		} else {
			pickerProperties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		dialog.showOpenDialog(focussedWindow && focussedWindow.win, {
			defaultPath: workingDir,
			properties: pickerProperties
		}, paths => {
			if (paths && paths.length > 0) {

				// Remember path in storage for next time
				this.storageService.setItem(WindowsManager.workingDirPickerStorageKey, path.dirname(paths[0]));

				// Return
				clb(paths);
			} else {
				clb(void (0));
			}
		});
	}

	public focusLastActive(cli: ParsedArgs, context: OpenContext): VSCodeWindow {
		const lastActive = this.getLastActiveWindow();
		if (lastActive) {
			lastActive.focus();

			return lastActive;
		}

		// No window - open new empty one
		const res = this.open({ context, cli, forceEmpty: true });

		return res && res[0];
	}

	public getLastActiveWindow(): VSCodeWindow {
		return getLastActiveWindow(WindowsManager.WINDOWS);
	}

	public findWindow(workspacePath: string, filePath?: string, extensionDevelopmentPath?: string): VSCodeWindow {
		if (WindowsManager.WINDOWS.length) {

			// Sort the last active window to the front of the array of windows to test
			const windowsToTest = WindowsManager.WINDOWS.slice(0);
			const lastActiveWindow = this.getLastActiveWindow();
			if (lastActiveWindow) {
				windowsToTest.splice(windowsToTest.indexOf(lastActiveWindow), 1);
				windowsToTest.unshift(lastActiveWindow);
			}

			// Find it
			const res = windowsToTest.filter(w => {

				// match on workspace
				if (typeof w.openedWorkspacePath === 'string' && (this.isPathEqual(w.openedWorkspacePath, workspacePath))) {
					return true;
				}

				// match on file
				if (typeof w.openedFilePath === 'string' && this.isPathEqual(w.openedFilePath, filePath)) {
					return true;
				}

				// match on file path
				if (typeof w.openedWorkspacePath === 'string' && filePath && paths.isEqualOrParent(filePath, w.openedWorkspacePath)) {
					return true;
				}

				// match on extension development path
				if (typeof extensionDevelopmentPath === 'string' && w.extensionDevelopmentPath === extensionDevelopmentPath) {
					return true;
				}

				return false;
			});

			if (res && res.length) {
				return res[0];
			}
		}

		return null;
	}

	public openNewWindow(context: OpenContext): void {
		this.open({ context, cli: this.environmentService.args, forceNewWindow: true, forceEmpty: true });
	}

	public sendToFocused(channel: string, ...args: any[]): void {
		const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();

		if (focusedWindow) {
			focusedWindow.sendWhenReady(channel, ...args);
		}
	}

	public sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void {
		WindowsManager.WINDOWS.forEach(w => {
			if (windowIdsToIgnore && windowIdsToIgnore.indexOf(w.id) >= 0) {
				return; // do not send if we are instructed to ignore it
			}

			w.sendWhenReady(channel, payload);
		});
	}

	public getFocusedWindow(): VSCodeWindow {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			return this.getWindowById(win.id);
		}

		return null;
	}

	public getWindowById(windowId: number): VSCodeWindow {
		const res = WindowsManager.WINDOWS.filter(w => w.id === windowId);
		if (res && res.length === 1) {
			return res[0];
		}

		return null;
	}

	public getWindows(): VSCodeWindow[] {
		return WindowsManager.WINDOWS;
	}

	public getWindowCount(): number {
		return WindowsManager.WINDOWS.length;
	}

	private onWindowError(vscodeWindow: VSCodeWindow, error: WindowError): void {
		console.error(error === WindowError.CRASHED ? '[VS Code]: render process crashed!' : '[VS Code]: detected unresponsive');

		// Unresponsive
		if (error === WindowError.UNRESPONSIVE) {
			dialog.showMessageBox(vscodeWindow.win, {
				title: product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('wait', "Keep Waiting"), nls.localize('close', "Close")],
				message: nls.localize('appStalled', "The window is no longer responding"),
				detail: nls.localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
				noLink: true
			}, result => {
				if (result === 0) {
					vscodeWindow.reload();
				} else if (result === 2) {
					this.onBeforeWindowClose(vscodeWindow); // 'close' event will not be fired on destroy(), so run it manually
					vscodeWindow.win.destroy(); // make sure to destroy the window as it is unresponsive
				}
			});
		}

		// Crashed
		else {
			dialog.showMessageBox(vscodeWindow.win, {
				title: product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('close', "Close")],
				message: nls.localize('appCrashed', "The window has crashed"),
				detail: nls.localize('appCrashedDetail', "We are sorry for the inconvenience! You can reopen the window to continue where you left off."),
				noLink: true
			}, result => {
				if (result === 0) {
					vscodeWindow.reload();
				} else if (result === 1) {
					this.onBeforeWindowClose(vscodeWindow); // 'close' event will not be fired on destroy(), so run it manually
					vscodeWindow.win.destroy(); // make sure to destroy the window as it has crashed
				}
			});
		}
	}

	private onWindowClosed(win: VSCodeWindow): void {

		// Tell window
		win.dispose();

		// Remove from our list so that Electron can clean it up
		const index = WindowsManager.WINDOWS.indexOf(win);
		WindowsManager.WINDOWS.splice(index, 1);

		// Emit
		this._onWindowClose.fire(win.id);
	}

	private isPathEqual(pathA: string, pathB: string): boolean {
		if (pathA === pathB) {
			return true;
		}

		if (!pathA || !pathB) {
			return false;
		}

		pathA = path.normalize(pathA);
		pathB = path.normalize(pathB);

		if (pathA === pathB) {
			return true;
		}

		if (!platform.isLinux) {
			pathA = pathA.toLowerCase();
			pathB = pathB.toLowerCase();
		}

		return pathA === pathB;
	}

	public updateWindowsJumpList(): void {
		if (!platform.isWindows) {
			return; // only on windows
		}

		const jumpList: Electron.JumpListCategory[] = [];

		// Tasks
		jumpList.push({
			type: 'tasks',
			items: [
				{
					type: 'task',
					title: nls.localize('newWindow', "New Window"),
					description: nls.localize('newWindowDesc', "Opens a new window"),
					program: process.execPath,
					args: '-n', // force new window
					iconPath: process.execPath,
					iconIndex: 0
				}
			]
		});

		// Recent Folders
		if (this.getRecentPathsList().folders.length > 0) {

			// The user might have meanwhile removed items from the jump list and we have to respect that
			// so we need to update our list of recent paths with the choice of the user to not add them again
			// Also: Windows will not show our custom category at all if there is any entry which was removed
			// by the user! See https://github.com/Microsoft/vscode/issues/15052
			this.removeFromRecentPathsList(app.getJumpListSettings().removedItems.map(r => trim(r.args, '"')));

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Folders"),
				items: this.getRecentPathsList().folders.slice(0, 7 /* limit number of entries here */).map(folder => {
					return <Electron.JumpListItem>{
						type: 'task',
						title: path.basename(folder) || folder, // use the base name to show shorter entries in the list
						description: nls.localize('folderDesc', "{0} {1}", path.basename(folder), getPathLabel(path.dirname(folder))),
						program: process.execPath,
						args: `"${folder}"`, // open folder (use quotes to support paths with whitespaces)
						iconPath: 'explorer.exe', // simulate folder icon
						iconIndex: 0
					};
				}).filter(i => !!i)
			});
		}

		// Recent
		jumpList.push({
			type: 'recent' // this enables to show files in the "recent" category
		});

		try {
			app.setJumpList(jumpList);
		} catch (error) {
			this.logService.log('#setJumpList', error); // since setJumpList is relatively new API, make sure to guard for errors
		}
	}

	public quit(): void {

		// If the user selected to exit from an extension development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		const vscodeWindow = this.getFocusedWindow();
		if (vscodeWindow && vscodeWindow.isExtensionDevelopmentHost && this.getWindowCount() > 1) {
			vscodeWindow.win.close();
		}

		// Otherwise: normal quit
		else {
			setTimeout(() => {
				app.quit();
			}, 10 /* delay to unwind callback stack (IPC) */);
		}
	}
}
