/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app } from 'electron';
import { Disposable } from 'vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { ICodeWindow, IWindowsMainService, IWindowState as IWindowUIState } from 'vs/platform/windows/electron-main/windows';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export type WindowsStateStorageData = object;

export interface IWindowState {
	workspace?: IWorkspaceIdentifier;
	folderUri?: URI;
	backupPath?: string;
	remoteAuthority?: string;
	uiState: IWindowUIState;
}

export interface IWindowsState {
	lastActiveWindow?: IWindowState;
	lastPluginDevelopmentHostWindow?: IWindowState;
	openedWindows: IWindowState[];
}

interface ISerializedWindowsState {
	readonly lastActiveWindow?: ISerializedWindowState;
	readonly lastPluginDevelopmentHostWindow?: ISerializedWindowState;
	readonly openedWindows: ISerializedWindowState[];
}

interface ISerializedWindowState {
	readonly workspaceIdentifier?: { id: string; configURIPath: string };
	readonly folder?: string;
	readonly backupPath?: string;
	readonly remoteAuthority?: string;
	readonly uiState: IWindowUIState;

	// deprecated
	readonly folderUri?: UriComponents;
	readonly folderPath?: string;
	readonly workspace?: { id: string; configPath: string };
}

export class WindowsStateHandler extends Disposable {

	private static readonly windowsStateStorageKey = 'windowsState';

	get state() { return this._windowsState; }
	private readonly _windowsState: IWindowsState;

	get lastClosedState() { return this._lastClosedState; }
	private _lastClosedState?: IWindowState;

	private shuttingDown = false;

	constructor(
		@IStateService private readonly stateService: IStateService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._windowsState = restoreWindowsState(this.stateService.getItem<WindowsStateStorageData>(WindowsStateHandler.windowsStateStorageKey));

		this.registerListeners();
	}

	private registerListeners(): void {

		// When a window looses focus, save all windows state. This allows to
		// prevent loss of window-state data when OS is restarted without properly
		// shutting down the application (https://github.com/microsoft/vscode/issues/87171)
		app.on('browser-window-blur', () => {
			if (!this.shuttingDown) {
				this.saveWindowsState();
			}
		});

		// Handle various lifecycle events around windows
		this.lifecycleMainService.onBeforeWindowClose(window => this.onBeforeWindowClose(window));
		this.lifecycleMainService.onBeforeShutdown(() => this.onBeforeShutdown());
		this.windowsMainService.onWindowsCountChanged(e => {
			if (e.newCount - e.oldCount > 0) {
				// clear last closed window state when a new window opens. this helps on macOS where
				// otherwise closing the last window, opening a new window and then quitting would
				// use the state of the previously closed window when restarting.
				this._lastClosedState = undefined;
			}
		});

		// try to save state before destroy because close will not fire
		this.windowsMainService.onWindowDestroyed(window => this.onBeforeWindowClose(window));
	}

	// Note that onBeforeShutdown() and onBeforeWindowClose() are fired in different order depending on the OS:
	// - macOS: since the app will not quit when closing the last window, you will always first get
	//          the onBeforeShutdown() event followed by N onBeforeWindowClose() events for each window
	// - other: on other OS, closing the last window will quit the app so the order depends on the
	//          user interaction: closing the last window will first trigger onBeforeWindowClose()
	//          and then onBeforeShutdown(). Using the quit action however will first issue onBeforeShutdown()
	//          and then onBeforeWindowClose().
	//
	// Here is the behavior on different OS depending on action taken (Electron 1.7.x):
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
		this.shuttingDown = true;

		this.saveWindowsState();
	}

	private saveWindowsState(): void {
		const currentWindowsState: IWindowsState = {
			openedWindows: [],
			lastPluginDevelopmentHostWindow: this._windowsState.lastPluginDevelopmentHostWindow,
			lastActiveWindow: this._lastClosedState
		};

		// 1.) Find a last active window (pick any other first window otherwise)
		if (!currentWindowsState.lastActiveWindow) {
			let activeWindow = this.windowsMainService.getLastActiveWindow();
			if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
				activeWindow = this.windowsMainService.getWindows().find(window => !window.isExtensionDevelopmentHost);
			}

			if (activeWindow) {
				currentWindowsState.lastActiveWindow = this.toWindowState(activeWindow);
			}
		}

		// 2.) Find extension host window
		const extensionHostWindow = this.windowsMainService.getWindows().find(window => window.isExtensionDevelopmentHost && !window.isExtensionTestHost);
		if (extensionHostWindow) {
			currentWindowsState.lastPluginDevelopmentHostWindow = this.toWindowState(extensionHostWindow);
		}

		// 3.) All windows (except extension host) for N >= 2 to support `restoreWindows: all` or for auto update
		//
		// Careful here: asking a window for its window state after it has been closed returns bogus values (width: 0, height: 0)
		// so if we ever want to persist the UI state of the last closed window (window count === 1), it has
		// to come from the stored lastClosedWindowState on Win/Linux at least
		if (this.windowsMainService.getWindowCount() > 1) {
			currentWindowsState.openedWindows = this.windowsMainService.getWindows().filter(window => !window.isExtensionDevelopmentHost).map(window => this.toWindowState(window));
		}

		// Persist
		const state = getWindowsStateStoreData(currentWindowsState);
		this.stateService.setItem(WindowsStateHandler.windowsStateStorageKey, state);

		if (this.shuttingDown) {
			this.logService.trace('[WindowsStateHandler] onBeforeShutdown', state);
		}
	}

	// See note on #onBeforeShutdown() for details how these events are flowing
	private onBeforeWindowClose(window: ICodeWindow): void {
		if (this.lifecycleMainService.quitRequested) {
			return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
		}

		// On Window close, update our stored UI state of this window
		const state: IWindowState = this.toWindowState(window);
		if (window.isExtensionDevelopmentHost && !window.isExtensionTestHost) {
			this._windowsState.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
		}

		// Any non extension host window with same workspace or folder
		else if (!window.isExtensionDevelopmentHost && (!!window.openedWorkspace || !!window.openedFolderUri)) {
			this._windowsState.openedWindows.forEach(openedWindow => {
				const sameWorkspace = window.openedWorkspace && openedWindow.workspace && openedWindow.workspace.id === window.openedWorkspace.id;
				const sameFolder = window.openedFolderUri && openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, window.openedFolderUri);

				if (sameWorkspace || sameFolder) {
					openedWindow.uiState = state.uiState;
				}
			});
		}

		// On Windows and Linux closing the last window will trigger quit. Since we are storing all UI state
		// before quitting, we need to remember the UI state of this window to be able to persist it.
		// On macOS we keep the last closed window state ready in case the user wants to quit right after or
		// wants to open another window, in which case we use this state over the persisted one.
		if (this.windowsMainService.getWindowCount() === 1) {
			this._lastClosedState = state;
		}
	}

	private toWindowState(window: ICodeWindow): IWindowState {
		return {
			workspace: window.openedWorkspace,
			folderUri: window.openedFolderUri,
			backupPath: window.backupPath,
			remoteAuthority: window.remoteAuthority,
			uiState: window.serializeWindowState()
		};
	}
}

export function restoreWindowsState(data: WindowsStateStorageData | undefined): IWindowsState {
	const result: IWindowsState = { openedWindows: [] };
	const windowsState = data as ISerializedWindowsState || { openedWindows: [] };

	if (windowsState.lastActiveWindow) {
		result.lastActiveWindow = restoreWindowState(windowsState.lastActiveWindow);
	}

	if (windowsState.lastPluginDevelopmentHostWindow) {
		result.lastPluginDevelopmentHostWindow = restoreWindowState(windowsState.lastPluginDevelopmentHostWindow);
	}

	if (Array.isArray(windowsState.openedWindows)) {
		result.openedWindows = windowsState.openedWindows.map(windowState => restoreWindowState(windowState));
	}

	return result;
}

function restoreWindowState(windowState: ISerializedWindowState): IWindowState {
	const result: IWindowState = { uiState: windowState.uiState };
	if (windowState.backupPath) {
		result.backupPath = windowState.backupPath;
	}

	if (windowState.remoteAuthority) {
		result.remoteAuthority = windowState.remoteAuthority;
	}

	if (windowState.folder) {
		result.folderUri = URI.parse(windowState.folder);
	} else if (windowState.folderUri) {
		result.folderUri = URI.revive(windowState.folderUri);
	} else if (windowState.folderPath) {
		result.folderUri = URI.file(windowState.folderPath);
	}

	if (windowState.workspaceIdentifier) {
		result.workspace = { id: windowState.workspaceIdentifier.id, configPath: URI.parse(windowState.workspaceIdentifier.configURIPath) };
	} else if (windowState.workspace) {
		result.workspace = { id: windowState.workspace.id, configPath: URI.file(windowState.workspace.configPath) };
	}

	return result;
}

export function getWindowsStateStoreData(windowsState: IWindowsState): WindowsStateStorageData {
	return {
		lastActiveWindow: windowsState.lastActiveWindow && serializeWindowState(windowsState.lastActiveWindow),
		lastPluginDevelopmentHostWindow: windowsState.lastPluginDevelopmentHostWindow && serializeWindowState(windowsState.lastPluginDevelopmentHostWindow),
		openedWindows: windowsState.openedWindows.map(ws => serializeWindowState(ws))
	};
}

function serializeWindowState(windowState: IWindowState): ISerializedWindowState {
	return {
		workspaceIdentifier: windowState.workspace && { id: windowState.workspace.id, configURIPath: windowState.workspace.configPath.toString() },
		folder: windowState.folderUri && windowState.folderUri.toString(),
		backupPath: windowState.backupPath,
		remoteAuthority: windowState.remoteAuthority,
		uiState: windowState.uiState
	};
}
