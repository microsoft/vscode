/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WindowsStateHandler_1;
import electron from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { IWindowsMainService } from './windows.js';
import { defaultWindowState } from '../../window/electron-main/window.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
let WindowsStateHandler = class WindowsStateHandler extends Disposable {
    static { WindowsStateHandler_1 = this; }
    static { this.windowsStateStorageKey = 'windowsState'; }
    get state() { return this._state; }
    constructor(windowsMainService, stateService, lifecycleMainService, logService, configurationService) {
        super();
        this.windowsMainService = windowsMainService;
        this.stateService = stateService;
        this.lifecycleMainService = lifecycleMainService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.lastClosedState = undefined;
        this.shuttingDown = false;
        this._state = restoreWindowsState(this.stateService.getItem(WindowsStateHandler_1.windowsStateStorageKey));
        this.registerListeners();
    }
    registerListeners() {
        // When a window looses focus, save all windows state. This allows to
        // prevent loss of window-state data when OS is restarted without properly
        // shutting down the application (https://github.com/microsoft/vscode/issues/87171)
        electron.app.on('browser-window-blur', () => {
            if (!this.shuttingDown) {
                this.saveWindowsState();
            }
        });
        // Handle various lifecycle events around windows
        this._register(this.lifecycleMainService.onBeforeCloseWindow(window => this.onBeforeCloseWindow(window)));
        this._register(this.lifecycleMainService.onBeforeShutdown(() => this.onBeforeShutdown()));
        this._register(this.windowsMainService.onDidChangeWindowsCount(e => {
            if (e.newCount - e.oldCount > 0) {
                // clear last closed window state when a new window opens. this helps on macOS where
                // otherwise closing the last window, opening a new window and then quitting would
                // use the state of the previously closed window when restarting.
                this.lastClosedState = undefined;
            }
        }));
        // try to save state before destroy because close will not fire
        this._register(this.windowsMainService.onDidDestroyWindow(window => this.onBeforeCloseWindow(window)));
    }
    // Note that onBeforeShutdown() and onBeforeCloseWindow() are fired in different order depending on the OS:
    // - macOS: since the app will not quit when closing the last window, you will always first get
    //          the onBeforeShutdown() event followed by N onBeforeCloseWindow() events for each window
    // - other: on other OS, closing the last window will quit the app so the order depends on the
    //          user interaction: closing the last window will first trigger onBeforeCloseWindow()
    //          and then onBeforeShutdown(). Using the quit action however will first issue onBeforeShutdown()
    //          and then onBeforeCloseWindow().
    //
    // Here is the behavior on different OS depending on action taken (Electron 1.7.x):
    //
    // Legend
    // -  quit(N): quit application with N windows opened
    // - close(1): close one window via the window close button
    // - closeAll: close all windows via the taskbar command
    // - onBeforeShutdown(N): number of windows reported in this event handler
    // - onBeforeCloseWindow(N, M): number of windows reported and quitRequested boolean in this event handler
    //
    // macOS
    // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
    // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
    // 	-     quit(0): onBeforeShutdown(0)
    // 	-    close(1): onBeforeCloseWindow(1, false)
    //
    // Windows
    // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
    // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
    // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
    // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
    // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
    //
    // Linux
    // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
    // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
    // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
    // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
    // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
    //
    onBeforeShutdown() {
        this.shuttingDown = true;
        this.saveWindowsState();
    }
    saveWindowsState() {
        // TODO@electron workaround for Electron not being able to restore
        // multiple (native) fullscreen windows on the same display at once
        // on macOS.
        // https://github.com/electron/electron/issues/34367
        const displaysWithFullScreenWindow = new Set();
        const currentWindowsState = {
            openedWindows: [],
            lastPluginDevelopmentHostWindow: this._state.lastPluginDevelopmentHostWindow,
            lastActiveWindow: this.lastClosedState
        };
        // 1.) Find a last active window (pick any other first window otherwise)
        if (!currentWindowsState.lastActiveWindow) {
            let activeWindow = this.windowsMainService.getLastActiveWindow();
            if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
                activeWindow = this.windowsMainService.getWindows().find(window => !window.isExtensionDevelopmentHost);
            }
            if (activeWindow) {
                currentWindowsState.lastActiveWindow = this.toWindowState(activeWindow);
                if (currentWindowsState.lastActiveWindow.uiState.mode === 3 /* WindowMode.Fullscreen */) {
                    displaysWithFullScreenWindow.add(currentWindowsState.lastActiveWindow.uiState.display); // always allow fullscreen for active window
                }
            }
        }
        // 2.) Find extension host window
        const extensionHostWindow = this.windowsMainService.getWindows().find(window => window.isExtensionDevelopmentHost && !window.isExtensionTestHost);
        if (extensionHostWindow) {
            currentWindowsState.lastPluginDevelopmentHostWindow = this.toWindowState(extensionHostWindow);
            if (currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode === 3 /* WindowMode.Fullscreen */) {
                if (displaysWithFullScreenWindow.has(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display)) {
                    if (isMacintosh && !extensionHostWindow.win?.isSimpleFullScreen()) {
                        currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode = 1 /* WindowMode.Normal */;
                    }
                }
                else {
                    displaysWithFullScreenWindow.add(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display);
                }
            }
        }
        // 3.) All windows (except extension host) for N >= 2 to support `restoreWindows: all` or for auto update
        //
        // Careful here: asking a window for its window state after it has been closed returns bogus values (width: 0, height: 0)
        // so if we ever want to persist the UI state of the last closed window (window count === 1), it has
        // to come from the stored lastClosedWindowState on Win/Linux at least
        if (this.windowsMainService.getWindowCount() > 1) {
            currentWindowsState.openedWindows = this.windowsMainService.getWindows().filter(window => !window.isExtensionDevelopmentHost).map(window => {
                const windowState = this.toWindowState(window);
                if (windowState.uiState.mode === 3 /* WindowMode.Fullscreen */) {
                    if (displaysWithFullScreenWindow.has(windowState.uiState.display)) {
                        if (isMacintosh && windowState.windowId !== currentWindowsState.lastActiveWindow?.windowId && !window.win?.isSimpleFullScreen()) {
                            windowState.uiState.mode = 1 /* WindowMode.Normal */;
                        }
                    }
                    else {
                        displaysWithFullScreenWindow.add(windowState.uiState.display);
                    }
                }
                return windowState;
            });
        }
        // Persist
        const state = getWindowsStateStoreData(currentWindowsState);
        this.stateService.setItem(WindowsStateHandler_1.windowsStateStorageKey, state);
        if (this.shuttingDown) {
            this.logService.trace('[WindowsStateHandler] onBeforeShutdown', state);
        }
    }
    // See note on #onBeforeShutdown() for details how these events are flowing
    onBeforeCloseWindow(window) {
        if (this.lifecycleMainService.quitRequested) {
            return; // during quit, many windows close in parallel so let it be handled in the before-quit handler
        }
        // On Window close, update our stored UI state of this window
        const state = this.toWindowState(window);
        if (window.isExtensionDevelopmentHost && !window.isExtensionTestHost) {
            this._state.lastPluginDevelopmentHostWindow = state; // do not let test run window state overwrite our extension development state
        }
        // Any non extension host window with same workspace or folder
        else if (!window.isExtensionDevelopmentHost && window.openedWorkspace) {
            this._state.openedWindows.forEach(openedWindow => {
                const sameWorkspace = isWorkspaceIdentifier(window.openedWorkspace) && openedWindow.workspace?.id === window.openedWorkspace.id;
                const sameFolder = isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, window.openedWorkspace.uri);
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
            this.lastClosedState = state;
        }
    }
    toWindowState(window) {
        return {
            windowId: window.id,
            workspace: isWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace : undefined,
            folderUri: isSingleFolderWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace.uri : undefined,
            backupPath: window.backupPath,
            remoteAuthority: window.remoteAuthority,
            uiState: window.serializeWindowState()
        };
    }
    getNewWindowState(configuration) {
        const state = this.doGetNewWindowState(configuration);
        const windowConfig = this.configurationService.getValue('window');
        // Fullscreen state gets special treatment
        if (state.mode === 3 /* WindowMode.Fullscreen */) {
            // Window state is not from a previous session: only allow fullscreen if we inherit it or user wants fullscreen
            let allowFullscreen;
            if (state.hasDefaultState) {
                allowFullscreen = !!(windowConfig?.newWindowDimensions && ['fullscreen', 'inherit', 'offset'].indexOf(windowConfig.newWindowDimensions) >= 0);
            }
            // Window state is from a previous session: only allow fullscreen when we got updated or user wants to restore
            else {
                allowFullscreen = !!(this.lifecycleMainService.wasRestarted || windowConfig?.restoreFullscreen);
            }
            if (!allowFullscreen) {
                state.mode = 1 /* WindowMode.Normal */;
            }
        }
        return state;
    }
    doGetNewWindowState(configuration) {
        const lastActive = this.windowsMainService.getLastActiveWindow();
        // Restore state unless we are running extension tests
        if (!configuration.extensionTestsPath) {
            // extension development host Window - load from stored settings if any
            if (!!configuration.extensionDevelopmentPath && this.state.lastPluginDevelopmentHostWindow) {
                return this.state.lastPluginDevelopmentHostWindow.uiState;
            }
            // Known Workspace - load from stored settings
            const workspace = configuration.workspace;
            if (isWorkspaceIdentifier(workspace)) {
                const stateForWorkspace = this.state.openedWindows.filter(openedWindow => openedWindow.workspace && openedWindow.workspace.id === workspace.id).map(openedWindow => openedWindow.uiState);
                if (stateForWorkspace.length) {
                    return stateForWorkspace[0];
                }
            }
            // Known Folder - load from stored settings
            if (isSingleFolderWorkspaceIdentifier(workspace)) {
                const stateForFolder = this.state.openedWindows.filter(openedWindow => openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, workspace.uri)).map(openedWindow => openedWindow.uiState);
                if (stateForFolder.length) {
                    return stateForFolder[0];
                }
            }
            // Empty windows with backups
            else if (configuration.backupPath) {
                const stateForEmptyWindow = this.state.openedWindows.filter(openedWindow => openedWindow.backupPath === configuration.backupPath).map(openedWindow => openedWindow.uiState);
                if (stateForEmptyWindow.length) {
                    return stateForEmptyWindow[0];
                }
            }
            // First Window
            const lastActiveState = this.lastClosedState || this.state.lastActiveWindow;
            if (!lastActive && lastActiveState) {
                return lastActiveState.uiState;
            }
        }
        //
        // In any other case, we do not have any stored settings for the window state, so we come up with something smart
        //
        // We want the new window to open on the same display that the last active one is in
        let displayToUse;
        const displays = electron.screen.getAllDisplays();
        // Single Display
        if (displays.length === 1) {
            displayToUse = displays[0];
        }
        // Multi Display
        else {
            // on mac there is 1 menu per window so we need to use the monitor where the cursor currently is
            if (isMacintosh) {
                const cursorPoint = electron.screen.getCursorScreenPoint();
                displayToUse = electron.screen.getDisplayNearestPoint(cursorPoint);
            }
            // if we have a last active window, use that display for the new window
            if (!displayToUse && lastActive) {
                displayToUse = electron.screen.getDisplayMatching(lastActive.getBounds());
            }
            // fallback to primary display or first display
            if (!displayToUse) {
                displayToUse = electron.screen.getPrimaryDisplay() || displays[0];
            }
        }
        // Compute x/y based on display bounds
        // Note: important to use Math.round() because Electron does not seem to be too happy about
        // display coordinates that are not absolute numbers.
        let state = defaultWindowState(undefined, isWorkspaceIdentifier(configuration.workspace) || isSingleFolderWorkspaceIdentifier(configuration.workspace));
        state.x = Math.round(displayToUse.bounds.x + (displayToUse.bounds.width / 2) - (state.width / 2));
        state.y = Math.round(displayToUse.bounds.y + (displayToUse.bounds.height / 2) - (state.height / 2));
        // Check for newWindowDimensions setting and adjust accordingly
        const windowConfig = this.configurationService.getValue('window');
        let ensureNoOverlap = true;
        if (windowConfig?.newWindowDimensions) {
            if (windowConfig.newWindowDimensions === 'maximized') {
                state.mode = 0 /* WindowMode.Maximized */;
                ensureNoOverlap = false;
            }
            else if (windowConfig.newWindowDimensions === 'fullscreen') {
                state.mode = 3 /* WindowMode.Fullscreen */;
                ensureNoOverlap = false;
            }
            else if ((windowConfig.newWindowDimensions === 'inherit' || windowConfig.newWindowDimensions === 'offset') && lastActive) {
                const lastActiveState = lastActive.serializeWindowState();
                if (lastActiveState.mode === 3 /* WindowMode.Fullscreen */) {
                    state.mode = 3 /* WindowMode.Fullscreen */; // only take mode (fixes https://github.com/microsoft/vscode/issues/19331)
                }
                else {
                    state = {
                        ...lastActiveState,
                        zoomLevel: undefined // do not inherit zoom level
                    };
                }
                ensureNoOverlap = state.mode !== 3 /* WindowMode.Fullscreen */ && windowConfig.newWindowDimensions === 'offset';
            }
        }
        if (ensureNoOverlap) {
            state = this.ensureNoOverlap(state);
        }
        state.hasDefaultState = true; // flag as default state
        return state;
    }
    ensureNoOverlap(state) {
        if (this.windowsMainService.getWindows().length === 0) {
            return state;
        }
        state.x = typeof state.x === 'number' ? state.x : 0;
        state.y = typeof state.y === 'number' ? state.y : 0;
        const existingWindowBounds = this.windowsMainService.getWindows().map(window => window.getBounds());
        while (existingWindowBounds.some(bounds => bounds.x === state.x || bounds.y === state.y)) {
            state.x += 30;
            state.y += 30;
        }
        return state;
    }
};
WindowsStateHandler = WindowsStateHandler_1 = __decorate([
    __param(0, IWindowsMainService),
    __param(1, IStateService),
    __param(2, ILifecycleMainService),
    __param(3, ILogService),
    __param(4, IConfigurationService)
], WindowsStateHandler);
export { WindowsStateHandler };
export function restoreWindowsState(data) {
    const result = { openedWindows: [] };
    const windowsState = data || { openedWindows: [] };
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
function restoreWindowState(windowState) {
    const result = { uiState: windowState.uiState };
    if (windowState.backupPath) {
        result.backupPath = windowState.backupPath;
    }
    if (windowState.remoteAuthority) {
        result.remoteAuthority = windowState.remoteAuthority;
    }
    if (windowState.folder) {
        result.folderUri = URI.parse(windowState.folder);
    }
    if (windowState.workspaceIdentifier) {
        result.workspace = { id: windowState.workspaceIdentifier.id, configPath: URI.parse(windowState.workspaceIdentifier.configURIPath) };
    }
    return result;
}
export function getWindowsStateStoreData(windowsState) {
    return {
        lastActiveWindow: windowsState.lastActiveWindow && serializeWindowState(windowsState.lastActiveWindow),
        lastPluginDevelopmentHostWindow: windowsState.lastPluginDevelopmentHostWindow && serializeWindowState(windowsState.lastPluginDevelopmentHostWindow),
        openedWindows: windowsState.openedWindows.map(ws => serializeWindowState(ws))
    };
}
function serializeWindowState(windowState) {
    return {
        workspaceIdentifier: windowState.workspace && { id: windowState.workspace.id, configURIPath: windowState.workspace.configPath.toString() },
        folder: windowState.folderUri?.toString(),
        backupPath: windowState.backupPath,
        remoteAuthority: windowState.remoteAuthority,
        uiState: windowState.uiState
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c1N0YXRlSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzU3RhdGVIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDaEMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUUxRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDbkQsT0FBTyxFQUFFLGtCQUFrQixFQUEyRCxNQUFNLHNDQUFzQyxDQUFDO0FBQ25JLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxxQkFBcUIsRUFBd0IsTUFBTSxxQ0FBcUMsQ0FBQztBQW1DOUgsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVOzthQUUxQiwyQkFBc0IsR0FBRyxjQUFjLEFBQWpCLENBQWtCO0lBRWhFLElBQUksS0FBSyxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFPbkMsWUFDc0Isa0JBQXdELEVBQzlELFlBQTRDLEVBQ3BDLG9CQUE0RCxFQUN0RSxVQUF3QyxFQUM5QixvQkFBNEQ7UUFFbkYsS0FBSyxFQUFFLENBQUM7UUFOOEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUM3QyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUNuQix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ3JELGVBQVUsR0FBVixVQUFVLENBQWE7UUFDYix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBVDVFLG9CQUFlLEdBQTZCLFNBQVMsQ0FBQztRQUV0RCxpQkFBWSxHQUFHLEtBQUssQ0FBQztRQVc1QixJQUFJLENBQUMsTUFBTSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUEwQixxQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFbEksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVPLGlCQUFpQjtRQUV4QixxRUFBcUU7UUFDckUsMEVBQTBFO1FBQzFFLG1GQUFtRjtRQUNuRixRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDM0MsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDekIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDbEUsSUFBSSxDQUFDLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLG9GQUFvRjtnQkFDcEYsa0ZBQWtGO2dCQUNsRixpRUFBaUU7Z0JBQ2pFLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1lBQ2xDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosK0RBQStEO1FBQy9ELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4RyxDQUFDO0lBRUQsMkdBQTJHO0lBQzNHLCtGQUErRjtJQUMvRixtR0FBbUc7SUFDbkcsOEZBQThGO0lBQzlGLDhGQUE4RjtJQUM5RiwwR0FBMEc7SUFDMUcsMkNBQTJDO0lBQzNDLEVBQUU7SUFDRixtRkFBbUY7SUFDbkYsRUFBRTtJQUNGLFNBQVM7SUFDVCxxREFBcUQ7SUFDckQsMkRBQTJEO0lBQzNELHdEQUF3RDtJQUN4RCwwRUFBMEU7SUFDMUUsMEdBQTBHO0lBQzFHLEVBQUU7SUFDRixRQUFRO0lBQ1Isb0VBQW9FO0lBQ3BFLGtHQUFrRztJQUNsRyxzQ0FBc0M7SUFDdEMsZ0RBQWdEO0lBQ2hELEVBQUU7SUFDRixVQUFVO0lBQ1Ysb0VBQW9FO0lBQ3BFLGtHQUFrRztJQUNsRyxpRUFBaUU7SUFDakUsa0ZBQWtGO0lBQ2xGLG9HQUFvRztJQUNwRyxFQUFFO0lBQ0YsUUFBUTtJQUNSLG9FQUFvRTtJQUNwRSxrR0FBa0c7SUFDbEcsaUVBQWlFO0lBQ2pFLGtGQUFrRjtJQUNsRixvR0FBb0c7SUFDcEcsRUFBRTtJQUNNLGdCQUFnQjtRQUN2QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUV6QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRU8sZ0JBQWdCO1FBRXZCLGtFQUFrRTtRQUNsRSxtRUFBbUU7UUFDbkUsWUFBWTtRQUNaLG9EQUFvRDtRQUNwRCxNQUFNLDRCQUE0QixHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1FBRW5FLE1BQU0sbUJBQW1CLEdBQWtCO1lBQzFDLGFBQWEsRUFBRSxFQUFFO1lBQ2pCLCtCQUErQixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsK0JBQStCO1lBQzVFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxlQUFlO1NBQ3RDLENBQUM7UUFFRix3RUFBd0U7UUFDeEUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0MsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDakUsSUFBSSxDQUFDLFlBQVksSUFBSSxZQUFZLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztnQkFDOUQsWUFBWSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3hHLENBQUM7WUFFRCxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNsQixtQkFBbUIsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUV4RSxJQUFJLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLGtDQUEwQixFQUFFLENBQUM7b0JBQ2pGLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyw0Q0FBNEM7Z0JBQ3JJLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELGlDQUFpQztRQUNqQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsMEJBQTBCLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNsSixJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsbUJBQW1CLENBQUMsK0JBQStCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBRTlGLElBQUksbUJBQW1CLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDLElBQUksa0NBQTBCLEVBQUUsQ0FBQztnQkFDaEcsSUFBSSw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQzNHLElBQUksV0FBVyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsQ0FBQzt3QkFDbkUsbUJBQW1CLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDLElBQUksNEJBQW9CLENBQUM7b0JBQ3RGLENBQUM7Z0JBQ0YsQ0FBQztxQkFBTSxDQUFDO29CQUNQLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZHLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELHlHQUF5RztRQUN6RyxFQUFFO1FBQ0YseUhBQXlIO1FBQ3pILG9HQUFvRztRQUNwRyxzRUFBc0U7UUFDdEUsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbEQsbUJBQW1CLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDMUksTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFL0MsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksa0NBQTBCLEVBQUUsQ0FBQztvQkFDeEQsSUFBSSw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO3dCQUNuRSxJQUFJLFdBQVcsSUFBSSxXQUFXLENBQUMsUUFBUSxLQUFLLG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxDQUFDOzRCQUNqSSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksNEJBQW9CLENBQUM7d0JBQzlDLENBQUM7b0JBQ0YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUMvRCxDQUFDO2dCQUNGLENBQUM7Z0JBRUQsT0FBTyxXQUFXLENBQUM7WUFDcEIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsVUFBVTtRQUNWLE1BQU0sS0FBSyxHQUFHLHdCQUF3QixDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMscUJBQW1CLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFN0UsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEUsQ0FBQztJQUNGLENBQUM7SUFFRCwyRUFBMkU7SUFDbkUsbUJBQW1CLENBQUMsTUFBbUI7UUFDOUMsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDN0MsT0FBTyxDQUFDLDhGQUE4RjtRQUN2RyxDQUFDO1FBRUQsNkRBQTZEO1FBQzdELE1BQU0sS0FBSyxHQUFpQixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZELElBQUksTUFBTSxDQUFDLDBCQUEwQixJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDdEUsSUFBSSxDQUFDLE1BQU0sQ0FBQywrQkFBK0IsR0FBRyxLQUFLLENBQUMsQ0FBQyw2RUFBNkU7UUFDbkksQ0FBQztRQUVELDhEQUE4RDthQUN6RCxJQUFJLENBQUMsTUFBTSxDQUFDLDBCQUEwQixJQUFJLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN2RSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUU7Z0JBQ2hELE1BQU0sYUFBYSxHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxZQUFZLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztnQkFDaEksTUFBTSxVQUFVLEdBQUcsaUNBQWlDLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxTQUFTLElBQUksMEJBQTBCLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFak0sSUFBSSxhQUFhLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2pDLFlBQVksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztnQkFDdEMsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELG9HQUFvRztRQUNwRyw2RkFBNkY7UUFDN0Ysb0dBQW9HO1FBQ3BHLHdGQUF3RjtRQUN4RixJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNwRCxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUVPLGFBQWEsQ0FBQyxNQUFtQjtRQUN4QyxPQUFPO1lBQ04sUUFBUSxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ25CLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDN0YsU0FBUyxFQUFFLGlDQUFpQyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDN0csVUFBVSxFQUFFLE1BQU0sQ0FBQyxVQUFVO1lBQzdCLGVBQWUsRUFBRSxNQUFNLENBQUMsZUFBZTtZQUN2QyxPQUFPLEVBQUUsTUFBTSxDQUFDLG9CQUFvQixFQUFFO1NBQ3RDLENBQUM7SUFDSCxDQUFDO0lBRUQsaUJBQWlCLENBQUMsYUFBeUM7UUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQThCLFFBQVEsQ0FBQyxDQUFDO1FBRS9GLDBDQUEwQztRQUMxQyxJQUFJLEtBQUssQ0FBQyxJQUFJLGtDQUEwQixFQUFFLENBQUM7WUFFMUMsK0dBQStHO1lBQy9HLElBQUksZUFBd0IsQ0FBQztZQUM3QixJQUFJLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDM0IsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxtQkFBbUIsSUFBSSxDQUFDLFlBQVksRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQy9JLENBQUM7WUFFRCw4R0FBOEc7aUJBQ3pHLENBQUM7Z0JBQ0wsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLElBQUksWUFBWSxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDakcsQ0FBQztZQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDdEIsS0FBSyxDQUFDLElBQUksNEJBQW9CLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxhQUF5QztRQUNwRSxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUVqRSxzREFBc0Q7UUFDdEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBRXZDLHVFQUF1RTtZQUN2RSxJQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxDQUFDO2dCQUM1RixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDO1lBQzNELENBQUM7WUFFRCw4Q0FBOEM7WUFDOUMsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQztZQUMxQyxJQUFJLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsSUFBSSxZQUFZLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUMxTCxJQUFJLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUM5QixPQUFPLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO1lBQ0YsQ0FBQztZQUVELDJDQUEyQztZQUMzQyxJQUFJLGlDQUFpQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLElBQUksMEJBQTBCLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN0TixJQUFJLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDM0IsT0FBTyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLENBQUM7WUFDRixDQUFDO1lBRUQsNkJBQTZCO2lCQUN4QixJQUFJLGFBQWEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxLQUFLLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzVLLElBQUksbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ2hDLE9BQU8sbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1lBRUQsZUFBZTtZQUNmLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQztZQUM1RSxJQUFJLENBQUMsVUFBVSxJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUNwQyxPQUFPLGVBQWUsQ0FBQyxPQUFPLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFFRCxFQUFFO1FBQ0YsaUhBQWlIO1FBQ2pILEVBQUU7UUFFRixvRkFBb0Y7UUFDcEYsSUFBSSxZQUEwQyxDQUFDO1FBQy9DLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFbEQsaUJBQWlCO1FBQ2pCLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMzQixZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFFRCxnQkFBZ0I7YUFDWCxDQUFDO1lBRUwsZ0dBQWdHO1lBQ2hHLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDM0QsWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDcEUsQ0FBQztZQUVELHVFQUF1RTtZQUN2RSxJQUFJLENBQUMsWUFBWSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNqQyxZQUFZLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUMzRSxDQUFDO1lBRUQsK0NBQStDO1lBQy9DLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkUsQ0FBQztRQUNGLENBQUM7UUFFRCxzQ0FBc0M7UUFDdEMsMkZBQTJGO1FBQzNGLHFEQUFxRDtRQUNyRCxJQUFJLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUscUJBQXFCLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3hKLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25HLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJHLCtEQUErRDtRQUMvRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUE4QixRQUFRLENBQUMsQ0FBQztRQUMvRixJQUFJLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDM0IsSUFBSSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztZQUN2QyxJQUFJLFlBQVksQ0FBQyxtQkFBbUIsS0FBSyxXQUFXLEVBQUUsQ0FBQztnQkFDdEQsS0FBSyxDQUFDLElBQUksK0JBQXVCLENBQUM7Z0JBQ2xDLGVBQWUsR0FBRyxLQUFLLENBQUM7WUFDekIsQ0FBQztpQkFBTSxJQUFJLFlBQVksQ0FBQyxtQkFBbUIsS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDOUQsS0FBSyxDQUFDLElBQUksZ0NBQXdCLENBQUM7Z0JBQ25DLGVBQWUsR0FBRyxLQUFLLENBQUM7WUFDekIsQ0FBQztpQkFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsSUFBSSxZQUFZLENBQUMsbUJBQW1CLEtBQUssUUFBUSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQzVILE1BQU0sZUFBZSxHQUFHLFVBQVUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUMxRCxJQUFJLGVBQWUsQ0FBQyxJQUFJLGtDQUEwQixFQUFFLENBQUM7b0JBQ3BELEtBQUssQ0FBQyxJQUFJLGdDQUF3QixDQUFDLENBQUMsMEVBQTBFO2dCQUMvRyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsS0FBSyxHQUFHO3dCQUNQLEdBQUcsZUFBZTt3QkFDbEIsU0FBUyxFQUFFLFNBQVMsQ0FBQyw0QkFBNEI7cUJBQ2pELENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxlQUFlLEdBQUcsS0FBSyxDQUFDLElBQUksa0NBQTBCLElBQUksWUFBWSxDQUFDLG1CQUFtQixLQUFLLFFBQVEsQ0FBQztZQUN6RyxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVBLEtBQXlCLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFDLHdCQUF3QjtRQUUzRSxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxlQUFlLENBQUMsS0FBcUI7UUFDNUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELEtBQUssQ0FBQyxDQUFDLEdBQUcsT0FBTyxLQUFLLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BELEtBQUssQ0FBQyxDQUFDLEdBQUcsT0FBTyxLQUFLLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXBELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sb0JBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDMUYsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZCxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNmLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7O0FBdlhXLG1CQUFtQjtJQVk3QixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEscUJBQXFCLENBQUE7R0FoQlgsbUJBQW1CLENBd1gvQjs7QUFFRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsSUFBeUM7SUFDNUUsTUFBTSxNQUFNLEdBQWtCLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ3BELE1BQU0sWUFBWSxHQUFHLElBQUksSUFBSSxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUVuRCxJQUFJLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ25DLE1BQU0sQ0FBQyxnQkFBZ0IsR0FBRyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRUQsSUFBSSxZQUFZLENBQUMsK0JBQStCLEVBQUUsQ0FBQztRQUNsRCxNQUFNLENBQUMsK0JBQStCLEdBQUcsa0JBQWtCLENBQUMsWUFBWSxDQUFDLCtCQUErQixDQUFDLENBQUM7SUFDM0csQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUMvQyxNQUFNLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxXQUFtQztJQUM5RCxNQUFNLE1BQU0sR0FBaUIsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlELElBQUksV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxVQUFVLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQztJQUM1QyxDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDakMsTUFBTSxDQUFDLGVBQWUsR0FBRyxXQUFXLENBQUMsZUFBZSxDQUFDO0lBQ3RELENBQUM7SUFFRCxJQUFJLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN4QixNQUFNLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxJQUFJLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsRUFBRSxFQUFFLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztJQUNySSxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxVQUFVLHdCQUF3QixDQUFDLFlBQTJCO0lBQ25FLE9BQU87UUFDTixnQkFBZ0IsRUFBRSxZQUFZLENBQUMsZ0JBQWdCLElBQUksb0JBQW9CLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDO1FBQ3RHLCtCQUErQixFQUFFLFlBQVksQ0FBQywrQkFBK0IsSUFBSSxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsK0JBQStCLENBQUM7UUFDbkosYUFBYSxFQUFFLFlBQVksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDN0UsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLFdBQXlCO0lBQ3RELE9BQU87UUFDTixtQkFBbUIsRUFBRSxXQUFXLENBQUMsU0FBUyxJQUFJLEVBQUUsRUFBRSxFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUMxSSxNQUFNLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUU7UUFDekMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxVQUFVO1FBQ2xDLGVBQWUsRUFBRSxXQUFXLENBQUMsZUFBZTtRQUM1QyxPQUFPLEVBQUUsV0FBVyxDQUFDLE9BQU87S0FDNUIsQ0FBQztBQUNILENBQUMifQ==