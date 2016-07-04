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
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import pkg from 'vs/platform/package';
import { EventEmitter } from 'events';
import { IStorageService } from 'vs/code/electron-main/storage';
import { IPath, VSCodeWindow, ReadyState, IWindowConfiguration, IWindowState as ISingleWindowState, defaultWindowState } from 'vs/code/electron-main/window';
import { ipcMain as ipc, app, screen, crashReporter, BrowserWindow, dialog } from 'electron';
import { ICommandLineArguments, IProcessEnvironment, IEnvironmentService, IParsedPath, parseLineAndColumnAware } from 'vs/code/electron-main/env';
import { ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { ISettingsService } from 'vs/code/electron-main/settings';
import { IUpdateService, IUpdate } from 'vs/code/electron-main/update-manager';
import { ILogService } from 'vs/code/electron-main/log';
import { ServiceIdentifier, createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const EventTypes = {
	OPEN: 'open',
	CLOSE: 'close',
	READY: 'ready'
};

enum WindowError {
	UNRESPONSIVE,
	CRASHED
}

export interface IOpenConfiguration {
	cli: ICommandLineArguments;
	userEnv?: IProcessEnvironment;
	pathsToOpen?: string[];
	preferNewWindow?: boolean;
	forceNewWindow?: boolean;
	forceEmpty?: boolean;
	windowToUse?: VSCodeWindow;
	diffMode?: boolean;
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

export interface IOpenedPathsList {
	folders: string[];
	files: string[];
}

interface ILogEntry {
	severity: string;
	arguments: any;
}

interface INativeOpenDialogOptions {
	pickFolders?: boolean;
	pickFiles?: boolean;
	path?: string;
	forceNewWindow?: boolean;
}

const ReopenFoldersSetting = {
	ALL: 'all',
	ONE: 'one',
	NONE: 'none'
};

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export interface IWindowsService {
	serviceId: ServiceIdentifier<any>;

	// TODO make proper events
	// events
	onOpen(clb: (path: IPath) => void): () => void;
	onReady(clb: (win: VSCodeWindow) => void): () => void;
	onClose(clb: (id: number) => void): () => void;

	// methods
	ready(initialUserEnv: IProcessEnvironment): void;
	reload(win: VSCodeWindow, cli?: ICommandLineArguments): void;
	open(openConfig: IOpenConfiguration): VSCodeWindow[];
	openPluginDevelopmentHostWindow(openConfig: IOpenConfiguration): void;
	openFileFolderPicker(forceNewWindow?: boolean): void;
	openFilePicker(forceNewWindow?: boolean): void;
	openFolderPicker(forceNewWindow?: boolean): void;
	focusLastActive(cli: ICommandLineArguments): VSCodeWindow;
	getLastActiveWindow(): VSCodeWindow;
	findWindow(workspacePath: string, filePath?: string, extensionDevelopmentPath?: string): VSCodeWindow;
	openNewWindow(): void;
	sendToFocused(channel: string, ...args: any[]): void;
	sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void;
	getFocusedWindow(): VSCodeWindow;
	getWindowById(windowId: number): VSCodeWindow;
	getWindows(): VSCodeWindow[];
	getWindowCount(): number;
}

export class WindowsManager implements IWindowsService {

	serviceId = IWindowsService;

	public static openedPathsListStorageKey = 'openedPathsList';

	private static workingDirPickerStorageKey = 'pickerWorkingDir';
	private static windowsStateStorageKey = 'windowsState';

	private static WINDOWS: VSCodeWindow[] = [];

	private eventEmitter = new EventEmitter();
	private initialUserEnv: IProcessEnvironment;
	private windowsState: IWindowsState;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private logService: ILogService,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private envService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IUpdateService private updateService: IUpdateService,
		@ISettingsService private settingsService: ISettingsService
	) {	}

	onOpen(clb: (path: IPath) => void): () => void {
		this.eventEmitter.addListener(EventTypes.OPEN, clb);

		return () => this.eventEmitter.removeListener(EventTypes.OPEN, clb);
	}

	onReady(clb: (win: VSCodeWindow) => void): () => void {
		this.eventEmitter.addListener(EventTypes.READY, clb);

		return () => this.eventEmitter.removeListener(EventTypes.READY, clb);
	}

	onClose(clb: (id: number) => void): () => void {
		this.eventEmitter.addListener(EventTypes.CLOSE, clb);

		return () => this.eventEmitter.removeListener(EventTypes.CLOSE, clb);
	}

	public ready(initialUserEnv: IProcessEnvironment): void {
		this.registerListeners();

		this.initialUserEnv = initialUserEnv;
		this.windowsState = this.storageService.getItem<IWindowsState>(WindowsManager.windowsStateStorageKey) || { openedFolders: [] };
	}

	private registerListeners(): void {
		app.on('activate', (event: Event, hasVisibleWindows: boolean) => {
			this.logService.log('App#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows) {
				this.openNewWindow();
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
				this.open({ cli: this.envService.cliArgs, pathsToOpen: macOpenFiles, preferNewWindow: true /* dropping on the dock prefers to open in a new window */ });
				macOpenFiles = [];
				runningTimeout = null;
			}, 100);
		});

		this.settingsService.onChange((newSettings) => {
			this.sendToAll('vscode:optionsChange', JSON.stringify({ globalSettings: newSettings }));
		}, this);

		ipc.on('vscode:startCrashReporter', (event: any, config: any) => {
			this.logService.log('IPC#vscode:startCrashReporter');

			crashReporter.start(config);
		});

		ipc.on('vscode:windowOpen', (event, paths: string[], forceNewWindow?: boolean) => {
			this.logService.log('IPC#vscode-windowOpen: ', paths);

			if (paths && paths.length) {
				this.open({ cli: this.envService.cliArgs, pathsToOpen: paths, forceNewWindow: forceNewWindow });
			}
		});

		ipc.on('vscode:workbenchLoaded', (event, windowId: number) => {
			this.logService.log('IPC#vscode-workbenchLoaded');

			let win = this.getWindowById(windowId);
			if (win) {
				win.setReady();

				// Event
				this.eventEmitter.emit(EventTypes.READY, win);
			}
		});

		ipc.on('vscode:openFilePicker', (event, forceNewWindow?: boolean, path?: string) => {
			this.logService.log('IPC#vscode-openFilePicker');

			this.openFilePicker(forceNewWindow, path);
		});

		ipc.on('vscode:openFolderPicker', (event, forceNewWindow?: boolean) => {
			this.logService.log('IPC#vscode-openFolderPicker');

			this.openFolderPicker(forceNewWindow);
		});

		ipc.on('vscode:openFileFolderPicker', (event, forceNewWindow?: boolean) => {
			this.logService.log('IPC#vscode-openFileFolderPicker');

			this.openFileFolderPicker(forceNewWindow);
		});

		ipc.on('vscode:closeFolder', (event, windowId: number) => {
			this.logService.log('IPC#vscode-closeFolder');

			let win = this.getWindowById(windowId);
			if (win) {
				this.open({ cli: this.envService.cliArgs, forceEmpty: true, windowToUse: win });
			}
		});

		ipc.on('vscode:openNewWindow', () => {
			this.logService.log('IPC#vscode-openNewWindow');

			this.openNewWindow();
		});

		ipc.on('vscode:reloadWindow', (event, windowId: number) => {
			this.logService.log('IPC#vscode:reloadWindow');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				this.reload(vscodeWindow);
			}
		});

		ipc.on('vscode:toggleFullScreen', (event, windowId: number) => {
			this.logService.log('IPC#vscode:toggleFullScreen');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.toggleFullScreen();
			}
		});

		ipc.on('vscode:setFullScreen', (event, windowId: number, fullscreen: boolean) => {
			this.logService.log('IPC#vscode:setFullScreen');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.setFullScreen(fullscreen);
			}
		});

		ipc.on('vscode:toggleDevTools', (event, windowId: number) => {
			this.logService.log('IPC#vscode:toggleDevTools');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.webContents.toggleDevTools();
			}
		});

		ipc.on('vscode:openDevTools', (event, windowId: number) => {
			this.logService.log('IPC#vscode:openDevTools');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.webContents.openDevTools();
				vscodeWindow.win.show();
			}
		});

		ipc.on('vscode:setRepresentedFilename', (event, windowId: number, fileName: string) => {
			this.logService.log('IPC#vscode:setRepresentedFilename');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.setRepresentedFilename(fileName);
			}
		});

		ipc.on('vscode:setMenuBarVisibility', (event, windowId: number, visibility: boolean) => {
			this.logService.log('IPC#vscode:setMenuBarVisibility');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.setMenuBarVisibility(visibility);
			}
		});

		ipc.on('vscode:flashFrame', (event, windowId: number) => {
			this.logService.log('IPC#vscode:flashFrame');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.flashFrame(!vscodeWindow.win.isFocused());
			}
		});

		ipc.on('vscode:focusWindow', (event, windowId: number) => {
			this.logService.log('IPC#vscode:focusWindow');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow) {
				vscodeWindow.win.focus();
			}
		});

		ipc.on('vscode:setDocumentEdited', (event, windowId: number, edited: boolean) => {
			this.logService.log('IPC#vscode:setDocumentEdited');

			let vscodeWindow = this.getWindowById(windowId);
			if (vscodeWindow && vscodeWindow.win.isDocumentEdited() !== edited) {
				vscodeWindow.win.setDocumentEdited(edited);
			}
		});

		ipc.on('vscode:toggleMenuBar', (event, windowId: number) => {
			this.logService.log('IPC#vscode:toggleMenuBar');

			// Update in settings
			let menuBarHidden = this.storageService.getItem(VSCodeWindow.menuBarHiddenKey, false);
			let newMenuBarHidden = !menuBarHidden;
			this.storageService.setItem(VSCodeWindow.menuBarHiddenKey, newMenuBarHidden);

			// Update across windows
			WindowsManager.WINDOWS.forEach(w => w.setMenuBarVisibility(!newMenuBarHidden));

			// Inform user if menu bar is now hidden
			if (newMenuBarHidden) {
				let vscodeWindow = this.getWindowById(windowId);
				if (vscodeWindow) {
					vscodeWindow.send('vscode:showInfoMessage', nls.localize('hiddenMenuBar', "You can still access the menu bar by pressing the **Alt** key."));
				}
			}
		});

		ipc.on('vscode:broadcast', (event, windowId: number, target: string, broadcast: { channel: string; payload: any; }) => {
			if (broadcast.channel && broadcast.payload) {
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

		ipc.on('vscode:log', (event, logEntry: ILogEntry) => {
			let args = [];
			try {
				let parsed = JSON.parse(logEntry.arguments);
				args.push(...Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
			} catch (error) {
				args.push(logEntry.arguments);
			}

			console[logEntry.severity].apply(console, args);
		});

		ipc.on('vscode:closeExtensionHostWindow', (event, extensionDevelopmentPath: string) => {
			this.logService.log('IPC#vscode:closeExtensionHostWindow', extensionDevelopmentPath);

			const windowOnExtension = this.findWindow(null, null, extensionDevelopmentPath);
			if (windowOnExtension) {
				windowOnExtension.win.close();
			}
		});

		this.updateService.on('update-downloaded', (update: IUpdate) => {
			this.sendToFocused('vscode:telemetry', { eventName: 'update:downloaded', data: { version: update.version } });

			this.sendToAll('vscode:update-downloaded', JSON.stringify({
				releaseNotes: update.releaseNotes,
				version: update.version,
				date: update.date
			}));
		});

		ipc.on('vscode:update-apply', () => {
			this.logService.log('IPC#vscode:update-apply');

			if (this.updateService.availableUpdate) {
				this.updateService.availableUpdate.quitAndUpdate();
			}
		});

		this.updateService.on('update-not-available', (explicit: boolean) => {
			this.sendToFocused('vscode:telemetry', { eventName: 'update:notAvailable', data: { explicit } });

			if (explicit) {
				this.sendToFocused('vscode:update-not-available', '');
			}
		});

		this.updateService.on('update-available', (url: string) => {
			if (url) {
				this.sendToFocused('vscode:update-available', url);
			}
		});

		this.lifecycleService.onBeforeQuit(() => {

			// 0-1 window open: Do not keep the list but just rely on the active window to be stored
			if (WindowsManager.WINDOWS.length < 2) {
				this.windowsState.openedFolders = [];
				return;
			}

			// 2-N windows open: Keep a list of windows that are opened on a specific folder to restore it in the next session as needed
			this.windowsState.openedFolders = WindowsManager.WINDOWS.filter(w => w.readyState === ReadyState.READY && !!w.openedWorkspacePath && !w.isPluginDevelopmentHost).map(w => {
				return <IWindowState>{
					workspacePath: w.openedWorkspacePath,
					uiState: w.serializeWindowState()
				};
			});
		});

		app.on('will-quit', () => {
			this.storageService.setItem(WindowsManager.windowsStateStorageKey, this.windowsState);
		});

		let loggedStartupTimes = false;
		this.onReady(window => {
			if (loggedStartupTimes) {
				return; // only for the first window
			}

			loggedStartupTimes = true;

			window.send('vscode:telemetry', { eventName: 'startupTime', data: { ellapsed: Date.now() - global.vscodeStart } });
		});
	}

	private onBroadcast(event: string, payload: any): void {

		// Theme changes
		if (event === 'vscode:changeTheme' && typeof payload === 'string') {
			this.storageService.setItem(VSCodeWindow.themeStorageKey, payload);
		}
	}

	public reload(win: VSCodeWindow, cli?: ICommandLineArguments): void {

		// Only reload when the window has not vetoed this
		this.lifecycleService.unload(win).done((veto) => {
			if (!veto) {
				win.reload(cli);
			}
		});
	}

	public open(openConfig: IOpenConfiguration): VSCodeWindow[] {
		let iPathsToOpen: IPath[];
		let usedWindows: VSCodeWindow[] = [];

		// Find paths from provided paths if any
		if (openConfig.pathsToOpen && openConfig.pathsToOpen.length > 0) {
			iPathsToOpen = openConfig.pathsToOpen.map((pathToOpen) => {
				let iPath = this.toIPath(pathToOpen, false, openConfig.cli && openConfig.cli.gotoLineMode);

				// Warn if the requested path to open does not exist
				if (!iPath) {
					let options = {
						title: this.envService.product.nameLong,
						type: 'info',
						buttons: [nls.localize('ok', "OK")],
						message: nls.localize('pathNotExistTitle', "Path does not exist"),
						detail: nls.localize('pathNotExistDetail', "The path '{0}' does not seem to exist anymore on disk.", pathToOpen),
						noLink: true
					};

					let activeWindow = BrowserWindow.getFocusedWindow();
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
			let ignoreFileNotFound = openConfig.cli.pathArguments.length > 0; // we assume the user wants to create this file from command line
			iPathsToOpen = this.cliToPaths(openConfig.cli, ignoreFileNotFound);
		}

		let filesToOpen: IPath[] = [];
		let filesToDiff: IPath[] = [];
		let foldersToOpen = iPathsToOpen.filter((iPath) => iPath.workspacePath && !iPath.filePath && !iPath.installExtensionPath);
		let emptyToOpen = iPathsToOpen.filter((iPath) => !iPath.workspacePath && !iPath.filePath && !iPath.installExtensionPath);
		let extensionsToInstall = iPathsToOpen.filter((iPath) => iPath.installExtensionPath).map(ipath => ipath.filePath);
		let filesToCreate = iPathsToOpen.filter((iPath) => !!iPath.filePath && iPath.createFilePath && !iPath.installExtensionPath);

		// Diff mode needs special care
		let candidates = iPathsToOpen.filter((iPath) => !!iPath.filePath && !iPath.createFilePath && !iPath.installExtensionPath);
		if (openConfig.diffMode) {
			if (candidates.length === 2) {
				filesToDiff = candidates;
			} else {
				emptyToOpen = [Object.create(null)]; // improper use of diffMode, open empty
			}

			foldersToOpen = []; // diff is always in empty workspace
			filesToCreate = []; // diff ignores other files that do not exist
		} else {
			filesToOpen = candidates;
		}

		let configuration: IWindowConfiguration;

		// Handle files to open/diff or to create when we dont open a folder
		if (!foldersToOpen.length && (filesToOpen.length > 0 || filesToCreate.length > 0 || filesToDiff.length > 0 || extensionsToInstall.length > 0)) {

			// Let the user settings override how files are open in a new window or same window unless we are forced
			let openFilesInNewWindow: boolean;
			if (openConfig.forceNewWindow) {
				openFilesInNewWindow = true;
			} else {
				openFilesInNewWindow = openConfig.preferNewWindow;
				if (openFilesInNewWindow && !openConfig.cli.extensionDevelopmentPath) { // can be overriden via settings (not for PDE though!)
					openFilesInNewWindow = this.settingsService.getValue('window.openFilesInNewWindow', openFilesInNewWindow);
				}
			}

			// Open Files in last instance if any and flag tells us so
			let lastActiveWindow = this.getLastActiveWindow();
			if (!openFilesInNewWindow && lastActiveWindow) {
				lastActiveWindow.focus();
				lastActiveWindow.ready().then((readyWindow) => {
					readyWindow.send('vscode:openFiles', {
						filesToOpen: filesToOpen,
						filesToCreate: filesToCreate,
						filesToDiff: filesToDiff
					});

					if (extensionsToInstall.length) {
						readyWindow.send('vscode:installExtensions', { extensionsToInstall });
					}
				});

				usedWindows.push(lastActiveWindow);
			}

			// Otherwise open instance with files
			else {
				configuration = this.toConfiguration(openConfig.userEnv || this.initialUserEnv, openConfig.cli, null, filesToOpen, filesToCreate, filesToDiff, extensionsToInstall);
				let browserWindow = this.openInBrowserWindow(configuration, true /* new window */);
				usedWindows.push(browserWindow);

				openConfig.forceNewWindow = true; // any other folders to open must open in new window then
			}
		}

		// Handle folders to open
		let openInNewWindow = openConfig.preferNewWindow || openConfig.forceNewWindow;
		if (foldersToOpen.length > 0) {

			// Check for existing instances
			let windowsOnWorkspacePath = arrays.coalesce(foldersToOpen.map((iPath) => this.findWindow(iPath.workspacePath)));
			if (windowsOnWorkspacePath.length > 0) {
				let browserWindow = windowsOnWorkspacePath[0];
				browserWindow.focus(); // just focus one of them
				browserWindow.ready().then((readyWindow) => {
					readyWindow.send('vscode:openFiles', {
						filesToOpen: filesToOpen,
						filesToCreate: filesToCreate,
						filesToDiff: filesToDiff
					});

					if (extensionsToInstall.length) {
						readyWindow.send('vscode:installExtensions', { extensionsToInstall });
					}
				});

				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				extensionsToInstall = [];

				openInNewWindow = true; // any other folders to open must open in new window then
			}

			// Open remaining ones
			foldersToOpen.forEach((folderToOpen) => {
				if (windowsOnWorkspacePath.some((win) => this.isPathEqual(win.openedWorkspacePath, folderToOpen.workspacePath))) {
					return; // ignore folders that are already open
				}

				configuration = this.toConfiguration(openConfig.userEnv || this.initialUserEnv, openConfig.cli, folderToOpen.workspacePath, filesToOpen, filesToCreate, filesToDiff, extensionsToInstall);
				let browserWindow = this.openInBrowserWindow(configuration, openInNewWindow, openInNewWindow ? void 0 : openConfig.windowToUse);
				usedWindows.push(browserWindow);

				// Reset these because we handled them
				filesToOpen = [];
				filesToCreate = [];
				filesToDiff = [];
				extensionsToInstall = [];

				openInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty
		if (emptyToOpen.length > 0) {
			emptyToOpen.forEach(() => {
				let configuration = this.toConfiguration(openConfig.userEnv || this.initialUserEnv, openConfig.cli);
				let browserWindow = this.openInBrowserWindow(configuration, openInNewWindow, openInNewWindow ? void 0 : openConfig.windowToUse);
				usedWindows.push(browserWindow);

				openInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Remember in recent document list
		iPathsToOpen.forEach((iPath) => {
			if (iPath.filePath || iPath.workspacePath) {
				app.addRecentDocument(iPath.filePath || iPath.workspacePath);
			}
		});

		// Emit events
		iPathsToOpen.forEach((iPath) => this.eventEmitter.emit(EventTypes.OPEN, iPath));

		return arrays.distinct(usedWindows);
	}

	public openPluginDevelopmentHostWindow(openConfig: IOpenConfiguration): void {

		// Reload an existing plugin development host window on the same path
		// We currently do not allow more than one extension development window
		// on the same plugin path.
		let res = WindowsManager.WINDOWS.filter((w) => w.config && this.isPathEqual(w.config.extensionDevelopmentPath, openConfig.cli.extensionDevelopmentPath));
		if (res && res.length === 1) {
			this.reload(res[0], openConfig.cli);
			res[0].focus(); // make sure it gets focus and is restored

			return;
		}

		// Fill in previously opened workspace unless an explicit path is provided and we are not unit testing
		if (openConfig.cli.pathArguments.length === 0 && !openConfig.cli.extensionTestsPath) {
			let workspaceToOpen = this.windowsState.lastPluginDevelopmentHostWindow && this.windowsState.lastPluginDevelopmentHostWindow.workspacePath;
			if (workspaceToOpen) {
				openConfig.cli.pathArguments = [workspaceToOpen];
			}
		}

		// Make sure we are not asked to open a path that is already opened
		if (openConfig.cli.pathArguments.length > 0) {
			res = WindowsManager.WINDOWS.filter((w) => w.openedWorkspacePath && openConfig.cli.pathArguments.indexOf(w.openedWorkspacePath) >= 0);
			if (res.length) {
				openConfig.cli.pathArguments = [];
			}
		}

		// Open it
		this.open({ cli: openConfig.cli, forceNewWindow: true, forceEmpty: openConfig.cli.pathArguments.length === 0 });
	}

	private toConfiguration(userEnv: IProcessEnvironment, cli: ICommandLineArguments, workspacePath?: string, filesToOpen?: IPath[], filesToCreate?: IPath[], filesToDiff?: IPath[], extensionsToInstall?: string[]): IWindowConfiguration {
		let configuration: IWindowConfiguration = objects.mixin({}, cli); // inherit all properties from CLI
		configuration.execPath = process.execPath;
		configuration.workspacePath = workspacePath;
		configuration.filesToOpen = filesToOpen;
		configuration.filesToCreate = filesToCreate;
		configuration.filesToDiff = filesToDiff;
		configuration.extensionsToInstall = extensionsToInstall;
		configuration.appName = this.envService.product.nameLong;
		configuration.applicationName = this.envService.product.applicationName;
		configuration.darwinBundleIdentifier = this.envService.product.darwinBundleIdentifier;
		configuration.appRoot = this.envService.appRoot;
		configuration.version = pkg.version;
		configuration.commitHash = this.envService.product.commit;
		configuration.appSettingsHome = this.envService.appSettingsHome;
		configuration.appSettingsPath = this.envService.appSettingsPath;
		configuration.appKeybindingsPath = this.envService.appKeybindingsPath;
		configuration.userExtensionsHome = this.envService.userExtensionsHome;
		configuration.extensionTips = this.envService.product.extensionTips;
		configuration.mainIPCHandle = this.envService.mainIPCHandle;
		configuration.sharedIPCHandle = this.envService.sharedIPCHandle;
		configuration.isBuilt = this.envService.isBuilt;
		configuration.crashReporter = this.envService.product.crashReporter;
		configuration.extensionsGallery = this.envService.product.extensionsGallery;
		configuration.welcomePage = this.envService.product.welcomePage;
		configuration.productDownloadUrl = this.envService.product.downloadUrl;
		configuration.releaseNotesUrl = this.envService.product.releaseNotesUrl;
		configuration.licenseUrl = this.envService.product.licenseUrl;
		configuration.updateFeedUrl = this.updateService.feedUrl;
		configuration.updateChannel = this.updateService.channel;
		configuration.aiConfig = this.envService.product.aiConfig;
		configuration.sendASmile = this.envService.product.sendASmile;
		configuration.enableTelemetry = this.envService.product.enableTelemetry;
		configuration.userEnv = userEnv;

		const recents = this.getRecentlyOpenedPaths(workspacePath, filesToOpen);
		configuration.recentFiles = recents.files;
		configuration.recentFolders = recents.folders;

		return configuration;
	}

	private getRecentlyOpenedPaths(workspacePath?: string, filesToOpen?: IPath[]): IOpenedPathsList {
		let files: string[];
		let folders: string[];

		// Get from storage
		let storedRecents = this.storageService.getItem<IOpenedPathsList>(WindowsManager.openedPathsListStorageKey);
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

		// Make sure it is bounded
		files = files.slice(0, 10);
		folders = folders.slice(0, 10);

		return { files, folders };
	}

	private toIPath(anyPath: string, ignoreFileNotFound?: boolean, gotoLineMode?: boolean): IPath {
		if (!anyPath) {
			return null;
		}

		let parsedPath: IParsedPath;
		if (gotoLineMode) {
			parsedPath = parseLineAndColumnAware(anyPath);
			anyPath = parsedPath.path;
		}

		let candidate = path.normalize(anyPath);
		try {
			let candidateStat = fs.statSync(candidate);
			if (candidateStat) {
				return candidateStat.isFile() ?
					{
						filePath: candidate,
						lineNumber: gotoLineMode ? parsedPath.line : void 0,
						columnNumber: gotoLineMode ? parsedPath.column : void 0,
						installExtensionPath: /\.vsix$/i.test(candidate)
					} :
					{ workspacePath: candidate };
			}
		} catch (error) {
			if (ignoreFileNotFound) {
				return { filePath: candidate, createFilePath: true }; // assume this is a file that does not yet exist
			}
		}

		return null;
	}

	private cliToPaths(cli: ICommandLineArguments, ignoreFileNotFound?: boolean): IPath[] {

		// Check for pass in candidate or last opened path
		let candidates: string[] = [];
		if (cli.pathArguments.length > 0) {
			candidates = cli.pathArguments;
		}

		// No path argument, check settings for what to do now
		else {
			let reopenFolders: string;
			if (this.lifecycleService.wasUpdated) {
				reopenFolders = ReopenFoldersSetting.ALL; // always reopen all folders when an update was applied
			} else {
				reopenFolders = this.settingsService.getValue('window.reopenFolders', ReopenFoldersSetting.ONE);
			}

			let lastActiveFolder = this.windowsState.lastActiveWindow && this.windowsState.lastActiveWindow.workspacePath;

			// Restore all
			if (reopenFolders === ReopenFoldersSetting.ALL) {
				let lastOpenedFolders = this.windowsState.openedFolders.map(o => o.workspacePath);

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

		let iPaths = candidates.map((candidate) => this.toIPath(candidate, ignoreFileNotFound, cli.gotoLineMode)).filter((path) => !!path);
		if (iPaths.length > 0) {
			return iPaths;
		}

		// No path provided, return empty to open empty
		return [Object.create(null)];
	}

	private openInBrowserWindow(configuration: IWindowConfiguration, forceNewWindow?: boolean, windowToUse?: VSCodeWindow): VSCodeWindow {
		let vscodeWindow: VSCodeWindow;

		if (!forceNewWindow) {
			vscodeWindow = windowToUse || this.getLastActiveWindow();

			if (vscodeWindow) {
				vscodeWindow.focus();
			}
		}

		// New window
		if (!vscodeWindow) {
			vscodeWindow = this.instantiationService.createInstance(VSCodeWindow, {
				state: this.getNewWindowState(configuration),
				extensionDevelopmentPath: configuration.extensionDevelopmentPath,
				allowFullscreen: this.lifecycleService.wasUpdated || this.settingsService.getValue('window.restoreFullscreen', false)
			});

			WindowsManager.WINDOWS.push(vscodeWindow);

			// Window Events
			vscodeWindow.win.webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			vscodeWindow.win.webContents.on('devtools-reload-page', () => this.reload(vscodeWindow));
			vscodeWindow.win.webContents.on('crashed', () => this.onWindowError(vscodeWindow, WindowError.CRASHED));
			vscodeWindow.win.on('unresponsive', () => this.onWindowError(vscodeWindow, WindowError.UNRESPONSIVE));
			vscodeWindow.win.on('close', () => this.onBeforeWindowClose(vscodeWindow));
			vscodeWindow.win.on('closed', () => this.onWindowClosed(vscodeWindow));

			// Lifecycle
			this.lifecycleService.registerWindow(vscodeWindow);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in plugin development host mode. These options are all development related.
			let currentWindowConfig = vscodeWindow.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
				configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
				configuration.verboseLogging = currentWindowConfig.verboseLogging;
				configuration.logExtensionHostCommunication = currentWindowConfig.logExtensionHostCommunication;
				configuration.debugBrkFileWatcherPort = currentWindowConfig.debugBrkFileWatcherPort;
				configuration.debugBrkExtensionHost = currentWindowConfig.debugBrkExtensionHost;
				configuration.debugExtensionHostPort = currentWindowConfig.debugExtensionHostPort;
				configuration.extensionsHomePath = currentWindowConfig.extensionsHomePath;
			}
		}

		// Only load when the window has not vetoed this
		this.lifecycleService.unload(vscodeWindow).done((veto) => {
			if (!veto) {

				// Load it
				vscodeWindow.load(configuration);
			}
		});

		return vscodeWindow;
	}

	private getNewWindowState(configuration: IWindowConfiguration): ISingleWindowState {

		// plugin development host Window - load from stored settings if any
		if (!!configuration.extensionDevelopmentPath && this.windowsState.lastPluginDevelopmentHostWindow) {
			return this.windowsState.lastPluginDevelopmentHostWindow.uiState;
		}

		// Known Folder - load from stored settings if any
		if (configuration.workspacePath) {
			let stateForWorkspace = this.windowsState.openedFolders.filter(o => this.isPathEqual(o.workspacePath, configuration.workspacePath)).map(o => o.uiState);
			if (stateForWorkspace.length) {
				return stateForWorkspace[0];
			}
		}

		// First Window
		let lastActive = this.getLastActiveWindow();
		if (!lastActive && this.windowsState.lastActiveWindow) {
			return this.windowsState.lastActiveWindow.uiState;
		}

		//
		// In any other case, we do not have any stored settings for the window state, so we come up with something smart
		//

		// We want the new window to open on the same display that the last active one is in
		let displayToUse: Electron.Display;
		let displays = screen.getAllDisplays();

		// Single Display
		if (displays.length === 1) {
			displayToUse = displays[0];
		}

		// Multi Display
		else {

			// on mac there is 1 menu per window so we need to use the monitor where the cursor currently is
			if (platform.isMacintosh) {
				let cursorPoint = screen.getCursorScreenPoint();
				displayToUse = screen.getDisplayNearestPoint(cursorPoint);
			}

			// if we have a last active window, use that display for the new window
			if (!displayToUse && lastActive) {
				displayToUse = screen.getDisplayMatching(lastActive.getBounds());
			}

			// fallback to first display
			if (!displayToUse) {
				displayToUse = displays[0];
			}
		}

		let defaultState = defaultWindowState();
		defaultState.x = displayToUse.bounds.x + (displayToUse.bounds.width / 2) - (defaultState.width / 2);
		defaultState.y = displayToUse.bounds.y + (displayToUse.bounds.height / 2) - (defaultState.height / 2);

		return this.ensureNoOverlap(defaultState);
	}

	private ensureNoOverlap(state: ISingleWindowState): ISingleWindowState {
		if (WindowsManager.WINDOWS.length === 0) {
			return state;
		}

		let existingWindowBounds = WindowsManager.WINDOWS.map((win) => win.getBounds());
		while (existingWindowBounds.some((b) => b.x === state.x || b.y === state.y)) {
			state.x += 30;
			state.y += 30;
		}

		return state;
	}

	public openFileFolderPicker(forceNewWindow?: boolean): void {
		this.doPickAndOpen({ pickFolders: true, pickFiles: true , forceNewWindow});
	}

	public openFilePicker(forceNewWindow?: boolean, path?: string): void {
		this.doPickAndOpen({ pickFiles: true, forceNewWindow, path });
	}

	public openFolderPicker(forceNewWindow?: boolean): void {
		this.doPickAndOpen({ pickFolders: true, forceNewWindow });
	}

	private doPickAndOpen(options: INativeOpenDialogOptions): void {
		this.getFileOrFolderPaths(options, (paths: string[]) => {
			if (paths && paths.length) {
				this.open({ cli: this.envService.cliArgs, pathsToOpen: paths, forceNewWindow: options.forceNewWindow });
			}
		});
	}

	private getFileOrFolderPaths(options: INativeOpenDialogOptions, clb: (paths: string[]) => void): void {
		let workingDir = options.path || this.storageService.getItem<string>(WindowsManager.workingDirPickerStorageKey);
		let focussedWindow = this.getFocusedWindow();

		let pickerProperties: string[];
		if (options.pickFiles && options.pickFolders) {
			pickerProperties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
		} else {
			pickerProperties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		dialog.showOpenDialog(focussedWindow && focussedWindow.win, {
			defaultPath: workingDir,
			properties: pickerProperties
		}, (paths) => {
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

	public focusLastActive(cli: ICommandLineArguments): VSCodeWindow {
		let lastActive = this.getLastActiveWindow();
		if (lastActive) {
			lastActive.focus();

			return lastActive;
		}

		// No window - open new one
		this.windowsState.openedFolders = []; // make sure we do not open too much
		const res = this.open({ cli: cli });

		return res && res[0];
	}

	public getLastActiveWindow(): VSCodeWindow {
		if (WindowsManager.WINDOWS.length) {
			let lastFocussedDate = Math.max.apply(Math, WindowsManager.WINDOWS.map((w) => w.lastFocusTime));
			let res = WindowsManager.WINDOWS.filter((w) => w.lastFocusTime === lastFocussedDate);
			if (res && res.length) {
				return res[0];
			}
		}

		return null;
	}

	public findWindow(workspacePath: string, filePath?: string, extensionDevelopmentPath?: string): VSCodeWindow {
		if (WindowsManager.WINDOWS.length) {

			// Sort the last active window to the front of the array of windows to test
			let windowsToTest = WindowsManager.WINDOWS.slice(0);
			let lastActiveWindow = this.getLastActiveWindow();
			if (lastActiveWindow) {
				windowsToTest.splice(windowsToTest.indexOf(lastActiveWindow), 1);
				windowsToTest.unshift(lastActiveWindow);
			}

			// Find it
			let res = windowsToTest.filter((w) => {

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

	public openNewWindow(): void {
		this.open({ cli: this.envService.cliArgs, forceNewWindow: true, forceEmpty: true });
	}

	public sendToFocused(channel: string, ...args: any[]): void {
		const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();

		if (focusedWindow) {
			focusedWindow.sendWhenReady(channel, ...args);
		}
	}

	public sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void {
		WindowsManager.WINDOWS.forEach((w) => {
			if (windowIdsToIgnore && windowIdsToIgnore.indexOf(w.id) >= 0) {
				return; // do not send if we are instructed to ignore it
			}

			w.sendWhenReady(channel, payload);
		});
	}

	public getFocusedWindow(): VSCodeWindow {
		let win = BrowserWindow.getFocusedWindow();
		if (win) {
			return this.getWindowById(win.id);
		}

		return null;
	}

	public getWindowById(windowId: number): VSCodeWindow {
		let res = WindowsManager.WINDOWS.filter((w) => w.id === windowId);
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
				title: this.envService.product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('wait', "Keep Waiting"), nls.localize('close', "Close")],
				message: nls.localize('appStalled', "The window is no longer responding"),
				detail: nls.localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
				noLink: true
			}, (result) => {
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
				title: this.envService.product.nameLong,
				type: 'warning',
				buttons: [nls.localize('reopen', "Reopen"), nls.localize('close', "Close")],
				message: nls.localize('appCrashed', "The window has crashed"),
				detail: nls.localize('appCrashedDetail', "We are sorry for the inconvenience! You can reopen the window to continue where you left off."),
				noLink: true
			}, (result) => {
				if (result === 0) {
					vscodeWindow.reload();
				} else if (result === 1) {
					this.onBeforeWindowClose(vscodeWindow); // 'close' event will not be fired on destroy(), so run it manually
					vscodeWindow.win.destroy(); // make sure to destroy the window as it has crashed
				}
			});
		}
	}

	private onBeforeWindowClose(win: VSCodeWindow): void {
		if (win.readyState !== ReadyState.READY) {
			return; // only persist windows that are fully loaded
		}

		// On Window close, update our stored state of this window
		let state: IWindowState = { workspacePath: win.openedWorkspacePath, uiState: win.serializeWindowState() };
		if (win.isPluginDevelopmentHost) {
			this.windowsState.lastPluginDevelopmentHostWindow = state;
		} else {
			this.windowsState.lastActiveWindow = state;

			this.windowsState.openedFolders.forEach(o => {
				if (this.isPathEqual(o.workspacePath, win.openedWorkspacePath)) {
					o.uiState = state.uiState;
				}
			});
		}
	}

	private onWindowClosed(win: VSCodeWindow): void {

		// Tell window
		win.dispose();

		// Remove from our list so that Electron can clean it up
		let index = WindowsManager.WINDOWS.indexOf(win);
		WindowsManager.WINDOWS.splice(index, 1);

		// Emit
		this.eventEmitter.emit(EventTypes.CLOSE, win.id);
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
}