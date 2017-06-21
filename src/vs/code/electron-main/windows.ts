/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as fs from 'original-fs';
import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { assign, mixin } from 'vs/base/common/objects';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/node/storage';
import { CodeWindow, IWindowState as ISingleWindowState, defaultWindowState, WindowMode } from 'vs/code/electron-main/window';
import { ipcMain as ipc, screen, BrowserWindow, dialog, systemPreferences } from 'electron';
import { IPathWithLineAndColumn, parseLineAndColumnAware } from 'vs/code/node/paths';
import { ILifecycleService, UnloadReason } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWindowSettings, OpenContext, IPath, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { getLastActiveWindow, findBestWindowOrFolder } from 'vs/code/node/windowsUtils';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import product from 'vs/platform/node/product';
import { ITelemetryService, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { isEqual, isEqualOrParent } from 'vs/base/common/paths';
import { IWindowsMainService, IOpenConfiguration } from "vs/platform/windows/electron-main/windows";
import { IHistoryMainService } from "vs/platform/history/electron-main/historyMainService";
import { IProcessEnvironment, isLinux, isMacintosh, isWindows } from "vs/base/common/platform";
import { TPromise } from "vs/base/common/winjs.base";

enum WindowError {
	UNRESPONSIVE,
	CRASHED
}

interface INewWindowState extends ISingleWindowState {
	hasDefaultState?: boolean;
}

interface IWindowState {
	workspacePath?: string;
	backupPath: string;
	uiState: ISingleWindowState;
}

interface IWindowsState {
	lastActiveWindow?: IWindowState;
	lastPluginDevelopmentHostWindow?: IWindowState;
	openedWindows: IWindowState[];
	openedFolders?: IWindowState[]; // TODO@Ben deprecated
}

type RestoreWindowsSetting = 'all' | 'folders' | 'one' | 'none';

interface IOpenBrowserWindowOptions {
	userEnv?: IProcessEnvironment;
	cli?: ParsedArgs;
	workspacePath?: string;

	initialStartup?: boolean;

	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];

	forceNewWindow?: boolean;
	windowToUse?: CodeWindow;

	emptyWorkspaceBackupFolder?: string;
}

interface IWindowToOpen extends IPath {

	// the workspace spath for a Code instance to open
	workspacePath?: string;

	// the backup spath for a Code instance to use
	backupPath?: string;

	// indicator to create the file path in the Code instance
	createFilePath?: boolean;
}

export class WindowsManager implements IWindowsMainService {

	_serviceBrand: any;

	private static windowsStateStorageKey = 'windowsState';

	private static WINDOWS: CodeWindow[] = [];

	private initialUserEnv: IProcessEnvironment;

	private windowsState: IWindowsState;
	private lastClosedWindowState: IWindowState;

	private fileDialog: FileDialog;

	private _onWindowReady = new Emitter<CodeWindow>();
	onWindowReady: CommonEvent<CodeWindow> = this._onWindowReady.event;

	private _onWindowClose = new Emitter<number>();
	onWindowClose: CommonEvent<number> = this._onWindowClose.event;

	private _onWindowReload = new Emitter<number>();
	onWindowReload: CommonEvent<number> = this._onWindowReload.event;

	private _onPathsOpen = new Emitter<IPath[]>();
	onPathsOpen: CommonEvent<IPath[]> = this._onPathsOpen.event;

	constructor(
		@ILogService private logService: ILogService,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IBackupMainService private backupService: IBackupMainService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IHistoryMainService private historyService: IHistoryMainService
	) {
		this.windowsState = this.storageService.getItem<IWindowsState>(WindowsManager.windowsStateStorageKey) || { openedWindows: [] };

		// TODO@Ben migration from previous openedFolders to new openedWindows property
		if (Array.isArray(this.windowsState.openedFolders) && this.windowsState.openedFolders.length > 0) {
			this.windowsState.openedWindows = this.windowsState.openedFolders;
			this.windowsState.openedFolders = void 0;
		} else if (!this.windowsState.openedWindows) {
			this.windowsState.openedWindows = [];
		}

		this.fileDialog = new FileDialog(environmentService, telemetryService, storageService, this);
	}

	public ready(initialUserEnv: IProcessEnvironment): void {
		this.initialUserEnv = initialUserEnv;

		this.registerListeners();
	}

	private registerListeners(): void {

		// React to workbench loaded events from windows
		ipc.on('vscode:workbenchLoaded', (event, windowId: number) => {
			this.logService.log('IPC#vscode-workbenchLoaded');

			const win = this.getWindowById(windowId);
			if (win) {
				win.setReady();

				// Event
				this._onWindowReady.fire(win);
			}
		});

		// React to HC color scheme changes (Windows)
		if (isWindows) {
			systemPreferences.on('inverted-color-scheme-changed', () => {
				if (systemPreferences.isInvertedColorScheme()) {
					this.sendToAll('vscode:enterHighContrast');
				} else {
					this.sendToAll('vscode:leaveHighContrast');
				}
			});
		}

		// Update our windows state before quitting and before closing windows
		this.lifecycleService.onBeforeWindowClose(win => this.onBeforeWindowClose(win as CodeWindow));
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
			openedWindows: [],
			openedFolders: [], // TODO@Ben migration so that old clients do not fail over data (prevents NPEs)
			lastPluginDevelopmentHostWindow: this.windowsState.lastPluginDevelopmentHostWindow,
			lastActiveWindow: this.lastClosedWindowState
		};

		// 1.) Find a last active window (pick any other first window otherwise)
		if (!currentWindowsState.lastActiveWindow) {
			let activeWindow = this.getLastActiveWindow();
			if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
				activeWindow = WindowsManager.WINDOWS.filter(w => !w.isExtensionDevelopmentHost)[0];
			}

			if (activeWindow) {
				currentWindowsState.lastActiveWindow = { workspacePath: activeWindow.openedWorkspacePath, uiState: activeWindow.serializeWindowState(), backupPath: activeWindow.backupPath };
			}
		}

		// 2.) Find extension host window
		const extensionHostWindow = WindowsManager.WINDOWS.filter(w => w.isExtensionDevelopmentHost && !w.isExtensionTestHost)[0];
		if (extensionHostWindow) {
			currentWindowsState.lastPluginDevelopmentHostWindow = { workspacePath: extensionHostWindow.openedWorkspacePath, uiState: extensionHostWindow.serializeWindowState(), backupPath: extensionHostWindow.backupPath };
		}

		// 3.) All windows (except extension host) for N >= 2 to support restoreWindows: all or for auto update
		//
		// Carefull here: asking a window for its window state after it has been closed returns bogus values (width: 0, height: 0)
		// so if we ever want to persist the UI state of the last closed window (window count === 1), it has
		// to come from the stored lastClosedWindowState on Win/Linux at least
		if (this.getWindowCount() > 1) {
			currentWindowsState.openedWindows = WindowsManager.WINDOWS.filter(w => !w.isExtensionDevelopmentHost).map(w => {
				return <IWindowState>{
					workspacePath: w.openedWorkspacePath,
					uiState: w.serializeWindowState(),
					backupPath: w.backupPath
				};
			});
		}

		// Persist
		this.storageService.setItem(WindowsManager.windowsStateStorageKey, currentWindowsState);
	}

	// See note on #onBeforeQuit() for details how these events are flowing
	private onBeforeWindowClose(win: CodeWindow): void {
		if (this.lifecycleService.isQuitRequested()) {
			return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
		}

		// On Window close, update our stored UI state of this window
		const state: IWindowState = { workspacePath: win.openedWorkspacePath, uiState: win.serializeWindowState(), backupPath: win.backupPath };
		if (win.isExtensionDevelopmentHost && !win.isExtensionTestHost) {
			this.windowsState.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
		}

		// Any non extension host window with same workspace
		else if (!win.isExtensionDevelopmentHost && !!win.openedWorkspacePath) {
			this.windowsState.openedWindows.forEach(o => {
				if (isEqual(o.workspacePath, win.openedWorkspacePath, !isLinux /* ignorecase */)) {
					o.uiState = state.uiState;
				}
			});
		}

		// On Windows and Linux closing the last window will trigger quit. Since we are storing all UI state
		// before quitting, we need to remember the UI state of this window to be able to persist it.
		// On macOS we keep the last closed window state ready in case the user wants to quit right after or
		// wants to open another window, in which case we use this state over the persisted one.
		if (this.getWindowCount() === 1) {
			this.lastClosedWindowState = state;
		}
	}

	public open(openConfig: IOpenConfiguration): CodeWindow[] {
		const windowsToOpen = this.getWindowsToOpen(openConfig);

		//
		// These are windows to open to show either folders or files (including diffing files or creating them)
		//
		const foldersToOpen = arrays.distinct(windowsToOpen.filter(win => win.workspacePath && !win.filePath).map(win => win.workspacePath), folder => isLinux ? folder : folder.toLowerCase()); // prevent duplicates
		const emptyToOpen = windowsToOpen.filter(win => !win.workspacePath && !win.filePath && !win.backupPath).length;

		let filesToOpen = windowsToOpen.filter(path => !!path.filePath && !path.createFilePath);
		let filesToCreate = windowsToOpen.filter(path => !!path.filePath && path.createFilePath);
		let filesToDiff: IPath[];
		if (openConfig.diffMode && filesToOpen.length === 2) {
			filesToDiff = filesToOpen;
			filesToOpen = [];
			filesToCreate = []; // diff ignores other files that do not exist
		} else {
			filesToDiff = [];
		}

		//
		// These are windows to restore because of hot-exit
		//
		const hotExitRestore = (openConfig.initialStartup && !openConfig.cli.extensionDevelopmentPath);
		const foldersToRestore = hotExitRestore ? this.backupService.getWorkspaceBackupPaths() : [];
		let emptyToRestore = hotExitRestore ? this.backupService.getEmptyWorkspaceBackupPaths() : [];
		emptyToRestore.push(...windowsToOpen.filter(w => !w.workspacePath && w.backupPath).map(w => path.basename(w.backupPath))); // add empty windows with backupPath
		emptyToRestore = arrays.distinct(emptyToRestore); // prevent duplicates

		// Open based on config
		const usedWindows = this.doOpen(openConfig, foldersToOpen, foldersToRestore, emptyToRestore, emptyToOpen, filesToOpen, filesToCreate, filesToDiff);

		// Make sure the last active window gets focus if we opened multiple
		if (usedWindows.length > 1 && this.windowsState.lastActiveWindow) {
			let lastActiveWindw = usedWindows.filter(w => w.backupPath === this.windowsState.lastActiveWindow.backupPath);
			if (lastActiveWindw.length) {
				lastActiveWindw[0].focus();
			}
		}

		// Remember in recent document list (unless this opens for extension development)
		// Also do not add paths when files are opened for diffing, only if opened individually
		if (!usedWindows.some(w => w.isExtensionDevelopmentHost) && !openConfig.cli.diff) {
			const recentPaths: { path: string; isFile?: boolean; }[] = [];

			windowsToOpen.forEach(win => {
				if (win.filePath || win.workspacePath) {
					recentPaths.push({ path: win.filePath || win.workspacePath, isFile: !!win.filePath });
				}
			});

			if (recentPaths.length) {
				this.historyService.addToRecentPathsList(recentPaths);
			}
		}

		// Emit events
		if (windowsToOpen.length) {
			this._onPathsOpen.fire(windowsToOpen);
		}

		return usedWindows;
	}

	private doOpen(
		openConfig: IOpenConfiguration,
		foldersToOpen: string[],
		foldersToRestore: string[],
		emptyToRestore: string[],
		emptyToOpen: number,
		filesToOpen: IPath[],
		filesToCreate: IPath[],
		filesToDiff: IPath[]
	) {

		// Settings can decide if files/folders open in new window or not
		let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);

		// Handle files to open/diff or to create when we dont open a folder and we do not restore any folder/untitled from hot-exit
		const usedWindows: CodeWindow[] = [];
		if (!foldersToOpen.length && !foldersToRestore.length && !emptyToRestore.length && (filesToOpen.length > 0 || filesToCreate.length > 0 || filesToDiff.length > 0)) {

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

			if (windowOrFolder instanceof CodeWindow) {
				windowOrFolder.focus();
				const files = { filesToOpen, filesToCreate, filesToDiff }; // copy to object because they get reset shortly after
				windowOrFolder.ready().then(readyWindow => {
					readyWindow.send('vscode:openFiles', files);
				});

				usedWindows.push(windowOrFolder);
			}

			// Otherwise open instance with files
			else {
				const browserWindow = this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					workspacePath: windowOrFolder,
					filesToOpen,
					filesToCreate,
					filesToDiff,
					forceNewWindow: true
				});
				usedWindows.push(browserWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Reset these because we handled them
			filesToOpen = [];
			filesToCreate = [];
			filesToDiff = [];
		}

		// Handle folders to open (instructed and to restore)
		let allFoldersToOpen = arrays.distinct([...foldersToOpen, ...foldersToRestore], folder => isLinux ? folder : folder.toLowerCase()); // prevent duplicates
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
				if (windowsOnWorkspacePath.some(win => isEqual(win.openedWorkspacePath, folderToOpen, !isLinux /* ignorecase */))) {
					return; // ignore folders that are already open
				}

				const browserWindow = this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					workspacePath: folderToOpen,
					filesToOpen,
					filesToCreate,
					filesToDiff,
					forceNewWindow: openFolderInNewWindow,
					windowToUse: openFolderInNewWindow ? void 0 : openConfig.windowToUse as CodeWindow
				});
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
				const browserWindow = this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					filesToOpen,
					filesToCreate,
					filesToDiff,
					forceNewWindow: true,
					emptyWorkspaceBackupFolder
				});
				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Only open empty if no empty workspaces were restored
		else if (emptyToOpen > 0) {
			for (let i = 0; i < emptyToOpen; i++) {
				const browserWindow = this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					forceNewWindow: openFolderInNewWindow,
					windowToUse: openFolderInNewWindow ? void 0 : openConfig.windowToUse as CodeWindow
				});
				usedWindows.push(browserWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}
		}

		return arrays.distinct(usedWindows);
	}

	private getWindowsToOpen(openConfig: IOpenConfiguration): IWindowToOpen[] {
		let windowsToOpen: IWindowToOpen[];

		// Extract paths: from API
		if (openConfig.pathsToOpen && openConfig.pathsToOpen.length > 0) {
			windowsToOpen = this.doExtractPathsFromAPI(openConfig.pathsToOpen, openConfig.cli && openConfig.cli.goto);
		}

		// Check for force empty
		else if (openConfig.forceEmpty) {
			windowsToOpen = [Object.create(null)];
		}

		// Extract paths: from CLI
		else if (openConfig.cli._.length > 0) {
			windowsToOpen = this.doExtractPathsFromCLI(openConfig.cli);
		}

		// Extract windows: from previous session
		else {
			windowsToOpen = this.doGetWindowsFromLastSession();
		}

		return windowsToOpen;
	}

	private doExtractPathsFromAPI(paths: string[], gotoLineMode: boolean): IPath[] {
		let pathsToOpen = paths.map(pathToOpen => {
			const path = this.parsePath(pathToOpen, false, gotoLineMode);

			// Warn if the requested path to open does not exist
			if (!path) {
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

			return path;
		});

		// get rid of nulls
		pathsToOpen = arrays.coalesce(pathsToOpen);

		return pathsToOpen;
	}

	private doExtractPathsFromCLI(cli: ParsedArgs): IPath[] {
		const pathsToOpen = cli._.map(candidate => this.parsePath(candidate, true /* ignoreFileNotFound */, cli.goto)).filter(path => !!path);
		if (pathsToOpen.length > 0) {
			return pathsToOpen;
		}

		// No path provided, return empty to open empty
		return [Object.create(null)];
	}

	private doGetWindowsFromLastSession(): IWindowToOpen[] {
		const restoreWindows = this.getRestoreWindowsSetting();
		const lastActiveWindow = this.windowsState.lastActiveWindow;

		switch (restoreWindows) {

			// none: we always open an empty window
			case 'none':
				return [Object.create(null)];

			// one: restore last opened folder or empty window
			case 'one':
				if (lastActiveWindow) {

					// return folder path if it is valid
					const folder = lastActiveWindow.workspacePath;
					if (folder) {
						const validatedFolderPath = this.parsePath(folder);
						if (validatedFolderPath) {
							return [validatedFolderPath];
						}
					}

					// otherwise use backup path to restore empty windows
					else if (lastActiveWindow.backupPath) {
						return [{ backupPath: lastActiveWindow.backupPath }];
					}
				}
				break;

			// all: restore all windows
			// folders: restore last opened folders only
			case 'all':
			case 'folders':

				// Windows with Folders
				const lastOpenedFolders = this.windowsState.openedWindows.filter(w => !!w.workspacePath).map(o => o.workspacePath);
				const lastActiveFolder = lastActiveWindow && lastActiveWindow.workspacePath;
				if (lastActiveFolder) {
					lastOpenedFolders.push(lastActiveFolder);
				}

				const windowsToOpen = lastOpenedFolders.map(candidate => this.parsePath(candidate)).filter(path => !!path);

				// Windows that were Empty
				if (restoreWindows === 'all') {
					const lastOpenedEmpty = this.windowsState.openedWindows.filter(w => !w.workspacePath && w.backupPath).map(w => w.backupPath);
					const lastActiveEmpty = lastActiveWindow && !lastActiveWindow.workspacePath && lastActiveWindow.backupPath;
					if (lastActiveEmpty) {
						lastOpenedEmpty.push(lastActiveEmpty);
					}

					windowsToOpen.push(...lastOpenedEmpty.map(backupPath => ({ backupPath })));
				}

				if (windowsToOpen.length > 0) {
					return windowsToOpen;
				}

				break;
		}

		// Always fallback to empty window
		return [Object.create(null)];
	}

	private getRestoreWindowsSetting(): RestoreWindowsSetting {
		let restoreWindows: RestoreWindowsSetting;
		if (this.lifecycleService.wasRestarted) {
			restoreWindows = 'all'; // always reopen all windows when an update was applied
		} else {
			const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
			restoreWindows = ((windowConfig && windowConfig.restoreWindows) || 'one') as RestoreWindowsSetting;

			if (restoreWindows === 'one' /* default */ && windowConfig && windowConfig.reopenFolders) {
				restoreWindows = windowConfig.reopenFolders; // TODO@Ben migration
			}

			if (['all', 'folders', 'one', 'none'].indexOf(restoreWindows) === -1) {
				restoreWindows = 'one';
			}
		}

		return restoreWindows;
	}

	private parsePath(anyPath: string, ignoreFileNotFound?: boolean, gotoLineMode?: boolean): IWindowToOpen {
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
			this.historyService.removeFromRecentPathsList(candidate); // since file does not seem to exist anymore, remove from recent

			if (ignoreFileNotFound) {
				return { filePath: candidate, createFilePath: true }; // assume this is a file that does not yet exist
			}
		}

		return null;
	}

	private shouldOpenNewWindow(openConfig: IOpenConfiguration): { openFolderInNewWindow: boolean; openFilesInNewWindow: boolean; } {

		// let the user settings override how folders are open in a new window or same window unless we are forced
		const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
		const openFolderInNewWindowConfig = (windowConfig && windowConfig.openFoldersInNewWindow) || 'default' /* default */;
		const openFilesInNewWindowConfig = (windowConfig && windowConfig.openFilesInNewWindow) || 'off' /* default */;

		let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
		if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && (openFolderInNewWindowConfig === 'on' || openFolderInNewWindowConfig === 'off')) {
			openFolderInNewWindow = (openFolderInNewWindowConfig === 'on');
		}

		// let the user settings override how files are open in a new window or same window unless we are forced (not for extension development though)
		let openFilesInNewWindow: boolean;
		if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
			openFilesInNewWindow = openConfig.forceNewWindow && !openConfig.forceReuseWindow;
		} else {
			if (openConfig.context === OpenContext.DOCK) {
				openFilesInNewWindow = true; // only on macOS do we allow to open files in a new window if this is triggered via DOCK context
			}

			if (!openConfig.cli.extensionDevelopmentPath && (openFilesInNewWindowConfig === 'on' || openFilesInNewWindowConfig === 'off')) {
				openFilesInNewWindow = (openFilesInNewWindowConfig === 'on');
			}
		}

		return { openFolderInNewWindow, openFilesInNewWindow };
	}

	public openExtensionDevelopmentHostWindow(openConfig: IOpenConfiguration): void {

		// Reload an existing extension development host window on the same path
		// We currently do not allow more than one extension development window
		// on the same extension path.
		let res = WindowsManager.WINDOWS.filter(w => w.config && isEqual(w.config.extensionDevelopmentPath, openConfig.cli.extensionDevelopmentPath, !isLinux /* ignorecase */));
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

	private openInBrowserWindow(options: IOpenBrowserWindowOptions): CodeWindow {

		// Build IWindowConfiguration from config and options
		const configuration: IWindowConfiguration = mixin({}, options.cli); // inherit all properties from CLI
		configuration.appRoot = this.environmentService.appRoot;
		configuration.execPath = process.execPath;
		configuration.userEnv = assign({}, this.initialUserEnv, options.userEnv || {});
		configuration.isInitialStartup = options.initialStartup;
		configuration.workspacePath = options.workspacePath;
		configuration.filesToOpen = options.filesToOpen;
		configuration.filesToCreate = options.filesToCreate;
		configuration.filesToDiff = options.filesToDiff;
		configuration.nodeCachedDataDir = this.environmentService.nodeCachedDataDir;

		// if we know the backup folder upfront (for empty workspaces to restore), we can set it
		// directly here which helps for restoring UI state associated with that window.
		// For all other cases we first call into registerWindowForBackupsSync() to set it before
		// loading the window.
		if (options.emptyWorkspaceBackupFolder) {
			configuration.backupPath = path.join(this.environmentService.backupHome, options.emptyWorkspaceBackupFolder);
		}

		let codeWindow: CodeWindow;

		if (!options.forceNewWindow) {
			codeWindow = options.windowToUse || this.getLastActiveWindow();

			if (codeWindow) {
				codeWindow.focus();
			}
		}

		// New window
		if (!codeWindow) {
			const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
			const state = this.getNewWindowState(configuration);

			// Window state is not from a previous session: only allow fullscreen if we inherit it or user wants fullscreen
			let allowFullscreen: boolean;
			if (state.hasDefaultState) {
				allowFullscreen = (windowConfig && windowConfig.newWindowDimensions && ['fullscreen', 'inherit'].indexOf(windowConfig.newWindowDimensions) >= 0);
			}

			// Window state is from a previous session: only allow fullscreen when we got updated or user wants to restore
			else {
				allowFullscreen = this.lifecycleService.wasRestarted || (windowConfig && windowConfig.restoreFullscreen);
			}

			if (state.mode === WindowMode.Fullscreen && !allowFullscreen) {
				state.mode = WindowMode.Normal;
			}

			codeWindow = new CodeWindow({
				state,
				extensionDevelopmentPath: configuration.extensionDevelopmentPath,
				isExtensionTestHost: !!configuration.extensionTestsPath
			},
				this.logService,
				this.environmentService,
				this.configurationService,
				this.storageService
			);

			WindowsManager.WINDOWS.push(codeWindow);

			// Window Events
			codeWindow.win.webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			codeWindow.win.webContents.on('devtools-reload-page', () => this.reload(codeWindow));
			codeWindow.win.webContents.on('crashed', () => this.onWindowError(codeWindow, WindowError.CRASHED));
			codeWindow.win.on('unresponsive', () => this.onWindowError(codeWindow, WindowError.UNRESPONSIVE));
			codeWindow.win.on('closed', () => this.onWindowClosed(codeWindow));

			// Lifecycle
			this.lifecycleService.registerWindow(codeWindow);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in extension development host mode. These options are all development related.
			const currentWindowConfig = codeWindow.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
				configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
				configuration.verbose = currentWindowConfig.verbose;
				configuration.debugBrkPluginHost = currentWindowConfig.debugBrkPluginHost;
				configuration.debugPluginHost = currentWindowConfig.debugPluginHost;
				configuration['extensions-dir'] = currentWindowConfig['extensions-dir'];
			}
		}

		// Only load when the window has not vetoed this
		this.lifecycleService.unload(codeWindow, UnloadReason.LOAD).done(veto => {
			if (!veto) {

				// Register window for backups
				if (!configuration.extensionDevelopmentPath) {
					const backupPath = this.backupService.registerWindowForBackupsSync(codeWindow.id, !configuration.workspacePath, options.emptyWorkspaceBackupFolder, configuration.workspacePath);
					configuration.backupPath = backupPath;
				}

				// Load it
				codeWindow.load(configuration);
			}
		});

		return codeWindow;
	}

	private getNewWindowState(configuration: IWindowConfiguration): INewWindowState {

		// extension development host Window - load from stored settings if any
		if (!!configuration.extensionDevelopmentPath && this.windowsState.lastPluginDevelopmentHostWindow) {
			return this.windowsState.lastPluginDevelopmentHostWindow.uiState;
		}

		// Known Folder - load from stored settings if any
		if (configuration.workspacePath) {
			const stateForWorkspace = this.windowsState.openedWindows.filter(o => isEqual(o.workspacePath, configuration.workspacePath, !isLinux /* ignorecase */)).map(o => o.uiState);
			if (stateForWorkspace.length) {
				return stateForWorkspace[0];
			}
		}

		// Empty workspace with backups
		else if (configuration.backupPath) {
			const stateForWorkspace = this.windowsState.openedWindows.filter(o => o.backupPath === configuration.backupPath).map(o => o.uiState);
			if (stateForWorkspace.length) {
				return stateForWorkspace[0];
			}
		}

		// First Window
		const lastActive = this.getLastActiveWindow();
		const lastActiveState = this.lastClosedWindowState || this.windowsState.lastActiveWindow;
		if (!lastActive && lastActiveState) {
			return lastActiveState.uiState;
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
			if (isMacintosh) {
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

	public reload(win: CodeWindow, cli?: ParsedArgs): void {

		// Only reload when the window has not vetoed this
		this.lifecycleService.unload(win, UnloadReason.RELOAD).done(veto => {
			if (!veto) {
				win.reload(cli);

				// Emit
				this._onWindowReload.fire(win.id);
			}
		});
	}

	public focusLastActive(cli: ParsedArgs, context: OpenContext): CodeWindow {
		const lastActive = this.getLastActiveWindow();
		if (lastActive) {
			lastActive.focus();

			return lastActive;
		}

		// No window - open new empty one
		return this.open({ context, cli, forceEmpty: true })[0];
	}

	public getLastActiveWindow(): CodeWindow {
		return getLastActiveWindow(WindowsManager.WINDOWS);
	}

	public findWindow(workspacePath: string, filePath?: string, extensionDevelopmentPath?: string): CodeWindow {
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
				if (typeof w.openedWorkspacePath === 'string' && (isEqual(w.openedWorkspacePath, workspacePath, !isLinux /* ignorecase */))) {
					return true;
				}

				// match on file
				if (typeof w.openedFilePath === 'string' && isEqual(w.openedFilePath, filePath, !isLinux /* ignorecase */)) {
					return true;
				}

				// match on file path
				if (typeof w.openedWorkspacePath === 'string' && filePath && isEqualOrParent(filePath, w.openedWorkspacePath, !isLinux /* ignorecase */)) {
					return true;
				}

				// match on extension development path
				if (typeof extensionDevelopmentPath === 'string' && isEqual(w.extensionDevelopmentPath, extensionDevelopmentPath, !isLinux /* ignorecase */)) {
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

	public sendToAll(channel: string, payload?: any, windowIdsToIgnore?: number[]): void {
		WindowsManager.WINDOWS.forEach(w => {
			if (windowIdsToIgnore && windowIdsToIgnore.indexOf(w.id) >= 0) {
				return; // do not send if we are instructed to ignore it
			}

			w.sendWhenReady(channel, payload);
		});
	}

	public getFocusedWindow(): CodeWindow {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			return this.getWindowById(win.id);
		}

		return null;
	}

	public getWindowById(windowId: number): CodeWindow {
		const res = WindowsManager.WINDOWS.filter(w => w.id === windowId);
		if (res && res.length === 1) {
			return res[0];
		}

		return null;
	}

	public getWindows(): CodeWindow[] {
		return WindowsManager.WINDOWS;
	}

	public getWindowCount(): number {
		return WindowsManager.WINDOWS.length;
	}

	private onWindowError(codeWindow: CodeWindow, error: WindowError): void {
		console.error(error === WindowError.CRASHED ? '[VS Code]: render process crashed!' : '[VS Code]: detected unresponsive');

		// Unresponsive
		if (error === WindowError.UNRESPONSIVE) {
			dialog.showMessageBox(codeWindow.win, {
				title: product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('wait', "Keep Waiting"), nls.localize('close', "Close")],
				message: nls.localize('appStalled', "The window is no longer responding"),
				detail: nls.localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
				noLink: true
			}, result => {
				if (!codeWindow.win) {
					return; // Return early if the window has been going down already
				}

				if (result === 0) {
					codeWindow.reload();
				} else if (result === 2) {
					this.onBeforeWindowClose(codeWindow); // 'close' event will not be fired on destroy(), so run it manually
					codeWindow.win.destroy(); // make sure to destroy the window as it is unresponsive
				}
			});
		}

		// Crashed
		else {
			dialog.showMessageBox(codeWindow.win, {
				title: product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('close', "Close")],
				message: nls.localize('appCrashed', "The window has crashed"),
				detail: nls.localize('appCrashedDetail', "We are sorry for the inconvenience! You can reopen the window to continue where you left off."),
				noLink: true
			}, result => {
				if (!codeWindow.win) {
					return; // Return early if the window has been going down already
				}

				if (result === 0) {
					codeWindow.reload();
				} else if (result === 1) {
					this.onBeforeWindowClose(codeWindow); // 'close' event will not be fired on destroy(), so run it manually
					codeWindow.win.destroy(); // make sure to destroy the window as it has crashed
				}
			});
		}
	}

	private onWindowClosed(win: CodeWindow): void {

		// Tell window
		win.dispose();

		// Remove from our list so that Electron can clean it up
		const index = WindowsManager.WINDOWS.indexOf(win);
		WindowsManager.WINDOWS.splice(index, 1);

		// Emit
		this._onWindowClose.fire(win.id);
	}

	public pickFileFolderAndOpen(forceNewWindow?: boolean, data?: ITelemetryData): void {
		this.fileDialog.pickAndOpen({ pickFolders: true, pickFiles: true, forceNewWindow }, 'openFileFolder', data);
	}

	public pickFileAndOpen(forceNewWindow?: boolean, path?: string, window?: CodeWindow, data?: ITelemetryData): void {
		this.fileDialog.pickAndOpen({ pickFiles: true, forceNewWindow, path, window, title: nls.localize('openFile', "Open File") }, 'openFile', data);
	}

	public pickFolderAndOpen(forceNewWindow?: boolean, window?: CodeWindow, data?: ITelemetryData): void {
		this.fileDialog.pickAndOpen({ pickFolders: true, forceNewWindow, window, title: nls.localize('openFolder', "Open Folder") }, 'openFolder', data);
	}

	public pickFolder(options?: { buttonLabel: string; title: string; }): TPromise<string[]> {
		return new TPromise((c, e) => {
			this.fileDialog.getFileOrFolderPaths({ pickFolders: true, buttonLabel: options && options.buttonLabel }, folders => {
				c(folders || []);
			});
		});
	}

	public quit(): void {

		// If the user selected to exit from an extension development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		const codeWindow = this.getFocusedWindow();
		if (codeWindow && codeWindow.isExtensionDevelopmentHost && this.getWindowCount() > 1) {
			codeWindow.win.close();
		}

		// Otherwise: normal quit
		else {
			setTimeout(() => {
				this.lifecycleService.quit();
			}, 10 /* delay to unwind callback stack (IPC) */);
		}
	}
}

interface INativeOpenDialogOptions {
	title?: string;
	pickFolders?: boolean;
	pickFiles?: boolean;
	path?: string;
	forceNewWindow?: boolean;
	window?: CodeWindow;
	buttonLabel?: string;
}

class FileDialog {

	private static workingDirPickerStorageKey = 'pickerWorkingDir';

	constructor(
		private environmentService: IEnvironmentService,
		private telemetryService: ITelemetryService,
		private storageService: IStorageService,
		private windowsMainService: IWindowsMainService
	) {
	}

	public pickAndOpen(options: INativeOpenDialogOptions, eventName: string, data?: ITelemetryData): void {
		this.getFileOrFolderPaths(options, (paths: string[]) => {
			const nOfPaths = paths ? paths.length : 0;
			if (nOfPaths) {
				this.windowsMainService.open({ context: OpenContext.DIALOG, cli: this.environmentService.args, pathsToOpen: paths, forceNewWindow: options.forceNewWindow });
			}
			this.telemetryService.publicLog(eventName, {
				...data,
				outcome: nOfPaths ? 'success' : 'canceled',
				nOfPaths
			});
		});
	}

	public getFileOrFolderPaths(options: INativeOpenDialogOptions, clb: (paths: string[]) => void): void {
		const workingDir = options.path || this.storageService.getItem<string>(FileDialog.workingDirPickerStorageKey);
		const focussedWindow = options.window || this.windowsMainService.getFocusedWindow();

		let pickerProperties: ('openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory')[];
		if (options.pickFiles && options.pickFolders) {
			pickerProperties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
		} else {
			pickerProperties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		dialog.showOpenDialog(focussedWindow && focussedWindow.win, {
			title: options && options.title ? options.title : void 0,
			defaultPath: workingDir,
			properties: pickerProperties,
			buttonLabel: options && options.buttonLabel ? options.buttonLabel : void 0
		}, paths => {
			if (paths && paths.length > 0) {

				// Remember path in storage for next time
				this.storageService.setItem(FileDialog.workingDirPickerStorageKey, path.dirname(paths[0]));

				// Return
				clb(paths);
			} else {
				clb(void (0));
			}
		});
	}
}