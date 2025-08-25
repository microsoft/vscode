/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { registerColor, editorBackground, contrastBorder, transparent, editorWidgetBackground, textLinkForeground, lighten, darken, focusBorder, activeContrastBorder, editorWidgetForeground, editorErrorForeground, editorWarningForeground, editorInfoForeground, treeIndentGuidesStroke, errorForeground, listActiveSelectionBackground, listActiveSelectionForeground, editorForeground, toolbarHoverBackground, inputBorder, widgetBorder, scrollbarShadow } from '../../platform/theme/common/colorRegistry.js';
import { IColorTheme } from '../../platform/theme/common/themeService.js';
import { Color } from '../../base/common/color.js';
import { ColorScheme } from '../../platform/theme/common/theme.js';

import {
	foreground,
	disabledForeground,
	buttonBackground,
	buttonForeground,
	buttonSecondaryBackground,
	buttonSecondaryForeground,
	checkboxBorder,
	checkboxForeground,
	checkboxBackground,
	inputBackground,
	listHoverBackground,
	listHoverForeground,
	listInactiveSelectionBackground,
	listInactiveSelectionForeground,
	menuBorder,
	textPreformatForeground,
	selectBorder,
	inputActiveOptionBackground,
	inputActiveOptionBorder
} from '../../platform/theme/common/colorRegistry.js';

export function WORKBENCH_BACKGROUND(theme: IColorTheme): Color {
	switch (theme.type) {
		case ColorScheme.LIGHT:
			return Color.fromHex('#F3F3F3');
		case ColorScheme.HIGH_CONTRAST_LIGHT:
			return Color.fromHex('#FFFFFF');
		case ColorScheme.HIGH_CONTRAST_DARK:
			return Color.fromHex('#000000');
		default:
			return Color.fromHex('#252526');
	}
}

// < --- Tabs --- >

//#region Tab Background

export const TAB_ACTIVE_BACKGROUND = registerColor('tab.activeBackground', editorBackground, localize('tabActiveBackground', "Active tab background color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_ACTIVE_BACKGROUND = registerColor('tab.unfocusedActiveBackground', TAB_ACTIVE_BACKGROUND, localize('tabUnfocusedActiveBackground', "Active tab background color in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_INACTIVE_BACKGROUND = registerColor('tab.inactiveBackground', {
	dark: '#2D2D2D',
	light: '#ECECEC',
	hcDark: null,
	hcLight: null,
}, localize('tabInactiveBackground', "Inactive tab background color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_INACTIVE_BACKGROUND = registerColor('tab.unfocusedInactiveBackground', TAB_INACTIVE_BACKGROUND, localize('tabUnfocusedInactiveBackground', "Inactive tab background color in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

//#region Tab Foreground

export const TAB_ACTIVE_FOREGROUND = registerColor('tab.activeForeground', {
	dark: Color.white,
	light: '#333333',
	hcDark: Color.white,
	hcLight: '#292929'
}, localize('tabActiveForeground', "Active tab foreground color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_INACTIVE_FOREGROUND = registerColor('tab.inactiveForeground', {
	dark: transparent(TAB_ACTIVE_FOREGROUND, 0.5),
	light: transparent(TAB_ACTIVE_FOREGROUND, 0.7),
	hcDark: Color.white,
	hcLight: '#292929'
}, localize('tabInactiveForeground', "Inactive tab foreground color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_ACTIVE_FOREGROUND = registerColor('tab.unfocusedActiveForeground', {
	dark: transparent(TAB_ACTIVE_FOREGROUND, 0.5),
	light: transparent(TAB_ACTIVE_FOREGROUND, 0.7),
	hcDark: Color.white,
	hcLight: '#292929'
}, localize('tabUnfocusedActiveForeground', "Active tab foreground color in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_INACTIVE_FOREGROUND = registerColor('tab.unfocusedInactiveForeground', {
	dark: transparent(TAB_INACTIVE_FOREGROUND, 0.5),
	light: transparent(TAB_INACTIVE_FOREGROUND, 0.5),
	hcDark: Color.white,
	hcLight: '#292929'
}, localize('tabUnfocusedInactiveForeground', "Inactive tab foreground color in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

//#region Tab Hover Foreground/Background

export const TAB_HOVER_BACKGROUND = registerColor('tab.hoverBackground', null, localize('tabHoverBackground', "Tab background color when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_HOVER_BACKGROUND = registerColor('tab.unfocusedHoverBackground', {
	dark: transparent(TAB_HOVER_BACKGROUND, 0.5),
	light: transparent(TAB_HOVER_BACKGROUND, 0.7),
	hcDark: null,
	hcLight: null
}, localize('tabUnfocusedHoverBackground', "Tab background color in an unfocused group when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_HOVER_FOREGROUND = registerColor('tab.hoverForeground', null, localize('tabHoverForeground', "Tab foreground color when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_HOVER_FOREGROUND = registerColor('tab.unfocusedHoverForeground', {
	dark: transparent(TAB_HOVER_FOREGROUND, 0.5),
	light: transparent(TAB_HOVER_FOREGROUND, 0.5),
	hcDark: null,
	hcLight: null
}, localize('tabUnfocusedHoverForeground', "Tab foreground color in an unfocused group when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

//#region Tab Borders

export const TAB_BORDER = registerColor('tab.border', {
	dark: '#252526',
	light: '#F3F3F3',
	hcDark: contrastBorder,
	hcLight: contrastBorder,
}, localize('tabBorder', "Border to separate tabs from each other. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_LAST_PINNED_BORDER = registerColor('tab.lastPinnedBorder', {
	dark: treeIndentGuidesStroke,
	light: treeIndentGuidesStroke,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('lastPinnedTabBorder', "Border to separate pinned tabs from other tabs. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_ACTIVE_BORDER = registerColor('tab.activeBorder', null, localize('tabActiveBorder', "Border on the bottom of an active tab. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_ACTIVE_BORDER = registerColor('tab.unfocusedActiveBorder', {
	dark: transparent(TAB_ACTIVE_BORDER, 0.5),
	light: transparent(TAB_ACTIVE_BORDER, 0.7),
	hcDark: null,
	hcLight: null
}, localize('tabActiveUnfocusedBorder', "Border on the bottom of an active tab in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_ACTIVE_BORDER_TOP = registerColor('tab.activeBorderTop', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: '#B5200D'
}, localize('tabActiveBorderTop', "Border to the top of an active tab. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_ACTIVE_BORDER_TOP = registerColor('tab.unfocusedActiveBorderTop', {
	dark: transparent(TAB_ACTIVE_BORDER_TOP, 0.5),
	light: transparent(TAB_ACTIVE_BORDER_TOP, 0.7),
	hcDark: null,
	hcLight: '#B5200D'
}, localize('tabActiveUnfocusedBorderTop', "Border to the top of an active tab in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_SELECTED_BORDER_TOP = registerColor('tab.selectedBorderTop', TAB_ACTIVE_BORDER_TOP, localize('tabSelectedBorderTop', "Border to the top of a selected tab. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_SELECTED_BACKGROUND = registerColor('tab.selectedBackground', TAB_ACTIVE_BACKGROUND, localize('tabSelectedBackground', "Background of a selected tab. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_SELECTED_FOREGROUND = registerColor('tab.selectedForeground', TAB_ACTIVE_FOREGROUND, localize('tabSelectedForeground', "Foreground of a selected tab. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));


export const TAB_HOVER_BORDER = registerColor('tab.hoverBorder', null, localize('tabHoverBorder', "Border to highlight tabs when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_HOVER_BORDER = registerColor('tab.unfocusedHoverBorder', {
	dark: transparent(TAB_HOVER_BORDER, 0.5),
	light: transparent(TAB_HOVER_BORDER, 0.7),
	hcDark: null,
	hcLight: contrastBorder
}, localize('tabUnfocusedHoverBorder', "Border to highlight tabs in an unfocused group when hovering. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

//#region Tab Drag and Drop Border

export const TAB_DRAG_AND_DROP_BORDER = registerColor('tab.dragAndDropBorder', {
	dark: TAB_ACTIVE_FOREGROUND,
	light: TAB_ACTIVE_FOREGROUND,
	hcDark: activeContrastBorder,
	hcLight: activeContrastBorder
}, localize('tabDragAndDropBorder', "Border between tabs to indicate that a tab can be inserted between two tabs. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

//#region Tab Modified Border

export const TAB_ACTIVE_MODIFIED_BORDER = registerColor('tab.activeModifiedBorder', {
	dark: '#3399CC',
	light: '#33AAEE',
	hcDark: null,
	hcLight: contrastBorder
}, localize('tabActiveModifiedBorder', "Border on the top of modified active tabs in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_INACTIVE_MODIFIED_BORDER = registerColor('tab.inactiveModifiedBorder', {
	dark: transparent(TAB_ACTIVE_MODIFIED_BORDER, 0.5),
	light: transparent(TAB_ACTIVE_MODIFIED_BORDER, 0.5),
	hcDark: Color.white,
	hcLight: contrastBorder
}, localize('tabInactiveModifiedBorder', "Border on the top of modified inactive tabs in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER = registerColor('tab.unfocusedActiveModifiedBorder', {
	dark: transparent(TAB_ACTIVE_MODIFIED_BORDER, 0.5),
	light: transparent(TAB_ACTIVE_MODIFIED_BORDER, 0.7),
	hcDark: Color.white,
	hcLight: contrastBorder
}, localize('unfocusedActiveModifiedBorder', "Border on the top of modified active tabs in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER = registerColor('tab.unfocusedInactiveModifiedBorder', {
	dark: transparent(TAB_INACTIVE_MODIFIED_BORDER, 0.5),
	light: transparent(TAB_INACTIVE_MODIFIED_BORDER, 0.5),
	hcDark: Color.white,
	hcLight: contrastBorder
}, localize('unfocusedINactiveModifiedBorder', "Border on the top of modified inactive tabs in an unfocused group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

//#endregion

// < --- Editors --- >

export const EDITOR_PANE_BACKGROUND = registerColor('editorPane.background', editorBackground, localize('editorPaneBackground', "Background color of the editor pane visible on the left and right side of the centered editor layout."));

export const EDITOR_GROUP_EMPTY_BACKGROUND = registerColor('editorGroup.emptyBackground', null, localize('editorGroupEmptyBackground', "Background color of an empty editor group. Editor groups are the containers of editors."));

export const EDITOR_GROUP_FOCUSED_EMPTY_BORDER = registerColor('editorGroup.focusedEmptyBorder', {
	dark: null,
	light: null,
	hcDark: focusBorder,
	hcLight: focusBorder
}, localize('editorGroupFocusedEmptyBorder', "Border color of an empty editor group that is focused. Editor groups are the containers of editors."));

export const EDITOR_GROUP_HEADER_TABS_BACKGROUND = registerColor('editorGroupHeader.tabsBackground', {
	dark: '#252526',
	light: '#F3F3F3',
	hcDark: null,
	hcLight: null
}, localize('tabsContainerBackground', "Background color of the editor group title header when tabs are enabled. Editor groups are the containers of editors."));

export const EDITOR_GROUP_HEADER_TABS_BORDER = registerColor('editorGroupHeader.tabsBorder', null, localize('tabsContainerBorder', "Border color of the editor group title header when tabs are enabled. Editor groups are the containers of editors."));

export const EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND = registerColor('editorGroupHeader.noTabsBackground', editorBackground, localize('editorGroupHeaderBackground', "Background color of the editor group title header when (`\"workbench.editor.showTabs\": \"single\"`). Editor groups are the containers of editors."));

export const EDITOR_GROUP_HEADER_BORDER = registerColor('editorGroupHeader.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('editorTitleContainerBorder', "Border color of the editor group title header. Editor groups are the containers of editors."));

export const EDITOR_GROUP_BORDER = registerColor('editorGroup.border', {
	dark: '#444444',
	light: '#E7E7E7',
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('editorGroupBorder', "Color to separate multiple editor groups from each other. Editor groups are the containers of editors."));

export const EDITOR_DRAG_AND_DROP_BACKGROUND = registerColor('editorGroup.dropBackground', {
	dark: Color.fromHex('#53595D').transparent(0.5),
	light: Color.fromHex('#2677CB').transparent(0.18),
	hcDark: null,
	hcLight: Color.fromHex('#0F4A85').transparent(0.50)
}, localize('editorDragAndDropBackground', "Background color when dragging editors around. The color should have transparency so that the editor contents can still shine through."));

export const EDITOR_DROP_INTO_PROMPT_FOREGROUND = registerColor('editorGroup.dropIntoPromptForeground', editorWidgetForeground, localize('editorDropIntoPromptForeground', "Foreground color of text shown over editors when dragging files. This text informs the user that they can hold shift to drop into the editor."));

export const EDITOR_DROP_INTO_PROMPT_BACKGROUND = registerColor('editorGroup.dropIntoPromptBackground', editorWidgetBackground, localize('editorDropIntoPromptBackground', "Background color of text shown over editors when dragging files. This text informs the user that they can hold shift to drop into the editor."));

export const EDITOR_DROP_INTO_PROMPT_BORDER = registerColor('editorGroup.dropIntoPromptBorder', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('editorDropIntoPromptBorder', "Border color of text shown over editors when dragging files. This text informs the user that they can hold shift to drop into the editor."));

export const SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER = registerColor('sideBySideEditor.horizontalBorder', EDITOR_GROUP_BORDER, localize('sideBySideEditor.horizontalBorder', "Color to separate two editors from each other when shown side by side in an editor group from top to bottom."));

export const SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER = registerColor('sideBySideEditor.verticalBorder', EDITOR_GROUP_BORDER, localize('sideBySideEditor.verticalBorder', "Color to separate two editors from each other when shown side by side in an editor group from left to right."));


// < --- Output Editor -->

const OUTPUT_VIEW_BACKGROUND = registerColor('outputView.background', null, localize('outputViewBackground', "Output view background color."));


registerColor('outputViewStickyScroll.background', OUTPUT_VIEW_BACKGROUND, localize('outputViewStickyScrollBackground', "Output view sticky scroll background color."));


// < --- Banner --- >

export const BANNER_BACKGROUND = registerColor('banner.background', {
	dark: listActiveSelectionBackground,
	light: darken(listActiveSelectionBackground, 0.3),
	hcDark: listActiveSelectionBackground,
	hcLight: listActiveSelectionBackground
}, localize('banner.background', "Banner background color. The banner is shown under the title bar of the window."));

export const BANNER_FOREGROUND = registerColor('banner.foreground', listActiveSelectionForeground, localize('banner.foreground', "Banner foreground color. The banner is shown under the title bar of the window."));

export const BANNER_ICON_FOREGROUND = registerColor('banner.iconForeground', editorInfoForeground, localize('banner.iconForeground', "Banner icon color. The banner is shown under the title bar of the window."));

// < --- Status --- >

export const STATUS_BAR_FOREGROUND = registerColor('statusBar.foreground', {
	dark: '#FFFFFF',
	light: '#FFFFFF',
	hcDark: '#FFFFFF',
	hcLight: editorForeground
}, localize('statusBarForeground', "Status bar foreground color when a workspace or folder is opened. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_NO_FOLDER_FOREGROUND = registerColor('statusBar.noFolderForeground', STATUS_BAR_FOREGROUND, localize('statusBarNoFolderForeground', "Status bar foreground color when no folder is opened. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_BACKGROUND = registerColor('statusBar.background', {
	dark: '#007ACC',
	light: '#007ACC',
	hcDark: null,
	hcLight: null,
}, localize('statusBarBackground', "Status bar background color when a workspace or folder is opened. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_NO_FOLDER_BACKGROUND = registerColor('statusBar.noFolderBackground', {
	dark: '#68217A',
	light: '#68217A',
	hcDark: null,
	hcLight: null,
}, localize('statusBarNoFolderBackground', "Status bar background color when no folder is opened. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_BORDER = registerColor('statusBar.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('statusBarBorder', "Status bar border color separating to the sidebar and editor. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_FOCUS_BORDER = registerColor('statusBar.focusBorder', {
	dark: STATUS_BAR_FOREGROUND,
	light: STATUS_BAR_FOREGROUND,
	hcDark: null,
	hcLight: STATUS_BAR_FOREGROUND
}, localize('statusBarFocusBorder', "Status bar border color when focused on keyboard navigation. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_NO_FOLDER_BORDER = registerColor('statusBar.noFolderBorder', STATUS_BAR_BORDER, localize('statusBarNoFolderBorder', "Status bar border color separating to the sidebar and editor when no folder is opened. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ITEM_ACTIVE_BACKGROUND = registerColor('statusBarItem.activeBackground', {
	dark: Color.white.transparent(0.18),
	light: Color.white.transparent(0.18),
	hcDark: Color.white.transparent(0.18),
	hcLight: Color.black.transparent(0.18)
}, localize('statusBarItemActiveBackground', "Status bar item background color when clicking. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ITEM_FOCUS_BORDER = registerColor('statusBarItem.focusBorder', {
	dark: STATUS_BAR_FOREGROUND,
	light: STATUS_BAR_FOREGROUND,
	hcDark: null,
	hcLight: activeContrastBorder
}, localize('statusBarItemFocusBorder', "Status bar item border color when focused on keyboard navigation. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.hoverBackground', {
	dark: Color.white.transparent(0.12),
	light: Color.white.transparent(0.12),
	hcDark: Color.white.transparent(0.12),
	hcLight: Color.black.transparent(0.12)
}, localize('statusBarItemHoverBackground', "Status bar item background color when hovering. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.hoverForeground', STATUS_BAR_FOREGROUND, localize('statusBarItemHoverForeground', "Status bar item foreground color when hovering. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND = registerColor('statusBarItem.compactHoverBackground', {
	dark: Color.white.transparent(0.20),
	light: Color.white.transparent(0.20),
	hcDark: Color.white.transparent(0.20),
	hcLight: Color.black.transparent(0.20)
}, localize('statusBarItemCompactHoverBackground', "Status bar item background color when hovering an item that contains two hovers. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_PROMINENT_ITEM_FOREGROUND = registerColor('statusBarItem.prominentForeground', STATUS_BAR_FOREGROUND, localize('statusBarProminentItemForeground', "Status bar prominent items foreground color. Prominent items stand out from other status bar entries to indicate importance. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_PROMINENT_ITEM_BACKGROUND = registerColor('statusBarItem.prominentBackground', Color.black.transparent(0.5), localize('statusBarProminentItemBackground', "Status bar prominent items background color. Prominent items stand out from other status bar entries to indicate importance. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_PROMINENT_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.prominentHoverForeground', STATUS_BAR_ITEM_HOVER_FOREGROUND, localize('statusBarProminentItemHoverForeground', "Status bar prominent items foreground color when hovering. Prominent items stand out from other status bar entries to indicate importance. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.prominentHoverBackground', STATUS_BAR_ITEM_HOVER_BACKGROUND, localize('statusBarProminentItemHoverBackground', "Status bar prominent items background color when hovering. Prominent items stand out from other status bar entries to indicate importance. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ERROR_ITEM_BACKGROUND = registerColor('statusBarItem.errorBackground', {
	dark: darken(errorForeground, .4),
	light: darken(errorForeground, .4),
	hcDark: null,
	hcLight: '#B5200D'
}, localize('statusBarErrorItemBackground', "Status bar error items background color. Error items stand out from other status bar entries to indicate error conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ERROR_ITEM_FOREGROUND = registerColor('statusBarItem.errorForeground', Color.white, localize('statusBarErrorItemForeground', "Status bar error items foreground color. Error items stand out from other status bar entries to indicate error conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ERROR_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.errorHoverForeground', STATUS_BAR_ITEM_HOVER_FOREGROUND, localize('statusBarErrorItemHoverForeground', "Status bar error items foreground color when hovering. Error items stand out from other status bar entries to indicate error conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_ERROR_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.errorHoverBackground', STATUS_BAR_ITEM_HOVER_BACKGROUND, localize('statusBarErrorItemHoverBackground', "Status bar error items background color when hovering. Error items stand out from other status bar entries to indicate error conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_WARNING_ITEM_BACKGROUND = registerColor('statusBarItem.warningBackground', {
	dark: darken(editorWarningForeground, .4),
	light: darken(editorWarningForeground, .4),
	hcDark: null,
	hcLight: '#895503'
}, localize('statusBarWarningItemBackground', "Status bar warning items background color. Warning items stand out from other status bar entries to indicate warning conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_WARNING_ITEM_FOREGROUND = registerColor('statusBarItem.warningForeground', Color.white, localize('statusBarWarningItemForeground', "Status bar warning items foreground color. Warning items stand out from other status bar entries to indicate warning conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_WARNING_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.warningHoverForeground', STATUS_BAR_ITEM_HOVER_FOREGROUND, localize('statusBarWarningItemHoverForeground', "Status bar warning items foreground color when hovering. Warning items stand out from other status bar entries to indicate warning conditions. The status bar is shown in the bottom of the window."));

export const STATUS_BAR_WARNING_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.warningHoverBackground', STATUS_BAR_ITEM_HOVER_BACKGROUND, localize('statusBarWarningItemHoverBackground', "Status bar warning items background color when hovering. Warning items stand out from other status bar entries to indicate warning conditions. The status bar is shown in the bottom of the window."));


// < --- Activity Bar --- >

export const ACTIVITY_BAR_BACKGROUND = registerColor('activityBar.background', {
	dark: '#333333',
	light: '#2C2C2C',
	hcDark: '#000000',
	hcLight: '#FFFFFF'
}, localize('activityBarBackground', "Activity bar background color. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_FOREGROUND = registerColor('activityBar.foreground', {
	dark: Color.white,
	light: Color.white,
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('activityBarForeground', "Activity bar item foreground color when it is active. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_INACTIVE_FOREGROUND = registerColor('activityBar.inactiveForeground', {
	dark: transparent(ACTIVITY_BAR_FOREGROUND, 0.4),
	light: transparent(ACTIVITY_BAR_FOREGROUND, 0.4),
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('activityBarInActiveForeground', "Activity bar item foreground color when it is inactive. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_BORDER = registerColor('activityBar.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('activityBarBorder', "Activity bar border color separating to the side bar. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_ACTIVE_BORDER = registerColor('activityBar.activeBorder', {
	dark: ACTIVITY_BAR_FOREGROUND,
	light: ACTIVITY_BAR_FOREGROUND,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('activityBarActiveBorder', "Activity bar border color for the active item. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_ACTIVE_FOCUS_BORDER = registerColor('activityBar.activeFocusBorder', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: '#B5200D'
}, localize('activityBarActiveFocusBorder', "Activity bar focus border color for the active item. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_ACTIVE_BACKGROUND = registerColor('activityBar.activeBackground', null, localize('activityBarActiveBackground', "Activity bar background color for the active item. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_DRAG_AND_DROP_BORDER = registerColor('activityBar.dropBorder', {
	dark: ACTIVITY_BAR_FOREGROUND,
	light: ACTIVITY_BAR_FOREGROUND,
	hcDark: null,
	hcLight: null,
}, localize('activityBarDragAndDropBorder', "Drag and drop feedback color for the activity bar items. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_BADGE_BACKGROUND = registerColor('activityBarBadge.background', {
	dark: '#007ACC',
	light: '#007ACC',
	hcDark: '#000000',
	hcLight: '#0F4A85'
}, localize('activityBarBadgeBackground', "Activity notification badge background color. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_BADGE_FOREGROUND = registerColor('activityBarBadge.foreground', Color.white, localize('activityBarBadgeForeground', "Activity notification badge foreground color. The activity bar is showing on the far left or right and allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_FOREGROUND = registerColor('activityBarTop.foreground', {
	dark: '#E7E7E7',
	light: '#424242',
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('activityBarTop', "Active foreground color of the item in the Activity bar when it is on top / bottom. The activity allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_ACTIVE_BORDER = registerColor('activityBarTop.activeBorder', {
	dark: ACTIVITY_BAR_TOP_FOREGROUND,
	light: ACTIVITY_BAR_TOP_FOREGROUND,
	hcDark: contrastBorder,
	hcLight: '#B5200D'
}, localize('activityBarTopActiveFocusBorder', "Focus border color for the active item in the Activity bar when it is on top / bottom. The activity allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND = registerColor('activityBarTop.activeBackground', null, localize('activityBarTopActiveBackground', "Background color for the active item in the Activity bar when it is on top / bottom. The activity allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND = registerColor('activityBarTop.inactiveForeground', {
	dark: transparent(ACTIVITY_BAR_TOP_FOREGROUND, 0.6),
	light: transparent(ACTIVITY_BAR_TOP_FOREGROUND, 0.75),
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('activityBarTopInActiveForeground', "Inactive foreground color of the item in the Activity bar when it is on top / bottom. The activity allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER = registerColor('activityBarTop.dropBorder', ACTIVITY_BAR_TOP_FOREGROUND, localize('activityBarTopDragAndDropBorder', "Drag and drop feedback color for the items in the Activity bar when it is on top / bottom. The activity allows to switch between views of the side bar."));

export const ACTIVITY_BAR_TOP_BACKGROUND = registerColor('activityBarTop.background', null, localize('activityBarTopBackground', "Background color of the activity bar when set to top / bottom."));


// < --- Panels --- >

export const PANEL_BACKGROUND = registerColor('panel.background', editorBackground, localize('panelBackground', "Panel background color. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_BORDER = registerColor('panel.border', {
	dark: Color.fromHex('#808080').transparent(0.35),
	light: Color.fromHex('#808080').transparent(0.35),
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('panelBorder', "Panel border color to separate the panel from the editor. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_TITLE_BORDER = registerColor('panelTitle.border', {
	dark: null,
	light: null,
	hcDark: PANEL_BORDER,
	hcLight: PANEL_BORDER
}, localize('panelTitleBorder', "Panel title border color on the bottom, separating the title from the views. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_ACTIVE_TITLE_FOREGROUND = registerColor('panelTitle.activeForeground', {
	dark: '#E7E7E7',
	light: '#424242',
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('panelActiveTitleForeground', "Title color for the active panel. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_INACTIVE_TITLE_FOREGROUND = registerColor('panelTitle.inactiveForeground', {
	dark: transparent(PANEL_ACTIVE_TITLE_FOREGROUND, 0.6),
	light: transparent(PANEL_ACTIVE_TITLE_FOREGROUND, 0.75),
	hcDark: Color.white,
	hcLight: editorForeground
}, localize('panelInactiveTitleForeground', "Title color for the inactive panel. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_ACTIVE_TITLE_BORDER = registerColor('panelTitle.activeBorder', {
	dark: PANEL_ACTIVE_TITLE_FOREGROUND,
	light: PANEL_ACTIVE_TITLE_FOREGROUND,
	hcDark: contrastBorder,
	hcLight: '#B5200D'
}, localize('panelActiveTitleBorder', "Border color for the active panel title. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_TITLE_BADGE_BACKGROUND = registerColor('panelTitleBadge.background', ACTIVITY_BAR_BADGE_BACKGROUND, localize('panelTitleBadgeBackground', "Panel title badge background color. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_TITLE_BADGE_FOREGROUND = registerColor('panelTitleBadge.foreground', ACTIVITY_BAR_BADGE_FOREGROUND, localize('panelTitleBadgeForeground', "Panel title badge foreground color. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_INPUT_BORDER = registerColor('panelInput.border', {
	dark: inputBorder,
	light: Color.fromHex('#ddd'),
	hcDark: inputBorder,
	hcLight: inputBorder
}, localize('panelInputBorder', "Input box border for inputs in the panel."));

export const PANEL_DRAG_AND_DROP_BORDER = registerColor('panel.dropBorder', PANEL_ACTIVE_TITLE_FOREGROUND, localize('panelDragAndDropBorder', "Drag and drop feedback color for the panel titles. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_SECTION_DRAG_AND_DROP_BACKGROUND = registerColor('panelSection.dropBackground', EDITOR_DRAG_AND_DROP_BACKGROUND, localize('panelSectionDragAndDropBackground', "Drag and drop feedback color for the panel sections. The color should have transparency so that the panel sections can still shine through. Panels are shown below the editor area and contain views like output and integrated terminal. Panel sections are views nested within the panels."));

export const PANEL_SECTION_HEADER_BACKGROUND = registerColor('panelSectionHeader.background', {
	dark: Color.fromHex('#808080').transparent(0.2),
	light: Color.fromHex('#808080').transparent(0.2),
	hcDark: null,
	hcLight: null,
}, localize('panelSectionHeaderBackground', "Panel section header background color. Panels are shown below the editor area and contain views like output and integrated terminal. Panel sections are views nested within the panels."));

export const PANEL_SECTION_HEADER_FOREGROUND = registerColor('panelSectionHeader.foreground', null, localize('panelSectionHeaderForeground', "Panel section header foreground color. Panels are shown below the editor area and contain views like output and integrated terminal. Panel sections are views nested within the panels."));

export const PANEL_SECTION_HEADER_BORDER = registerColor('panelSectionHeader.border', contrastBorder, localize('panelSectionHeaderBorder', "Panel section header border color used when multiple views are stacked vertically in the panel. Panels are shown below the editor area and contain views like output and integrated terminal. Panel sections are views nested within the panels."));

export const PANEL_SECTION_BORDER = registerColor('panelSection.border', PANEL_BORDER, localize('panelSectionBorder', "Panel section border color used when multiple views are stacked horizontally in the panel. Panels are shown below the editor area and contain views like output and integrated terminal. Panel sections are views nested within the panels."));

export const PANEL_STICKY_SCROLL_BACKGROUND = registerColor('panelStickyScroll.background', PANEL_BACKGROUND, localize('panelStickyScrollBackground', "Background color of sticky scroll in the panel."));

export const PANEL_STICKY_SCROLL_BORDER = registerColor('panelStickyScroll.border', null, localize('panelStickyScrollBorder', "Border color of sticky scroll in the panel."));

export const PANEL_STICKY_SCROLL_SHADOW = registerColor('panelStickyScroll.shadow', scrollbarShadow, localize('panelStickyScrollShadow', "Shadow color of sticky scroll in the panel."));


// < --- Profiles --- >

export const PROFILE_BADGE_BACKGROUND = registerColor('profileBadge.background', {
	dark: '#4D4D4D',
	light: '#C4C4C4',
	hcDark: Color.white,
	hcLight: Color.black
}, localize('profileBadgeBackground', "Profile badge background color. The profile badge shows on top of the settings gear icon in the activity bar."));

export const PROFILE_BADGE_FOREGROUND = registerColor('profileBadge.foreground', {
	dark: Color.white,
	light: '#333333',
	hcDark: Color.black,
	hcLight: Color.white
}, localize('profileBadgeForeground', "Profile badge foreground color. The profile badge shows on top of the settings gear icon in the activity bar."));


// < --- Remote --- >

export const STATUS_BAR_REMOTE_ITEM_BACKGROUND = registerColor('statusBarItem.remoteBackground', ACTIVITY_BAR_BADGE_BACKGROUND, localize('statusBarItemRemoteBackground', "Background color for the remote indicator on the status bar."));

export const STATUS_BAR_REMOTE_ITEM_FOREGROUND = registerColor('statusBarItem.remoteForeground', ACTIVITY_BAR_BADGE_FOREGROUND, localize('statusBarItemRemoteForeground', "Foreground color for the remote indicator on the status bar."));

export const STATUS_BAR_REMOTE_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.remoteHoverForeground', STATUS_BAR_ITEM_HOVER_FOREGROUND, localize('statusBarRemoteItemHoverForeground', "Foreground color for the remote indicator on the status bar when hovering."));

export const STATUS_BAR_REMOTE_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.remoteHoverBackground', {
	dark: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	light: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	hcDark: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	hcLight: null
}, localize('statusBarRemoteItemHoverBackground', "Background color for the remote indicator on the status bar when hovering."));

export const STATUS_BAR_OFFLINE_ITEM_BACKGROUND = registerColor('statusBarItem.offlineBackground', '#6c1717', localize('statusBarItemOfflineBackground', "Status bar item background color when the workbench is offline."));

export const STATUS_BAR_OFFLINE_ITEM_FOREGROUND = registerColor('statusBarItem.offlineForeground', STATUS_BAR_REMOTE_ITEM_FOREGROUND, localize('statusBarItemOfflineForeground', "Status bar item foreground color when the workbench is offline."));

export const STATUS_BAR_OFFLINE_ITEM_HOVER_FOREGROUND = registerColor('statusBarItem.offlineHoverForeground', STATUS_BAR_ITEM_HOVER_FOREGROUND, localize('statusBarOfflineItemHoverForeground', "Status bar item foreground hover color when the workbench is offline."));

export const STATUS_BAR_OFFLINE_ITEM_HOVER_BACKGROUND = registerColor('statusBarItem.offlineHoverBackground', {
	dark: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	light: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	hcDark: STATUS_BAR_ITEM_HOVER_BACKGROUND,
	hcLight: null
}, localize('statusBarOfflineItemHoverBackground', "Status bar item background hover color when the workbench is offline."));

export const EXTENSION_BADGE_BACKGROUND = registerColor('extensionBadge.remoteBackground', ACTIVITY_BAR_BADGE_BACKGROUND, localize('extensionBadge.remoteBackground', "Background color for the remote badge in the extensions view."));
export const EXTENSION_BADGE_FOREGROUND = registerColor('extensionBadge.remoteForeground', ACTIVITY_BAR_BADGE_FOREGROUND, localize('extensionBadge.remoteForeground', "Foreground color for the remote badge in the extensions view."));


// < --- Side Bar --- >

export const SIDE_BAR_BACKGROUND = registerColor('sideBar.background', {
	dark: '#252526',
	light: '#F3F3F3',
	hcDark: '#000000',
	hcLight: '#FFFFFF'
}, localize('sideBarBackground', "Side bar background color. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_FOREGROUND = registerColor('sideBar.foreground', null, localize('sideBarForeground', "Side bar foreground color. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_BORDER = registerColor('sideBar.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('sideBarBorder', "Side bar border color on the side separating to the editor. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_TITLE_BACKGROUND = registerColor('sideBarTitle.background', SIDE_BAR_BACKGROUND, localize('sideBarTitleBackground', "Side bar title background color. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_TITLE_FOREGROUND = registerColor('sideBarTitle.foreground', SIDE_BAR_FOREGROUND, localize('sideBarTitleForeground', "Side bar title foreground color. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_TITLE_BORDER = registerColor('sideBarTitle.border', {
	dark: null,
	light: null,
	hcDark: SIDE_BAR_BORDER,
	hcLight: SIDE_BAR_BORDER
}, localize('sideBarTitleBorder', "Side bar title border color on the bottom, separating the title from the views. The side bar is the container for views like explorer and search."));

export const SIDE_BAR_DRAG_AND_DROP_BACKGROUND = registerColor('sideBar.dropBackground', EDITOR_DRAG_AND_DROP_BACKGROUND, localize('sideBarDragAndDropBackground', "Drag and drop feedback color for the side bar sections. The color should have transparency so that the side bar sections can still shine through. The side bar is the container for views like explorer and search. Side bar sections are views nested within the side bar."));

export const SIDE_BAR_SECTION_HEADER_BACKGROUND = registerColor('sideBarSectionHeader.background', {
	dark: Color.fromHex('#808080').transparent(0.2),
	light: Color.fromHex('#808080').transparent(0.2),
	hcDark: null,
	hcLight: null
}, localize('sideBarSectionHeaderBackground', "Side bar section header background color. The side bar is the container for views like explorer and search. Side bar sections are views nested within the side bar."));

export const SIDE_BAR_SECTION_HEADER_FOREGROUND = registerColor('sideBarSectionHeader.foreground', SIDE_BAR_FOREGROUND, localize('sideBarSectionHeaderForeground', "Side bar section header foreground color. The side bar is the container for views like explorer and search. Side bar sections are views nested within the side bar."));

export const SIDE_BAR_SECTION_HEADER_BORDER = registerColor('sideBarSectionHeader.border', contrastBorder, localize('sideBarSectionHeaderBorder', "Side bar section header border color. The side bar is the container for views like explorer and search. Side bar sections are views nested within the side bar."));

export const ACTIVITY_BAR_TOP_BORDER = registerColor('sideBarActivityBarTop.border', SIDE_BAR_SECTION_HEADER_BORDER, localize('sideBarActivityBarTopBorder', "Border color between the activity bar at the top/bottom and the views."));

export const SIDE_BAR_STICKY_SCROLL_BACKGROUND = registerColor('sideBarStickyScroll.background', SIDE_BAR_BACKGROUND, localize('sideBarStickyScrollBackground', "Background color of sticky scroll in the side bar."));

export const SIDE_BAR_STICKY_SCROLL_BORDER = registerColor('sideBarStickyScroll.border', null, localize('sideBarStickyScrollBorder', "Border color of sticky scroll in the side bar."));

export const SIDE_BAR_STICKY_SCROLL_SHADOW = registerColor('sideBarStickyScroll.shadow', scrollbarShadow, localize('sideBarStickyScrollShadow', "Shadow color of sticky scroll in the side bar."));

// < --- Title Bar --- >

export const TITLE_BAR_ACTIVE_FOREGROUND = registerColor('titleBar.activeForeground', {
	dark: '#CCCCCC',
	light: '#333333',
	hcDark: '#FFFFFF',
	hcLight: '#292929'
}, localize('titleBarActiveForeground', "Title bar foreground when the window is active."));

export const TITLE_BAR_INACTIVE_FOREGROUND = registerColor('titleBar.inactiveForeground', {
	dark: transparent(TITLE_BAR_ACTIVE_FOREGROUND, 0.6),
	light: transparent(TITLE_BAR_ACTIVE_FOREGROUND, 0.6),
	hcDark: null,
	hcLight: '#292929'
}, localize('titleBarInactiveForeground', "Title bar foreground when the window is inactive."));

export const TITLE_BAR_ACTIVE_BACKGROUND = registerColor('titleBar.activeBackground', {
	dark: '#3C3C3C',
	light: '#DDDDDD',
	hcDark: '#000000',
	hcLight: '#FFFFFF'
}, localize('titleBarActiveBackground', "Title bar background when the window is active."));

export const TITLE_BAR_INACTIVE_BACKGROUND = registerColor('titleBar.inactiveBackground', {
	dark: transparent(TITLE_BAR_ACTIVE_BACKGROUND, 0.6),
	light: transparent(TITLE_BAR_ACTIVE_BACKGROUND, 0.6),
	hcDark: null,
	hcLight: null,
}, localize('titleBarInactiveBackground', "Title bar background when the window is inactive."));

export const TITLE_BAR_BORDER = registerColor('titleBar.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('titleBarBorder', "Title bar border color."));

// < --- Menubar --- >

export const MENUBAR_SELECTION_FOREGROUND = registerColor('menubar.selectionForeground', TITLE_BAR_ACTIVE_FOREGROUND, localize('menubarSelectionForeground', "Foreground color of the selected menu item in the menubar."));

export const MENUBAR_SELECTION_BACKGROUND = registerColor('menubar.selectionBackground', {
	dark: toolbarHoverBackground,
	light: toolbarHoverBackground,
	hcDark: null,
	hcLight: null,
}, localize('menubarSelectionBackground', "Background color of the selected menu item in the menubar."));

export const MENUBAR_SELECTION_BORDER = registerColor('menubar.selectionBorder', {
	dark: null,
	light: null,
	hcDark: activeContrastBorder,
	hcLight: activeContrastBorder,
}, localize('menubarSelectionBorder', "Border color of the selected menu item in the menubar."));

// < --- Command Center --- >

// foreground (inactive and active)
export const COMMAND_CENTER_FOREGROUND = registerColor(
	'commandCenter.foreground',
	TITLE_BAR_ACTIVE_FOREGROUND,
	localize('commandCenter-foreground', "Foreground color of the command center"),
	false
);
export const COMMAND_CENTER_ACTIVEFOREGROUND = registerColor(
	'commandCenter.activeForeground',
	MENUBAR_SELECTION_FOREGROUND,
	localize('commandCenter-activeForeground', "Active foreground color of the command center"),
	false
);
export const COMMAND_CENTER_INACTIVEFOREGROUND = registerColor(
	'commandCenter.inactiveForeground',
	TITLE_BAR_INACTIVE_FOREGROUND,
	localize('commandCenter-inactiveForeground', "Foreground color of the command center when the window is inactive"),
	false
);
// background (inactive and active)
export const COMMAND_CENTER_BACKGROUND = registerColor(
	'commandCenter.background',
	{ dark: Color.white.transparent(0.05), hcDark: null, light: Color.black.transparent(0.05), hcLight: null },
	localize('commandCenter-background', "Background color of the command center"),
	false
);
export const COMMAND_CENTER_ACTIVEBACKGROUND = registerColor(
	'commandCenter.activeBackground',
	{ dark: Color.white.transparent(0.08), hcDark: MENUBAR_SELECTION_BACKGROUND, light: Color.black.transparent(0.08), hcLight: MENUBAR_SELECTION_BACKGROUND },
	localize('commandCenter-activeBackground', "Active background color of the command center"),
	false
);
// border: active and inactive. defaults to active background
export const COMMAND_CENTER_BORDER = registerColor(
	'commandCenter.border', { dark: transparent(TITLE_BAR_ACTIVE_FOREGROUND, .20), hcDark: contrastBorder, light: transparent(TITLE_BAR_ACTIVE_FOREGROUND, .20), hcLight: contrastBorder },
	localize('commandCenter-border', "Border color of the command center"),
	false
);
export const COMMAND_CENTER_ACTIVEBORDER = registerColor(
	'commandCenter.activeBorder', { dark: transparent(TITLE_BAR_ACTIVE_FOREGROUND, .30), hcDark: TITLE_BAR_ACTIVE_FOREGROUND, light: transparent(TITLE_BAR_ACTIVE_FOREGROUND, .30), hcLight: TITLE_BAR_ACTIVE_FOREGROUND },
	localize('commandCenter-activeBorder', "Active border color of the command center"),
	false
);
// border: defaults to active background
export const COMMAND_CENTER_INACTIVEBORDER = registerColor(
	'commandCenter.inactiveBorder', transparent(TITLE_BAR_INACTIVE_FOREGROUND, .25),
	localize('commandCenter-inactiveBorder', "Border color of the command center when the window is inactive"),
	false
);


// < --- Notifications --- >

export const NOTIFICATIONS_CENTER_BORDER = registerColor('notificationCenter.border', {
	dark: widgetBorder,
	light: widgetBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('notificationCenterBorder', "Notifications center border color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_TOAST_BORDER = registerColor('notificationToast.border', {
	dark: widgetBorder,
	light: widgetBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('notificationToastBorder', "Notification toast border color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_FOREGROUND = registerColor('notifications.foreground', editorWidgetForeground, localize('notificationsForeground', "Notifications foreground color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_BACKGROUND = registerColor('notifications.background', editorWidgetBackground, localize('notificationsBackground', "Notifications background color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_LINKS = registerColor('notificationLink.foreground', textLinkForeground, localize('notificationsLink', "Notification links foreground color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_CENTER_HEADER_FOREGROUND = registerColor('notificationCenterHeader.foreground', null, localize('notificationCenterHeaderForeground', "Notifications center header foreground color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_CENTER_HEADER_BACKGROUND = registerColor('notificationCenterHeader.background', {
	dark: lighten(NOTIFICATIONS_BACKGROUND, 0.3),
	light: darken(NOTIFICATIONS_BACKGROUND, 0.05),
	hcDark: NOTIFICATIONS_BACKGROUND,
	hcLight: NOTIFICATIONS_BACKGROUND
}, localize('notificationCenterHeaderBackground', "Notifications center header background color. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_BORDER = registerColor('notifications.border', NOTIFICATIONS_CENTER_HEADER_BACKGROUND, localize('notificationsBorder', "Notifications border color separating from other notifications in the notifications center. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_ERROR_ICON_FOREGROUND = registerColor('notificationsErrorIcon.foreground', editorErrorForeground, localize('notificationsErrorIconForeground', "The color used for the icon of error notifications. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_WARNING_ICON_FOREGROUND = registerColor('notificationsWarningIcon.foreground', editorWarningForeground, localize('notificationsWarningIconForeground', "The color used for the icon of warning notifications. Notifications slide in from the bottom right of the window."));

export const NOTIFICATIONS_INFO_ICON_FOREGROUND = registerColor('notificationsInfoIcon.foreground', editorInfoForeground, localize('notificationsInfoIconForeground', "The color used for the icon of info notifications. Notifications slide in from the bottom right of the window."));

export const WINDOW_ACTIVE_BORDER = registerColor('window.activeBorder', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('windowActiveBorder', "The color used for the border of the window when it is active on macOS or Linux. Requires custom title bar style and custom or hidden window controls on Linux."));

export const WINDOW_INACTIVE_BORDER = registerColor('window.inactiveBorder', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('windowInactiveBorder', "The color used for the border of the window when it is inactive on macOS or Linux. Requires custom title bar style and custom or hidden window controls on Linux."));

// Erdos error foreground color.
export const ERDOS_ERROR_FOREGROUND = registerColor('erdosError.foreground', {
	dark: errorForeground,
	light: errorForeground,
	hcDark: errorForeground,
	hcLight: errorForeground
}, localize('erdosError.foreground', "Erdos error foreground color."));

// Erdos scroll bar border color.
export const ERDOS_SCROLL_BAR_BORDER = registerColor('erdosScrollBar.border', {
	dark: scrollbarShadow,
	light: scrollbarShadow,
	hcDark: scrollbarShadow,
	hcLight: scrollbarShadow
}, localize('erdosScrollBar.border', "Erdos scroll bar border color."));

// Erdos splitter expand/collapse button background color.
export const ERDOS_SPLITTER_EXPAND_COLLAPSE_BUTTON_BACKGROUND = registerColor('erdosSplitterExpandCollapseButton.background', {
	dark: transparent(editorWidgetBackground, 0.8),
	light: transparent(editorWidgetBackground, 0.8),
	hcDark: editorWidgetBackground,
	hcLight: editorWidgetBackground
}, localize('erdosSplitterExpandCollapseButton.background', "Erdos splitter expand/collapse button background color."));

// Erdos splitter expand/collapse button foreground color.
export const ERDOS_SPLITTER_EXPAND_COLLAPSE_BUTTON_FOREGROUND = registerColor('erdosSplitterExpandCollapseButton.foreground', {
	dark: editorWidgetForeground,
	light: editorWidgetForeground,
	hcDark: editorWidgetForeground,
	hcLight: editorWidgetForeground
}, localize('erdosSplitterExpandCollapseButton.foreground', "Erdos splitter expand/collapse button foreground color."));

// Erdos tool tip background color.
export const ERDOS_TOOL_TIP_BACKGROUND = registerColor('erdosToolTip.background', {
	dark: editorWidgetBackground,
	light: editorWidgetBackground,
	hcDark: editorWidgetBackground,
	hcLight: editorWidgetBackground
}, localize('erdosToolTip.background', "Erdos tool tip background color."));

// Erdos tool tip border color.
export const ERDOS_TOOL_TIP_BORDER = registerColor('erdosToolTip.border', {
	dark: widgetBorder,
	light: widgetBorder,
	hcDark: widgetBorder,
	hcLight: widgetBorder
}, localize('erdosToolTip.border', "Erdos tool tip border color."));

// Erdos context menu background color.
export const ERDOS_CONTEXT_MENU_BACKGROUND = registerColor('erdosContextMenu.background', {
	dark: editorWidgetBackground,
	light: editorWidgetBackground,
	hcDark: editorWidgetBackground,
	hcLight: editorWidgetBackground
}, localize('erdosContextMenu.background', "Erdos context menu background color."));

// Erdos context menu foreground color.
export const ERDOS_CONTEXT_MENU_FOREGROUND = registerColor('erdosContextMenu.foreground', {
	dark: editorWidgetForeground,
	light: editorWidgetForeground,
	hcDark: editorWidgetForeground,
	hcLight: editorWidgetForeground
}, localize('erdosContextMenu.foreground', "Erdos context menu foreground color."));

// Erdos context menu hover background color.
export const ERDOS_CONTEXT_MENU_HOVER_BACKGROUND = registerColor('erdosContextMenu.hoverBackground', {
	dark: listHoverBackground,
	light: listHoverBackground,
	hcDark: listHoverBackground,
	hcLight: listHoverBackground
}, localize('erdosContextMenu.hoverBackground', "Erdos context menu hover background color."));

// Erdos context menu hover foreground color.
export const ERDOS_CONTEXT_MENU_HOVER_FOREGROUND = registerColor('erdosContextMenu.hoverForeground', {
	dark: listHoverForeground,
	light: listHoverForeground,
	hcDark: listHoverForeground,
	hcLight: listHoverForeground
}, localize('erdosContextMenu.hoverForeground', "Erdos context menu hover foreground color."));

// Erdos context menu action hover background color.
export const ERDOS_CONTEXT_MENU_ACTION_HOVER_BACKGROUND = registerColor('erdosContextMenu.actionHoverBackground', {
	dark: darken(listHoverBackground, 0.2),
	light: darken(listHoverBackground, 0.1),
	hcDark: listActiveSelectionBackground,
	hcLight: listActiveSelectionBackground
}, localize('erdosContextMenu.actionHoverBackground', "Erdos context menu action hover background color."));

// Erdos context menu separator background color.
export const ERDOS_CONTEXT_MENU_SEPARATOR_BACKGROUND = registerColor('erdosContextMenu.separatorBackground', {
	dark: menuBorder,
	light: menuBorder,
	hcDark: menuBorder,
	hcLight: menuBorder
}, localize('erdosContextMenu.separatorBackground', "Erdos context menu separator background color."));

// Erdos modal dialog background color.
export const ERDOS_MODAL_DIALOG_BACKGROUND = registerColor('erdosModalDialog.background', {
	dark: editorBackground,
	light: editorBackground,
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosModalDialog.background', "Erdos modal dialog background color."));

// Erdos modal dialog foreground color.
export const ERDOS_MODAL_DIALOG_FOREGROUND = registerColor('erdosModalDialog.foreground', {
	dark: foreground,
	light: foreground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosModalDialog.foreground', "Erdos modal dialog foreground color."));

// Erdos modal dialog contrast background color.
export const ERDOS_MODAL_DIALOG_CONTRAST_BACKGROUND = registerColor('erdosModalDialog.contrastBackground', {
	dark: lighten(ERDOS_MODAL_DIALOG_BACKGROUND, 0.2),
	light: darken(ERDOS_MODAL_DIALOG_BACKGROUND, 0.2),
	hcDark: '#3a3d41',
	hcLight: darken(ERDOS_MODAL_DIALOG_BACKGROUND, 0.2)
}, localize('erdosModalDialog.contrastBackground', "Erdos modal dialog contrast background color."));

// Erdos modal dialog border color.
export const ERDOS_MODAL_DIALOG_BORDER = registerColor('erdosModalDialog.border', {
	dark: selectBorder,
	light: selectBorder,
	hcDark: selectBorder,
	hcLight: selectBorder
}, localize('erdosModalDialog.border', "Erdos modal dialog border color."));

// Erdos modal dialog separator color.
export const ERDOS_MODAL_DIALOG_SEPARATOR = registerColor('erdosModalDialog.separator', {
	dark: '#3a3d41',
	light: darken(ERDOS_MODAL_DIALOG_BACKGROUND, 0.2),
	hcDark: '#3a3d41',
	hcLight: darken(ERDOS_MODAL_DIALOG_BACKGROUND, 0.2)
}, localize('erdosModalDialog.separator', "Erdos modal dialog separator color."));

// Erdos modal dialog preformatted text foreground color.
export const ERDOS_MODAL_DIALOG_PREFORMATTED_TEXT_FOREGROUND = registerColor('erdosModalDialog.preformattedTextForeground', {
	dark: textPreformatForeground,
	light: textPreformatForeground,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('erdosModalDialog.preformattedTextForeground', "Erdos modal dialog preformatted text foreground color."));

// Erdos modal dialog title bar background color.
export const ERDOS_MODAL_DIALOG_TITLE_BAR_BACKGROUND = registerColor('erdosModalDialog.titleBarBackground', {
	dark: ACTIVITY_BAR_BACKGROUND,
	light: ACTIVITY_BAR_BACKGROUND,
	hcDark: ACTIVITY_BAR_BACKGROUND,
	hcLight: ACTIVITY_BAR_BACKGROUND
}, localize('erdosModalDialog.titleBarBackground', "Erdos modal dialog title bar background color."));

// Erdos modal dialog title bar foreground color.
export const ERDOS_MODAL_DIALOG_TITLE_BAR_FOREGROUND = registerColor('erdosModalDialog.titleBarForeground', {
	dark: ACTIVITY_BAR_FOREGROUND,
	light: ACTIVITY_BAR_FOREGROUND,
	hcDark: ACTIVITY_BAR_FOREGROUND,
	hcLight: ACTIVITY_BAR_FOREGROUND
}, localize('erdosModalDialog.titleBarForeground', "Erdos modal dialog title bar foreground color."));

// Erdos modal dialog button background color.
export const ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND = registerColor('erdosModalDialog.buttonBackground', {
	dark: buttonSecondaryBackground,
	light: buttonSecondaryBackground,
	hcDark: null,
	hcLight: null
}, localize('erdosModalDialog.buttonBackground', "Erdos modal dialog button background color."));

// Erdos modal dialog button hover background color.
export const ERDOS_MODAL_DIALOG_BUTTON_HOVER_BACKGROUND = registerColor('erdosModalDialog.buttonHoverBackground', {
	dark: lighten(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	light: darken(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	hcDark: lighten(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	hcLight: darken(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15)
}, localize('erdosModalDialog.buttonHoverBackground', "Erdos modal dialog button hover background color."));

// Erdos modal dialog button background color.
export const ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_BACKGROUND = registerColor('erdosModalDialog.defaultButtonBackground', {
	dark: buttonBackground,
	light: buttonBackground,
	hcDark: buttonBackground,
	hcLight: buttonBackground
}, localize('erdosModalDialog.defaultButtonBackground', "Erdos modal dialog default button background color."));

// Erdos modal dialog button hover background color.
export const ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_HOVER_BACKGROUND = registerColor('erdosModalDialog.defaultButtonHoverBackground', {
	dark: lighten(ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_BACKGROUND, 0.15),
	light: darken(ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_BACKGROUND, 0.15),
	hcDark: lighten(ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_BACKGROUND, 0.15),
	hcLight: darken(ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_BACKGROUND, 0.15)
}, localize('erdosModalDialog.defaultButtonHoverBackground', "Erdos modal dialog default button hover background color."));

// Erdos modal dialog button active background color.
export const ERDOS_MODAL_DIALOG_BUTTON_ACTIVE_BACKGROUND = registerColor('erdosModalDialog.buttonActiveBackground', {
	dark: lighten(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	light: darken(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	hcDark: lighten(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15),
	hcLight: darken(ERDOS_MODAL_DIALOG_BUTTON_BACKGROUND, 0.15)
}, localize('erdosModalDialog.buttonActiveBackground', "Erdos modal dialog button active background color."));

// Erdos modal dialog button disabled background color.
export const ERDOS_MODAL_DIALOG_BUTTON_DISABLED_BACKGROUND = registerColor('erdosModalDialog.buttonDisabledBackground', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, localize('erdosModalDialog.buttonDisabledBackground', "Erdos modal dialog button disabled background color."));

// Erdos modal dialog button foreground color.
export const ERDOS_MODAL_DIALOG_BUTTON_FOREGROUND = registerColor('erdosModalDialog.buttonForeground', {
	dark: buttonSecondaryForeground,
	light: buttonSecondaryForeground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosModalDialog.buttonForeground', "Erdos modal dialog button foreground color."));

// Erdos modal dialog button foreground color.
export const ERDOS_MODAL_DIALOG_DEFAULT_BUTTON_FOREGROUND = registerColor('erdosModalDialog.defaultButtonForeground', {
	dark: buttonForeground,
	light: buttonForeground,
	hcDark: buttonForeground,
	hcLight: buttonForeground
}, localize('erdosModalDialog.defaultButtonForeground', "Erdos modal dialog default button foreground color."));

// Erdos modal dialog button destructive background color.
export const ERDOS_MODAL_DIALOG_BUTTON_DESTRUCTIVE_BACKGROUND = registerColor('erdosModalDialog.buttonDestructiveBackground', {
	dark: buttonSecondaryBackground,
	light: buttonSecondaryBackground,
	hcDark: buttonSecondaryBackground,
	hcLight: buttonSecondaryBackground
}, localize('erdosModalDialog.buttonDestructiveBackground', "Erdos modal dialog button destructive background color."));

// Erdos modal dialog button destructive foreground color.
export const ERDOS_MODAL_DIALOG_BUTTON_DESTRUCTIVE_FOREGROUND = registerColor('erdosModalDialog.buttonDestructiveForeground', {
	dark: buttonSecondaryForeground,
	light: buttonSecondaryForeground,
	hcDark: buttonSecondaryForeground,
	hcLight: buttonSecondaryForeground
}, localize('erdosModalDialog.buttonDestructiveForeground', "Erdos modal dialog button destructive foreground color."));

// Erdos modal dialog button disabled foreground color.
export const ERDOS_MODAL_DIALOG_BUTTON_DISABLED_FOREGROUND = registerColor('erdosModalDialog.buttonDisabledForeground', {
	dark: disabledForeground,
	light: disabledForeground,
	hcDark: disabledForeground,
	hcLight: disabledForeground
}, localize('erdosModalDialog.buttonDisabledForeground', "Erdos modal dialog button disabled foreground color."));

// Erdos modal dialog button border color.
export const ERDOS_MODAL_DIALOG_BUTTON_BORDER = registerColor('erdosModalDialog.buttonBorder', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('erdosModalDialog.buttonBorder', "Erdos modal dialog button border color."));

// Erdos modal dialog button disabled border color.
export const ERDOS_MODAL_DIALOG_BUTTON_DISABLED_BORDER = registerColor('erdosModalDialog.buttonDisabledBorder', {
	dark: disabledForeground,
	light: disabledForeground,
	hcDark: disabledForeground,
	hcLight: disabledForeground
}, localize('erdosModalDialog.buttonDisabledBorder', "Erdos modal dialog button disabled border color."));

// Erdos modal dialog text input background color.
export const ERDOS_MODAL_DIALOG_TEXT_INPUT_BACKGROUND = registerColor('erdosModalDialog.textInputBackground', {
	dark: '#292f32',
	light: '#ffffff',
	hcDark: inputBackground,
	hcLight: inputBackground
}, localize('erdosModalDialog.textInputBackground', "Erdos modal dialog text input background color."));

// Erdos modal dialog text input border color.
export const ERDOS_MODAL_DIALOG_TEXT_INPUT_BORDER = registerColor('erdosModalDialog.textInputBorder', {
	dark: '#292f32',
	light: '#a6a6a6',
	hcDark: inputBorder,
	hcLight: inputBorder
}, localize('erdosModalDialog.textInputBorder', "Erdos modal dialog text input border."));

// Erdos modal dialog text input selection foreground color.
export const ERDOS_MODAL_DIALOG_TEXT_INPUT_SELECTION_FOREGROUND = registerColor('erdosModalDialog.textInputSelectionForeground', {
	dark: '#ffffff',
	light: '#ffffff',
	hcDark: '#ffffff',
	hcLight: '#ffffff'
}, localize('erdosModalDialog.textInputSelectionForeground', "Erdos modal dialog text input selection foreground color."));

// Erdos modal dialog text input selection background color.
export const ERDOS_MODAL_DIALOG_TEXT_INPUT_SELECTION_BACKGROUND = registerColor('erdosModalDialog.textInputSelectionBackground', {
	dark: '#0e639c',
	light: '#007acc',
	hcDark: '#0e639c',
	hcLight: '#007acc'
}, localize('erdosModalDialog.textInputSelectionBackground', "Erdos modal dialog text input selection background color."));

// Erdos modal dialog checkbox background color.
export const ERDOS_MODAL_DIALOG_CHECKBOX_BACKGROUND = registerColor('erdosModalDialog.checkboxBackground', {
	dark: '#292f32',
	light: '#ffffff',
	hcDark: checkboxBackground,
	hcLight: checkboxBackground
}, localize('erdosModalDialog.checkboxBackground', "Erdos modal dialog checkbox background color."));

// Erdos modal dialog checkbox foreground color.
export const ERDOS_MODAL_DIALOG_CHECKBOX_FOREGROUND = registerColor('erdosModalDialog.checkboxForeground', {
	dark: foreground,
	light: '#000000',
	hcDark: checkboxForeground,
	hcLight: checkboxForeground
}, localize('erdosModalDialog.checkboxForeground', "Erdos modal dialog checkbox foreground."));

// Erdos modal dialog checkbox border color.
export const ERDOS_MODAL_DIALOG_CHECKBOX_BORDER = registerColor('erdosModalDialog.checkboxBorder', {
	dark: '#292f32',
	light: '#a6a6a6',
	hcDark: checkboxBorder,
	hcLight: checkboxBorder
}, localize('erdosModalDialog.checkboxBorder', "Erdos modal dialog checkbox border."));

// Erdos modal dialog radio button background color.
export const ERDOS_MODAL_DIALOG_RADIO_BUTTON_BACKGROUND = registerColor('erdosModalDialog.radioButtonBackground', {
	dark: buttonSecondaryBackground,
	light: editorBackground,
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosModalDialog.radioButtonBackground', "Erdos modal dialog radio button background color."));

// Erdos modal dialog radio button foreground color.
export const ERDOS_MODAL_DIALOG_RADIO_BUTTON_FOREGROUND = registerColor('erdosModalDialog.radioButtonForeground', {
	dark: foreground,
	light: foreground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosModalDialog.radioButtonForeground', "Erdos modal dialog radio button foreground color."));

// Erdos modal dialog radio button border color.
export const ERDOS_MODAL_DIALOG_RADIO_BUTTON_BORDER = registerColor('erdosModalDialog.radioButtonBorder', {
	dark: selectBorder,
	light: selectBorder,
	hcDark: selectBorder,
	hcLight: selectBorder
}, localize('erdosModalDialog.radioButtonBorder', "Erdos modal dialog radio button border color."));

// Erdos modal dialog project type background color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BACKGROUND = registerColor('erdosModalDialog.projectTypeBackground', {
	dark: buttonSecondaryBackground,
	light: darken(editorBackground, 0.05),
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosModalDialog.projectTypeBackground', "Erdos modal dialog project type background color."));

// Erdos modal dialog project type hover background color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BACKGROUND_HOVER = registerColor('erdosModalDialog.projectTypeBackgroundHover', {
	dark: inputActiveOptionBackground,
	light: inputActiveOptionBackground,
	hcDark: inputActiveOptionBackground,
	hcLight: inputActiveOptionBackground
}, localize('erdosModalDialog.projectTypeBackgroundHover', "Erdos modal dialog project type background hover color."));

// Erdos modal dialog project type background selected color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BACKGROUND_SELECTED = registerColor('erdosModalDialog.projectTypeBackgroundSelected', {
	dark: inputActiveOptionBackground,
	light: inputActiveOptionBackground,
	hcDark: inputActiveOptionBackground,
	hcLight: inputActiveOptionBackground
}, localize('erdosModalDialog.projectTypeBackgroundSelected', "Erdos modal dialog project type background selected color."));

// Erdos modal dialog project type foreground color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_FOREGROUND = registerColor('erdosModalDialog.projectTypeForeground', {
	dark: editorForeground,
	light: editorForeground,
	hcDark: editorForeground,
	hcLight: editorForeground
}, localize('erdosModalDialog.projectTypeForeground', "Erdos modal dialog project type foreground color."));

// Erdos modal dialog project type foreground hover color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_FOREGROUND_HOVER = registerColor('erdosModalDialog.projectTypeForegroundHover', {
	dark: listHoverForeground,
	light: listHoverForeground,
	hcDark: listHoverForeground,
	hcLight: listHoverForeground
}, localize('erdosModalDialog.projectTypeForegroundHover', "Erdos modal dialog project type foreground hover color."));

// Erdos modal dialog project type foreground selected color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_FOREGROUND_SELECTED = registerColor('erdosModalDialog.projectTypeForegroundSelected', {
	dark: listInactiveSelectionForeground,
	light: listInactiveSelectionForeground,
	hcDark: listHoverForeground,
	hcLight: listHoverForeground
}, localize('erdosModalDialog.projectTypeForegroundSelected', "Erdos modal dialog project type foreground selected color."));

// Erdos modal dialog project type border color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BORDER = registerColor('erdosModalDialog.projectTypeBorder', {
	dark: buttonSecondaryBackground,
	light: darken(editorBackground, 0.05),
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('erdosModalDialog.projectTypeBorder', "Erdos modal dialog project type border color."));

// Erdos modal dialog project type border color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BORDER_HOVER = registerColor('erdosModalDialog.projectTypeBorderHover', {
	dark: darken(editorForeground, 0.25),
	light: focusBorder,
	hcDark: activeContrastBorder,
	hcLight: activeContrastBorder
}, localize('erdosModalDialog.projectTypeBorderHover', "Erdos modal dialog project type border hover color."));

// Erdos modal dialog project type border selected color.
export const ERDOS_MODAL_DIALOG_PROJECT_TYPE_BORDER_SELECTED = registerColor('erdosModalDialog.projectTypeBorderSelected', {
	dark: inputActiveOptionBorder,
	light: inputActiveOptionBorder,
	hcDark: inputActiveOptionBorder,
	hcLight: inputActiveOptionBorder
}, localize('erdosModalDialog.projectTypeBorderSelected', "Erdos modal dialog project type border selected color."));

export const ERDOS_ICON_BUTTON_BORDER = registerColor('erdosIconButton.border', {
	dark: inputActiveOptionBorder,
	light: inputActiveOptionBorder,
	hcDark: inputActiveOptionBorder,
	hcLight: inputActiveOptionBorder
}, localize('erdosIconButton.border', "Erdos icon button border color."));

export const ERDOS_ICON_BUTTON_BACKGROUND = registerColor('erdosIconButton.background', {
	dark: inputActiveOptionBackground,
	light: inputActiveOptionBackground,
	hcDark: inputActiveOptionBackground,
	hcLight: inputActiveOptionBackground
}, localize('erdosIconButton.background', "Erdos icon button background color."));

// Erdos drop down border color.
export const ERDOS_DROP_DOWN_BORDER = registerColor('erdosDropDownListBox.border', {
	dark: selectBorder,
	light: selectBorder,
	hcDark: selectBorder,
	hcLight: selectBorder
}, localize('erdosDropDown.border', "Erdos drop down border color."));


// Erdos drop down list box background.
export const ERDOS_DROP_DOWN_BACKGROUND = registerColor('erdosDropDownListBox.background', {
	dark: editorBackground,
	light: editorBackground,
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosDropDownListBox.background', "Erdos drop down list box background color."));

// Erdos drop down list box foreground color.
export const ERDOS_DROP_DOWN_FOREGROUND = registerColor('erdosDropDownListBox.foreground', {
	dark: foreground,
	light: foreground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosDropDownListBox.foreground', "Erdos drop down list box foreground color."));

// Erdos drop down list box hover background.
export const ERDOS_DROP_DOWN_HOVER_BACKGROUND = registerColor('erdosDropDownListBox.hoverBackground', {
	dark: listHoverBackground,
	light: listHoverBackground,
	hcDark: listHoverBackground,
	hcLight: listHoverBackground
}, localize('erdosDropDownListBox.hoverBackground', "Erdos drop down list box hover background color."));

// Erdos drop down list box hover foreground.
export const ERDOS_DROP_DOWN_HOVER_FOREGROUND = registerColor('erdosDropDownListBox.hoverForeground', {
	dark: listHoverForeground,
	light: listHoverForeground,
	hcDark: listHoverForeground,
	hcLight: listHoverForeground
}, localize('erdosDropDownListBox.hoverForeground', "Erdos drop down list box hover foreground color."));

// Erdos drop down list box action hover background.
export const ERDOS_DROP_DOWN_ACTION_HOVER_BACKGROUND = registerColor('erdosDropDownListBox.actionHoverBackground', {
	dark: darken(listHoverBackground, 0.2),
	light: darken(listHoverBackground, 0.1),
	hcDark: listActiveSelectionBackground,
	hcLight: listActiveSelectionBackground
}, localize('erdosDropDownListBox.actionHoverBackground', "Erdos drop down list box action hover background color."));

// Erdos drop down list box separator background.
export const ERDOS_DROP_DOWN_SEPARATOR_BACKGROUND = registerColor('erdosDropDownListBox.separatorBackground', {
	dark: menuBorder,
	light: menuBorder,
	hcDark: menuBorder,
	hcLight: menuBorder
}, localize('erdosDropDownListBox.separatorBackground', "Erdos drop down list box separator background color."));

// Erdos action bar border color.
export const ERDOS_ACTION_BAR_BORDER = registerColor('erdosActionBar.border', {
	dark: widgetBorder,
	light: widgetBorder,
	hcDark: widgetBorder,
	hcLight: widgetBorder
}, localize('erdosActionBar.border', "Erdos action bar border color."));

// Erdos action bar background color.
export const ERDOS_ACTION_BAR_BACKGROUND = registerColor('erdosActionBar.background', {
	dark: editorBackground,
	light: editorBackground,
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosActionBar.background', "Erdos action bar background color."));

// Erdos action bar foreground color.
export const ERDOS_ACTION_BAR_FOREGROUND = registerColor('erdosActionBar.foreground', {
	dark: foreground,
	light: foreground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosActionBar.foreground', "Erdos action bar foreground color."));

// Erdos action bar disabled foreground color.
export const ERDOS_ACTION_BAR_DISABLED_FOREGROUND = registerColor('erdosActionBar.disabledForeground', {
	dark: disabledForeground,
	light: disabledForeground,
	hcDark: disabledForeground,
	hcLight: disabledForeground
}, localize('erdosActionBar.disabledForeground', "Erdos action bar disabled foreground color."));

// Erdos action bar separator color.
export const ERDOS_ACTION_BAR_SEPARATOR = registerColor('erdosActionBar.separator', {
	dark: '#434b4f',
	light: '#dfe3e6',
	hcDark: '#2f3436',
	hcLight: '#dfe3e6'
}, localize('erdosActionBar.separator', "Erdos action bar separator color."));

// Erdos action bar hover background color.
export const ERDOS_ACTION_BAR_HOVER_BACKGROUND = registerColor('erdosActionBar.hoverBackground', {
	dark: listInactiveSelectionBackground,
	light: listInactiveSelectionBackground,
	hcDark: null,
	hcLight: null
}, localize('erdosActionBar.hoverBackground', "Erdos action bar hover background color."));

// Erdos action bar checkbox border color.
export const ERDOS_ACTION_BAR_CHECKBOX_BORDER = registerColor('erdosActionBar.checkboxBorder', {
	dark: foreground,
	light: foreground,
	hcDark: foreground,
	hcLight: foreground
}, localize('erdosActionBar.checkboxBorder', "Erdos action bar checkbox border."));

// Erdos action bar toggle button highlighted border color.
export const ERDOS_ACTION_BAR_TOGGLE_BUTTON_HIGHLIGHTED = registerColor('erdosActionBar.toggleButtonHighlightedBorder', {
	dark: listInactiveSelectionBackground,
	light: listInactiveSelectionBackground,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('erdosActionBar.toggleButtonHighlightedBorder', "Erdos action bar toggle button highlighted border color."));

// Erdos action bar text input background color.
export const ERDOS_ACTION_BAR_TEXT_INPUT_BACKGROUND = registerColor('erdosActionBar.textInputBackground', {
	dark: '#000000',
	light: '#ffffff',
	hcDark: '#000000',
	hcLight: '#ffffff'
}, localize('erdosActionBar.textInputBackground', "Erdos action bar text input background color."));

// Erdos action bar text input border color.
export const ERDOS_ACTION_BAR_TEXT_INPUT_BORDER = registerColor('erdosActionBar.textInputBorder', {
	dark: '#434b4f',
	light: '#cbd0d5',
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('erdosActionBar.textInputBorder', "Erdos action bar text input border."));

// Erdos action bar text input selection foreground color.
export const ERDOS_ACTION_BAR_TEXT_INPUT_SELECTION_FOREGROUND = registerColor('erdosActionBar.textInputSelectionForeground', {
	dark: '#ffffff',
	light: '#ffffff',
	hcDark: '#ffffff',
	hcLight: '#ffffff'
}, localize('erdosActionBar.textInputSelectionForeground', "Erdos action bar text input selection foreground color."));

// Erdos action bar text input selection background color.
export const ERDOS_ACTION_BAR_TEXT_INPUT_SELECTION_BACKGROUND = registerColor('erdosActionBar.textInputSelectionBackground', {
	dark: '#0e639c',
	light: '#007acc',
	hcDark: '#0e639c',
	hcLight: '#007acc'
}, localize('erdosActionBar.textInputSelectionBackground', "Erdos action bar text input selection background color."));

// Erdos action bar select border color.
export const ERDOS_ACTION_BAR_SELECT_BORDER = registerColor('erdosActionBar.selectBorder', {
	dark: selectBorder,
	light: selectBorder,
	hcDark: selectBorder,
	hcLight: selectBorder
}, localize('erdosActionBar.selectBorder', "Erdos action bar select border color."));

// Erdos action bar select box background color.
export const ERDOS_ACTION_BAR_SELECT_BOX_BACKGROUND = registerColor('erdosActionBar.selectBoxBackground', {
	dark: editorBackground,
	light: editorBackground,
	hcDark: editorBackground,
	hcLight: editorBackground
}, localize('erdosActionBar.selectBoxBackground', "Erdos action bar select box background color."));

// Erdos console background color.
export const ERDOS_CONSOLE_BACKGROUND_COLOR = registerColor('erdosConsole.background', {
	dark: 'panel.background',
	light: 'panel.background',
	hcDark: 'panel.background',
	hcLight: 'panel.background'
}, localize('erdosConsole.background', "Erdos console background color."));

// Erdos console foreground color.
export const ERDOS_CONSOLE_FOREGROUND_COLOR = registerColor('erdosConsole.foreground', {
	dark: 'terminal.foreground',
	light: 'terminal.foreground',
	hcDark: 'terminal.foreground',
	hcLight: 'terminal.foreground'
}, localize('erdosConsole.foreground', "Erdos console foreground color."));

// Erdos console error background color.
export const ERDOS_CONSOLE_ERROR_BACKGROUND_COLOR = registerColor('erdosConsole.errorBackground', {
	dark: transparent('terminal.ansiRed', 0.1),
	light: transparent('terminal.ansiRed', 0.05),
	hcDark: 'panel.background',
	hcLight: 'panel.background'
}, localize('erdosConsole.errorBackground', "Erdos console error background color."));

// Erdos console error foreground color.
export const ERDOS_CONSOLE_ERROR_FOREGROUND_COLOR = registerColor('erdosConsole.errorForeground', {
	dark: errorForeground,
	light: errorForeground,
	hcDark: errorForeground,
	hcLight: errorForeground
}, localize('erdosConsole.errorForeground', "Erdos console error foreground color."));

// Erdos console ANSI black color.
export const ERDOS_CONSOLE_ANSI_BLACK = registerColor('erdosConsole.ansiBlack', {
	dark: 'terminal.ansiBlack',
	light: 'terminal.ansiBlack',
	hcDark: 'terminal.ansiBlack',
	hcLight: 'terminal.ansiBlack'
}, localize('erdosConsole.ansiBlack', "Erdos console ANSI black color."));

// Erdos console ANSI red color.
export const ERDOS_CONSOLE_ANSI_RED = registerColor('erdosConsole.ansiRed', {
	dark: 'terminal.ansiRed',
	light: 'terminal.ansiRed',
	hcDark: 'terminal.ansiRed',
	hcLight: 'terminal.ansiRed'
}, localize('erdosConsole.ansiRed', "Erdos console ANSI red color."));

// Erdos console ANSI green color.
export const ERDOS_CONSOLE_ANSI_GREEN = registerColor('erdosConsole.ansiGreen', {
	dark: 'terminal.ansiGreen',
	light: 'terminal.ansiGreen',
	hcDark: 'terminal.ansiGreen',
	hcLight: 'terminal.ansiGreen'
}, localize('erdosConsole.ansiGreen', "Erdos console ANSI green color."));

// Erdos console ANSI yellow color.
export const ERDOS_CONSOLE_ANSI_YELLOW = registerColor('erdosConsole.ansiYellow', {
	dark: 'terminal.ansiYellow',
	light: 'terminal.ansiYellow',
	hcDark: 'terminal.ansiYellow',
	hcLight: 'terminal.ansiYellow'
}, localize('erdosConsole.ansiYellow', "Erdos console ANSI yellow color."));

// Erdos console ANSI blue color.
export const ERDOS_CONSOLE_ANSI_BLUE = registerColor('erdosConsole.ansiBlue', {
	dark: 'terminal.ansiBlue',
	light: 'terminal.ansiBlue',
	hcDark: 'terminal.ansiBlue',
	hcLight: 'terminal.ansiBlue'
}, localize('erdosConsole.ansiBlue', "Erdos console ANSI blue color."));

// Erdos console ANSI magenta color.
export const ERDOS_CONSOLE_ANSI_MAGENTA = registerColor('erdosConsole.ansiMagenta', {
	dark: 'terminal.ansiMagenta',
	light: 'terminal.ansiMagenta',
	hcDark: 'terminal.ansiMagenta',
	hcLight: 'terminal.ansiMagenta'
}, localize('erdosConsole.ansiMagenta', "Erdos console ANSI magenta color."));

// Erdos console ANSI cyan color.
export const ERDOS_CONSOLE_ANSI_CYAN = registerColor('erdosConsole.ansiCyan', {
	dark: 'terminal.ansiCyan',
	light: 'terminal.ansiCyan',
	hcDark: 'terminal.ansiCyan',
	hcLight: 'terminal.ansiCyan'
}, localize('erdosConsole.ansiCyan', "Erdos console ANSI cyan color."));

// Erdos console ANSI white color.
export const ERDOS_CONSOLE_ANSI_WHITE = registerColor('erdosConsole.ansiWhite', {
	dark: 'terminal.ansiWhite',
	light: 'terminal.ansiWhite',
	hcDark: 'terminal.ansiWhite',
	hcLight: 'terminal.ansiWhite'
}, localize('erdosConsole.ansiWhite', "Erdos console ANSI white color."));

// Erdos console ANSI bright black color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_BLACK = registerColor('erdosConsole.ansiBrightBlack', {
	dark: 'terminal.ansiBrightBlack',
	light: 'terminal.ansiBrightBlack',
	hcDark: 'terminal.ansiBrightBlack',
	hcLight: 'terminal.ansiBrightBlack'
}, localize('erdosConsole.ansiBrightBlack', "Erdos console ANSI bright black color."));

// Erdos console ANSI bright red color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_RED = registerColor('erdosConsole.ansiBrightRed', {
	dark: 'terminal.ansiBrightRed',
	light: 'terminal.ansiBrightRed',
	hcDark: 'terminal.ansiBrightRed',
	hcLight: 'terminal.ansiBrightRed'
}, localize('erdosConsole.ansiBrightRed', "Erdos console ANSI bright red color."));

// Erdos console ANSI bright green color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_GREEN = registerColor('erdosConsole.ansiBrightGreen', {
	dark: 'terminal.ansiBrightGreen',
	light: 'terminal.ansiBrightGreen',
	hcDark: 'terminal.ansiBrightGreen',
	hcLight: 'terminal.ansiBrightGreen'
}, localize('erdosConsole.ansiBrightGreen', "Erdos console ANSI bright green color."));

// Erdos console ANSI bright yellow color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_YELLOW = registerColor('erdosConsole.ansiBrightYellow', {
	dark: 'terminal.ansiBrightYellow',
	light: 'terminal.ansiBrightYellow',
	hcDark: 'terminal.ansiBrightYellow',
	hcLight: 'terminal.ansiBrightYellow'
}, localize('erdosConsole.ansiBrightYellow', "Erdos console ANSI bright yellow color."));

// Erdos console ANSI bright blue color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_BLUE = registerColor('erdosConsole.ansiBrightBlue', {
	dark: 'terminal.ansiBrightBlue',
	light: 'terminal.ansiBrightBlue',
	hcDark: 'terminal.ansiBrightBlue',
	hcLight: 'terminal.ansiBrightBlue'
}, localize('erdosConsole.ansiBrightBlue', "Erdos console ANSI bright blue color."));

// Erdos console ANSI bright magenta color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_MAGENTA = registerColor('erdosConsole.ansiBrightMagenta', {
	dark: 'terminal.ansiBrightMagenta',
	light: 'terminal.ansiBrightMagenta',
	hcDark: 'terminal.ansiBrightMagenta',
	hcLight: 'terminal.ansiBrightMagenta'
}, localize('erdosConsole.ansiBrightMagenta', "Erdos console ANSI bright magenta color."));

// Erdos console ANSI bright cyan color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_CYAN = registerColor('erdosConsole.ansiBrightCyan', {
	dark: 'terminal.ansiBrightCyan',
	light: 'terminal.ansiBrightCyan',
	hcDark: 'terminal.ansiBrightCyan',
	hcLight: 'terminal.ansiBrightCyan'
}, localize('erdosConsole.ansiBrightCyan', "Erdos console ANSI bright cyan color."));

// Erdos console ANSI bright white color.
export const ERDOS_CONSOLE_ANSI_BRIGHT_WHITE = registerColor('erdosConsole.ansiBrightWhite', {
	dark: 'terminal.ansiBrightWhite',
	light: 'terminal.ansiBrightWhite',
	hcDark: 'terminal.ansiBrightWhite',
	hcLight: 'terminal.ansiBrightWhite'
}, localize('erdosConsole.ansiBrightWhite', "Erdos console ANSI bright white color."));

// Erdos console trace background color.
export const ERDOS_CONSOLE_TRACE_BACKGROUND_COLOR = registerColor('erdosConsole.traceBackground', {
	dark: '#262626',
	light: '#e5e5e5',
	hcDark: '#262626',
	hcLight: '#e5e5e5'
}, localize('erdosConsole.traceBackground', "Erdos console trace background color."));

// Erdos console active state icon color.
export const ERDOS_CONSOLE_STATE_ICON_ACTIVE = registerColor('erdosConsole.stateIconActive', {
	dark: '#afcbe9',
	light: '#3a79b2',
	hcDark: '#afcbe9',
	hcLight: '#3a79b2'
}, localize('erdosConsole.stateIconActive', "Erdos console active state icon color."));

// Erdos console disconnected state icon color.
export const ERDOS_CONSOLE_STATE_ICON_DISCONNECTED = registerColor('erdosConsole.stateIconDisconnected', {
	dark: '#ea8b8b',
	light: '#d93939',
	hcDark: '#ea8b8b',
	hcLight: '#d93939'
}, localize('erdosConsole.stateIconDisconnected', "Erdos console disconnected state icon color."));

export const ERDOS_CONSOLE_STATE_ICON_IDLE = registerColor('erdosConsole.stateIconIdle', {
	dark: '#2eb77c',
	light: '#2eb77c',
	hcDark: '#2eb77c',
	hcLight: '#2eb77c'
}, localize('erdosConsole.stateIconIdle', "Erdos console idle state icon color."));

export const ERDOS_PLOTS_BACKGROUND_COLOR = registerColor('erdosPlots.background', {
	dark: 'panel.background',
	light: 'panel.background',
	hcDark: 'panel.background',
	hcLight: 'panel.background'
}, localize('erdosPlots.background', "Erdos plots background color."));

export const ERDOS_WELCOME_FOREGROUND_COLOR = registerColor('erdosWelcome.foreground', {
	dark: '#4AB4E8',
	light: '#1371A0',
	hcDark: '#4AB4E8',
	hcLight: '#1371A0'
}, localize('erdosWelcome.foreground', "Erdos welcome page foreground color."));

export const ERDOS_WELCOME_SECONDARY_FOREGROUND_COLOR = registerColor('erdosWelcome.secondaryForeground', {
	dark: '#cbd0d4',
	light: '#cbd0d4',
	hcDark: '#e5e5e5',
	hcLight: '#262626'
}, localize('erdosWelcome.secondaryForeground', "Erdos welcome page secondary foreground color."));

export const ERDOS_WELCOME_BACKGROUND_COLOR = registerColor('erdosWelcome.background', {
	dark: 'panel.background',
	light: 'panel.background',
	hcDark: 'panel.background',
	hcLight: 'panel.background'
}, localize('erdosWelcome.background', "Erdos Welcome page background color."));

export const ERDOS_WELCOME_HOVER_BACKGROUND = registerColor('erdosWelcome.hoverBackground', {
	dark: listHoverBackground,
	light: listHoverBackground,
	hcDark: listHoverBackground,
	hcLight: listHoverBackground
}, localize('erdosWelcome.hoverBackground', "Erdos welcome page hover background color."));