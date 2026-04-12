/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isBoolean, isString } from '../../../../base/common/types.js';
export const IWorkbenchThemeService = refineServiceDecorator(IThemeService);
export const THEME_SCOPE_OPEN_PAREN = '[';
export const THEME_SCOPE_CLOSE_PAREN = ']';
export const THEME_SCOPE_WILDCARD = '*';
export const themeScopeRegex = /\[(.+?)\]/g;
export var ThemeSettings;
(function (ThemeSettings) {
    ThemeSettings["COLOR_THEME"] = "workbench.colorTheme";
    ThemeSettings["FILE_ICON_THEME"] = "workbench.iconTheme";
    ThemeSettings["PRODUCT_ICON_THEME"] = "workbench.productIconTheme";
    ThemeSettings["COLOR_CUSTOMIZATIONS"] = "workbench.colorCustomizations";
    ThemeSettings["TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.tokenColorCustomizations";
    ThemeSettings["SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.semanticTokenColorCustomizations";
    ThemeSettings["PREFERRED_DARK_THEME"] = "workbench.preferredDarkColorTheme";
    ThemeSettings["PREFERRED_LIGHT_THEME"] = "workbench.preferredLightColorTheme";
    ThemeSettings["PREFERRED_HC_DARK_THEME"] = "workbench.preferredHighContrastColorTheme";
    ThemeSettings["PREFERRED_HC_LIGHT_THEME"] = "workbench.preferredHighContrastLightColorTheme";
    ThemeSettings["DETECT_COLOR_SCHEME"] = "window.autoDetectColorScheme";
    ThemeSettings["DETECT_HC"] = "window.autoDetectHighContrast";
    ThemeSettings["SYSTEM_COLOR_THEME"] = "window.systemColorTheme";
})(ThemeSettings || (ThemeSettings = {}));
export var ThemeSettingDefaults;
(function (ThemeSettingDefaults) {
    ThemeSettingDefaults.COLOR_THEME_DARK = 'Dark 2026';
    ThemeSettingDefaults.COLOR_THEME_LIGHT = 'Light 2026';
    ThemeSettingDefaults.COLOR_THEME_HC_DARK = 'Default High Contrast';
    ThemeSettingDefaults.COLOR_THEME_HC_LIGHT = 'Default High Contrast Light';
    ThemeSettingDefaults.FILE_ICON_THEME = 'vs-seti';
    ThemeSettingDefaults.PRODUCT_ICON_THEME = 'Default';
})(ThemeSettingDefaults || (ThemeSettingDefaults = {}));
/**
 * Migrates legacy theme settings IDs to their current equivalents.
 * Theme IDs were simplified: "Default" prefix was removed from built-in themes,
 * and "Experimental" prefix was replaced when VS Code themes became GA.
 */
export function migrateThemeSettingsId(settingsId) {
    switch (settingsId) {
        case 'Default Dark Modern': return 'Dark Modern';
        case 'Default Light Modern': return 'Light Modern';
        case 'Default Dark+': return 'Dark+';
        case 'Default Light+': return 'Light+';
        case 'Experimental Dark':
        case 'VS Code Dark':
            return ThemeSettingDefaults.COLOR_THEME_DARK;
        case 'Experimental Light':
        case 'VS Code Light':
            return ThemeSettingDefaults.COLOR_THEME_LIGHT;
    }
    return settingsId;
}
export const COLOR_THEME_DARK_INITIAL_COLORS = {
    'actionBar.toggledBackground': '#383a49',
    'activityBar.activeBorder': '#0078D4',
    'activityBar.background': '#181818',
    'activityBar.border': '#2B2B2B',
    'activityBar.foreground': '#D7D7D7',
    'activityBar.inactiveForeground': '#868686',
    'activityBarBadge.background': '#0078D4',
    'activityBarBadge.foreground': '#FFFFFF',
    'badge.background': '#616161',
    'badge.foreground': '#F8F8F8',
    'button.background': '#0078D4',
    'button.border': '#FFFFFF12',
    'button.foreground': '#FFFFFF',
    'button.hoverBackground': '#026EC1',
    'button.secondaryBackground': '#313131',
    'button.secondaryForeground': '#CCCCCC',
    'button.secondaryHoverBackground': '#3C3C3C',
    'chat.slashCommandBackground': '#26477866',
    'chat.slashCommandForeground': '#85B6FF',
    'chat.editedFileForeground': '#E2C08D',
    'checkbox.background': '#313131',
    'checkbox.border': '#3C3C3C',
    'debugToolBar.background': '#181818',
    'descriptionForeground': '#9D9D9D',
    'dropdown.background': '#313131',
    'dropdown.border': '#3C3C3C',
    'dropdown.foreground': '#CCCCCC',
    'dropdown.listBackground': '#1F1F1F',
    'editor.background': '#1F1F1F',
    'editor.findMatchBackground': '#9E6A03',
    'editor.foreground': '#CCCCCC',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editor.selectionHighlightBackground': '#ADD6FF26',
    'editorGroup.border': '#FFFFFF17',
    'editorGroupHeader.tabsBackground': '#181818',
    'editorGroupHeader.tabsBorder': '#2B2B2B',
    'editorGutter.addedBackground': '#2EA043',
    'editorGutter.deletedBackground': '#F85149',
    'editorGutter.modifiedBackground': '#0078D4',
    'editorIndentGuide.activeBackground1': '#707070',
    'editorIndentGuide.background1': '#404040',
    'editorLineNumber.activeForeground': '#CCCCCC',
    'editorLineNumber.foreground': '#6E7681',
    'editorOverviewRuler.border': '#010409',
    'editorWidget.background': '#202020',
    'errorForeground': '#F85149',
    'focusBorder': '#0078D4',
    'foreground': '#CCCCCC',
    'icon.foreground': '#CCCCCC',
    'input.background': '#313131',
    'input.border': '#3C3C3C',
    'input.foreground': '#CCCCCC',
    'input.placeholderForeground': '#989898',
    'inputOption.activeBackground': '#2489DB82',
    'inputOption.activeBorder': '#2488DB',
    'keybindingLabel.foreground': '#CCCCCC',
    'list.activeSelectionIconForeground': '#FFF',
    'list.dropBackground': '#383B3D',
    'menu.background': '#1F1F1F',
    'menu.border': '#454545',
    'menu.foreground': '#CCCCCC',
    'menu.selectionBackground': '#0078d4',
    'menu.separatorBackground': '#454545',
    'notificationCenterHeader.background': '#1F1F1F',
    'notificationCenterHeader.foreground': '#CCCCCC',
    'notifications.background': '#1F1F1F',
    'notifications.border': '#2B2B2B',
    'notifications.foreground': '#CCCCCC',
    'panel.background': '#181818',
    'panel.border': '#2B2B2B',
    'panelInput.border': '#2B2B2B',
    'panelTitle.activeBorder': '#0078D4',
    'panelTitle.activeForeground': '#CCCCCC',
    'panelTitle.inactiveForeground': '#9D9D9D',
    'peekViewEditor.background': '#1F1F1F',
    'peekViewEditor.matchHighlightBackground': '#BB800966',
    'peekViewResult.background': '#1F1F1F',
    'peekViewResult.matchHighlightBackground': '#BB800966',
    'pickerGroup.border': '#3C3C3C',
    'ports.iconRunningProcessForeground': '#369432',
    'progressBar.background': '#0078D4',
    'quickInput.background': '#222222',
    'quickInput.foreground': '#CCCCCC',
    'settings.dropdownBackground': '#313131',
    'settings.dropdownBorder': '#3C3C3C',
    'settings.headerForeground': '#FFFFFF',
    'settings.modifiedItemIndicator': '#BB800966',
    'sideBar.background': '#181818',
    'sideBar.border': '#2B2B2B',
    'sideBar.foreground': '#CCCCCC',
    'sideBarSectionHeader.background': '#181818',
    'sideBarSectionHeader.border': '#2B2B2B',
    'sideBarSectionHeader.foreground': '#CCCCCC',
    'sideBarTitle.foreground': '#CCCCCC',
    'statusBar.background': '#181818',
    'statusBar.border': '#2B2B2B',
    'statusBar.debuggingBackground': '#0078D4',
    'statusBar.debuggingForeground': '#FFFFFF',
    'statusBar.focusBorder': '#0078D4',
    'statusBar.foreground': '#CCCCCC',
    'statusBar.noFolderBackground': '#1F1F1F',
    'statusBarItem.focusBorder': '#0078D4',
    'statusBarItem.prominentBackground': '#6E768166',
    'statusBarItem.remoteBackground': '#0078D4',
    'statusBarItem.remoteForeground': '#FFFFFF',
    'tab.activeBackground': '#1F1F1F',
    'tab.activeBorder': '#1F1F1F',
    'tab.activeBorderTop': '#0078D4',
    'tab.activeForeground': '#FFFFFF',
    'tab.border': '#2B2B2B',
    'tab.hoverBackground': '#1F1F1F',
    'tab.inactiveBackground': '#181818',
    'tab.inactiveForeground': '#9D9D9D',
    'tab.lastPinnedBorder': '#ccc3',
    'tab.selectedBackground': '#222222',
    'tab.selectedBorderTop': '#6caddf',
    'tab.selectedForeground': '#ffffffa0',
    'tab.unfocusedActiveBorder': '#1F1F1F',
    'tab.unfocusedActiveBorderTop': '#2B2B2B',
    'tab.unfocusedHoverBackground': '#1F1F1F',
    'terminal.foreground': '#CCCCCC',
    'terminal.inactiveSelectionBackground': '#3A3D41',
    'terminal.tab.activeBorder': '#0078D4',
    'textBlockQuote.background': '#2B2B2B',
    'textBlockQuote.border': '#616161',
    'textCodeBlock.background': '#2B2B2B',
    'textLink.activeForeground': '#4daafc',
    'textLink.foreground': '#4daafc',
    'textPreformat.background': '#3C3C3C',
    'textPreformat.foreground': '#D0D0D0',
    'textSeparator.foreground': '#21262D',
    'titleBar.activeBackground': '#181818',
    'titleBar.activeForeground': '#CCCCCC',
    'titleBar.border': '#2B2B2B',
    'titleBar.inactiveBackground': '#1F1F1F',
    'titleBar.inactiveForeground': '#9D9D9D',
    'welcomePage.progress.foreground': '#0078D4',
    'welcomePage.tileBackground': '#2B2B2B',
    'widget.border': '#313131'
};
export const COLOR_THEME_LIGHT_INITIAL_COLORS = {
    'actionBar.toggledBackground': '#dddddd',
    'activityBar.activeBorder': '#005FB8',
    'activityBar.background': '#F8F8F8',
    'activityBar.border': '#E5E5E5',
    'activityBar.foreground': '#1F1F1F',
    'activityBar.inactiveForeground': '#616161',
    'activityBarBadge.background': '#005FB8',
    'activityBarBadge.foreground': '#FFFFFF',
    'badge.background': '#CCCCCC',
    'badge.foreground': '#3B3B3B',
    'button.background': '#005FB8',
    'button.border': '#0000001a',
    'button.foreground': '#FFFFFF',
    'button.hoverBackground': '#0258A8',
    'button.secondaryBackground': '#E5E5E5',
    'button.secondaryForeground': '#3B3B3B',
    'button.secondaryHoverBackground': '#CCCCCC',
    'chat.slashCommandBackground': '#ADCEFF7A',
    'chat.slashCommandForeground': '#26569E',
    'chat.editedFileForeground': '#895503',
    'checkbox.background': '#F8F8F8',
    'checkbox.border': '#CECECE',
    'descriptionForeground': '#3B3B3B',
    'diffEditor.unchangedRegionBackground': '#f8f8f8',
    'dropdown.background': '#FFFFFF',
    'dropdown.border': '#CECECE',
    'dropdown.foreground': '#3B3B3B',
    'dropdown.listBackground': '#FFFFFF',
    'editor.background': '#FFFFFF',
    'editor.foreground': '#3B3B3B',
    'editor.inactiveSelectionBackground': '#E5EBF1',
    'editor.selectionHighlightBackground': '#ADD6FF80',
    'editorGroup.border': '#E5E5E5',
    'editorGroupHeader.tabsBackground': '#F8F8F8',
    'editorGroupHeader.tabsBorder': '#E5E5E5',
    'editorGutter.addedBackground': '#2EA043',
    'editorGutter.deletedBackground': '#F85149',
    'editorGutter.modifiedBackground': '#005FB8',
    'editorIndentGuide.activeBackground1': '#939393',
    'editorIndentGuide.background1': '#D3D3D3',
    'editorLineNumber.activeForeground': '#171184',
    'editorLineNumber.foreground': '#6E7681',
    'editorOverviewRuler.border': '#E5E5E5',
    'editorSuggestWidget.background': '#F8F8F8',
    'editorWidget.background': '#F8F8F8',
    'errorForeground': '#F85149',
    'focusBorder': '#005FB8',
    'foreground': '#3B3B3B',
    'icon.foreground': '#3B3B3B',
    'input.background': '#FFFFFF',
    'input.border': '#CECECE',
    'input.foreground': '#3B3B3B',
    'input.placeholderForeground': '#767676',
    'inputOption.activeBackground': '#BED6ED',
    'inputOption.activeBorder': '#005FB8',
    'inputOption.activeForeground': '#000000',
    'keybindingLabel.foreground': '#3B3B3B',
    'list.activeSelectionBackground': '#E8E8E8',
    'list.activeSelectionForeground': '#000000',
    'list.activeSelectionIconForeground': '#000000',
    'list.focusAndSelectionOutline': '#005FB8',
    'list.hoverBackground': '#F2F2F2',
    'menu.border': '#CECECE',
    'menu.selectionBackground': '#005FB8',
    'menu.selectionForeground': '#ffffff',
    'notebook.cellBorderColor': '#E5E5E5',
    'notebook.selectedCellBackground': '#C8DDF150',
    'notificationCenterHeader.background': '#FFFFFF',
    'notificationCenterHeader.foreground': '#3B3B3B',
    'notifications.background': '#FFFFFF',
    'notifications.border': '#E5E5E5',
    'notifications.foreground': '#3B3B3B',
    'panel.background': '#F8F8F8',
    'panel.border': '#E5E5E5',
    'panelInput.border': '#E5E5E5',
    'panelTitle.activeBorder': '#005FB8',
    'panelTitle.activeForeground': '#3B3B3B',
    'panelTitle.inactiveForeground': '#3B3B3B',
    'peekViewEditor.matchHighlightBackground': '#BB800966',
    'peekViewResult.background': '#FFFFFF',
    'peekViewResult.matchHighlightBackground': '#BB800966',
    'pickerGroup.border': '#E5E5E5',
    'pickerGroup.foreground': '#8B949E',
    'ports.iconRunningProcessForeground': '#369432',
    'progressBar.background': '#005FB8',
    'quickInput.background': '#F8F8F8',
    'quickInput.foreground': '#3B3B3B',
    'searchEditor.textInputBorder': '#CECECE',
    'settings.dropdownBackground': '#FFFFFF',
    'settings.dropdownBorder': '#CECECE',
    'settings.headerForeground': '#1F1F1F',
    'settings.modifiedItemIndicator': '#BB800966',
    'settings.numberInputBorder': '#CECECE',
    'settings.textInputBorder': '#CECECE',
    'sideBar.background': '#F8F8F8',
    'sideBar.border': '#E5E5E5',
    'sideBar.foreground': '#3B3B3B',
    'sideBarSectionHeader.background': '#F8F8F8',
    'sideBarSectionHeader.border': '#E5E5E5',
    'sideBarSectionHeader.foreground': '#3B3B3B',
    'sideBarTitle.foreground': '#3B3B3B',
    'statusBar.background': '#F8F8F8',
    'statusBar.border': '#E5E5E5',
    'statusBar.debuggingBackground': '#FD716C',
    'statusBar.debuggingForeground': '#000000',
    'statusBar.focusBorder': '#005FB8',
    'statusBar.foreground': '#3B3B3B',
    'statusBar.noFolderBackground': '#F8F8F8',
    'statusBarItem.compactHoverBackground': '#CCCCCC',
    'statusBarItem.errorBackground': '#C72E0F',
    'statusBarItem.focusBorder': '#005FB8',
    'statusBarItem.hoverBackground': '#B8B8B850',
    'statusBarItem.prominentBackground': '#6E768166',
    'statusBarItem.remoteBackground': '#005FB8',
    'statusBarItem.remoteForeground': '#FFFFFF',
    'tab.activeBackground': '#FFFFFF',
    'tab.activeBorder': '#F8F8F8',
    'tab.activeBorderTop': '#005FB8',
    'tab.activeForeground': '#3B3B3B',
    'tab.border': '#E5E5E5',
    'tab.hoverBackground': '#FFFFFF',
    'tab.inactiveBackground': '#F8F8F8',
    'tab.inactiveForeground': '#868686',
    'tab.lastPinnedBorder': '#D4D4D4',
    'tab.selectedBackground': '#ffffffa5',
    'tab.selectedBorderTop': '#68a3da',
    'tab.selectedForeground': '#333333b3',
    'tab.unfocusedActiveBorder': '#F8F8F8',
    'tab.unfocusedActiveBorderTop': '#E5E5E5',
    'tab.unfocusedHoverBackground': '#F8F8F8',
    'terminal.foreground': '#3B3B3B',
    'terminal.inactiveSelectionBackground': '#E5EBF1',
    'terminal.tab.activeBorder': '#005FB8',
    'terminalCursor.foreground': '#005FB8',
    'textBlockQuote.background': '#F8F8F8',
    'textBlockQuote.border': '#E5E5E5',
    'textCodeBlock.background': '#F8F8F8',
    'textLink.activeForeground': '#005FB8',
    'textLink.foreground': '#005FB8',
    'textPreformat.background': '#0000001F',
    'textPreformat.foreground': '#3B3B3B',
    'textSeparator.foreground': '#21262D',
    'titleBar.activeBackground': '#F8F8F8',
    'titleBar.activeForeground': '#1E1E1E',
    'titleBar.border': '#E5E5E5',
    'titleBar.inactiveBackground': '#F8F8F8',
    'titleBar.inactiveForeground': '#8B949E',
    'welcomePage.tileBackground': '#F3F3F3',
    'widget.border': '#E5E5E5'
};
export var ExtensionData;
(function (ExtensionData) {
    function toJSONObject(d) {
        return d && { _extensionId: d.extensionId, _extensionIsBuiltin: d.extensionIsBuiltin, _extensionName: d.extensionName, _extensionPublisher: d.extensionPublisher };
    }
    ExtensionData.toJSONObject = toJSONObject;
    function fromJSONObject(o) {
        if (o && isString(o._extensionId) && isBoolean(o._extensionIsBuiltin) && isString(o._extensionName) && isString(o._extensionPublisher)) {
            return { extensionId: o._extensionId, extensionIsBuiltin: o._extensionIsBuiltin, extensionName: o._extensionName, extensionPublisher: o._extensionPublisher };
        }
        return undefined;
    }
    ExtensionData.fromJSONObject = fromJSONObject;
    function fromName(publisher, name, isBuiltin = false) {
        return { extensionPublisher: publisher, extensionId: `${publisher}.${name}`, extensionName: name, extensionIsBuiltin: isBuiltin };
    }
    ExtensionData.fromName = fromName;
})(ExtensionData || (ExtensionData = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBR3BHLE9BQU8sRUFBZSxhQUFhLEVBQXFDLE1BQU0sbURBQW1ELENBQUM7QUFFbEksT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUl2RSxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxzQkFBc0IsQ0FBd0MsYUFBYSxDQUFDLENBQUM7QUFFbkgsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsR0FBRyxDQUFDO0FBQzFDLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLEdBQUcsQ0FBQztBQUMzQyxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUM7QUFFeEMsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQztBQUU1QyxNQUFNLENBQU4sSUFBWSxhQWdCWDtBQWhCRCxXQUFZLGFBQWE7SUFDeEIscURBQW9DLENBQUE7SUFDcEMsd0RBQXVDLENBQUE7SUFDdkMsa0VBQWlELENBQUE7SUFDakQsdUVBQXNELENBQUE7SUFDdEQsK0VBQThELENBQUE7SUFDOUQsZ0dBQStFLENBQUE7SUFFL0UsMkVBQTBELENBQUE7SUFDMUQsNkVBQTRELENBQUE7SUFDNUQsc0ZBQXFFLENBQUE7SUFDckUsNEZBQTJFLENBQUE7SUFDM0UscUVBQW9ELENBQUE7SUFDcEQsNERBQTJDLENBQUE7SUFFM0MsK0RBQThDLENBQUE7QUFDL0MsQ0FBQyxFQWhCVyxhQUFhLEtBQWIsYUFBYSxRQWdC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