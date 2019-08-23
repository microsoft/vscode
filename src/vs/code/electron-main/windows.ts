/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { basename, normalize, join, dirname } from 'vs/base/common/path';
import { localize } from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { assign, mixin } from 'vs/base/common/objects';
import { IBackupMainService, IEmptyWindowBackupInfo } from 'vs/platform/backup/common/backup';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { IStateService } from 'vs/platform/state/common/state';
import { CodeWindow, defaultWindowState } from 'vs/code/electron-main/window';
import { hasArgs, asArray } from 'vs/platform/environment/node/argv';
import { ipcMain as ipc, screen, BrowserWindow, dialog, systemPreferences, FileFilter } from 'electron';
import { parseLineAndColumnAware } from 'vs/code/node/paths';
import { ILifecycleService, UnloadReason, LifecycleService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWindowSettings, OpenContext, IPath, IWindowConfiguration, INativeOpenDialogOptions, IPathsToWaitFor, IEnterWorkspaceResult, IMessageBoxResult, INewWindowOptions, IURIToOpen, isFileToOpen, isWorkspaceToOpen, isFolderToOpen } from 'vs/platform/windows/common/windows';
import { getLastActiveWindow, findBestWindowOrFolderForFile, findWindowOnWorkspace, findWindowOnExtensionDevelopmentPath, findWindowOnWorkspaceOrFolderUri } from 'vs/code/node/windowsFinder';
import { Event as CommonEvent, Emitter } from 'vs/base/common/event';
import product from 'vs/platform/product/node/product';
import { ITelemetryService, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWindowsMainService, IOpenConfiguration, IWindowsCountChangedEvent, ICodeWindow, IWindowState as ISingleWindowState, WindowMode } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService, IRecent } from 'vs/platform/history/common/history';
import { IProcessEnvironment, isMacintosh, isWindows } from 'vs/base/common/platform';
import { IWorkspacesMainService, IWorkspaceIdentifier, WORKSPACE_FILTER, isSingleFolderWorkspaceIdentifier, hasWorkspaceFileExtension } from 'vs/platform/workspaces/common/workspaces';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { normalizeNFC } from 'vs/base/common/normalization';
import { URI } from 'vs/base/common/uri';
import { Queue } from 'vs/base/common/async';
import { exists, dirExists } from 'vs/base/node/pfs';
import { getComparisonKey, isEqual, normalizePath, basename as resourcesBasename, originalFSPath, hasTrailingPathSeparator, removeTrailingPathSeparator } from 'vs/base/common/resources';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { restoreWindowsState, WindowsStateStorageData, getWindowsStateStoreData } from 'vs/code/electron-main/windowsStateStorage';
import { getWorkspaceIdentifier } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';

const enum WindowError {
	UNRESPONSIVE = 1,
	CRASHED = 2
}

export interface IWindowState {
	workspace?: IWorkspaceIdentifier;
	folderUri?: URI;
	backupPath?: string;
	remoteAuthority?: string;
	uiState: ISingleWindowState;
}

export interface IWindowsState {
	lastActiveWindow?: IWindowState;
	lastPluginDevelopmentHostWindow?: IWindowState;
	openedWindows: IWindowState[];
}

interface INewWindowState extends ISingleWindowState {
	hasDefaultState?: boolean;
}

type RestoreWindowsSetting = 'all' | 'folders' | 'one' | 'none';

interface IOpenBrowserWindowOptions {
	userEnv?: IProcessEnvironment;
	cli?: ParsedArgs;

	workspace?: IWorkspaceIdentifier;
	folderUri?: URI;

	remoteAuthority?: string;

	initialStartup?: boolean;

	fileInputs?: IFileInputs;

	forceNewWindow?: boolean;
	forceNewTabbedWindow?: boolean;
	windowToUse?: ICodeWindow;

	emptyWindowBackupInfo?: IEmptyWindowBackupInfo;
}

interface IPathParseOptions {
	ignoreFileNotFound?: boolean;
	gotoLineMode?: boolean;
	remoteAuthority?: string;
}

interface IFileInputs {
	filesToOpenOrCreate: IPath[];
	filesToDiff: IPath[];
	filesToWait?: IPathsToWaitFor;
	remoteAuthority?: string;
}

interface IPathToOpen extends IPath {

	// the workspace for a Code instance to open
	workspace?: IWorkspaceIdentifier;

	// the folder path for a Code instance to open
	folderUri?: URI;

	// the backup path for a Code instance to use
	backupPath?: string;

	// the remote authority for the Code instance to open. Undefined if not remote.
	remoteAuthority?: string;

	// optional label for the recent history
	label?: string;
}

function isFolderPathToOpen(path: IPathToOpen): path is IFolderPathToOpen {
	return !!path.folderUri;
}

interface IFolderPathToOpen {

	// the folder path for a Code instance to open
	folderUri: URI;

	// the backup path for a Code instance to use
	backupPath?: string;

	// the remote authority for the Code instance to open. Undefined if not remote.
	remoteAuthority?: string;

	// optional label for the recent history
	label?: string;
}

function isWorkspacePathToOpen(path: IPathToOpen): path is IWorkspacePathToOpen {
	return !!path.workspace;
}

interface IWorkspacePathToOpen {

	// the workspace for a Code instance to open
	workspace: IWorkspaceIdentifier;

	// the backup path for a Code instance to use
	backupPath?: string;

	// the remote authority for the Code instance to open. Undefined if not remote.
	remoteAuthority?: string;

	// optional label for the recent history
	label?: string;
}

export class WindowsManager extends Disposable implements IWindowsMainService {

	_serviceBrand: any;

	private static readonly windowsStateStorageKey = 'windowsState';

	private static readonly WINDOWS: ICodeWindow[] = [];

	private readonly windowsState: IWindowsState;
	private lastClosedWindowState?: IWindowState;

	private readonly dialogs: Dialogs;
	private readonly workspacesManager: WorkspacesManager;

	private readonly _onWindowReady = this._register(new Emitter<ICodeWindow>());
	readonly onWindowReady: CommonEvent<ICodeWindow> = this._onWindowReady.event;

	private readonly _onWindowClose = this._register(new Emitter<number>());
	readonly onWindowClose: CommonEvent<number> = this._onWindowClose.event;

	private readonly _onWindowLoad = this._register(new Emitter<number>());
	readonly onWindowLoad: CommonEvent<number> = this._onWindowLoad.event;

	private readonly _onWindowsCountChanged = this._register(new Emitter<IWindowsCountChangedEvent>());
	readonly onWindowsCountChanged: CommonEvent<IWindowsCountChangedEvent> = this._onWindowsCountChanged.event;

	constructor(
		private readonly machineId: string,
		private readonly initialUserEnv: IProcessEnvironment,
		@ILogService private readonly logService: ILogService,
		@IStateService private readonly stateService: IStateService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHistoryMainService private readonly historyMainService: IHistoryMainService,
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		const windowsStateStoreData = this.stateService.getItem<WindowsStateStorageData>(WindowsManager.windowsStateStorageKey);

		this.windowsState = restoreWindowsState(windowsStateStoreData);
		if (!Array.isArray(this.windowsState.openedWindows)) {
			this.windowsState.openedWindows = [];
		}

		this.dialogs = new Dialogs(stateService, this);
		this.workspacesManager = new WorkspacesManager(workspacesMainService, backupMainService, this);

		this.lifecycleService.when(LifecycleMainPhase.Ready).then(() => this.registerListeners());
		this.lifecycleService.when(LifecycleMainPhase.AfterWindowOpen).then(() => this.installWindowsMutex());
	}

	private installWindowsMutex(): void {
		if (isWindows) {
			try {
				const WindowsMutex = (require.__$__nodeRequire('windows-mutex') as typeof import('windows-mutex')).Mutex;
				const mutex = new WindowsMutex(product.win32MutexName);
				once(this.lifecycleService.onWillShutdown)(() => mutex.release());
			} catch (e) {
				this.logService.error(e);
			}
		}
	}

	private registerListeners(): void {

		// React to workbench ready events from windows
		ipc.on('vscode:workbenchReady', (event: Electron.Event, windowId: number) => {
			this.logService.trace('IPC#vscode-workbenchReady');

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
		this.lifecycleService.onBeforeWindowClose(window => this.onBeforeWindowClose(window));
		this.lifecycleService.onBeforeShutdown(() => this.onBeforeShutdown());
		this.onWindowsCountChanged(e => {
			if (e.newCount - e.oldCount > 0) {
				// clear last closed window state when a new window opens. this helps on macOS where
				// otherwise closing the last window, opening a new window and then quitting would
				// use the state of the previously closed window when restarting.
				this.lastClosedWindowState = undefined;
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
		this.stateService.setItem(WindowsManager.windowsStateStorageKey, getWindowsStateStoreData(currentWindowsState));
	}

	// See note on #onBeforeShutdown() for details how these events are flowing
	private onBeforeWindowClose(win: ICodeWindow): void {
		if (this.lifecycleService.quitRequested) {
			return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
		}

		// On Window close, update our stored UI state of this window
		const state: IWindowState = this.toWindowState(win);
		if (win.isExtensionDevelopmentHost && !win.isExtensionTestHost) {
			this.windowsState.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
		}

		// Any non extension host window with same workspace or folder
		else if (!win.isExtensionDevelopmentHost && (!!win.openedWorkspace || !!win.openedFolderUri)) {
			this.windowsState.openedWindows.forEach(o => {
				const sameWorkspace = win.openedWorkspace && o.workspace && o.workspace.id === win.openedWorkspace.id;
				const sameFolder = win.openedFolderUri && o.folderUri && isEqual(o.folderUri, win.openedFolderUri);

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
			folderUri: win.openedFolderUri,
			backupPath: win.backupPath,
			remoteAuthority: win.remoteAuthority,
			uiState: win.serializeWindowState()
		};
	}

	open(openConfig: IOpenConfiguration): ICodeWindow[] {
		this.logService.trace('windowsManager#open');
		openConfig = this.validateOpenConfig(openConfig);

		const pathsToOpen = this.getPathsToOpen(openConfig);

		const foldersToAdd: IFolderPathToOpen[] = [];
		const foldersToOpen: IFolderPathToOpen[] = [];
		const workspacesToOpen: IWorkspacePathToOpen[] = [];
		const emptyToRestore: IEmptyWindowBackupInfo[] = []; // empty windows with backupPath
		let emptyToOpen: number = 0;
		let fileInputs: IFileInputs | undefined; 		// collect all file inputs
		for (const path of pathsToOpen) {
			if (isFolderPathToOpen(path)) {
				if (openConfig.addMode) {
					// When run with --add, take the folders that are to be opened as
					// folders that should be added to the currently active window.
					foldersToAdd.push(path);
				} else {
					foldersToOpen.push(path);
				}
			} else if (isWorkspacePathToOpen(path)) {
				workspacesToOpen.push(path);
			} else if (path.fileUri) {
				if (!fileInputs) {
					fileInputs = { filesToOpenOrCreate: [], filesToDiff: [], remoteAuthority: path.remoteAuthority };
				}
				fileInputs.filesToOpenOrCreate.push(path);
			} else if (path.backupPath) {
				emptyToRestore.push({ backupFolder: basename(path.backupPath), remoteAuthority: path.remoteAuthority });
			} else {
				emptyToOpen++;
			}
		}

		// When run with --diff, take the files to open as files to diff
		// if there are exactly two files provided.
		if (fileInputs && openConfig.diffMode && fileInputs.filesToOpenOrCreate.length === 2) {
			fileInputs.filesToDiff = fileInputs.filesToOpenOrCreate;
			fileInputs.filesToOpenOrCreate = [];
		}

		// When run with --wait, make sure we keep the paths to wait for
		if (fileInputs && openConfig.waitMarkerFileURI) {
			fileInputs.filesToWait = { paths: [...fileInputs.filesToDiff, ...fileInputs.filesToOpenOrCreate], waitMarkerFileUri: openConfig.waitMarkerFileURI };
		}

		//
		// These are windows to restore because of hot-exit or from previous session (only performed once on startup!)
		//
		let foldersToRestore: URI[] = [];
		let workspacesToRestore: IWorkspacePathToOpen[] = [];
		if (openConfig.initialStartup && !openConfig.cli.extensionDevelopmentPath && !openConfig.cli['disable-restore-windows']) {
			let foldersToRestore = this.backupMainService.getFolderBackupPaths();
			foldersToAdd.push(...foldersToRestore.map(f => ({ folderUri: f, remoteAuhority: getRemoteAuthority(f), isRestored: true })));

			// collect from workspaces with hot-exit backups and from previous window session
			workspacesToRestore = [...this.backupMainService.getWorkspaceBackups(), ...this.workspacesMainService.getUntitledWorkspacesSync()];
			workspacesToOpen.push(...workspacesToRestore);

			emptyToRestore.push(...this.backupMainService.getEmptyWindowBackupPaths());
		} else {
			emptyToRestore.length = 0;
		}

		// Open based on config
		const usedWindows = this.doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyToRestore, emptyToOpen, fileInputs, foldersToAdd);

		// Make sure to pass focus to the most relevant of the windows if we open multiple
		if (usedWindows.length > 1) {

			const focusLastActive = this.windowsState.lastActiveWindow && !openConfig.forceEmpty && !hasArgs(openConfig.cli._) && !hasArgs(openConfig.cli['file-uri']) && !hasArgs(openConfig.cli['folder-uri']) && !(openConfig.urisToOpen && openConfig.urisToOpen.length);
			let focusLastOpened = true;
			let focusLastWindow = true;

			// 1.) focus last active window if we are not instructed to open any paths
			if (focusLastActive) {
				const lastActiveWindow = usedWindows.filter(w => w.backupPath === this.windowsState.lastActiveWindow!.backupPath);
				if (lastActiveWindow.length) {
					lastActiveWindow[0].focus();
					focusLastOpened = false;
					focusLastWindow = false;
				}
			}

			// 2.) if instructed to open paths, focus last window which is not restored
			if (focusLastOpened) {
				for (let i = usedWindows.length - 1; i >= 0; i--) {
					const usedWindow = usedWindows[i];
					if (
						(usedWindow.openedWorkspace && workspacesToRestore.some(workspace => workspace.workspace.id === usedWindow.openedWorkspace!.id)) ||	// skip over restored workspace
						(usedWindow.openedFolderUri && foldersToRestore.some(uri => isEqual(uri, usedWindow.openedFolderUri))) ||			// skip over restored folder
						(usedWindow.backupPath && emptyToRestore.some(empty => empty.backupFolder === basename(usedWindow.backupPath!)))				// skip over restored empty window
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
		if (!usedWindows.some(w => w.isExtensionDevelopmentHost) && !openConfig.diffMode && !openConfig.noRecentEntry) {
			const recents: IRecent[] = [];
			for (let pathToOpen of pathsToOpen) {
				if (pathToOpen.workspace) {
					recents.push({ label: pathToOpen.label, workspace: pathToOpen.workspace });
				} else if (pathToOpen.folderUri) {
					recents.push({ label: pathToOpen.label, folderUri: pathToOpen.folderUri });
				} else if (pathToOpen.fileUri) {
					recents.push({ label: pathToOpen.label, fileUri: pathToOpen.fileUri });
				}
			}
			this.historyMainService.addRecentlyOpened(recents);
		}

		// If we got started with --wait from the CLI, we need to signal to the outside when the window
		// used for the edit operation is closed or loaded to a different folder so that the waiting
		// process can continue. We do this by deleting the waitMarkerFilePath.
		const waitMarkerFileURI = openConfig.waitMarkerFileURI;
		if (openConfig.context === OpenContext.CLI && waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
			this.waitForWindowCloseOrLoad(usedWindows[0].id).then(() => fs.unlink(waitMarkerFileURI.fsPath, _error => undefined));
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
		workspacesToOpen: IWorkspacePathToOpen[],
		foldersToOpen: IFolderPathToOpen[],
		emptyToRestore: IEmptyWindowBackupInfo[],
		emptyToOpen: number,
		fileInputs: IFileInputs | undefined,
		foldersToAdd: IFolderPathToOpen[]
	) {
		const usedWindows: ICodeWindow[] = [];

		// Settings can decide if files/folders open in new window or not
		let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);

		// Handle folders to add by looking for the last active workspace (not on initial startup)
		if (!openConfig.initialStartup && foldersToAdd.length > 0) {
			const authority = foldersToAdd[0].remoteAuthority;
			const lastActiveWindow = this.getLastActiveWindowForAuthority(authority);
			if (lastActiveWindow) {
				usedWindows.push(this.doAddFoldersToExistingWindow(lastActiveWindow, foldersToAdd.map(f => f.folderUri)));
			}
		}

		// Handle files to open/diff or to create when we dont open a folder and we do not restore any folder/untitled from hot-exit
		const potentialWindowsCount = foldersToOpen.length + workspacesToOpen.length + emptyToRestore.length;
		if (potentialWindowsCount === 0 && fileInputs) {

			// Find suitable window or folder path to open files in
			const fileToCheck = fileInputs.filesToOpenOrCreate[0] || fileInputs.filesToDiff[0];

			// only look at the windows with correct authority
			const windows = WindowsManager.WINDOWS.filter(w => w.remoteAuthority === fileInputs!.remoteAuthority);

			const bestWindowOrFolder = findBestWindowOrFolderForFile({
				windows,
				newWindow: openFilesInNewWindow,
				context: openConfig.context,
				fileUri: fileToCheck && fileToCheck.fileUri,
				localWorkspaceResolver: workspace => workspace.configPath.scheme === Schemas.file ? this.workspacesMainService.resolveLocalWorkspaceSync(workspace.configPath) : null
			});

			// We found a window to open the files in
			if (bestWindowOrFolder instanceof CodeWindow) {

				// Window is workspace
				if (bestWindowOrFolder.openedWorkspace) {
					workspacesToOpen.push({ workspace: bestWindowOrFolder.openedWorkspace, remoteAuthority: bestWindowOrFolder.remoteAuthority });
				}

				// Window is single folder
				else if (bestWindowOrFolder.openedFolderUri) {
					foldersToOpen.push({ folderUri: bestWindowOrFolder.openedFolderUri, remoteAuthority: bestWindowOrFolder.remoteAuthority });
				}

				// Window is empty
				else {

					// Do open files
					usedWindows.push(this.doOpenFilesInExistingWindow(openConfig, bestWindowOrFolder, fileInputs));

					// Reset these because we handled them
					fileInputs = undefined;
				}
			}

			// Finally, if no window or folder is found, just open the files in an empty window
			else {
				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					fileInputs,
					forceNewWindow: true,
					remoteAuthority: fileInputs.remoteAuthority,
					forceNewTabbedWindow: openConfig.forceNewTabbedWindow
				}));

				// Reset these because we handled them
				fileInputs = undefined;
			}
		}

		// Handle workspaces to open (instructed and to restore)
		const allWorkspacesToOpen = arrays.distinct(workspacesToOpen, workspace => workspace.workspace.id); // prevent duplicates
		if (allWorkspacesToOpen.length > 0) {

			// Check for existing instances
			const windowsOnWorkspace = arrays.coalesce(allWorkspacesToOpen.map(workspaceToOpen => findWindowOnWorkspace(WindowsManager.WINDOWS, workspaceToOpen.workspace)));
			if (windowsOnWorkspace.length > 0) {
				const windowOnWorkspace = windowsOnWorkspace[0];
				const fileInputsForWindow = (fileInputs && fileInputs.remoteAuthority === windowOnWorkspace.remoteAuthority) ? fileInputs : undefined;

				// Do open files
				usedWindows.push(this.doOpenFilesInExistingWindow(openConfig, windowOnWorkspace, fileInputsForWindow));

				// Reset these because we handled them
				if (fileInputsForWindow) {
					fileInputs = undefined;
				}

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			allWorkspacesToOpen.forEach(workspaceToOpen => {
				if (windowsOnWorkspace.some(win => win.openedWorkspace!.id === workspaceToOpen.workspace.id)) {
					return; // ignore folders that are already open
				}

				const remoteAuthority = workspaceToOpen.remoteAuthority;
				const fileInputsForWindow = (fileInputs && fileInputs.remoteAuthority === remoteAuthority) ? fileInputs : undefined;

				// Do open folder
				usedWindows.push(this.doOpenFolderOrWorkspace(openConfig, workspaceToOpen, openFolderInNewWindow, fileInputsForWindow));

				// Reset these because we handled them
				if (fileInputsForWindow) {
					fileInputs = undefined;
				}

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle folders to open (instructed and to restore)
		const allFoldersToOpen = arrays.distinct(foldersToOpen, folder => getComparisonKey(folder.folderUri)); // prevent duplicates
		if (allFoldersToOpen.length > 0) {

			// Check for existing instances
			const windowsOnFolderPath = arrays.coalesce(allFoldersToOpen.map(folderToOpen => findWindowOnWorkspace(WindowsManager.WINDOWS, folderToOpen.folderUri)));
			if (windowsOnFolderPath.length > 0) {
				const windowOnFolderPath = windowsOnFolderPath[0];
				const fileInputsForWindow = fileInputs && fileInputs.remoteAuthority === windowOnFolderPath.remoteAuthority ? fileInputs : undefined;

				// Do open files
				usedWindows.push(this.doOpenFilesInExistingWindow(openConfig, windowOnFolderPath, fileInputsForWindow));

				// Reset these because we handled them
				if (fileInputsForWindow) {
					fileInputs = undefined;
				}

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			allFoldersToOpen.forEach(folderToOpen => {

				if (windowsOnFolderPath.some(win => isEqual(win.openedFolderUri, folderToOpen.folderUri))) {
					return; // ignore folders that are already open
				}

				const remoteAuthority = folderToOpen.remoteAuthority;
				const fileInputsForWindow = (fileInputs && fileInputs.remoteAuthority === remoteAuthority) ? fileInputs : undefined;

				// Do open folder
				usedWindows.push(this.doOpenFolderOrWorkspace(openConfig, folderToOpen, openFolderInNewWindow, fileInputsForWindow));

				// Reset these because we handled them
				if (fileInputsForWindow) {
					fileInputs = undefined;
				}

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to restore
		const allEmptyToRestore = arrays.distinct(emptyToRestore, info => info.backupFolder); // prevent duplicates
		if (allEmptyToRestore.length > 0) {
			allEmptyToRestore.forEach(emptyWindowBackupInfo => {
				const remoteAuthority = emptyWindowBackupInfo.remoteAuthority;
				const fileInputsForWindow = (fileInputs && fileInputs.remoteAuthority === remoteAuthority) ? fileInputs : undefined;

				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					fileInputs: fileInputsForWindow,
					remoteAuthority,
					forceNewWindow: true,
					forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
					emptyWindowBackupInfo
				}));

				// Reset these because we handled them
				if (fileInputsForWindow) {
					fileInputs = undefined;
				}

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to open (only if no other window opened)
		if (usedWindows.length === 0 || fileInputs) {
			if (fileInputs && !emptyToOpen) {
				emptyToOpen++;
			}

			const remoteAuthority = fileInputs ? fileInputs.remoteAuthority : (openConfig.cli && openConfig.cli.remote || undefined);

			for (let i = 0; i < emptyToOpen; i++) {
				usedWindows.push(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					remoteAuthority,
					forceNewWindow: openFolderInNewWindow,
					forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
					fileInputs
				}));

				// Reset these because we handled them
				fileInputs = undefined;
				openFolderInNewWindow = true; // any other window to open must open in new window then
			}
		}

		return arrays.distinct(usedWindows);
	}

	private doOpenFilesInExistingWindow(configuration: IOpenConfiguration, window: ICodeWindow, fileInputs?: IFileInputs): ICodeWindow {
		window.focus(); // make sure window has focus

		const params: { filesToOpenOrCreate?: IPath[], filesToDiff?: IPath[], filesToWait?: IPathsToWaitFor, termProgram?: string } = {};
		if (fileInputs) {
			params.filesToOpenOrCreate = fileInputs.filesToOpenOrCreate;
			params.filesToDiff = fileInputs.filesToDiff;
			params.filesToWait = fileInputs.filesToWait;
		}

		if (configuration.userEnv) {
			params.termProgram = configuration.userEnv['TERM_PROGRAM'];
		}

		window.sendWhenReady('vscode:openFiles', params);

		return window;
	}

	private doAddFoldersToExistingWindow(window: ICodeWindow, foldersToAdd: URI[]): ICodeWindow {
		window.focus(); // make sure window has focus

		window.sendWhenReady('vscode:addFolders', { foldersToAdd });

		return window;
	}

	private doOpenFolderOrWorkspace(openConfig: IOpenConfiguration, folderOrWorkspace: IPathToOpen, forceNewWindow: boolean, fileInputs: IFileInputs | undefined, windowToUse?: ICodeWindow): ICodeWindow {
		if (!forceNewWindow && !windowToUse && typeof openConfig.contextWindowId === 'number') {
			windowToUse = this.getWindowById(openConfig.contextWindowId); // fix for https://github.com/Microsoft/vscode/issues/49587
		}

		const browserWindow = this.openInBrowserWindow({
			userEnv: openConfig.userEnv,
			cli: openConfig.cli,
			initialStartup: openConfig.initialStartup,
			workspace: folderOrWorkspace.workspace,
			folderUri: folderOrWorkspace.folderUri,
			fileInputs,
			remoteAuthority: folderOrWorkspace.remoteAuthority,
			forceNewWindow,
			forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
			windowToUse
		});

		return browserWindow;
	}

	private getPathsToOpen(openConfig: IOpenConfiguration): IPathToOpen[] {
		let windowsToOpen: IPathToOpen[];
		let isCommandLineOrAPICall = false;

		// Extract paths: from API
		if (openConfig.urisToOpen && openConfig.urisToOpen.length > 0) {
			windowsToOpen = this.doExtractPathsFromAPI(openConfig);
			isCommandLineOrAPICall = true;
		}

		// Check for force empty
		else if (openConfig.forceEmpty) {
			windowsToOpen = [Object.create(null)];
		}

		// Extract paths: from CLI
		else if (hasArgs(openConfig.cli._) || hasArgs(openConfig.cli['folder-uri']) || hasArgs(openConfig.cli['file-uri'])) {
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
			const foldersToOpen = windowsToOpen.filter(path => !!path.folderUri);
			if (foldersToOpen.length > 1) {
				const remoteAuthority = foldersToOpen[0].remoteAuthority;
				if (foldersToOpen.every(f => f.remoteAuthority === remoteAuthority)) { // only if all folder have the same authority
					const workspace = this.workspacesMainService.createUntitledWorkspaceSync(foldersToOpen.map(folder => ({ uri: folder.folderUri! })));

					// Add workspace and remove folders thereby
					windowsToOpen.push({ workspace, remoteAuthority });
					windowsToOpen = windowsToOpen.filter(path => !path.folderUri);
				}
			}
		}

		return windowsToOpen;
	}

	private doExtractPathsFromAPI(openConfig: IOpenConfiguration): IPathToOpen[] {
		const pathsToOpen: IPathToOpen[] = [];
		const parseOptions: IPathParseOptions = { gotoLineMode: openConfig.gotoLineMode };
		for (const pathToOpen of openConfig.urisToOpen || []) {
			if (!pathToOpen) {
				continue;
			}

			const path = this.parseUri(pathToOpen, parseOptions);
			if (path) {
				path.label = pathToOpen.label;
				pathsToOpen.push(path);
			} else {
				const uri = resourceFromURIToOpen(pathToOpen);
				// Warn about the invalid URI or path
				let message, detail;
				if (uri.scheme === Schemas.file) {
					message = localize('pathNotExistTitle', "Path does not exist");
					detail = localize('pathNotExistDetail', "The path '{0}' does not seem to exist anymore on disk.", uri.fsPath);
				} else {
					message = localize('uriInvalidTitle', "URI can not be opened");
					detail = localize('uriInvalidDetail', "The URI '{0}' is not valid and can not be opened.", uri.toString());
				}
				const options: Electron.MessageBoxOptions = {
					title: product.nameLong,
					type: 'info',
					buttons: [localize('ok', "OK")],
					message,
					detail,
					noLink: true
				};

				this.dialogs.showMessageBox(options, this.getFocusedWindow());
			}
		}
		return pathsToOpen;
	}

	private doExtractPathsFromCLI(cli: ParsedArgs): IPath[] {
		const pathsToOpen: IPathToOpen[] = [];
		const parseOptions: IPathParseOptions = { ignoreFileNotFound: true, gotoLineMode: cli.goto, remoteAuthority: cli.remote || undefined };

		// folder uris
		const folderUris = asArray(cli['folder-uri']);
		for (let f of folderUris) {
			const folderUri = this.argToUri(f);
			if (folderUri) {
				const path = this.parseUri({ folderUri }, parseOptions);
				if (path) {
					pathsToOpen.push(path);
				}
			}
		}

		// file uris
		const fileUris = asArray(cli['file-uri']);
		for (let f of fileUris) {
			const fileUri = this.argToUri(f);
			if (fileUri) {
				const path = this.parseUri(hasWorkspaceFileExtension(f) ? { workspaceUri: fileUri } : { fileUri }, parseOptions);
				if (path) {
					pathsToOpen.push(path);
				}
			}
		}

		// folder or file paths
		const cliArgs = asArray(cli._);
		for (let cliArg of cliArgs) {
			const path = this.parsePath(cliArg, parseOptions);
			if (path) {
				pathsToOpen.push(path);
			}
		}

		if (pathsToOpen.length) {
			return pathsToOpen;
		}

		// No path provided, return empty to open empty
		return [Object.create(null)];
	}

	private doGetWindowsFromLastSession(): IPathToOpen[] {
		const restoreWindows = this.getRestoreWindowsSetting();

		switch (restoreWindows) {

			// none: we always open an empty window
			case 'none':
				return [Object.create(null)];

			// one: restore last opened workspace/folder or empty window
			// all: restore all windows
			// folders: restore last opened folders only
			case 'one':
			case 'all':
			case 'folders':
				const openedWindows: IWindowState[] = [];
				if (restoreWindows !== 'one') {
					openedWindows.push(...this.windowsState.openedWindows);
				}
				if (this.windowsState.lastActiveWindow) {
					openedWindows.push(this.windowsState.lastActiveWindow);
				}

				const windowsToOpen: IPathToOpen[] = [];
				for (const openedWindow of openedWindows) {
					if (openedWindow.workspace) { // Workspaces
						const pathToOpen = this.parseUri({ workspaceUri: openedWindow.workspace.configPath }, { remoteAuthority: openedWindow.remoteAuthority });
						if (pathToOpen && pathToOpen.workspace) {
							windowsToOpen.push(pathToOpen);
						}
					} else if (openedWindow.folderUri) { // Folders
						const pathToOpen = this.parseUri({ folderUri: openedWindow.folderUri }, { remoteAuthority: openedWindow.remoteAuthority });
						if (pathToOpen && pathToOpen.folderUri) {
							windowsToOpen.push(pathToOpen);
						}
					} else if (restoreWindows !== 'folders' && openedWindow.backupPath && !openedWindow.remoteAuthority) { // Local windows that were empty. Empty windows with backups will always be restored in open()
						windowsToOpen.push({ backupPath: openedWindow.backupPath, remoteAuthority: openedWindow.remoteAuthority });
					}
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
			restoreWindows = ((windowConfig && windowConfig.restoreWindows) || 'one');

			if (['all', 'folders', 'one', 'none'].indexOf(restoreWindows) === -1) {
				restoreWindows = 'one';
			}
		}

		return restoreWindows;
	}

	private argToUri(arg: string): URI | undefined {
		try {
			const uri = URI.parse(arg);
			if (!uri.scheme) {
				this.logService.error(`Invalid URI input string, scheme missing: ${arg}`);
				return undefined;
			}
			return uri;
		} catch (e) {
			this.logService.error(`Invalid URI input string: ${arg}, ${e.message}`);
		}
		return undefined;
	}

	private parseUri(uriToOpen: IURIToOpen, options: IPathParseOptions = {}): IPathToOpen | undefined {
		if (!uriToOpen) {
			return undefined;
		}
		let uri = resourceFromURIToOpen(uriToOpen);
		if (uri.scheme === Schemas.file) {
			return this.parsePath(uri.fsPath, options, isFileToOpen(uriToOpen));
		}

		// open remote if either specified in the cli or if it's a remotehost URI
		const remoteAuthority = options.remoteAuthority || getRemoteAuthority(uri);

		// normalize URI
		uri = normalizePath(uri);

		// remove trailing slash
		if (hasTrailingPathSeparator(uri)) {
			uri = removeTrailingPathSeparator(uri);
		}

		if (isFileToOpen(uriToOpen)) {
			if (options.gotoLineMode) {
				const parsedPath = parseLineAndColumnAware(uri.path);
				return {
					fileUri: uri.with({ path: parsedPath.path }),
					lineNumber: parsedPath.line,
					columnNumber: parsedPath.column,
					remoteAuthority
				};
			}
			return {
				fileUri: uri,
				remoteAuthority
			};
		} else if (isWorkspaceToOpen(uriToOpen)) {
			return {
				workspace: getWorkspaceIdentifier(uri),
				remoteAuthority
			};
		}
		return {
			folderUri: uri,
			remoteAuthority
		};
	}

	private parsePath(anyPath: string, options: IPathParseOptions, forceOpenWorkspaceAsFile?: boolean): IPathToOpen | undefined {
		if (!anyPath) {
			return undefined;
		}

		let lineNumber, columnNumber: number | undefined;

		if (options.gotoLineMode) {
			const parsedPath = parseLineAndColumnAware(anyPath);
			lineNumber = parsedPath.line;
			columnNumber = parsedPath.column;

			anyPath = parsedPath.path;
		}

		// open remote if either specified in the cli even if it is a local file. TODO@aeschli: Future idea: resolve in remote host context.
		const remoteAuthority = options.remoteAuthority;

		const candidate = normalize(anyPath);
		try {
			const candidateStat = fs.statSync(candidate);
			if (candidateStat.isFile()) {

				// Workspace (unless disabled via flag)
				if (!forceOpenWorkspaceAsFile) {
					const workspace = this.workspacesMainService.resolveLocalWorkspaceSync(URI.file(candidate));
					if (workspace) {
						return {
							workspace: { id: workspace.id, configPath: workspace.configPath },
							remoteAuthority: workspace.remoteAuthority,
							exists: true
						};
					}
				}

				// File
				return {
					fileUri: URI.file(candidate),
					lineNumber,
					columnNumber,
					remoteAuthority,
					exists: true
				};
			}

			// Folder (we check for isDirectory() because e.g. paths like /dev/null
			// are neither file nor folder but some external tools might pass them
			// over to us)
			else if (candidateStat.isDirectory()) {
				return {
					folderUri: URI.file(candidate),
					remoteAuthority,
					exists: true
				};
			}
		} catch (error) {
			const fileUri = URI.file(candidate);
			this.historyMainService.removeFromRecentlyOpened([fileUri]); // since file does not seem to exist anymore, remove from recent

			// assume this is a file that does not yet exist
			if (options && options.ignoreFileNotFound) {
				return {
					fileUri,
					remoteAuthority,
					exists: false
				};
			}
		}

		return undefined;
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
		let openFilesInNewWindow: boolean = false;
		if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
			openFilesInNewWindow = !!openConfig.forceNewWindow && !openConfig.forceReuseWindow;
		} else {

			// macOS: by default we open files in a new window if this is triggered via DOCK context
			if (isMacintosh) {
				if (openConfig.context === OpenContext.DOCK) {
					openFilesInNewWindow = true;
				}
			}

			// Linux/Windows: by default we open files in the new window unless triggered via DIALOG / MENU context
			// or from the integrated terminal where we assume the user prefers to open in the current window
			else {
				if (openConfig.context !== OpenContext.DIALOG && openConfig.context !== OpenContext.MENU && !(openConfig.userEnv && openConfig.userEnv['TERM_PROGRAM'] === 'vscode')) {
					openFilesInNewWindow = true;
				}
			}

			// finally check for overrides of default
			if (!openConfig.cli.extensionDevelopmentPath && (openFilesInNewWindowConfig === 'on' || openFilesInNewWindowConfig === 'off')) {
				openFilesInNewWindow = (openFilesInNewWindowConfig === 'on');
			}
		}

		return { openFolderInNewWindow: !!openFolderInNewWindow, openFilesInNewWindow };
	}

	openExtensionDevelopmentHostWindow(extensionDevelopmentPath: string | string[], openConfig: IOpenConfiguration): void {

		// Reload an existing extension development host window on the same path
		// We currently do not allow more than one extension development window
		// on the same extension path.
		const existingWindow = findWindowOnExtensionDevelopmentPath(WindowsManager.WINDOWS, extensionDevelopmentPath);
		if (existingWindow) {
			this.reload(existingWindow, openConfig.cli);
			existingWindow.focus(); // make sure it gets focus and is restored

			return;
		}
		let folderUris = asArray(openConfig.cli['folder-uri']);
		let fileUris = asArray(openConfig.cli['file-uri']);
		let cliArgs = openConfig.cli._;

		// Fill in previously opened workspace unless an explicit path is provided and we are not unit testing
		if (!cliArgs.length && !folderUris.length && !fileUris.length && !openConfig.cli.extensionTestsPath) {
			const extensionDevelopmentWindowState = this.windowsState.lastPluginDevelopmentHostWindow;
			const workspaceToOpen = extensionDevelopmentWindowState && (extensionDevelopmentWindowState.workspace || extensionDevelopmentWindowState.folderUri);
			if (workspaceToOpen) {
				if (isSingleFolderWorkspaceIdentifier(workspaceToOpen)) {
					if (workspaceToOpen.scheme === Schemas.file) {
						cliArgs = [workspaceToOpen.fsPath];
					} else {
						folderUris = [workspaceToOpen.toString()];
					}
				} else {
					if (workspaceToOpen.configPath.scheme === Schemas.file) {
						cliArgs = [originalFSPath(workspaceToOpen.configPath)];
					} else {
						fileUris = [workspaceToOpen.configPath.toString()];
					}
				}
			}
		}

		if (!Array.isArray(extensionDevelopmentPath)) {
			extensionDevelopmentPath = [extensionDevelopmentPath];
		}

		let authority = '';
		for (let p of extensionDevelopmentPath) {
			if (p.match(/^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/)) {
				const url = URI.parse(p);
				if (url.scheme === Schemas.vscodeRemote) {
					if (authority) {
						if (url.authority !== authority) {
							this.logService.error('more than one extension development path authority');
						}
					} else {
						authority = url.authority;
					}
				}
			}
		}

		// Make sure that we do not try to open:
		// - a workspace or folder that is already opened
		// - a workspace or file that has a different authority as the extension development.

		cliArgs = cliArgs.filter(path => {
			const uri = URI.file(path);
			if (!!findWindowOnWorkspaceOrFolderUri(WindowsManager.WINDOWS, uri)) {
				return false;
			}
			return uri.authority === authority;
		});

		folderUris = folderUris.filter(uri => {
			const u = this.argToUri(uri);
			if (!!findWindowOnWorkspaceOrFolderUri(WindowsManager.WINDOWS, u)) {
				return false;
			}
			return u ? u.authority === authority : false;
		});

		fileUris = fileUris.filter(uri => {
			const u = this.argToUri(uri);
			if (!!findWindowOnWorkspaceOrFolderUri(WindowsManager.WINDOWS, u)) {
				return false;
			}
			return u ? u.authority === authority : false;
		});

		openConfig.cli._ = cliArgs;
		openConfig.cli['folder-uri'] = folderUris;
		openConfig.cli['file-uri'] = fileUris;

		// if there are no files or folders cli args left, use the "remote" cli argument
		const noFilesOrFolders = !cliArgs.length && !folderUris.length && !fileUris.length;
		if (noFilesOrFolders && authority) {
			openConfig.cli.remote = authority;
		}

		// Open it
		const openArgs: IOpenConfiguration = {
			context: openConfig.context,
			cli: openConfig.cli,
			forceNewWindow: true,
			forceEmpty: noFilesOrFolders,
			userEnv: openConfig.userEnv,
			noRecentEntry: true,
			waitMarkerFileURI: openConfig.waitMarkerFileURI
		};
		this.open(openArgs);
	}

	private openInBrowserWindow(options: IOpenBrowserWindowOptions): ICodeWindow {

		// Build IWindowConfiguration from config and options
		const configuration: IWindowConfiguration = mixin({}, options.cli); // inherit all properties from CLI
		configuration.appRoot = this.environmentService.appRoot;
		configuration.machineId = this.machineId;
		configuration.nodeCachedDataDir = this.environmentService.nodeCachedDataDir;
		configuration.mainPid = process.pid;
		configuration.execPath = process.execPath;
		configuration.userEnv = assign({}, this.initialUserEnv, options.userEnv || {});
		configuration.isInitialStartup = options.initialStartup;
		configuration.workspace = options.workspace;
		configuration.folderUri = options.folderUri;
		configuration.remoteAuthority = options.remoteAuthority;

		const fileInputs = options.fileInputs;
		if (fileInputs) {
			configuration.filesToOpenOrCreate = fileInputs.filesToOpenOrCreate;
			configuration.filesToDiff = fileInputs.filesToDiff;
			configuration.filesToWait = fileInputs.filesToWait;
		}

		// if we know the backup folder upfront (for empty windows to restore), we can set it
		// directly here which helps for restoring UI state associated with that window.
		// For all other cases we first call into registerEmptyWindowBackupSync() to set it before
		// loading the window.
		if (options.emptyWindowBackupInfo) {
			configuration.backupPath = join(this.environmentService.backupHome.fsPath, options.emptyWindowBackupInfo.backupFolder);
		}

		let window: ICodeWindow | undefined;
		if (!options.forceNewWindow && !options.forceNewTabbedWindow) {
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

			// Create the window
			window = this.instantiationService.createInstance(CodeWindow, {
				state,
				extensionDevelopmentPath: configuration.extensionDevelopmentPath,
				isExtensionTestHost: !!configuration.extensionTestsPath
			});

			// Add as window tab if configured (macOS only)
			if (options.forceNewTabbedWindow) {
				const activeWindow = this.getLastActiveWindow();
				if (activeWindow) {
					activeWindow.addTabbedWindow(window);
				}
			}

			// Add to our list of windows
			WindowsManager.WINDOWS.push(window);

			// Indicate number change via event
			this._onWindowsCountChanged.fire({ oldCount: WindowsManager.WINDOWS.length - 1, newCount: WindowsManager.WINDOWS.length });

			// Window Events
			window.win.webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			window.win.webContents.on('devtools-reload-page', () => this.reload(window!));
			window.win.webContents.on('crashed', () => this.onWindowError(window!, WindowError.CRASHED));
			window.win.on('unresponsive', () => this.onWindowError(window!, WindowError.UNRESPONSIVE));
			window.win.on('closed', () => this.onWindowClosed(window!));

			// Lifecycle
			(this.lifecycleService as LifecycleService).registerWindow(window);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in extension development host mode. These options are all development related.
			const currentWindowConfig = window.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
				configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
				configuration.verbose = currentWindowConfig.verbose;
				configuration['inspect-brk-extensions'] = currentWindowConfig['inspect-brk-extensions'];
				configuration.debugId = currentWindowConfig.debugId;
				configuration['inspect-extensions'] = currentWindowConfig['inspect-extensions'];
				configuration['extensions-dir'] = currentWindowConfig['extensions-dir'];
			}
		}

		// If the window was already loaded, make sure to unload it
		// first and only load the new configuration if that was
		// not vetoed
		if (window.isReady) {
			this.lifecycleService.unload(window, UnloadReason.LOAD).then(veto => {
				if (!veto) {
					this.doOpenInBrowserWindow(window!, configuration, options);
				}
			});
		} else {
			this.doOpenInBrowserWindow(window, configuration, options);
		}

		return window;
	}

	private doOpenInBrowserWindow(window: ICodeWindow, configuration: IWindowConfiguration, options: IOpenBrowserWindowOptions): void {

		// Register window for backups
		if (!configuration.extensionDevelopmentPath) {
			if (configuration.workspace) {
				configuration.backupPath = this.backupMainService.registerWorkspaceBackupSync({ workspace: configuration.workspace, remoteAuthority: configuration.remoteAuthority });
			} else if (configuration.folderUri) {
				configuration.backupPath = this.backupMainService.registerFolderBackupSync(configuration.folderUri);
			} else {
				const backupFolder = options.emptyWindowBackupInfo && options.emptyWindowBackupInfo.backupFolder;
				configuration.backupPath = this.backupMainService.registerEmptyWindowBackupSync(backupFolder, configuration.remoteAuthority);
			}
		}

		// Load it
		window.load(configuration);

		// Signal event
		this._onWindowLoad.fire(window.id);
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
			const workspace = configuration.workspace;
			if (workspace) {
				const stateForWorkspace = this.windowsState.openedWindows.filter(o => o.workspace && o.workspace.id === workspace.id).map(o => o.uiState);
				if (stateForWorkspace.length) {
					return stateForWorkspace[0];
				}
			}

			// Known Folder - load from stored settings
			if (configuration.folderUri) {
				const stateForFolder = this.windowsState.openedWindows.filter(o => o.folderUri && isEqual(o.folderUri, configuration.folderUri)).map(o => o.uiState);
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
		let displayToUse: Electron.Display | undefined;
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

		// Compute x/y based on display bounds
		// Note: important to use Math.round() because Electron does not seem to be too happy about
		// display coordinates that are not absolute numbers.
		let state = defaultWindowState();
		state.x = Math.round(displayToUse.bounds.x + (displayToUse.bounds.width / 2) - (state.width! / 2));
		state.y = Math.round(displayToUse.bounds.y + (displayToUse.bounds.height / 2) - (state.height! / 2));

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

		(state as INewWindowState).hasDefaultState = true; // flag as default state

		return state;
	}

	private ensureNoOverlap(state: ISingleWindowState): ISingleWindowState {
		if (WindowsManager.WINDOWS.length === 0) {
			return state;
		}

		state.x = typeof state.x === 'number' ? state.x : 0;
		state.y = typeof state.y === 'number' ? state.y : 0;

		const existingWindowBounds = WindowsManager.WINDOWS.map(win => win.getBounds());
		while (existingWindowBounds.some(b => b.x === state.x || b.y === state.y)) {
			state.x += 30;
			state.y += 30;
		}

		return state;
	}

	async reload(win: ICodeWindow, cli?: ParsedArgs): Promise<void> {

		// Only reload when the window has not vetoed this
		const veto = await this.lifecycleService.unload(win, UnloadReason.RELOAD);
		if (!veto) {
			win.reload(undefined, cli);
		}
	}

	closeWorkspace(win: ICodeWindow): void {
		this.openInBrowserWindow({
			cli: this.environmentService.args,
			windowToUse: win,
			remoteAuthority: win.remoteAuthority
		});
	}

	async enterWorkspace(win: ICodeWindow, path: URI): Promise<IEnterWorkspaceResult | undefined> {
		const result = await this.workspacesManager.enterWorkspace(win, path);

		return result ? this.doEnterWorkspace(win, result) : undefined;
	}

	private doEnterWorkspace(win: ICodeWindow, result: IEnterWorkspaceResult): IEnterWorkspaceResult {

		// Mark as recently opened
		this.historyMainService.addRecentlyOpened([{ workspace: result.workspace }]);

		// Trigger Eevent to indicate load of workspace into window
		this._onWindowReady.fire(win);

		return result;
	}

	focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow {
		const lastActive = this.getLastActiveWindow();
		if (lastActive) {
			lastActive.focus();

			return lastActive;
		}

		// No window - open new empty one
		return this.open({ context, cli, forceEmpty: true })[0];
	}

	getLastActiveWindow(): ICodeWindow | undefined {
		return getLastActiveWindow(WindowsManager.WINDOWS);
	}

	getLastActiveWindowForAuthority(remoteAuthority: string | undefined): ICodeWindow | undefined {
		return getLastActiveWindow(WindowsManager.WINDOWS.filter(w => w.remoteAuthority === remoteAuthority));
	}

	openNewWindow(context: OpenContext, options?: INewWindowOptions): ICodeWindow[] {
		let cli = this.environmentService.args;
		const remote = options && options.remoteAuthority || undefined;
		if (cli && (cli.remote !== remote)) {
			cli = { ...cli, remote };
		}
		const forceReuseWindow = options && options.reuseWindow;
		const forceNewWindow = !forceReuseWindow;
		return this.open({ context, cli, forceEmpty: true, forceNewWindow, forceReuseWindow });
	}

	openNewTabbedWindow(context: OpenContext): ICodeWindow[] {
		return this.open({ context, cli: this.environmentService.args, forceNewTabbedWindow: true, forceEmpty: true });
	}

	waitForWindowCloseOrLoad(windowId: number): Promise<void> {
		return new Promise<void>(resolve => {
			function handler(id: number) {
				if (id === windowId) {
					closeListener.dispose();
					loadListener.dispose();

					resolve();
				}
			}

			const closeListener = this.onWindowClose(id => handler(id));
			const loadListener = this.onWindowLoad(id => handler(id));
		});
	}

	sendToFocused(channel: string, ...args: any[]): void {
		const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();

		if (focusedWindow) {
			focusedWindow.sendWhenReady(channel, ...args);
		}
	}

	sendToAll(channel: string, payload?: any, windowIdsToIgnore?: number[]): void {
		WindowsManager.WINDOWS.forEach(w => {
			if (windowIdsToIgnore && windowIdsToIgnore.indexOf(w.id) >= 0) {
				return; // do not send if we are instructed to ignore it
			}

			w.sendWhenReady(channel, payload);
		});
	}

	getFocusedWindow(): ICodeWindow | undefined {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			return this.getWindowById(win.id);
		}

		return undefined;
	}

	getWindowById(windowId: number): ICodeWindow | undefined {
		const res = WindowsManager.WINDOWS.filter(w => w.id === windowId);
		if (res && res.length === 1) {
			return res[0];
		}

		return undefined;
	}

	getWindows(): ICodeWindow[] {
		return WindowsManager.WINDOWS;
	}

	getWindowCount(): number {
		return WindowsManager.WINDOWS.length;
	}

	private onWindowError(window: ICodeWindow, error: WindowError): void {
		this.logService.error(error === WindowError.CRASHED ? '[VS Code]: render process crashed!' : '[VS Code]: detected unresponsive');
		type WindowErrorClassification = {
			type: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
		};
		type WindowErrorEvent = {
			type: WindowError;
		};
		this.telemetryService.publicLog2<WindowErrorEvent, WindowErrorClassification>('windowerror', { type: error });
		// Unresponsive
		if (error === WindowError.UNRESPONSIVE) {
			if (window.isExtensionDevelopmentHost || window.isExtensionTestHost || (window.win && window.win.webContents && window.win.webContents.isDevToolsOpened())) {
				// TODO@Ben Workaround for https://github.com/Microsoft/vscode/issues/56994
				// In certain cases the window can report unresponsiveness because a breakpoint was hit
				// and the process is stopped executing. The most typical cases are:
				// - devtools are opened and debugging happens
				// - window is an extensions development host that is being debugged
				// - window is an extension test development host that is being debugged
				return;
			}

			// Show Dialog
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

	async pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		const title = localize('open', "Open");
		const paths = await this.dialogs.pick({ ...options, pickFolders: true, pickFiles: true, title });
		if (paths) {
			this.sendPickerTelemetry(paths, options.telemetryEventName || 'openFileFolder', options.telemetryExtraData);
			const urisToOpen = await Promise.all(paths.map(async path => {
				const isDir = await dirExists(path);

				return isDir ? { folderUri: URI.file(path) } : { fileUri: URI.file(path) };
			}));
			this.open({
				context: OpenContext.DIALOG,
				contextWindowId: options.windowId,
				cli: this.environmentService.args,
				urisToOpen,
				forceNewWindow: options.forceNewWindow
			});
		}
	}

	async pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		const title = localize('openFolder', "Open Folder");
		const paths = await this.dialogs.pick({ ...options, pickFolders: true, title });
		if (paths) {
			this.sendPickerTelemetry(paths, options.telemetryEventName || 'openFolder', options.telemetryExtraData);
			this.open({
				context: OpenContext.DIALOG,
				contextWindowId: options.windowId,
				cli: this.environmentService.args,
				urisToOpen: paths.map(path => ({ folderUri: URI.file(path) })),
				forceNewWindow: options.forceNewWindow
			});
		}
	}

	async pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		const title = localize('openFile', "Open File");
		const paths = await this.dialogs.pick({ ...options, pickFiles: true, title });
		if (paths) {
			this.sendPickerTelemetry(paths, options.telemetryEventName || 'openFile', options.telemetryExtraData);
			this.open({
				context: OpenContext.DIALOG,
				contextWindowId: options.windowId,
				cli: this.environmentService.args,
				urisToOpen: paths.map(path => ({ fileUri: URI.file(path) })),
				forceNewWindow: options.forceNewWindow
			});
		}
	}

	async pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		const title = localize('openWorkspaceTitle', "Open Workspace");
		const buttonLabel = mnemonicButtonLabel(localize({ key: 'openWorkspace', comment: ['&& denotes a mnemonic'] }, "&&Open"));
		const filters = WORKSPACE_FILTER;
		const paths = await this.dialogs.pick({ ...options, pickFiles: true, title, filters, buttonLabel });
		if (paths) {
			this.sendPickerTelemetry(paths, options.telemetryEventName || 'openWorkspace', options.telemetryExtraData);
			this.open({
				context: OpenContext.DIALOG,
				contextWindowId: options.windowId,
				cli: this.environmentService.args,
				urisToOpen: paths.map(path => ({ workspaceUri: URI.file(path) })),
				forceNewWindow: options.forceNewWindow
			});
		}

	}

	private sendPickerTelemetry(paths: string[], telemetryEventName: string, telemetryExtraData?: ITelemetryData) {

		const numberOfPaths = paths ? paths.length : 0;

		// Telemetry
		// __GDPR__TODO__ Dynamic event names and dynamic properties. Can not be registered statically.
		this.telemetryService.publicLog(telemetryEventName, {
			...telemetryExtraData,
			outcome: numberOfPaths ? 'success' : 'canceled',
			numberOfPaths
		});
	}

	showMessageBox(options: Electron.MessageBoxOptions, win?: ICodeWindow): Promise<IMessageBoxResult> {
		return this.dialogs.showMessageBox(options, win);
	}

	showSaveDialog(options: Electron.SaveDialogOptions, win?: ICodeWindow): Promise<string> {
		return this.dialogs.showSaveDialog(options, win);
	}

	showOpenDialog(options: Electron.OpenDialogOptions, win?: ICodeWindow): Promise<string[]> {
		return this.dialogs.showOpenDialog(options, win);
	}

	quit(): void {

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

	title: string;
	buttonLabel?: string;
	filters?: FileFilter[];
}

class Dialogs {

	private static readonly workingDirPickerStorageKey = 'pickerWorkingDir';

	private readonly mapWindowToDialogQueue: Map<number, Queue<void>>;
	private readonly noWindowDialogQueue: Queue<void>;

	constructor(
		private readonly stateService: IStateService,
		private readonly windowsMainService: IWindowsMainService
	) {
		this.mapWindowToDialogQueue = new Map<number, Queue<void>>();
		this.noWindowDialogQueue = new Queue<void>();
	}

	async pick(options: IInternalNativeOpenDialogOptions): Promise<string[] | undefined> {

		// Ensure dialog options
		const dialogOptions: Electron.OpenDialogOptions = {
			title: options.title,
			buttonLabel: options.buttonLabel,
			filters: options.filters
		};

		// Ensure defaultPath
		dialogOptions.defaultPath = options.defaultPath || this.stateService.getItem<string>(Dialogs.workingDirPickerStorageKey);


		// Ensure properties
		if (typeof options.pickFiles === 'boolean' || typeof options.pickFolders === 'boolean') {
			dialogOptions.properties = undefined; // let it override based on the booleans

			if (options.pickFiles && options.pickFolders) {
				dialogOptions.properties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
			}
		}

		if (!dialogOptions.properties) {
			dialogOptions.properties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		if (isMacintosh) {
			dialogOptions.properties.push('treatPackageAsDirectory'); // always drill into .app files
		}

		// Show Dialog
		const focusedWindow = (typeof options.windowId === 'number' ? this.windowsMainService.getWindowById(options.windowId) : undefined) || this.windowsMainService.getFocusedWindow();

		const paths = await this.showOpenDialog(dialogOptions, focusedWindow);
		if (paths && paths.length > 0) {

			// Remember path in storage for next time
			this.stateService.setItem(Dialogs.workingDirPickerStorageKey, dirname(paths[0]));

			return paths;
		}

		return;
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

	showMessageBox(options: Electron.MessageBoxOptions, window?: ICodeWindow): Promise<IMessageBoxResult> {
		return this.getDialogQueue(window).queue(() => {
			return new Promise(resolve => {
				const callback = (response: number, checkboxChecked: boolean) => {
					resolve({ button: response, checkboxChecked });
				};

				if (window) {
					dialog.showMessageBox(window.win, options, callback);
				} else {
					dialog.showMessageBox(options, callback);
				}
			});
		});
	}

	showSaveDialog(options: Electron.SaveDialogOptions, window?: ICodeWindow): Promise<string> {

		function normalizePath(path: string): string {
			if (path && isMacintosh) {
				path = normalizeNFC(path); // normalize paths returned from the OS
			}

			return path;
		}

		return this.getDialogQueue(window).queue(() => {
			return new Promise(resolve => {
				const callback = (path: string) => {
					resolve(normalizePath(path));
				};

				if (window) {
					dialog.showSaveDialog(window.win, options, callback);
				} else {
					dialog.showSaveDialog(options, callback);
				}
			});
		});
	}

	showOpenDialog(options: Electron.OpenDialogOptions, window?: ICodeWindow): Promise<string[]> {

		function normalizePaths(paths: string[]): string[] {
			if (paths && paths.length > 0 && isMacintosh) {
				paths = paths.map(path => normalizeNFC(path)); // normalize paths returned from the OS
			}

			return paths;
		}

		return this.getDialogQueue(window).queue(() => {
			return new Promise(resolve => {

				// Ensure the path exists (if provided)
				let validatePathPromise: Promise<void> = Promise.resolve();
				if (options.defaultPath) {
					validatePathPromise = exists(options.defaultPath).then(exists => {
						if (!exists) {
							options.defaultPath = undefined;
						}
					});
				}

				// Show dialog and wrap as promise
				validatePathPromise.then(() => {
					const callback = (paths: string[]) => {
						resolve(normalizePaths(paths));
					};

					if (window) {
						dialog.showOpenDialog(window.win, options, callback);
					} else {
						dialog.showOpenDialog(options, callback);
					}
				});
			});
		});
	}
}

class WorkspacesManager {

	constructor(
		private readonly workspacesMainService: IWorkspacesMainService,
		private readonly backupMainService: IBackupMainService,
		private readonly windowsMainService: IWindowsMainService,
	) { }

	async enterWorkspace(window: ICodeWindow, path: URI): Promise<IEnterWorkspaceResult | null> {
		if (!window || !window.win || !window.isReady) {
			return null; // return early if the window is not ready or disposed
		}

		const isValid = await this.isValidTargetWorkspacePath(window, path);
		if (!isValid) {
			return null; // return early if the workspace is not valid
		}

		return this.doOpenWorkspace(window, getWorkspaceIdentifier(path));
	}

	private async isValidTargetWorkspacePath(window: ICodeWindow, path?: URI): Promise<boolean> {
		if (!path) {
			return true;
		}

		if (window.openedWorkspace && isEqual(window.openedWorkspace.configPath, path)) {
			return false; // window is already opened on a workspace with that path
		}

		// Prevent overwriting a workspace that is currently opened in another window
		if (findWindowOnWorkspace(this.windowsMainService.getWindows(), getWorkspaceIdentifier(path))) {
			const options: Electron.MessageBoxOptions = {
				title: product.nameLong,
				type: 'info',
				buttons: [localize('ok', "OK")],
				message: localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", resourcesBasename(path)),
				detail: localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again."),
				noLink: true
			};

			await this.windowsMainService.showMessageBox(options, this.windowsMainService.getFocusedWindow());

			return false;
		}

		return true; // OK
	}

	private doOpenWorkspace(window: ICodeWindow, workspace: IWorkspaceIdentifier): IEnterWorkspaceResult {
		window.focus();

		// Register window for backups and migrate current backups over
		let backupPath: string | undefined;
		if (!window.config.extensionDevelopmentPath) {
			backupPath = this.backupMainService.registerWorkspaceBackupSync({ workspace, remoteAuthority: window.remoteAuthority }, window.config.backupPath);
		}

		// if the window was opened on an untitled workspace, delete it.
		if (window.openedWorkspace && this.workspacesMainService.isUntitledWorkspace(window.openedWorkspace)) {
			this.workspacesMainService.deleteUntitledWorkspaceSync(window.openedWorkspace);
		}

		// Update window configuration properly based on transition to workspace
		window.config.folderUri = undefined;
		window.config.workspace = workspace;
		window.config.backupPath = backupPath;

		return { workspace, backupPath };
	}
}

function resourceFromURIToOpen(u: IURIToOpen): URI {
	if (isWorkspaceToOpen(u)) {
		return u.workspaceUri;
	}

	if (isFolderToOpen(u)) {
		return u.folderUri;
	}

	return u.fileUri;
}
