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
var ThemeMainService_1;
import electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IStateService } from '../../state/node/state.js';
import { ThemeTypeSelector } from '../common/theme.js';
import { coalesce } from '../../../base/common/arrays.js';
import { getAllWindowsExcludingOffscreen } from '../../windows/electron-main/windows.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
// These default colors match our default themes
// editor background color ("Dark Modern", etc...)
const DEFAULT_BG_LIGHT = '#FFFFFF';
const DEFAULT_BG_DARK = '#1F1F1F';
const DEFAULT_BG_HC_BLACK = '#000000';
const DEFAULT_BG_HC_LIGHT = '#FFFFFF';
const THEME_STORAGE_KEY = 'theme';
const THEME_BG_STORAGE_KEY = 'themeBackground';
const THEME_WINDOW_SPLASH_KEY = 'windowSplash';
const THEME_WINDOW_SPLASH_OVERRIDE_KEY = 'windowSplashWorkspaceOverride';
class Setting {
    constructor(key, defaultValue) {
        this.key = key;
        this.defaultValue = defaultValue;
    }
    getValue(configurationService) {
        return configurationService.getValue(this.key) ?? this.defaultValue;
    }
}
// in the main process, defaults are not known to the configuration service, so we need to define them here
(function (Setting) {
    Setting.DETECT_COLOR_SCHEME = new Setting('window.autoDetectColorScheme', false);
    Setting.DETECT_HC = new Setting('window.autoDetectHighContrast', true);
    Setting.SYSTEM_COLOR_THEME = new Setting('window.systemColorTheme', 'default');
    Setting.AUXILIARYBAR_DEFAULT_VISIBILITY = new Setting('workbench.secondarySideBar.defaultVisibility', 'visibleInWorkspace');
    Setting.STARTUP_EDITOR = new Setting('workbench.startupEditor', 'welcomePage');
})(Setting || (Setting = {}));
let ThemeMainService = class ThemeMainService extends Disposable {
    static { ThemeMainService_1 = this; }
    static { this.DEFAULT_BAR_WIDTH = 300; }
    static { this.WORKSPACE_OVERRIDE_LIMIT = 50; }
    constructor(stateService, configurationService, logService) {
        super();
        this.stateService = stateService;
        this.configurationService = configurationService;
        this.logService = logService;
        this._onDidChangeColorScheme = this._register(new Emitter());
        this.onDidChangeColorScheme = this._onDidChangeColorScheme.event;
        // System Theme
        if (!isLinux) {
            this._register(this.configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(Setting.SYSTEM_COLOR_THEME.key) || e.affectsConfiguration(Setting.DETECT_COLOR_SCHEME.key)) {
                    this.updateSystemColorTheme();
                    this.logThemeSettings();
                }
            }));
        }
        this.updateSystemColorTheme();
        this.logThemeSettings();
        // Color Scheme changes
        this._register(Event.fromNodeEventEmitter(electron.nativeTheme, 'updated')(() => {
            this.logThemeSettings();
            this._onDidChangeColorScheme.fire(this.getColorScheme());
        }));
    }
    logThemeSettings() {
        if (this.logService.getLevel() >= LogLevel.Debug) {
            const logSetting = (setting) => `${setting.key}=${setting.getValue(this.configurationService)}`;
            this.logService.debug(`[theme main service] ${logSetting(Setting.DETECT_COLOR_SCHEME)}, ${logSetting(Setting.DETECT_HC)}, ${logSetting(Setting.SYSTEM_COLOR_THEME)}`);
            const logProperty = (property) => `${String(property)}=${electron.nativeTheme[property]}`;
            this.logService.debug(`[theme main service] electron.nativeTheme: ${logProperty('themeSource')}, ${logProperty('shouldUseDarkColors')}, ${logProperty('shouldUseHighContrastColors')}, ${logProperty('shouldUseInvertedColorScheme')}, ${logProperty('shouldUseDarkColorsForSystemIntegratedUI')}	`);
            this.logService.debug(`[theme main service] New color scheme: ${JSON.stringify(this.getColorScheme())}`);
        }
    }
    updateSystemColorTheme() {
        if (isLinux || this.isAutoDetectColorScheme()) {
            electron.nativeTheme.themeSource = 'system'; // only with `system` we can detect the system color scheme
        }
        else {
            switch (Setting.SYSTEM_COLOR_THEME.getValue(this.configurationService)) {
                case 'dark':
                    electron.nativeTheme.themeSource = 'dark';
                    break;
                case 'light':
                    electron.nativeTheme.themeSource = 'light';
                    break;
                case 'auto':
                    switch (this.getPreferredBaseTheme() ?? this.getStoredBaseTheme()) {
                        case ThemeTypeSelector.VS:
                            electron.nativeTheme.themeSource = 'light';
                            break;
                        case ThemeTypeSelector.VS_DARK:
                            electron.nativeTheme.themeSource = 'dark';
                            break;
                        default: electron.nativeTheme.themeSource = 'system';
                    }
                    break;
                default:
                    electron.nativeTheme.themeSource = 'system';
                    break;
            }
        }
    }
    getColorScheme() {
        // high contrast is reflected by the shouldUseInvertedColorScheme property
        if (isWindows) {
            if (electron.nativeTheme.shouldUseHighContrastColors) {
                // shouldUseInvertedColorScheme is dark, !shouldUseInvertedColorScheme is light
                return { dark: electron.nativeTheme.shouldUseInvertedColorScheme, highContrast: true };
            }
        }
        // high contrast is set if one of shouldUseInvertedColorScheme or shouldUseHighContrastColors is set,
        // reflecting the 'Invert colours' and `Increase contrast` settings in MacOS
        else if (isMacintosh) {
            if (electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors) {
                return { dark: electron.nativeTheme.shouldUseDarkColors, highContrast: true };
            }
        }
        // ubuntu gnome seems to have 3 states, light dark and high contrast
        else if (isLinux) {
            if (electron.nativeTheme.shouldUseHighContrastColors) {
                return { dark: true, highContrast: true };
            }
        }
        return {
            dark: electron.nativeTheme.shouldUseDarkColors,
            highContrast: false
        };
    }
    getPreferredBaseTheme() {
        const colorScheme = this.getColorScheme();
        if (Setting.DETECT_HC.getValue(this.configurationService) && colorScheme.highContrast) {
            return colorScheme.dark ? ThemeTypeSelector.HC_BLACK : ThemeTypeSelector.HC_LIGHT;
        }
        if (this.isAutoDetectColorScheme()) {
            return colorScheme.dark ? ThemeTypeSelector.VS_DARK : ThemeTypeSelector.VS;
        }
        return undefined;
    }
    isAutoDetectColorScheme() {
        if (Setting.DETECT_COLOR_SCHEME.getValue(this.configurationService)) {
            return true;
        }
        return false;
    }
    getBackgroundColor() {
        const preferred = this.getPreferredBaseTheme();
        const stored = this.getStoredBaseTheme();
        // If the stored theme has the same base as the preferred, we can return the stored background
        if (preferred === undefined || preferred === stored) {
            const storedBackground = this.stateService.getItem(THEME_BG_STORAGE_KEY, null);
            if (storedBackground) {
                return storedBackground;
            }
        }
        // Otherwise we return the default background for the preferred base theme. If there's no preferred, use the stored one.
        switch (preferred ?? stored) {
            case ThemeTypeSelector.VS: return DEFAULT_BG_LIGHT;
            case ThemeTypeSelector.HC_BLACK: return DEFAULT_BG_HC_BLACK;
            case ThemeTypeSelector.HC_LIGHT: return DEFAULT_BG_HC_LIGHT;
            default: return DEFAULT_BG_DARK;
        }
    }
    getStoredBaseTheme() {
        const baseTheme = this.stateService.getItem(THEME_STORAGE_KEY, ThemeTypeSelector.VS_DARK).split(' ')[0];
        switch (baseTheme) {
            case ThemeTypeSelector.VS: return ThemeTypeSelector.VS;
            case ThemeTypeSelector.HC_BLACK: return ThemeTypeSelector.HC_BLACK;
            case ThemeTypeSelector.HC_LIGHT: return ThemeTypeSelector.HC_LIGHT;
            default: return ThemeTypeSelector.VS_DARK;
        }
    }
    saveWindowSplash(windowId, workspace, splash) {
        // Update override as needed
        const splashOverride = this.updateWindowSplashOverride(workspace, splash);
        // Update in storage
        this.stateService.setItems(coalesce([
            { key: THEME_STORAGE_KEY, data: splash.baseTheme },
            { key: THEME_BG_STORAGE_KEY, data: splash.colorInfo.background },
            { key: THEME_WINDOW_SPLASH_KEY, data: splash },
            splashOverride ? { key: THEME_WINDOW_SPLASH_OVERRIDE_KEY, data: splashOverride } : undefined
        ]));
        // Update in opened windows
        if (typeof windowId === 'number') {
            this.updateBackgroundColor(windowId, splash);
        }
        // Update system theme
        this.updateSystemColorTheme();
    }
    updateWindowSplashOverride(workspace, splash) {
        let splashOverride = undefined;
        let changed = false;
        if (workspace) {
            splashOverride = { ...this.getWindowSplashOverride() }; // make a copy for modifications
            changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, 'sideBar');
            changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, 'auxiliaryBar') || changed;
        }
        return changed ? splashOverride : undefined;
    }
    doUpdateWindowSplashOverride(workspace, splash, splashOverride, part) {
        const currentWidth = part === 'sideBar' ? splash.layoutInfo?.sideBarWidth : splash.layoutInfo?.auxiliaryBarWidth;
        const overrideWidth = part === 'sideBar' ? splashOverride.layoutInfo.sideBarWidth : splashOverride.layoutInfo.auxiliaryBarWidth;
        // No layout info: remove override
        let changed = false;
        if (typeof currentWidth !== 'number') {
            if (splashOverride.layoutInfo.workspaces[workspace.id]) {
                delete splashOverride.layoutInfo.workspaces[workspace.id];
                changed = true;
            }
            return changed;
        }
        let workspaceOverride = splashOverride.layoutInfo.workspaces[workspace.id];
        if (!workspaceOverride) {
            const workspaceEntries = Object.keys(splashOverride.layoutInfo.workspaces);
            if (workspaceEntries.length >= ThemeMainService_1.WORKSPACE_OVERRIDE_LIMIT) {
                delete splashOverride.layoutInfo.workspaces[workspaceEntries[0]];
                changed = true;
            }
            workspaceOverride = { sideBarVisible: false, auxiliaryBarVisible: false };
            splashOverride.layoutInfo.workspaces[workspace.id] = workspaceOverride;
            changed = true;
        }
        // Part has width: update width & visibility override
        if (currentWidth > 0) {
            if (overrideWidth !== currentWidth) {
                splashOverride.layoutInfo[part === 'sideBar' ? 'sideBarWidth' : 'auxiliaryBarWidth'] = currentWidth;
                changed = true;
            }
            switch (part) {
                case 'sideBar':
                    if (!workspaceOverride.sideBarVisible) {
                        workspaceOverride.sideBarVisible = true;
                        changed = true;
                    }
                    break;
                case 'auxiliaryBar':
                    if (!workspaceOverride.auxiliaryBarVisible) {
                        workspaceOverride.auxiliaryBarVisible = true;
                        changed = true;
                    }
                    break;
            }
        }
        // Part is hidden: update visibility override
        else {
            switch (part) {
                case 'sideBar':
                    if (workspaceOverride.sideBarVisible) {
                        workspaceOverride.sideBarVisible = false;
                        changed = true;
                    }
                    break;
                case 'auxiliaryBar':
                    if (workspaceOverride.auxiliaryBarVisible) {
                        workspaceOverride.auxiliaryBarVisible = false;
                        changed = true;
                    }
                    break;
            }
        }
        return changed;
    }
    updateBackgroundColor(windowId, splash) {
        for (const window of getAllWindowsExcludingOffscreen()) {
            if (window.id === windowId) {
                window.setBackgroundColor(splash.colorInfo.background);
                break;
            }
        }
    }
    getWindowSplash(workspace) {
        try {
            return this.doGetWindowSplash(workspace);
        }
        catch (error) {
            this.logService.error('[theme main service] Failed to get window splash', error);
            return undefined;
        }
    }
    doGetWindowSplash(workspace) {
        const partSplash = this.stateService.getItem(THEME_WINDOW_SPLASH_KEY);
        if (!partSplash?.layoutInfo) {
            return partSplash; // return early: overrides currently only apply to layout info
        }
        const override = this.getWindowSplashOverride();
        // Figure out side bar width based on workspace and overrides
        let sideBarWidth;
        if (workspace) {
            if (override.layoutInfo.workspaces[workspace.id]?.sideBarVisible === false) {
                sideBarWidth = 0;
            }
            else {
                sideBarWidth = override.layoutInfo.sideBarWidth || partSplash.layoutInfo.sideBarWidth || ThemeMainService_1.DEFAULT_BAR_WIDTH;
            }
        }
        else {
            sideBarWidth = 0;
        }
        // Figure out auxiliary bar width based on workspace, configuration and overrides
        const auxiliaryBarDefaultVisibility = Setting.AUXILIARYBAR_DEFAULT_VISIBILITY.getValue(this.configurationService);
        const startupEditor = Setting.STARTUP_EDITOR.getValue(this.configurationService);
        let auxiliaryBarWidth;
        if (workspace) {
            const auxiliaryBarVisible = override.layoutInfo.workspaces[workspace.id]?.auxiliaryBarVisible;
            if (auxiliaryBarVisible === true) {
                auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService_1.DEFAULT_BAR_WIDTH;
            }
            else if (auxiliaryBarVisible === false) {
                auxiliaryBarWidth = 0;
            }
            else {
                if (startupEditor !== 'agentSessionsWelcomePage' && (auxiliaryBarDefaultVisibility === 'visible' || auxiliaryBarDefaultVisibility === 'visibleInWorkspace')) {
                    auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService_1.DEFAULT_BAR_WIDTH;
                }
                else if (startupEditor !== 'agentSessionsWelcomePage' && (auxiliaryBarDefaultVisibility === 'maximized' || auxiliaryBarDefaultVisibility === 'maximizedInWorkspace')) {
                    auxiliaryBarWidth = Number.MAX_SAFE_INTEGER; // marker for a maximised auxiliary bar
                }
                else {
                    auxiliaryBarWidth = 0;
                }
            }
        }
        else {
            auxiliaryBarWidth = 0; // technically not true if configured 'visible', but we never store splash per empty window, so we decide on a default here
        }
        return {
            ...partSplash,
            layoutInfo: {
                ...partSplash.layoutInfo,
                sideBarWidth,
                auxiliaryBarWidth
            }
        };
    }
    getWindowSplashOverride() {
        let override = this.stateService.getItem(THEME_WINDOW_SPLASH_OVERRIDE_KEY);
        if (!override?.layoutInfo) {
            override = {
                layoutInfo: {
                    sideBarWidth: ThemeMainService_1.DEFAULT_BAR_WIDTH,
                    auxiliaryBarWidth: ThemeMainService_1.DEFAULT_BAR_WIDTH,
                    workspaces: {}
                }
            };
        }
        if (!override.layoutInfo.sideBarWidth) {
            override.layoutInfo.sideBarWidth = ThemeMainService_1.DEFAULT_BAR_WIDTH;
        }
        if (!override.layoutInfo.auxiliaryBarWidth) {
            override.layoutInfo.auxiliaryBarWidth = ThemeMainService_1.DEFAULT_BAR_WIDTH;
        }
        if (!override.layoutInfo.workspaces) {
            override.layoutInfo.workspaces = {};
        }
        return override;
    }
};
ThemeMainService = ThemeMainService_1 = __decorate([
    __param(0, IStateService),
    __param(1, IConfigurationService),
    __param(2, ILogService)
], ThemeMainService);
export { ThemeMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVNYWluU2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90aGVtZS9lbGVjdHJvbi1tYWluL3RoZW1lTWFpblNlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDaEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXZELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RixPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR2hFLGdEQUFnRDtBQUNoRCxrREFBa0Q7QUFDbEQsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7QUFDbkMsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDO0FBQ2xDLE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDO0FBQ3RDLE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDO0FBRXRDLE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDO0FBQ2xDLE1BQU0sb0JBQW9CLEdBQUcsaUJBQWlC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