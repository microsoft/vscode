/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import electron from 'electron';
import { Color } from '../../../base/common/color.js';
import { join } from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { WindowMinimumSize, hasNativeTitlebar, useNativeFullScreen, useWindowControlsOverlay, zoomLevelToZoomFactor } from '../../window/common/window.js';
import { defaultWindowState } from '../../window/electron-main/window.js';
export const IWindowsMainService = createDecorator('windowsMainService');
export var OpenContext;
(function (OpenContext) {
    // opening when running from the command line
    OpenContext[OpenContext["CLI"] = 0] = "CLI";
    // macOS only: opening from the dock (also when opening files to a running instance from desktop)
    OpenContext[OpenContext["DOCK"] = 1] = "DOCK";
    // opening from the main application window
    OpenContext[OpenContext["MENU"] = 2] = "MENU";
    // opening from a file or folder dialog
    OpenContext[OpenContext["DIALOG"] = 3] = "DIALOG";
    // opening from the OS's UI
    OpenContext[OpenContext["DESKTOP"] = 4] = "DESKTOP";
    // opening through the API
    OpenContext[OpenContext["API"] = 5] = "API";
    // opening from a protocol link
    OpenContext[OpenContext["LINK"] = 6] = "LINK";
})(OpenContext || (OpenContext = {}));
export function defaultBrowserWindowOptions(accessor, windowState, overrides, webPreferences) {
    const themeMainService = accessor.get(IThemeMainService);
    const productService = accessor.get(IProductService);
    const configurationService = accessor.get(IConfigurationService);
    const environmentMainService = accessor.get(IEnvironmentMainService);
    const windowSettings = configurationService.getValue('window');
    const options = {
        backgroundColor: themeMainService.getBackgroundColor(),
        minWidth: WindowMinimumSize.WIDTH,
        minHeight: WindowMinimumSize.HEIGHT,
        title: productService.nameLong,
        show: windowState.mode !== 0 /* WindowMode.Maximized */ && windowState.mode !== 3 /* WindowMode.Fullscreen */, // reduce flicker by showing later
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        webPreferences: {
            ...webPreferences,
            enableWebSQL: false,
            spellcheck: false,
            zoomFactor: zoomLevelToZoomFactor(windowState.zoomLevel ?? windowSettings?.zoomLevel),
            autoplayPolicy: 'user-gesture-required',
            // Enable experimental css highlight api https://chromestatus.com/feature/5436441440026624
            // Refs https://github.com/microsoft/vscode/issues/140098
            enableBlinkFeatures: 'HighlightAPI',
            sandbox: true,
            // TODO(deepak1556): Should be removed once migration is complete
            // https://github.com/microsoft/vscode/issues/239228
            enableDeprecatedPaste: true,
        },
        experimentalDarkMode: true
    };
    if (isWindows) {
        let borderSetting = windowSettings?.border || 'default';
        if (borderSetting === 'system') {
            borderSetting = 'default';
        }
        if (borderSetting !== 'default') {
            if (borderSetting === 'off') {
                options.accentColor = false;
            }
            else if (typeof borderSetting === 'string') {
                options.accentColor = borderSetting;
            }
        }
    }
    if (isLinux) {
        options.icon = join(environmentMainService.appRoot, 'resources/linux/code.png'); // always on Linux
    }
    else if (isWindows) {
        if (!environmentMainService.isBuilt) {
            options.icon = join(environmentMainService.appRoot, 'resources/win32/code_150x150.png'); // only when running out of sources on Windows
        }
        else if (process.isEmbeddedApp) {
            // For sub app the proxy executable acts as a launcher to the main executable whose
            // icon will be used when creating windows if the following override is not set.
            // This avoids sharing icon with the main application.
            options.icon = join(environmentMainService.appRoot, 'resources/win32/sessions.ico');
        }
    }
    if (isMacintosh) {
        options.acceptFirstMouse = true; // enabled by default
        if (windowSettings?.clickThroughInactive === false) {
            options.acceptFirstMouse = false;
        }
    }
    if (overrides?.disableFullscreen) {
        options.fullscreen = false;
    }
    else if (isMacintosh && !useNativeFullScreen(configurationService)) {
        options.fullscreenable = false; // enables simple fullscreen mode
    }
    const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
    if (useNativeTabs) {
        options.tabbingIdentifier = productService.nameShort; // this opts in to native macOS tabs
    }
    const hideNativeTitleBar = !hasNativeTitlebar(configurationService, overrides?.forceNativeTitlebar ? "native" /* TitlebarStyle.NATIVE */ : undefined);
    if (hideNativeTitleBar) {
        options.titleBarStyle = 'hidden';
        if (!isMacintosh) {
            options.frame = false;
        }
        if (useWindowControlsOverlay(configurationService)) {
            if (isMacintosh) {
                options.titleBarOverlay = true;
            }
            else {
                // This logic will not perfectly guess the right colors
                // to use on initialization, but prefer to keep things
                // simple as it is temporary and not noticeable
                const titleBarColor = themeMainService.getWindowSplash(undefined)?.colorInfo.titleBarBackground ?? themeMainService.getBackgroundColor();
                const symbolColor = Color.fromHex(titleBarColor).isDarker() ? '#FFFFFF' : '#000000';
                options.titleBarOverlay = {
                    height: 29, // the smallest size of the title bar on windows accounting for the border on windows 11
                    color: titleBarColor,
                    symbolColor
                };
            }
        }
    }
    if (overrides?.alwaysOnTop) {
        options.alwaysOnTop = true;
    }
    return options;
}
export function getLastFocused(windows) {
    let lastFocusedWindow = undefined;
    let maxLastFocusTime = Number.MIN_VALUE;
    for (const window of windows) {
        if (window.lastFocusTime > maxLastFocusTime) {
            maxLastFocusTime = window.lastFocusTime;
            lastFocusedWindow = window;
        }
    }
    return lastFocusedWindow;
}
export var WindowStateValidator;
(function (WindowStateValidator) {
    function validateWindowState(logService, state, displays = electron.screen.getAllDisplays()) {
        logService.trace(`window#validateWindowState: validating window state on ${displays.length} display(s)`, state);
        if (typeof state.x !== 'number' ||
            typeof state.y !== 'number' ||
            typeof state.width !== 'number' ||
            typeof state.height !== 'number') {
            logService.trace('window#validateWindowState: unexpected type of state values');
            return undefined;
        }
        if (state.width <= 0 || state.height <= 0) {
            logService.trace('window#validateWindowState: unexpected negative values');
            return undefined;
        }
        // Single Monitor: be strict about x/y positioning
        // macOS & Linux: these OS seem to be pretty good in ensuring that a window is never outside of it's bounds.
        // Windows: it is possible to have a window with a size that makes it fall out of the window. our strategy
        //          is to try as much as possible to keep the window in the monitor bounds. we are not as strict as
        //          macOS and Linux and allow the window to exceed the monitor bounds as long as the window is still
        //          some pixels (128) visible on the screen for the user to drag it back.
        if (displays.length === 1) {
            const displayWorkingArea = getWorkingArea(displays[0]);
            logService.trace('window#validateWindowState: single monitor working area', displayWorkingArea);
            if (displayWorkingArea) {
                function ensureStateInDisplayWorkingArea() {
                    if (!state || typeof state.x !== 'number' || typeof state.y !== 'number' || !displayWorkingArea) {
                        return;
                    }
                    if (state.x < displayWorkingArea.x) {
                        // prevent window from falling out of the screen to the left
                        state.x = displayWorkingArea.x;
                    }
                    if (state.y < displayWorkingArea.y) {
                        // prevent window from falling out of the screen to the top
                        state.y = displayWorkingArea.y;
                    }
                }
                // ensure state is not outside display working area (top, left)
                ensureStateInDisplayWorkingArea();
                if (state.width > displayWorkingArea.width) {
                    // prevent window from exceeding display bounds width
                    state.width = displayWorkingArea.width;
                }
                if (state.height > displayWorkingArea.height) {
                    // prevent window from exceeding display bounds height
                    state.height = displayWorkingArea.height;
                }
                if (state.x > (displayWorkingArea.x + displayWorkingArea.width - 128)) {
                    // prevent window from falling out of the screen to the right with
                    // 128px margin by positioning the window to the far right edge of
                    // the screen
                    state.x = displayWorkingArea.x + displayWorkingArea.width - state.width;
                }
                if (state.y > (displayWorkingArea.y + displayWorkingArea.height - 128)) {
                    // prevent window from falling out of the screen to the bottom with
                    // 128px margin by positioning the window to the far bottom edge of
                    // the screen
                    state.y = displayWorkingArea.y + displayWorkingArea.height - state.height;
                }
                // again ensure state is not outside display working area
                // (it may have changed from the previous validation step)
                ensureStateInDisplayWorkingArea();
            }
            return state;
        }
        // Multi Montior (fullscreen): try to find the previously used display
        if (state.display && state.mode === 3 /* WindowMode.Fullscreen */) {
            const display = displays.find(d => d.id === state.display);
            if (display && typeof display.bounds?.x === 'number' && typeof display.bounds?.y === 'number') {
                logService.trace('window#validateWindowState: restoring fullscreen to previous display');
                const defaults = defaultWindowState(3 /* WindowMode.Fullscreen */); // make sure we have good values when the user restores the window
                defaults.x = display.bounds.x; // carefull to use displays x/y position so that the window ends up on the correct monitor
                defaults.y = display.bounds.y;
                return defaults;
            }
        }
        // Multi Monitor (non-fullscreen): ensure window is within display bounds
        let display;
        let displayWorkingArea;
        try {
            display = electron.screen.getDisplayMatching({ x: state.x, y: state.y, width: state.width, height: state.height });
            displayWorkingArea = getWorkingArea(display);
            logService.trace('window#validateWindowState: multi-monitor working area', displayWorkingArea);
        }
        catch (error) {
            // Electron has weird conditions under which it throws errors
            // e.g. https://github.com/microsoft/vscode/issues/100334 when
            // large numbers are passed in
            logService.error('window#validateWindowState: error finding display for window state', error);
        }
        if (display && validateWindowStateOnDisplay(state, display)) {
            return state;
        }
        logService.trace('window#validateWindowState: state is outside of the multi-monitor working area');
        return undefined;
    }
    WindowStateValidator.validateWindowState = validateWindowState;
    function validateWindowStateOnDisplay(state, display) {
        if (typeof state.x !== 'number' ||
            typeof state.y !== 'number' ||
            typeof state.width !== 'number' ||
            typeof state.height !== 'number' ||
            state.width <= 0 || state.height <= 0) {
            return false;
        }
        const displayWorkingArea = getWorkingArea(display);
        return Boolean(displayWorkingArea && // we have valid working area bounds
            state.x + state.width > displayWorkingArea.x && // prevent window from falling out of the screen to the left
            state.y + state.height > displayWorkingArea.y && // prevent window from falling out of the screen to the top
            state.x < displayWorkingArea.x + displayWorkingArea.width && // prevent window from falling out of the screen to the right
            state.y < displayWorkingArea.y + displayWorkingArea.height // prevent window from falling out of the screen to the bottom
        );
    }
    WindowStateValidator.validateWindowStateOnDisplay = validateWindowStateOnDisplay;
    function getWorkingArea(display) {
        // Prefer the working area of the display to account for taskbars on the
        // desktop being positioned somewhere (https://github.com/microsoft/vscode/issues/50830).
        //
        // Linux X11 sessions sometimes report wrong display bounds, so we validate
        // the reported sizes are positive.
        if (display.workArea.width > 0 && display.workArea.height > 0) {
            return display.workArea;
        }
        if (display.bounds.width > 0 && display.bounds.height > 0) {
            return display.bounds;
        }
        return undefined;
    }
})(WindowStateValidator || (WindowStateValidator = {}));
/**
 * We have some components like `NativeWebContentExtractorService` that create offscreen windows
 * to extract content from web pages. These windows are not visible to the user and are not
 * considered part of the main application window. This function filters out those offscreen
 * windows from the list of all windows.
 * @returns An array of all BrowserWindow instances that are not offscreen.
 */
export function getAllWindowsExcludingOffscreen() {
    return electron.BrowserWindow.getAllWindows().filter(win => !win.webContents.isOffscreen());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sUUFBZ0MsTUFBTSxVQUFVLENBQUM7QUFDeEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQXFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHdEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFcEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFvQixlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUE0RSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSx3QkFBd0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3JPLE9BQU8sRUFBeUMsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqSCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLG9CQUFvQixDQUFDLENBQUM7QUEwQzlGLE1BQU0sQ0FBTixJQUFrQixXQXNCakI7QUF0QkQsV0FBa0IsV0FBVztJQUU1Qiw2Q0FBNkM7SUFDN0MsMkNBQUcsQ0FBQTtJQUVILGlHQUFpRztJQUNqRyw2Q0FBSSxDQUFBO0lBRUos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