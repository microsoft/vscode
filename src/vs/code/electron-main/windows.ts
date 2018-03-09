/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { basename, normalize, join, dirname } from 'path';
import * as fs from 'original-fs';
import { localize } from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { assign, mixin, equals } from 'vs/base/common/objects';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { IStateService } from 'vs/platform/state/common/state';
import { CodeWindow, defaultWindowState } from 'vs/code/electron-main/window';
import { ipcMain as ipc, screen, BrowserWindow, dialog, systemPreferences, app } from 'electron';
import { IPathWithLineAndColumn, parseLineAndColumnAware } from 'vs/code/node/paths';
import { ILifecycleService, UnloadReason, IWindowUnloadEvent } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWindowSettings, OpenContext, IPath, IWindowConfiguration, INativeOpenDialogOptions, ReadyState, IPathsToWaitFor, IEnterWorkspaceResult, IMessageBoxResult } from 'vs/platform/windows/common/windows';
import { getLastActiveWindow, findBestWindowOrFolderForFile, findWindowOnWorkspace, findWindowOnExtensionDevelopmentPath, findWindowOnWorkspaceOrFolderPath } from 'vs/code/node/windowsFinder';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import product from 'vs/platform/node/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isEqual } from 'vs/base/common/paths';
import { IWindowsMainService, IOpenConfiguration, IWindowsCountChangedEvent, ICodeWindow, IWindowState as ISingleWindowState, WindowMode } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { IProcessEnvironment, isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspacesMainService, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, WORKSPACE_FILTER, isSingleFolderWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { normalizeNFC } from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { Queue } from 'vs/base/common/async';

enum WindowError {
	UNRESPONSIVE,
	CRASHED
}

interface INewWindowState extends ISingleWindowState {
	hasDefaultState?: boolean;
}

interface IWindowState {
	workspace?: IWorkspaceIdentifier;
	folderPath?: string;
	backupPath: string;
	uiState: ISingleWindowState;
}

interface IWindowsState {
	lastActiveWindow?: IWindowState;
	lastPluginDevelopmentHostWindow?: IWindowState;
	openedWindows: IWindowState[];
}

type RestoreWindowsSetting = 'all' | 'folders' | 'one' | 'none';

interface IOpenBrowserWindowOptions {
	userEnv?: IProcessEnvironment;
	cli?: ParsedArgs;

	workspace?: IWorkspaceIdentifier;
	folderPath?: string;

	initialStartup?: boolean;

	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;

	forceNewWindow?: boolean;
	windowToUse?: ICodeWindow;

	emptyWindowBackupFolder?: string;
}

interface IPathToOpen extends IPath {

	// the workspace for a Code instance to open
	workspace?: IWorkspaceIdentifier;

	// the folder path for a Code instance to open
	folderPath?: string;

	// the backup spath for a Code instance to use
	backupPath?: string;

	// indicator to create the file path in the Code instance
	createFilePath?: boolean;
}

export class WindowsManager implements IWindowsMainService {

	_serviceBrand: any;

	private static readonly windowsStateStorageKey = 'windowsState';

	private static WINDOWS: ICodeWindow[] = [];

	private initialUserEnv: IProcessEnvironment;

	private windowsState: IWindowsState;
	private lastClosedWindowState: IWindowState;

	private dialogs: Dialogs;
	private workspacesManager: WorkspacesManager;

	private _onWindowReady = new Emitter<ICodeWindow>();
	onWindowReady: CommonEvent<ICodeWindow> = this._onWindowReady.event;

	private _onWindowClose = new Emitter<number>();
	onWindowClose: CommonEvent<number> = this._onWindowClose.event;

	private _onWindowLoad = new Emitter<number>();
	onWindowLoad: CommonEvent<number> = this._onWindowLoad.event;

	private _onActiveWindowChanged = new Emitter<ICodeWindow>();
	onActiveWindowChanged: CommonEvent<ICodeWindow> = this._onActiveWindowChanged.event;

	private _onWindowReload = new Emitter<number>();
	onWindowReload: CommonEvent<number> = this._onWindowReload.event;

	private _onWindowsCountChanged = new Emitter<IWindowsCountChangedEvent>();
	onWindowsCountChanged: CommonEvent<IWindowsCountChangedEvent> = this._onWindowsCountChanged.event;

	constructor(
		private readonly machineId: string,
		@ILogService private logService: ILogService,
		@IStateService private stateService: IStateService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IBackupMainService private backupMainService: IBackupMainService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IHistoryMainService private historyMainService: IHistoryMainService,
		@IWorkspacesMainService private workspacesMainService: IWorkspacesMainService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.windowsState = this.stateService.getItem<IWindowsState>(WindowsManager.windowsStateStorageKey) || { openedWindows: [] };
		if (!Array.isArray(this.windowsState.openedWindows)) {
			this.windowsState.openedWindows = [];
		}

		this.dialogs = new Dialogs(environmentService, telemetryService, stateService, this);
		this.workspacesManager = new WorkspacesManager(workspacesMainService, backupMainService, environmentService, this);
	}

	public ready(initialUserEnv: IProcessEnvironment): void {
		this.initialUserEnv = initialUserEnv;

		this.registerListeners();
	}

	private registerListeners(): void {

		// React to windows focus changes
		app.on('browser-window-focus', () => {
			setTimeout(() => {
				this._onActiveWindowChanged.fire(this.getLastActiveWindow());
			});
		});

		// React to workbench loaded events from windows
		ipc.on('vscode:workbenchLoaded', (_event: any, windowId: number) => {
			this.logService.trace('IPC#vscode-workbenchLoaded');

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

		// Handle various lifecycle events around windows
		this.lifecycleService.onBeforeWindowUnload(e => this.onBeforeWindowUnload(e));
		this.lifecycleService.onBeforeWindowClose(win => this.onBeforeWindowClose(win as ICodeWindow));
		this.lifecycleService.onBeforeShutdown(() => this.onBeforeShutdown());
		this.onWindowsCountChanged(e => {
			if (e.newCount - e.oldCount > 0) {
				// clear last closed window state when a new window opens. this helps on macOS where
				// otherwise closing the last window, opening a new window and then quitting would
				// use the state of the previously closed window when restarting.
				this.lastClosedWindowState = void 0;
			}
		});
	}

	// Note that onBeforeShutdown() and onBeforeWindowClose() are fired in different order depending on the OS:
	// - macOS: since the app will not quit when closing the last window, you will always first get
	//          the onBeforeShutdown() event followed by N onbeforeWindowClose() events for each window
	// - other: on other OS, closing the last window will quit the app so the order depends on the
	//          user interaction: closing the last window will first trigger onBeforeWindowClose()
	//          and then onBeforeShutdown(). Using the quit action however will first issue onBeforeShutdown()
	//          and then onBeforeWindowClose().
	//
	// Here is the behaviour on different OS dependig on action taken (Electron 1.7.x):
	//
	// Legend
	// -  quit(N): quit application with N windows opened
	// - close(1): close one window via the window close button
	// - closeAll: close all windows via the taskbar command
	// - onBeforeShutdown(N): number of windows reported in this event handler
	// - onBeforeWindowClose(N, M): number of windows reported and quitRequested boolean in this event handler
	//
	// macOS
	// 	-     quit(1): onBeforeShutdown(1), onBeforeWindowClose(1, true)
	// 	-     quit(2): onBeforeShutdown(2), onBeforeWindowClose(2, true), onBeforeWindowClose(2, true)
	// 	-     quit(0): onBeforeShutdown(0)
	// 	-    close(1): onBeforeWindowClose(1, false)
	//
	// Windows
	// 	-     quit(1): onBeforeShutdown(1), onBeforeWindowClose(1, true)
	// 	-     quit(2): onBeforeShutdown(2), onBeforeWindowClose(2, true), onBeforeWindowClose(2, true)
	// 	-    close(1): onBeforeWindowClose(2, false)[not last window]
	// 	-    close(1): onBeforeWindowClose(1, false), onBeforeShutdown(0)[last window]
	// 	- closeAll(2): onBeforeWindowClose(2, false), onBeforeWindowClose(2, false), onBeforeShutdown(0)
	//
	// Linux
	// 	-     quit(1): onBeforeShutdown(1), onBeforeWindowClose(1, true)
	// 	-     quit(2): onBeforeShutdown(2), onBeforeWindowClose(2, true), onBeforeWindowClose(2, true)
	// 	-    close(1): onBeforeWindowClose(2, false)[not last window]
	// 	-    close(1): onBeforeWindowClose(1, false), onBeforeShutdown(0)[last window]
	// 	- closeAll(2): onBeforeWindowClose(2, false), onBeforeWindowClose(2, false), onBeforeShutdown(0)
	//
	private onBeforeShutdown(): void {
		const currentWindowsState: IWindowsState = {
			openedWindows: [],
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
				currentWindowsState.lastActiveWindow = this.toWindowState(activeWindow);
			}
		}

		// 2.) Find extension host window
		const extensionHostWindow = WindowsManager.WINDOWS.filter(w => w.isExtensionDevelopmentHost && !w.isExtensionTestHost)[0];
		if (extensionHostWindow) {
			currentWindowsState.lastPluginDevelopmentHostWindow = this.toWindowState(extensionHostWindow);
		}

		// 3.) All windows (except extension host) for N >= 2 to support restoreWindows: all or for auto update
		//
		// Carefull here: asking a window for its window state after it has been closed returns bogus values (width: 0, height: 0)
		// so if we ever want to persist the UI state of the last closed window (window count === 1), it has
		// to come from the stored lastClosedWindowState on Win/Linux at least
		if (this.getWindowCount() > 1) {
			currentWindowsState.openedWindows = WindowsManager.WINDOWS.filter(w => !w.isExtensionDevelopmentHost).map(w => this.toWindowState(w));
		}

		// Persist
		this.stateService.setItem(WindowsManager.windowsStateStorageKey, currentWindowsState);
	}

	// See note on #onBeforeShutdown() for details how these events are flowing
	private onBeforeWindowClose(win: ICodeWindow): void {
		if (this.lifecycleService.isQuitRequested()) {
			return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
		}

		// On Window close, update our stored UI state of this window
		const state: IWindowState = this.toWindowState(win);
		if (win.isExtensionDevelopmentHost && !win.isExtensionTestHost) {
			this.windowsState.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
		}

		// Any non extension host window with same workspace or folder
		else if (!win.isExtensionDevelopmentHost && (!!win.openedWorkspace || !!win.openedFolderPath)) {
			this.windowsState.openedWindows.forEach(o => {
				const sameWorkspace = win.openedWorkspace && o.workspace && o.workspace.id === win.openedWorkspace.id;
				const sameFolder = win.openedFolderPath && isEqual(o.folderPath, win.openedFolderPath, !isLinux /* ignorecase */);

				if (sameWorkspace || sameFolder) {
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

	private toWindowState(win: ICodeWindow): IWindowState {
		return {
			workspace: win.openedWorkspace,
			folderPath: win.openedFolderPath,
			backupPath: win.backupPath,
			uiState: win.serializeWindowState()
		};
	}

	public open(openConfig: IOpenConfiguration): ICodeWindow[] {
		openConfig = this.validateOpenConfig(openConfig);

		let pathsToOpen = this.getPathsToOpen(openConfig);

		// When run with --add, take the folders that are to be opened as
		// folders that should be added to the currently active window.
		let foldersToAdd: IPath[] = [];
		if (openConfig.addMode) {
			foldersToAdd = pathsToOpen.filter(path => !!path.folderPath).map(path => ({ filePath: path.folderPath }));
			pathsToOpen = pathsToOpen.filter(path => !path.folderPath);
		}

		let filesToOpen = pathsToOpen.filter(path => !!path.filePath && !path.createFilePath);
		let filesToCreate = pathsToOpen.filter(path => !!path.filePath && path.createFilePath);

		// When run with --diff, take the files to open as files to diff
		// if there are exactly two files provided.
		let filesToDiff: IPath[] = [];
		if (openConfig.diffMode && filesToOpen.length === 2) {
			filesToDiff = filesToOpen;
			filesToOpen = [];
			filesToCreate = []; // diff ignores other files that do not exist
		}

		// When run with --wait, make sure we keep the paths to wait for
		let filesToWait: IPathsToWaitFor;
		if (openConfig.cli.wait && openConfig.cli.waitMarkerFilePath) {
			filesToWait = { paths: [...filesToDiff, ...filesToOpen, ...filesToCreate], waitMarkerFilePath: openConfig.cli.waitMarkerFilePath };
		}

		//
		// These are windows to open to show workspaces
		//
		const workspacesToOpen = arrays.distinct(pathsToOpen.filter(win => !!win.workspace).map(win => win.workspace), workspace => workspace.id); // prevent duplicates

		//
		// These are windows to open to show either folders or files (including diffing files or creating them)
		//
		const foldersToOpen = arrays.distinct(pathsToOpen.filter(win => win.folderPath && !win.filePath).map(win => win.folderPath), folder => isLinux ? folder : folder.toLowerCase()); // prevent duplicates

		//
		// These are windows to restore because of hot-exit or from previous session (only performed once on startup!)
		//
		let foldersToRestore: string[] = [];
		let workspacesToRestore: IWorkspaceIdentifier[] = [];
		let emptyToRestore: string[] = [];
		if (openConfig.initialStartup && !openConfig.cli.extensionDevelopmentPath && !openConfig.cli['disable-restore-windows']) {
			foldersToRestore = this.backupMainService.getFolderBackupPaths();

			workspacesToRestore = this.backupMainService.getWorkspaceBackups();						// collect from workspaces with hot-exit backups
			workspacesToRestore.push(...this.workspacesMainService.getUntitledWorkspacesSync());	// collect from previous window session

			emptyToRestore = this.backupMainService.getEmptyWindowBackupPaths();
			emptyToRestore.push(...pathsToOpen.filter(w => !w.workspace && !w.folderPath && w.backupPath).map(w => basename(w.backupPath))); // add empty windows with backupPath
			emptyToRestore = arrays.distinct(emptyToRestore); // prevent duplicates
		}

		//
		// These are empty windows to open
		//
		const emptyToOpen = pathsToOpen.filter(win => !win.workspace && !win.folderPath && !win.filePath && !win.backupPath).length;

		// Open based on config
		const usedWindows = this.doOpen(openConfig, workspacesToOpen, workspacesToRestore, foldersToOpen, foldersToRestore, emptyToRestore, emptyToOpen, filesToOpen, filesToCreate, filesToDiff, filesToWait, foldersToAdd);

		// Make sure to pass focus to the most relevant of the windows if we open multiple
		if (usedWindows.length > 1) {
			let focusLastActive = this.windowsState.lastActiveWindow && !openConfig.forceEmpty && !openConfig.cli._.length && (!openConfig.pathsToOpen || !openConfig.pathsToOpen.length);
			let focusLastOpened = true;
			let focusLastWindow = true;

			// 1.) focus last active window if we are not instructed to open any paths
			if (focusLastActive) {
				const lastActiveWindw = usedWindows.filter(w => w.backupPath === this.windowsState.lastActiveWindow.backupPath);
				if (lastActiveWindw.length) {
					lastActiveWindw[0].focus();
					focusLastOpened = false;
					focusLastWindow = false;
				}
			}

			// 2.) if instructed to open paths, focus last window which is not restored
			if (focusLastOpened) {
				for (let i = usedWindows.length - 1; i >= 0; i--) {
					const usedWindow = usedWindows[i];
					if (
						(usedWindow.openedWorkspace && workspacesToRestore.some(workspace => workspace.id === usedWindow.openedWorkspace.id)) || 	// skip over restored workspace
						(usedWindow.openedFolderPath && foldersToRestore.some(folder => folder === usedWindow.openedFolderPath)) ||					// skip over restored folder
						(usedWindow.backupPath && emptyToRestore.some(empty => empty === basename(usedWindow.backupPath)))							// skip over restored empty window
					) {
						continue;
					}

					usedWindow.focus();
					focusLastWindow = false;
					break;
				}
			}

			// 3.) finally, always ensure to have at least last used window focused
			if (focusLastWindow) {
				usedWindows[usedWindows.length - 1].focus();
			}
		}

		// Remember in recent document list (unless this opens for extension development)
		// Also do not add paths when files are opened for diffing, only if opened individually
		if (!usedWindows.some(w => w.isExtensionDevelopmentHost) && !openConfig.cli.diff) {
			const recentlyOpenedWorkspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[] = [];
			const recentlyOpenedFiles: string[] = [];

			pathsToOpen.forEach(win => {
				if (win.workspace || win.folderPath) {
					recentlyOpenedWorkspaces.push(win.workspace || win.folderPath);
				} else if (win.filePath) {
					recentlyOpenedFiles.push(win.filePath);
				}
			});

			if (!this.environmentService.skipAddToRecentlyOpened) {
				this.historyMainService.addRecentlyOpened(recentlyOpenedWorkspaces, recentlyOpenedFiles);
			}
		}

		// If we got started with --wait from the CLI, we need to signal to the outside when the window
		// used for the edit operation is closed or loaded to a different folder so that the waiting
		// process can continue. We do this by deleting the waitMarkerFilePath.
		if (openConfig.context === OpenContext.CLI && openConfig.cli.wait && openConfig.cli.waitMarkerFilePath && usedWindows.length === 1 && usedWindows[0]) {
			this.waitForWindowCloseOrLoad(usedWindows[0].id).done(() => fs.unlink(openConfig.cli.waitMarkerFilePath, error => void 0));
		}

		return usedWindows;
	}

	private validateOpenConfig(config: IOpenConfiguration): IOpenConfiguration {

		// Make sure addMode is only enabled if we have an active window
		if (config.addMode && (config.initialStartup || !this.getLastActiveWindow())) {
			config.addMode = false;
		}

		return config;
	}

	private doOpen(
		openConfig: IOpenConfiguration,
		workspacesToOpen: IWorkspaceIdentifier[],
		workspacesToRestore: IWorkspaceIdentifier[],
		foldersToOpen: string[],
		foldersToRestore: string[],
		emptyToRestore: string[],
		emptyToOpen: number,
		filesToOpen: IPath[],
		filesToCreate: IPath[],
		filesToDiff: IPath[],
		filesToWait: IPathsToWaitFor,
		foldersToAdd: IPath[]
	) {
		const usedWindows: ICodeWindow[] = [];

		// Settings can decide if files/folders open in new window or not
		let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);

		// Handle folders to add by looking for the last active workspace (not on initial startup)
		if (!openConfig.initialStartup && foldersToAdd.length > 0) {
			const lastActiveWindow = this.getLastActiveWindow();
			if (lastActiveWindow) {
				usedWindows.push(this.doAddFoldersToExistingWidow(lastActiveWindow, foldersToAdd));
			}

			// Reset because we handled them
			foldersToAdd = [];
		}

		// Handle files to open/diff or to create when we dont open a folder and we do not restore any folder/untitled from hot-exit
		const potentialWindowsCount = foldersToOpen.length + foldersToRestore.length + workspacesToOpen.length + workspacesToRestore.length + emptyToRestore.length;
		if (potentialWindowsCount === 0 && (filesToOpen.length > 0 || filesToCreate.length > 0 || filesToDiff.length > 0)) {

			// Find suitable window or folder path to open files in
			const fileToCheck = filesToOpen[0] || filesToCreate[0] || filesToDiff[0];
			let bestWindowOrFolder = findBestWindowOrFolderForFile({
				windows: WindowsManager.WINDOWS,
				newWindow: openFilesInNewWindow,
				reuseWindow: openConfig.forceReuseWindow,
				context: openConfig.context,
				filePath: fileToCheck && fileToCheck.filePath,
				userHome: this.environmentService.userHome,
				workspaceResolver: workspace => this.workspacesMainService.resolveWorkspaceSync(workspace.configPath)
			});

			// Special case: we started with --wait and we got back a folder to open. In this case
			// we actually prefer to not open the folder but operate purely on the file.
			if (typeof bestWindowOrFolder === 'string' && filesToWait) {
				bestWindowOrFolder = !openFilesInNewWindow ? this.getLastActiveWindow() : null;
			}

			// We found a window to open the files in
			if (bestWindowOrFolder instanceof CodeWindow) {

				// Window is workspace
				if (bestWindowOrFolder.openedWorkspace) {
					workspacesToOpen.push(bestWindowOrFolder.openedWorkspace);
				}

				// Window is single folder
				else if (bestWindowOrFolder.openedFolderPath) {
					foldersToOpen.push(bestWindowOrFolder.openedFolderPath);
				}

				// Window is empty
				else {

					// Do open files
					usedWindows.push(this.doOpenFilesInExistingWindow(bestWindowOrFolder, filesToOpen, filesToCreate, filesToDiff, filesToWait));

					// Reset these because we handled them
					filesToOpen = [];
					filesToCreate = [];
					filesToDiff = [];
					filesToWait = void 0;
				}
			}

			// We found a suitable folder to open: add it to foldersToOpen
			else if (typeof bestWindowOrFolder === 'string') {
				foldersToOpen.push(bestWindowOrFolder);
			}

			// Finally, if no window or folder is found, just open the files in an empty window
			else {
				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					filesToOpen,
					filesToCreate,
					filesToDiff,
					filesToWait,
					forceNewWindow: true
				}));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;
			}
		}

		// Handle workspaces to open (instructed and to restore)
		const allWorkspacesToOpen = arrays.distinct([...workspacesToRestore, ...workspacesToOpen], workspace => workspace.id); // prevent duplicates
		if (allWorkspacesToOpen.length > 0) {

			// Check for existing instances
			const windowsOnWorkspace = arrays.coalesce(allWorkspacesToOpen.map(workspaceToOpen => findWindowOnWorkspace(WindowsManager.WINDOWS, workspaceToOpen)));
			if (windowsOnWorkspace.length > 0) {
				const windowOnWorkspace = windowsOnWorkspace[0];

				// Do open files
				usedWindows.push(this.doOpenFilesInExistingWindow(windowOnWorkspace, filesToOpen, filesToCreate, filesToDiff, filesToWait));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			allWorkspacesToOpen.forEach(workspaceToOpen => {
				if (windowsOnWorkspace.some(win => win.openedWorkspace.id === workspaceToOpen.id)) {
					return; // ignore folders that are already open
				}

				// Do open folder
				usedWindows.push(this.doOpenFolderOrWorkspace(openConfig, { workspace: workspaceToOpen }, openFolderInNewWindow, filesToOpen, filesToCreate, filesToDiff, filesToWait));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle folders to open (instructed and to restore)
		const allFoldersToOpen = arrays.distinct([...foldersToRestore, ...foldersToOpen], folder => isLinux ? folder : folder.toLowerCase()); // prevent duplicates
		if (allFoldersToOpen.length > 0) {

			// Check for existing instances
			const windowsOnFolderPath = arrays.coalesce(allFoldersToOpen.map(folderToOpen => findWindowOnWorkspace(WindowsManager.WINDOWS, folderToOpen)));
			if (windowsOnFolderPath.length > 0) {
				const windowOnFolderPath = windowsOnFolderPath[0];

				// Do open files
				usedWindows.push(this.doOpenFilesInExistingWindow(windowOnFolderPath, filesToOpen, filesToCreate, filesToDiff, filesToWait));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			allFoldersToOpen.forEach(folderToOpen => {
				if (windowsOnFolderPath.some(win => isEqual(win.openedFolderPath, folderToOpen, !isLinux /* ignorecase */))) {
					return; // ignore folders that are already open
				}

				// Do open folder
				usedWindows.push(this.doOpenFolderOrWorkspace(openConfig, { folderPath: folderToOpen }, openFolderInNewWindow, filesToOpen, filesToCreate, filesToDiff, filesToWait));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to restore
		if (emptyToRestore.length > 0) {
			emptyToRestore.forEach(emptyWindowBackupFolder => {
				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					filesToOpen,
					filesToCreate,
					filesToDiff,
					filesToWait,
					forceNewWindow: true,
					emptyWindowBackupFolder
				}));

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				filesToWait = void 0;

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to open (only if no other window opened)
		if (usedWindows.length === 0) {
			for (let i = 0; i < emptyToOpen; i++) {
				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					forceNewWindow: openFolderInNewWindow
				}));

				openFolderInNewWindow = true; // any other window to open must open in new window then
			}
		}

		return arrays.distinct(usedWindows);
	}

	private doOpenFilesInExistingWindow(window: ICodeWindow, filesToOpen: IPath[], filesToCreate: IPath[], filesToDiff: IPath[], filesToWait: IPathsToWaitFor): ICodeWindow {
		window.focus(); // make sure window has focus

		window.ready().then(readyWindow => {
			readyWindow.send('vscode:openFiles', { filesToOpen, filesToCreate, filesToDiff, filesToWait });
		});

		return window;
	}

	private doAddFoldersToExistingWidow(window: ICodeWindow, foldersToAdd: IPath[]): ICodeWindow {
		window.focus(); // make sure window has focus

		window.ready().then(readyWindow => {
			readyWindow.send('vscode:addFolders', { foldersToAdd });
		});

		return window;
	}

	private doOpenFolderOrWorkspace(openConfig: IOpenConfiguration, folderOrWorkspace: IPathToOpen, openInNewWindow: boolean, filesToOpen: IPath[], filesToCreate: IPath[], filesToDiff: IPath[], filesToWait: IPathsToWaitFor, windowToUse?: ICodeWindow): ICodeWindow {
		const browserWindow = this.openInBrowserWindow({
			userEnv: openConfig.userEnv,
			cli: openConfig.cli,
			initialStartup: openConfig.initialStartup,
			workspace: folderOrWorkspace.workspace,
			folderPath: folderOrWorkspace.folderPath,
			filesToOpen,
			filesToCreate,
			filesToDiff,
			filesToWait,
			forceNewWindow: openInNewWindow,
			windowToUse
		});

		return browserWindow;
	}

	private getPathsToOpen(openConfig: IOpenConfiguration): IPathToOpen[] {
		let windowsToOpen: IPathToOpen[];
		let isCommandLineOrAPICall = false;

		// Extract paths: from API
		if (openConfig.pathsToOpen && openConfig.pathsToOpen.length > 0) {
			windowsToOpen = this.doExtractPathsFromAPI(openConfig);
			isCommandLineOrAPICall = true;
		}

		// Check for force empty
		else if (openConfig.forceEmpty) {
			windowsToOpen = [Object.create(null)];
		}

		// Extract paths: from CLI
		else if (openConfig.cli._.length > 0) {
			windowsToOpen = this.doExtractPathsFromCLI(openConfig.cli);
			isCommandLineOrAPICall = true;
		}

		// Extract windows: from previous session
		else {
			windowsToOpen = this.doGetWindowsFromLastSession();
		}

		// Convert multiple folders into workspace (if opened via API or CLI)
		// This will ensure to open these folders in one window instead of multiple
		// If we are in addMode, we should not do this because in that case all
		// folders should be added to the existing window.
		if (!openConfig.addMode && isCommandLineOrAPICall) {
			const foldersToOpen = windowsToOpen.filter(path => !!path.folderPath);
			if (foldersToOpen.length > 1) {
				const workspace = this.workspacesMainService.createWorkspaceSync(foldersToOpen.map(folder => ({ uri: URI.file(folder.folderPath) })));

				// Add workspace and remove folders thereby
				windowsToOpen.push({ workspace });
				windowsToOpen = windowsToOpen.filter(path => !path.folderPath);
			}
		}

		return windowsToOpen;
	}

	private doExtractPathsFromAPI(openConfig: IOpenConfiguration): IPath[] {
		let pathsToOpen = openConfig.pathsToOpen.map(pathToOpen => {
			const path = this.parsePath(pathToOpen, { gotoLineMode: openConfig.cli && openConfig.cli.goto, forceOpenWorkspaceAsFile: openConfig.forceOpenWorkspaceAsFile });

			// Warn if the requested path to open does not exist
			if (!path) {
				const options: Electron.MessageBoxOptions = {
					title: product.nameLong,
					type: 'info',
					buttons: [localize('ok', "OK")],
					message: localize('pathNotExistTitle', "Path does not exist"),
					detail: localize('pathNotExistDetail', "The path '{0}' does not seem to exist anymore on disk.", pathToOpen),
					noLink: true
				};

				this.dialogs.showMessageBox(options, this.getFocusedWindow());
			}

			return path;
		});

		// get rid of nulls
		pathsToOpen = arrays.coalesce(pathsToOpen);

		return pathsToOpen;
	}

	private doExtractPathsFromCLI(cli: ParsedArgs): IPath[] {
		const pathsToOpen = arrays.coalesce(cli._.map(candidate => this.parsePath(candidate, { ignoreFileNotFound: true, gotoLineMode: cli.goto })));
		if (pathsToOpen.length > 0) {
			return pathsToOpen;
		}

		// No path provided, return empty to open empty
		return [Object.create(null)];
	}

	private doGetWindowsFromLastSession(): IPathToOpen[] {
		const restoreWindows = this.getRestoreWindowsSetting();
		const lastActiveWindow = this.windowsState.lastActiveWindow;

		switch (restoreWindows) {

			// none: we always open an empty window
			case 'none':
				return [Object.create(null)];

			// one: restore last opened workspace/folder or empty window
			case 'one':
				if (lastActiveWindow) {

					// workspace
					const candidateWorkspace = lastActiveWindow.workspace;
					if (candidateWorkspace) {
						const validatedWorkspace = this.parsePath(candidateWorkspace.configPath);
						if (validatedWorkspace && validatedWorkspace.workspace) {
							return [validatedWorkspace];
						}
					}

					// folder (if path is valid)
					else if (lastActiveWindow.folderPath) {
						const validatedFolder = this.parsePath(lastActiveWindow.folderPath);
						if (validatedFolder && validatedFolder.folderPath) {
							return [validatedFolder];
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
				const windowsToOpen: IPathToOpen[] = [];

				// Workspaces
				const workspaceCandidates = this.windowsState.openedWindows.filter(w => !!w.workspace).map(w => w.workspace);
				if (lastActiveWindow && lastActiveWindow.workspace) {
					workspaceCandidates.push(lastActiveWindow.workspace);
				}
				windowsToOpen.push(...workspaceCandidates.map(candidate => this.parsePath(candidate.configPath)).filter(window => window && window.workspace));

				// Folders
				const folderCandidates = this.windowsState.openedWindows.filter(w => !!w.folderPath).map(w => w.folderPath);
				if (lastActiveWindow && lastActiveWindow.folderPath) {
					folderCandidates.push(lastActiveWindow.folderPath);
				}
				windowsToOpen.push(...folderCandidates.map(candidate => this.parsePath(candidate)).filter(window => window && window.folderPath));

				// Windows that were Empty
				if (restoreWindows === 'all') {
					const lastOpenedEmpty = this.windowsState.openedWindows.filter(w => !w.workspace && !w.folderPath && w.backupPath).map(w => w.backupPath);
					const lastActiveEmpty = lastActiveWindow && !lastActiveWindow.workspace && !lastActiveWindow.folderPath && lastActiveWindow.backupPath;
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
			const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
			restoreWindows = ((windowConfig && windowConfig.restoreWindows) || 'one') as RestoreWindowsSetting;

			if (['all', 'folders', 'one', 'none'].indexOf(restoreWindows) === -1) {
				restoreWindows = 'one';
			}
		}

		return restoreWindows;
	}

	private parsePath(anyPath: string, options?: { ignoreFileNotFound?: boolean, gotoLineMode?: boolean, forceOpenWorkspaceAsFile?: boolean; }): IPathToOpen {
		if (!anyPath) {
			return null;
		}

		let parsedPath: IPathWithLineAndColumn;

		const gotoLineMode = options && options.gotoLineMode;
		if (options && options.gotoLineMode) {
			parsedPath = parseLineAndColumnAware(anyPath);
			anyPath = parsedPath.path;
		}

		const candidate = normalize(anyPath);
		try {
			const candidateStat = fs.statSync(candidate);
			if (candidateStat) {
				if (candidateStat.isFile()) {

					// Workspace (unless disabled via flag)
					if (!options || !options.forceOpenWorkspaceAsFile) {
						const workspace = this.workspacesMainService.resolveWorkspaceSync(candidate);
						if (workspace) {
							return { workspace: { id: workspace.id, configPath: workspace.configPath } };
						}
					}

					// File
					return {
						filePath: candidate,
						lineNumber: gotoLineMode ? parsedPath.line : void 0,
						columnNumber: gotoLineMode ? parsedPath.column : void 0
					};
				}

				// Folder (we check for isDirectory() because e.g. paths like /dev/null
				// are neither file nor folder but some external tools might pass them
				// over to us)
				else if (candidateStat.isDirectory()) {
					return {
						folderPath: candidate
					};
				}
			}
		} catch (error) {
			this.historyMainService.removeFromRecentlyOpened([candidate]); // since file does not seem to exist anymore, remove from recent

			if (options && options.ignoreFileNotFound) {
				return { filePath: candidate, createFilePath: true }; // assume this is a file that does not yet exist
			}
		}

		return null;
	}

	private shouldOpenNewWindow(openConfig: IOpenConfiguration): { openFolderInNewWindow: boolean; openFilesInNewWindow: boolean; } {

		// let the user settings override how folders are open in a new window or same window unless we are forced
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
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

			// macOS: by default we open files in a new window if this is triggered via DOCK context
			if (isMacintosh) {
				if (openConfig.context === OpenContext.DOCK) {
					openFilesInNewWindow = true;
				}
			}

			// Linux/Windows: by default we open files in the new window unless triggered via DIALOG or MENU context
			else {
				if (openConfig.context !== OpenContext.DIALOG && openConfig.context !== OpenContext.MENU) {
					openFilesInNewWindow = true;
				}
			}

			// finally check for overrides of default
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
		const existingWindow = findWindowOnExtensionDevelopmentPath(WindowsManager.WINDOWS, openConfig.cli.extensionDevelopmentPath);
		if (existingWindow) {
			this.reload(existingWindow, openConfig.cli);
			existingWindow.focus(); // make sure it gets focus and is restored

			return;
		}

		// Fill in previously opened workspace unless an explicit path is provided and we are not unit testing
		if (openConfig.cli._.length === 0 && !openConfig.cli.extensionTestsPath) {
			const extensionDevelopmentWindowState = this.windowsState.lastPluginDevelopmentHostWindow;
			const workspaceToOpen = extensionDevelopmentWindowState && (extensionDevelopmentWindowState.workspace || extensionDevelopmentWindowState.folderPath);
			if (workspaceToOpen) {
				openConfig.cli._ = [isSingleFolderWorkspaceIdentifier(workspaceToOpen) ? workspaceToOpen : workspaceToOpen.configPath];
			}
		}

		// Make sure we are not asked to open a workspace or folder that is already opened
		if (openConfig.cli._.some(path => !!findWindowOnWorkspaceOrFolderPath(WindowsManager.WINDOWS, path))) {
			openConfig.cli._ = [];
		}

		// Open it
		this.open({ context: openConfig.context, cli: openConfig.cli, forceNewWindow: true, forceEmpty: openConfig.cli._.length === 0, userEnv: openConfig.userEnv });
	}

	private openInBrowserWindow(options: IOpenBrowserWindowOptions): ICodeWindow {

		// Build IWindowConfiguration from config and options
		const configuration: IWindowConfiguration = mixin({}, options.cli); // inherit all properties from CLI
		configuration.appRoot = this.environmentService.appRoot;
		configuration.machineId = this.machineId;
		configuration.execPath = process.execPath;
		configuration.userEnv = assign({}, this.initialUserEnv, options.userEnv || {});
		configuration.isInitialStartup = options.initialStartup;
		configuration.workspace = options.workspace;
		configuration.folderPath = options.folderPath;
		configuration.filesToOpen = options.filesToOpen;
		configuration.filesToCreate = options.filesToCreate;
		configuration.filesToDiff = options.filesToDiff;
		configuration.filesToWait = options.filesToWait;
		configuration.nodeCachedDataDir = this.environmentService.nodeCachedDataDir;

		// if we know the backup folder upfront (for empty windows to restore), we can set it
		// directly here which helps for restoring UI state associated with that window.
		// For all other cases we first call into registerEmptyWindowBackupSync() to set it before
		// loading the window.
		if (options.emptyWindowBackupFolder) {
			configuration.backupPath = join(this.environmentService.backupHome, options.emptyWindowBackupFolder);
		}

		let window: ICodeWindow;
		if (!options.forceNewWindow) {
			window = options.windowToUse || this.getLastActiveWindow();
			if (window) {
				window.focus();
			}
		}

		// New window
		if (!window) {
			const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
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

			window = this.instantiationService.createInstance(CodeWindow, {
				state,
				extensionDevelopmentPath: configuration.extensionDevelopmentPath,
				isExtensionTestHost: !!configuration.extensionTestsPath
			});

			// Add to our list of windows
			WindowsManager.WINDOWS.push(window);

			// Indicate number change via event
			this._onWindowsCountChanged.fire({ oldCount: WindowsManager.WINDOWS.length - 1, newCount: WindowsManager.WINDOWS.length });

			// Window Events
			window.win.webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			window.win.webContents.on('devtools-reload-page', () => this.reload(window));
			window.win.webContents.on('crashed', () => this.onWindowError(window, WindowError.CRASHED));
			window.win.on('unresponsive', () => this.onWindowError(window, WindowError.UNRESPONSIVE));
			window.win.on('closed', () => this.onWindowClosed(window));

			// Lifecycle
			this.lifecycleService.registerWindow(window);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in extension development host mode. These options are all development related.
			const currentWindowConfig = window.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
				configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
				configuration.verbose = currentWindowConfig.verbose;
				configuration.debugBrkPluginHost = currentWindowConfig.debugBrkPluginHost;
				configuration.debugId = currentWindowConfig.debugId;
				configuration.debugPluginHost = currentWindowConfig.debugPluginHost;
				configuration['extensions-dir'] = currentWindowConfig['extensions-dir'];
			}
		}

		// Only load when the window has not vetoed this
		this.lifecycleService.unload(window, UnloadReason.LOAD).done(veto => {
			if (!veto) {

				// Register window for backups
				if (!configuration.extensionDevelopmentPath) {
					if (configuration.workspace) {
						configuration.backupPath = this.backupMainService.registerWorkspaceBackupSync(configuration.workspace);
					} else if (configuration.folderPath) {
						configuration.backupPath = this.backupMainService.registerFolderBackupSync(configuration.folderPath);
					} else {
						configuration.backupPath = this.backupMainService.registerEmptyWindowBackupSync(options.emptyWindowBackupFolder);
					}
				}

				// Load it
				window.load(configuration);

				// Signal event
				this._onWindowLoad.fire(window.id);
			}
		});

		return window;
	}

	private getNewWindowState(configuration: IWindowConfiguration): INewWindowState {
		const lastActive = this.getLastActiveWindow();

		// Restore state unless we are running extension tests
		if (!configuration.extensionTestsPath) {

			// extension development host Window - load from stored settings if any
			if (!!configuration.extensionDevelopmentPath && this.windowsState.lastPluginDevelopmentHostWindow) {
				return this.windowsState.lastPluginDevelopmentHostWindow.uiState;
			}

			// Known Workspace - load from stored settings
			if (configuration.workspace) {
				const stateForWorkspace = this.windowsState.openedWindows.filter(o => o.workspace && o.workspace.id === configuration.workspace.id).map(o => o.uiState);
				if (stateForWorkspace.length) {
					return stateForWorkspace[0];
				}
			}

			// Known Folder - load from stored settings
			if (configuration.folderPath) {
				const stateForFolder = this.windowsState.openedWindows.filter(o => isEqual(o.folderPath, configuration.folderPath, !isLinux /* ignorecase */)).map(o => o.uiState);
				if (stateForFolder.length) {
					return stateForFolder[0];
				}
			}

			// Empty windows with backups
			else if (configuration.backupPath) {
				const stateForEmptyWindow = this.windowsState.openedWindows.filter(o => o.backupPath === configuration.backupPath).map(o => o.uiState);
				if (stateForEmptyWindow.length) {
					return stateForEmptyWindow[0];
				}
			}

			// First Window
			const lastActiveState = this.lastClosedWindowState || this.windowsState.lastActiveWindow;
			if (!lastActive && lastActiveState) {
				return lastActiveState.uiState;
			}
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
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
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

	public reload(win: ICodeWindow, cli?: ParsedArgs): void {

		// Only reload when the window has not vetoed this
		this.lifecycleService.unload(win, UnloadReason.RELOAD).done(veto => {
			if (!veto) {
				win.reload(void 0, cli);

				// Emit
				this._onWindowReload.fire(win.id);
			}
		});
	}

	public closeWorkspace(win: ICodeWindow): void {
		this.openInBrowserWindow({
			cli: this.environmentService.args,
			windowToUse: win
		});
	}

	public saveAndEnterWorkspace(win: ICodeWindow, path: string): TPromise<IEnterWorkspaceResult> {
		return this.workspacesManager.saveAndEnterWorkspace(win, path).then(result => this.doEnterWorkspace(win, result));
	}

	public createAndEnterWorkspace(win: ICodeWindow, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		return this.workspacesManager.createAndEnterWorkspace(win, folders, path).then(result => this.doEnterWorkspace(win, result));
	}

	private doEnterWorkspace(win: ICodeWindow, result: IEnterWorkspaceResult): IEnterWorkspaceResult {

		// Mark as recently opened
		this.historyMainService.addRecentlyOpened([result.workspace], []);

		// Trigger Eevent to indicate load of workspace into window
		this._onWindowReady.fire(win);

		return result;
	}

	public pickWorkspaceAndOpen(options: INativeOpenDialogOptions): void {
		this.workspacesManager.pickWorkspaceAndOpen(options);
	}

	private onBeforeWindowUnload(e: IWindowUnloadEvent): void {
		const windowClosing = (e.reason === UnloadReason.CLOSE);
		const windowLoading = (e.reason === UnloadReason.LOAD);
		if (!windowClosing && !windowLoading) {
			return; // only interested when window is closing or loading
		}

		const workspace = e.window.openedWorkspace;
		if (!workspace || !this.workspacesMainService.isUntitledWorkspace(workspace)) {
			return; // only care about untitled workspaces to ask for saving
		}

		if (e.window.config && !!e.window.config.extensionDevelopmentPath) {
			// do not ask to save workspace when doing extension development
			// but still delete it.
			this.workspacesMainService.deleteUntitledWorkspaceSync(workspace);
			return;
		}

		if (windowClosing && !isMacintosh && this.getWindowCount() === 1) {
			return; // Windows/Linux: quits when last window is closed, so do not ask then
		}

		// Handle untitled workspaces with prompt as needed
		e.veto(this.workspacesManager.promptToSaveUntitledWorkspace(this.getWindowById(e.window.id), workspace).then(veto => {
			if (veto) {
				return veto;
			}

			// Bug in electron: somehow we need this timeout so that the window closes properly. That
			// might be related to the fact that the untitled workspace prompt shows up async and this
			// code can execute before the dialog is fully closed which then blocks the window from closing.
			// Issue: https://github.com/Microsoft/vscode/issues/41989
			return TPromise.timeout(0).then(() => veto);
		}));
	}

	public focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow {
		const lastActive = this.getLastActiveWindow();
		if (lastActive) {
			lastActive.focus();

			return lastActive;
		}

		// No window - open new empty one
		return this.open({ context, cli, forceEmpty: true })[0];
	}

	public getLastActiveWindow(): ICodeWindow {
		return getLastActiveWindow(WindowsManager.WINDOWS);
	}

	public openNewWindow(context: OpenContext): void {
		this.open({ context, cli: this.environmentService.args, forceNewWindow: true, forceEmpty: true });
	}

	public waitForWindowCloseOrLoad(windowId: number): TPromise<void> {
		return new TPromise<void>(c => {
			function handler(id: number) {
				if (id === windowId) {
					closeListener.dispose();
					loadListener.dispose();

					c(null);
				}
			}

			const closeListener = this.onWindowClose(id => handler(id));
			const loadListener = this.onWindowLoad(id => handler(id));
		});
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

	public getFocusedWindow(): ICodeWindow {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			return this.getWindowById(win.id);
		}

		return null;
	}

	public getWindowById(windowId: number): ICodeWindow {
		const res = WindowsManager.WINDOWS.filter(w => w.id === windowId);
		if (res && res.length === 1) {
			return res[0];
		}

		return null;
	}

	public getWindows(): ICodeWindow[] {
		return WindowsManager.WINDOWS;
	}

	public getWindowCount(): number {
		return WindowsManager.WINDOWS.length;
	}

	private onWindowError(window: ICodeWindow, error: WindowError): void {
		this.logService.error(error === WindowError.CRASHED ? '[VS Code]: render process crashed!' : '[VS Code]: detected unresponsive');

		// Unresponsive
		if (error === WindowError.UNRESPONSIVE) {
			this.dialogs.showMessageBox({
				title: product.nameLong,
				type: 'warning',
				buttons: [mnemonicButtonLabel(localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen")), mnemonicButtonLabel(localize({ key: 'wait', comment: ['&& denotes a mnemonic'] }, "&&Keep Waiting")), mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))],
				message: localize('appStalled', "The window is no longer responding"),
				detail: localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
				noLink: true
			}, window).then(result => {
				if (!window.win) {
					return; // Return early if the window has been going down already
				}

				if (result.button === 0) {
					window.reload();
				} else if (result.button === 2) {
					this.onBeforeWindowClose(window); // 'close' event will not be fired on destroy(), so run it manually
					window.win.destroy(); // make sure to destroy the window as it is unresponsive
				}
			});
		}

		// Crashed
		else {
			this.dialogs.showMessageBox({
				title: product.nameLong,
				type: 'warning',
				buttons: [mnemonicButtonLabel(localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen")), mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))],
				message: localize('appCrashed', "The window has crashed"),
				detail: localize('appCrashedDetail', "We are sorry for the inconvenience! You can reopen the window to continue where you left off."),
				noLink: true
			}, window).then(result => {
				if (!window.win) {
					return; // Return early if the window has been going down already
				}

				if (result.button === 0) {
					window.reload();
				} else if (result.button === 1) {
					this.onBeforeWindowClose(window); // 'close' event will not be fired on destroy(), so run it manually
					window.win.destroy(); // make sure to destroy the window as it has crashed
				}
			});
		}
	}

	private onWindowClosed(win: ICodeWindow): void {

		// Tell window
		win.dispose();

		// Remove from our list so that Electron can clean it up
		const index = WindowsManager.WINDOWS.indexOf(win);
		WindowsManager.WINDOWS.splice(index, 1);

		// Emit
		this._onWindowsCountChanged.fire({ oldCount: WindowsManager.WINDOWS.length + 1, newCount: WindowsManager.WINDOWS.length });
		this._onWindowClose.fire(win.id);
	}

	public pickFileFolderAndOpen(options: INativeOpenDialogOptions): void {
		this.doPickAndOpen(options, true /* pick folders */, true /* pick files */);
	}

	public pickFolderAndOpen(options: INativeOpenDialogOptions): void {
		this.doPickAndOpen(options, true /* pick folders */, false /* pick files */);
	}

	public pickFileAndOpen(options: INativeOpenDialogOptions): void {
		this.doPickAndOpen(options, false /* pick folders */, true /* pick files */);
	}

	private doPickAndOpen(options: INativeOpenDialogOptions, pickFolders: boolean, pickFiles: boolean): void {
		const internalOptions = options as IInternalNativeOpenDialogOptions;

		internalOptions.pickFolders = pickFolders;
		internalOptions.pickFiles = pickFiles;

		if (!internalOptions.dialogOptions) {
			internalOptions.dialogOptions = Object.create(null);
		}

		if (!internalOptions.dialogOptions.title) {
			if (pickFolders && pickFiles) {
				internalOptions.dialogOptions.title = localize('open', "Open");
			} else if (pickFolders) {
				internalOptions.dialogOptions.title = localize('openFolder', "Open Folder");
			} else {
				internalOptions.dialogOptions.title = localize('openFile', "Open File");
			}
		}

		if (!internalOptions.telemetryEventName) {
			if (pickFolders && pickFiles) {
				internalOptions.telemetryEventName = 'openFileFolder';
			} else if (pickFolders) {
				internalOptions.telemetryEventName = 'openFolder';
			} else {
				internalOptions.telemetryEventName = 'openFile';
			}
		}

		this.dialogs.pickAndOpen(internalOptions);
	}

	public showMessageBox(options: Electron.MessageBoxOptions, win?: ICodeWindow): TPromise<IMessageBoxResult> {
		return this.dialogs.showMessageBox(options, win);
	}

	public showSaveDialog(options: Electron.SaveDialogOptions, win?: ICodeWindow): TPromise<string> {
		return this.dialogs.showSaveDialog(options, win);
	}

	public showOpenDialog(options: Electron.OpenDialogOptions, win?: ICodeWindow): TPromise<string[]> {
		return this.dialogs.showOpenDialog(options, win);
	}

	public quit(): void {

		// If the user selected to exit from an extension development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		const window = this.getFocusedWindow();
		if (window && window.isExtensionDevelopmentHost && this.getWindowCount() > 1) {
			window.win.close();
		}

		// Otherwise: normal quit
		else {
			setTimeout(() => {
				this.lifecycleService.quit();
			}, 10 /* delay to unwind callback stack (IPC) */);
		}
	}
}

interface IInternalNativeOpenDialogOptions extends INativeOpenDialogOptions {
	pickFolders?: boolean;
	pickFiles?: boolean;
}

class Dialogs {

	private static readonly workingDirPickerStorageKey = 'pickerWorkingDir';

	private mapWindowToDialogQueue: Map<number, Queue<any>>;
	private noWindowDialogQueue: Queue<any>;

	constructor(
		private environmentService: IEnvironmentService,
		private telemetryService: ITelemetryService,
		private stateService: IStateService,
		private windowsMainService: IWindowsMainService,
	) {
		this.mapWindowToDialogQueue = new Map<number, Queue<any>>();
		this.noWindowDialogQueue = new Queue<any>();
	}

	public pickAndOpen(options: INativeOpenDialogOptions): void {
		this.getFileOrFolderPaths(options).then(paths => {
			const numberOfPaths = paths ? paths.length : 0;

			// Telemetry
			if (options.telemetryEventName) {
				// __GDPR__TODO__ Dynamic event names and dynamic properties. Can not be registered statically.
				this.telemetryService.publicLog(options.telemetryEventName, {
					...options.telemetryExtraData,
					outcome: numberOfPaths ? 'success' : 'canceled',
					numberOfPaths
				});
			}

			// Open
			if (numberOfPaths) {
				this.windowsMainService.open({
					context: OpenContext.DIALOG,
					cli: this.environmentService.args,
					pathsToOpen: paths,
					forceNewWindow: options.forceNewWindow,
					forceOpenWorkspaceAsFile: options.dialogOptions && !equals(options.dialogOptions.filters, WORKSPACE_FILTER)
				});
			}
		});
	}

	private getFileOrFolderPaths(options: IInternalNativeOpenDialogOptions): TPromise<string[]> {

		// Ensure dialog options
		if (!options.dialogOptions) {
			options.dialogOptions = Object.create(null);
		}

		// Ensure defaultPath
		if (!options.dialogOptions.defaultPath) {
			options.dialogOptions.defaultPath = this.stateService.getItem<string>(Dialogs.workingDirPickerStorageKey);
		}

		// Ensure properties
		if (typeof options.pickFiles === 'boolean' || typeof options.pickFolders === 'boolean') {
			options.dialogOptions.properties = void 0; // let it override based on the booleans

			if (options.pickFiles && options.pickFolders) {
				options.dialogOptions.properties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
			}
		}

		if (!options.dialogOptions.properties) {
			options.dialogOptions.properties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		if (isMacintosh) {
			options.dialogOptions.properties.push('treatPackageAsDirectory'); // always drill into .app files
		}

		// Show Dialog
		const focusedWindow = this.windowsMainService.getWindowById(options.windowId) || this.windowsMainService.getFocusedWindow();

		return this.showOpenDialog(options.dialogOptions, focusedWindow).then(paths => {
			if (paths && paths.length > 0) {

				// Remember path in storage for next time
				this.stateService.setItem(Dialogs.workingDirPickerStorageKey, dirname(paths[0]));

				return paths;
			}

			return void 0;
		});
	}

	private getDialogQueue(window?: ICodeWindow): Queue<any> {
		if (!window) {
			return this.noWindowDialogQueue;
		}

		let windowDialogQueue = this.mapWindowToDialogQueue.get(window.id);
		if (!windowDialogQueue) {
			windowDialogQueue = new Queue<any>();
			this.mapWindowToDialogQueue.set(window.id, windowDialogQueue);
		}

		return windowDialogQueue;
	}

	public showMessageBox(options: Electron.MessageBoxOptions, window?: ICodeWindow): TPromise<IMessageBoxResult> {
		return this.getDialogQueue(window).queue(() => {
			return new TPromise((c, e) => {
				dialog.showMessageBox(window ? window.win : void 0, options, (response: number, checkboxChecked: boolean) => {
					c({ button: response, checkboxChecked });
				});
			});
		});
	}

	public showSaveDialog(options: Electron.SaveDialogOptions, window?: ICodeWindow): TPromise<string> {
		function normalizePath(path: string): string {
			if (path && isMacintosh) {
				path = normalizeNFC(path); // normalize paths returned from the OS
			}

			return path;
		}

		return this.getDialogQueue(window).queue(() => {
			return new TPromise((c, e) => {
				dialog.showSaveDialog(window ? window.win : void 0, options, path => {
					c(normalizePath(path));
				});
			});
		});
	}

	public showOpenDialog(options: Electron.OpenDialogOptions, window?: ICodeWindow): TPromise<string[]> {
		function normalizePaths(paths: string[]): string[] {
			if (paths && paths.length > 0 && isMacintosh) {
				paths = paths.map(path => normalizeNFC(path)); // normalize paths returned from the OS
			}

			return paths;
		}

		return this.getDialogQueue(window).queue(() => {
			return new TPromise((c, e) => {
				dialog.showOpenDialog(window ? window.win : void 0, options, paths => {
					c(normalizePaths(paths));
				});
			});
		});
	}
}

class WorkspacesManager {

	constructor(
		private workspacesMainService: IWorkspacesMainService,
		private backupMainService: IBackupMainService,
		private environmentService: IEnvironmentService,
		private windowsMainService: IWindowsMainService
	) {
	}

	public saveAndEnterWorkspace(window: ICodeWindow, path: string): TPromise<IEnterWorkspaceResult> {
		if (!window || !window.win || window.readyState !== ReadyState.READY || !window.openedWorkspace || !path || !this.isValidTargetWorkspacePath(window, path)) {
			return TPromise.as(null); // return early if the window is not ready or disposed or does not have a workspace
		}

		return this.doSaveAndOpenWorkspace(window, window.openedWorkspace, path);
	}

	public createAndEnterWorkspace(window: ICodeWindow, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		if (!window || !window.win || window.readyState !== ReadyState.READY) {
			return TPromise.as(null); // return early if the window is not ready or disposed
		}

		return this.isValidTargetWorkspacePath(window, path).then(isValid => {
			if (!isValid) {
				return TPromise.as(null); // return early if the workspace is not valid
			}

			return this.workspacesMainService.createWorkspace(folders).then(workspace => {
				return this.doSaveAndOpenWorkspace(window, workspace, path);
			});
		});

	}

	private isValidTargetWorkspacePath(window: ICodeWindow, path?: string): TPromise<boolean> {
		if (!path) {
			return TPromise.wrap(true);
		}

		if (window.openedWorkspace && window.openedWorkspace.configPath === path) {
			return TPromise.wrap(false); // window is already opened on a workspace with that path
		}

		// Prevent overwriting a workspace that is currently opened in another window
		if (findWindowOnWorkspace(this.windowsMainService.getWindows(), { id: this.workspacesMainService.getWorkspaceId(path), configPath: path })) {
			const options: Electron.MessageBoxOptions = {
				title: product.nameLong,
				type: 'info',
				buttons: [localize('ok', "OK")],
				message: localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(path)),
				detail: localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again."),
				noLink: true
			};

			return this.windowsMainService.showMessageBox(options, this.windowsMainService.getFocusedWindow()).then(() => false);
		}

		return TPromise.wrap(true); // OK
	}

	private doSaveAndOpenWorkspace(window: ICodeWindow, workspace: IWorkspaceIdentifier, path?: string): TPromise<IEnterWorkspaceResult> {
		let savePromise: TPromise<IWorkspaceIdentifier>;
		if (path) {
			savePromise = this.workspacesMainService.saveWorkspace(workspace, path);
		} else {
			savePromise = TPromise.as(workspace);
		}

		return savePromise.then(workspace => {
			window.focus();

			// Register window for backups and migrate current backups over
			let backupPath: string;
			if (!window.config.extensionDevelopmentPath) {
				backupPath = this.backupMainService.registerWorkspaceBackupSync(workspace, window.config.backupPath);
			}

			// Update window configuration properly based on transition to workspace
			window.config.folderPath = void 0;
			window.config.workspace = workspace;
			window.config.backupPath = backupPath;

			return { workspace, backupPath };
		});
	}

	public pickWorkspaceAndOpen(options: INativeOpenDialogOptions): void {
		const window = this.windowsMainService.getWindowById(options.windowId) || this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();

		this.windowsMainService.pickFileAndOpen({
			windowId: window ? window.id : void 0,
			dialogOptions: {
				buttonLabel: mnemonicButtonLabel(localize({ key: 'openWorkspace', comment: ['&& denotes a mnemonic'] }, "&&Open")),
				title: localize('openWorkspaceTitle', "Open Workspace"),
				filters: WORKSPACE_FILTER,
				properties: ['openFile'],
				defaultPath: options.dialogOptions && options.dialogOptions.defaultPath
			},
			forceNewWindow: options.forceNewWindow,
			telemetryEventName: options.telemetryEventName,
			telemetryExtraData: options.telemetryExtraData
		});
	}

	public promptToSaveUntitledWorkspace(window: ICodeWindow, workspace: IWorkspaceIdentifier): TPromise<boolean> {
		enum ConfirmResult {
			SAVE,
			DONT_SAVE,
			CANCEL
		}

		const save = { label: mnemonicButtonLabel(localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: mnemonicButtonLabel(localize({ key: 'doNotSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons: { label: string; result: ConfirmResult; }[] = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		const options: Electron.MessageBoxOptions = {
			title: this.environmentService.appNameLong,
			message: localize('saveWorkspaceMessage', "Do you want to save your workspace configuration as a file?"),
			detail: localize('saveWorkspaceDetail', "Save your workspace if you plan to open it again."),
			noLink: true,
			type: 'warning',
			buttons: buttons.map(button => button.label),
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			options.defaultId = 2;
		}

		return this.windowsMainService.showMessageBox(options, window).then(res => {
			switch (buttons[res.button].result) {

				// Cancel: veto unload
				case ConfirmResult.CANCEL:
					return true;

				// Don't Save: delete workspace
				case ConfirmResult.DONT_SAVE:
					this.workspacesMainService.deleteUntitledWorkspaceSync(workspace);
					return false;

				// Save: save workspace, but do not veto unload
				case ConfirmResult.SAVE: {
					return this.windowsMainService.showSaveDialog({
						buttonLabel: mnemonicButtonLabel(localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")),
						title: localize('saveWorkspace', "Save Workspace"),
						filters: WORKSPACE_FILTER,
						defaultPath: this.getUntitledWorkspaceSaveDialogDefaultPath(workspace)
					}, window).then(target => {
						if (target) {
							return this.workspacesMainService.saveWorkspace(workspace, target).then(() => false, () => false);
						}

						return true; // keep veto if no target was provided
					});
				}
			}
		});
	}

	private getUntitledWorkspaceSaveDialogDefaultPath(workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): string {
		if (workspace) {
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				return dirname(workspace);
			}

			const resolvedWorkspace = this.workspacesMainService.resolveWorkspaceSync(workspace.configPath);
			if (resolvedWorkspace && resolvedWorkspace.folders.length > 0) {
				for (const folder of resolvedWorkspace.folders) {
					if (folder.uri.scheme === Schemas.file) {
						return dirname(folder.uri.fsPath);
					}
				}
			}
		}

		return void 0;
	}
}
