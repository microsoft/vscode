/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { isMacintosh, isNative, isWeb } from '../../../../base/common/platform.js';
import { isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { getMenuBarVisibility, hasCustomTitlebar, hasNativeMenu, hasNativeTitlebar } from '../../../../platform/window/common/window.js';
import { isFullscreen, isWCOEnabled } from '../../../../base/browser/browser.js';
export const IWorkbenchLayoutService = refineServiceDecorator(ILayoutService);
export var Parts;
(function (Parts) {
    Parts["TITLEBAR_PART"] = "workbench.parts.titlebar";
    Parts["BANNER_PART"] = "workbench.parts.banner";
    Parts["ACTIVITYBAR_PART"] = "workbench.parts.activitybar";
    Parts["SIDEBAR_PART"] = "workbench.parts.sidebar";
    Parts["PANEL_PART"] = "workbench.parts.panel";
    Parts["AUXILIARYBAR_PART"] = "workbench.parts.auxiliarybar";
    Parts["CHATBAR_PART"] = "workbench.parts.chatbar";
    Parts["EDITOR_PART"] = "workbench.parts.editor";
    Parts["STATUSBAR_PART"] = "workbench.parts.statusbar";
})(Parts || (Parts = {}));
export var ZenModeSettings;
(function (ZenModeSettings) {
    ZenModeSettings["SHOW_TABS"] = "zenMode.showTabs";
    ZenModeSettings["HIDE_LINENUMBERS"] = "zenMode.hideLineNumbers";
    ZenModeSettings["HIDE_STATUSBAR"] = "zenMode.hideStatusBar";
    ZenModeSettings["HIDE_ACTIVITYBAR"] = "zenMode.hideActivityBar";
    ZenModeSettings["CENTER_LAYOUT"] = "zenMode.centerLayout";
    ZenModeSettings["FULLSCREEN"] = "zenMode.fullScreen";
    ZenModeSettings["RESTORE"] = "zenMode.restore";
    ZenModeSettings["SILENT_NOTIFICATIONS"] = "zenMode.silentNotifications";
})(ZenModeSettings || (ZenModeSettings = {}));
export var LayoutSettings;
(function (LayoutSettings) {
    LayoutSettings["ACTIVITY_BAR_LOCATION"] = "workbench.activityBar.location";
    LayoutSettings["ACTIVITY_BAR_AUTO_HIDE"] = "workbench.activityBar.autoHide";
    LayoutSettings["ACTIVITY_BAR_COMPACT"] = "workbench.activityBar.compact";
    LayoutSettings["EDITOR_TABS_MODE"] = "workbench.editor.showTabs";
    LayoutSettings["EDITOR_ACTIONS_LOCATION"] = "workbench.editor.editorActionsLocation";
    LayoutSettings["COMMAND_CENTER"] = "window.commandCenter";
    LayoutSettings["LAYOUT_ACTIONS"] = "workbench.layoutControl.enabled";
    LayoutSettings["SHADOWS"] = "workbench.shadows";
})(LayoutSettings || (LayoutSettings = {}));
export var ActivityBarPosition;
(function (ActivityBarPosition) {
    ActivityBarPosition["DEFAULT"] = "default";
    ActivityBarPosition["TOP"] = "top";
    ActivityBarPosition["BOTTOM"] = "bottom";
    ActivityBarPosition["HIDDEN"] = "hidden";
})(ActivityBarPosition || (ActivityBarPosition = {}));
export var EditorTabsMode;
(function (EditorTabsMode) {
    EditorTabsMode["MULTIPLE"] = "multiple";
    EditorTabsMode["SINGLE"] = "single";
    EditorTabsMode["NONE"] = "none";
})(EditorTabsMode || (EditorTabsMode = {}));
export var EditorActionsLocation;
(function (EditorActionsLocation) {
    EditorActionsLocation["DEFAULT"] = "default";
    EditorActionsLocation["TITLEBAR"] = "titleBar";
    EditorActionsLocation["HIDDEN"] = "hidden";
})(EditorActionsLocation || (EditorActionsLocation = {}));
export var Position;
(function (Position) {
    Position[Position["LEFT"] = 0] = "LEFT";
    Position[Position["RIGHT"] = 1] = "RIGHT";
    Position[Position["BOTTOM"] = 2] = "BOTTOM";
    Position[Position["TOP"] = 3] = "TOP";
})(Position || (Position = {}));
export function isHorizontal(position) {
    return position === 2 /* Position.BOTTOM */ || position === 3 /* Position.TOP */;
}
export var PartOpensMaximizedOptions;
(function (PartOpensMaximizedOptions) {
    PartOpensMaximizedOptions[PartOpensMaximizedOptions["ALWAYS"] = 0] = "ALWAYS";
    PartOpensMaximizedOptions[PartOpensMaximizedOptions["NEVER"] = 1] = "NEVER";
    PartOpensMaximizedOptions[PartOpensMaximizedOptions["REMEMBER_LAST"] = 2] = "REMEMBER_LAST";
})(PartOpensMaximizedOptions || (PartOpensMaximizedOptions = {}));
export function positionToString(position) {
    switch (position) {
        case 0 /* Position.LEFT */: return 'left';
        case 1 /* Position.RIGHT */: return 'right';
        case 2 /* Position.BOTTOM */: return 'bottom';
        case 3 /* Position.TOP */: return 'top';
        default: return 'bottom';
    }
}
const positionsByString = {
    [positionToString(0 /* Position.LEFT */)]: 0 /* Position.LEFT */,
    [positionToString(1 /* Position.RIGHT */)]: 1 /* Position.RIGHT */,
    [positionToString(2 /* Position.BOTTOM */)]: 2 /* Position.BOTTOM */,
    [positionToString(3 /* Position.TOP */)]: 3 /* Position.TOP */
};
export function positionFromString(str) {
    return positionsByString[str];
}
function partOpensMaximizedSettingToString(setting) {
    switch (setting) {
        case 0 /* PartOpensMaximizedOptions.ALWAYS */: return 'always';
        case 1 /* PartOpensMaximizedOptions.NEVER */: return 'never';
        case 2 /* PartOpensMaximizedOptions.REMEMBER_LAST */: return 'preserve';
        default: return 'preserve';
    }
}
const partOpensMaximizedByString = {
    [partOpensMaximizedSettingToString(0 /* PartOpensMaximizedOptions.ALWAYS */)]: 0 /* PartOpensMaximizedOptions.ALWAYS */,
    [partOpensMaximizedSettingToString(1 /* PartOpensMaximizedOptions.NEVER */)]: 1 /* PartOpensMaximizedOptions.NEVER */,
    [partOpensMaximizedSettingToString(2 /* PartOpensMaximizedOptions.REMEMBER_LAST */)]: 2 /* PartOpensMaximizedOptions.REMEMBER_LAST */
};
export function partOpensMaximizedFromString(str) {
    return partOpensMaximizedByString[str];
}
export function isMultiWindowPart(part) {
    return part === "workbench.parts.editor" /* Parts.EDITOR_PART */ ||
        part === "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */ ||
        part === "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */;
}
export function shouldShowCustomTitleBar(configurationService, window, menuBarToggled) {
    if (!hasCustomTitlebar(configurationService)) {
        return false;
    }
    const inFullscreen = isFullscreen(window);
    const nativeTitleBarEnabled = hasNativeTitlebar(configurationService);
    if (!isWeb) {
        const showCustomTitleBar = configurationService.getValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */);
        if (showCustomTitleBar === "never" /* CustomTitleBarVisibility.NEVER */ && nativeTitleBarEnabled || showCustomTitleBar === "windowed" /* CustomTitleBarVisibility.WINDOWED */ && inFullscreen) {
            return false;
        }
    }
    if (!isTitleBarEmpty(configurationService)) {
        return true;
    }
    // Hide custom title bar when native title bar enabled and custom title bar is empty
    if (nativeTitleBarEnabled && hasNativeMenu(configurationService)) {
        return false;
    }
    // macOS desktop does not need a title bar when full screen
    if (isMacintosh && isNative) {
        return !inFullscreen;
    }
    // non-fullscreen native must show the title bar
    if (isNative && !inFullscreen) {
        return true;
    }
    // if WCO is visible, we have to show the title bar
    if (isWCOEnabled() && !inFullscreen) {
        return true;
    }
    // remaining behavior is based on menubar visibility
    const menuBarVisibility = !isAuxiliaryWindow(window) ? getMenuBarVisibility(configurationService) : 'hidden';
    switch (menuBarVisibility) {
        case 'classic':
            return !inFullscreen || !!menuBarToggled;
        case 'compact':
        case 'hidden':
            return false;
        case 'toggle':
            return !!menuBarToggled;
        case 'visible':
            return true;
        default:
            return isWeb ? false : !inFullscreen || !!menuBarToggled;
    }
}
function isTitleBarEmpty(configurationService) {
    // with the command center enabled, we should always show
    if (configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */)) {
        return false;
    }
    // with the activity bar on top, we should always show
    const activityBarPosition = configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */);
    if (activityBarPosition === "top" /* ActivityBarPosition.TOP */ || activityBarPosition === "bottom" /* ActivityBarPosition.BOTTOM */) {
        return false;
    }
    // with the editor actions on top, we should always show
    const editorActionsLocation = configurationService.getValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */);
    const editorTabsMode = configurationService.getValue("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */);
    if (editorActionsLocation === "titleBar" /* EditorActionsLocation.TITLEBAR */ || editorActionsLocation === "default" /* EditorActionsLocation.DEFAULT */ && editorTabsMode === "none" /* EditorTabsMode.NONE */) {
        return false;
    }
    // with the layout actions on top, we should always show
    if (configurationService.getValue("workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRXBHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUl0RixPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQTZDLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3BMLE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFJakYsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQTBDLGNBQWMsQ0FBQyxDQUFDO0FBRXZILE1BQU0sQ0FBTixJQUFrQixLQVVqQjtBQVZELFdBQWtCLEtBQUs7SUFDdEIsbURBQTBDLENBQUE7SUFDMUMsK0NBQXNDLENBQUE7SUFDdEMseURBQWdELENBQUE7SUFDaEQsaURBQXdDLENBQUE7SUFDeEMsNkNBQW9DLENBQUE7SUFDcEMsMkRBQWtELENBQUE7SUFDbEQsaURBQXdDLENBQUE7SUFDeEMsK0NBQXNDLENBQUE7SUFDdEMscURBQTRDLENBQUE7QUFDN0MsQ0FBQyxFQVZpQixLQUFLLEtBQUwsS0FBSyxRQVV0QjtBQUVELE1BQU0sQ0FBTixJQUFrQixlQVNqQjtBQVRELFdBQWtCLGVBQWU7SUFDaEMsaURBQThCLENBQUE7SUFDOUIs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