/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import * as os from 'os';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { KeybindingsReferenceAction, OpenDocumentationUrlAction, OpenIntroductoryVideosUrlAction, OpenTipsAndTricksUrlAction, OpenIssueReporterAction, ReportPerformanceIssueUsingReporterAction, ZoomResetAction, ZoomOutAction, ZoomInAction, ToggleFullScreenAction, ToggleMenuBarAction, CloseWorkspaceAction, CloseCurrentWindowAction, SwitchWindow, NewWindowAction, NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction, IncreaseViewSizeAction, DecreaseViewSizeAction, ShowStartupPerformance, ToggleSharedProcessAction, QuickSwitchWindow, QuickOpenRecentAction, inRecentFilesPickerContextKey, ShowAboutDialogAction, InspectContextKeysAction } from 'vs/workbench/electron-browser/actions';
import { registerCommands } from 'vs/workbench/electron-browser/commands';
import { AddRootFolderAction, GlobalRemoveRootFolderAction, OpenWorkspaceAction, SaveWorkspaceAsAction, OpenWorkspaceConfigFileAction, OpenFolderAsWorkspaceInNewWindowAction, OpenFileFolderAction, OpenFileAction, OpenFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { inQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

// Contribute Commands
registerCommands();

// Contribute Global Actions
const viewCategory = nls.localize('view', "View");
const helpCategory = nls.localize('help', "Help");
const fileCategory = nls.localize('file', "File");
const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }), 'New Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseCurrentWindowAction, CloseCurrentWindowAction.ID, CloseCurrentWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }), 'Close Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SwitchWindow, SwitchWindow.ID, SwitchWindow.LABEL, { primary: null, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_W } }), 'Switch Window...');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(QuickSwitchWindow, QuickSwitchWindow.ID, QuickSwitchWindow.LABEL), 'Quick Switch Window...');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenRecentAction, QuickOpenRecentAction.ID, QuickOpenRecentAction.LABEL), 'File: Quick Open Recent...', fileCategory);

if (isMacintosh) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileFolderAction, OpenFileFolderAction.ID, OpenFileFolderAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'File: Open...', fileCategory);
} else {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileAction, OpenFileAction.ID, OpenFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'File: Open File...', fileCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderAction, OpenFolderAction.ID, OpenFolderAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_O) }), 'File: Open Folder...', fileCategory);
}

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseWorkspaceAction, CloseWorkspaceAction.ID, CloseWorkspaceAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), 'File: Close Workspace', fileCategory);
if (!!product.reportIssueUrl) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenIssueReporterAction, OpenIssueReporterAction.ID, OpenIssueReporterAction.LABEL), 'Help: Open Issue Reporter', helpCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReportPerformanceIssueUsingReporterAction, ReportPerformanceIssueUsingReporterAction.ID, ReportPerformanceIssueUsingReporterAction.LABEL), 'Help: Report Performance Issue', helpCategory);
}

if (KeybindingsReferenceAction.AVAILABLE) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(KeybindingsReferenceAction, KeybindingsReferenceAction.ID, KeybindingsReferenceAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_R) }), 'Help: Keyboard Shortcuts Reference', helpCategory);
}

if (OpenDocumentationUrlAction.AVAILABLE) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenDocumentationUrlAction, OpenDocumentationUrlAction.ID, OpenDocumentationUrlAction.LABEL), 'Help: Documentation', helpCategory);
}

if (OpenIntroductoryVideosUrlAction.AVAILABLE) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenIntroductoryVideosUrlAction, OpenIntroductoryVideosUrlAction.ID, OpenIntroductoryVideosUrlAction.LABEL), 'Help: Introductory Videos', helpCategory);
}

if (OpenTipsAndTricksUrlAction.AVAILABLE) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenTipsAndTricksUrlAction, OpenTipsAndTricksUrlAction.ID, OpenTipsAndTricksUrlAction.LABEL), 'Help: Tips and Tricks', helpCategory);
}

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowAboutDialogAction, ShowAboutDialogAction.ID, ShowAboutDialogAction.LABEL), 'Help: About', helpCategory);

workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ZoomInAction, ZoomInAction.ID, ZoomInAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.US_EQUAL,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_EQUAL, KeyMod.CtrlCmd | KeyCode.NUMPAD_ADD]
	}), 'View: Zoom In', viewCategory);

workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ZoomOutAction, ZoomOutAction.ID, ZoomOutAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.US_MINUS,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS, KeyMod.CtrlCmd | KeyCode.NUMPAD_SUBTRACT],
		linux: { primary: KeyMod.CtrlCmd | KeyCode.US_MINUS, secondary: [KeyMod.CtrlCmd | KeyCode.NUMPAD_SUBTRACT] }
	}), 'View: Zoom Out', viewCategory
);

workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ZoomResetAction, ZoomResetAction.ID, ZoomResetAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.NUMPAD_0
	}), 'View: Reset Zoom', viewCategory
);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'View: Toggle Full Screen', viewCategory);
if (isWindows || isLinux) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), 'View: Toggle Menu Bar', viewCategory);
}
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateUpAction, NavigateUpAction.ID, NavigateUpAction.LABEL, null), 'View: Navigate to the View Above', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateDownAction, NavigateDownAction.ID, NavigateDownAction.LABEL, null), 'View: Navigate to the View Below', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateLeftAction, NavigateLeftAction.ID, NavigateLeftAction.LABEL, null), 'View: Navigate to the View on the Left', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateRightAction, NavigateRightAction.ID, NavigateRightAction.LABEL, null), 'View: Navigate to the View on the Right', viewCategory);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(IncreaseViewSizeAction, IncreaseViewSizeAction.ID, IncreaseViewSizeAction.LABEL, null), 'View: Increase Current View Size', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(DecreaseViewSizeAction, DecreaseViewSizeAction.ID, DecreaseViewSizeAction.LABEL, null), 'View: Decrease Current View Size', viewCategory);

const workspacesCategory = nls.localize('workspaces', "Workspaces");
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(AddRootFolderAction, AddRootFolderAction.ID, AddRootFolderAction.LABEL), 'Workspaces: Add Folder to Workspace...', workspacesCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalRemoveRootFolderAction, GlobalRemoveRootFolderAction.ID, GlobalRemoveRootFolderAction.LABEL), 'Workspaces: Remove Folder from Workspace...', workspacesCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceAction, OpenWorkspaceAction.ID, OpenWorkspaceAction.LABEL), 'Workspaces: Open Workspace...', workspacesCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SaveWorkspaceAsAction, SaveWorkspaceAsAction.ID, SaveWorkspaceAsAction.LABEL), 'Workspaces: Save Workspace As...', workspacesCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceConfigFileAction, OpenWorkspaceConfigFileAction.ID, OpenWorkspaceConfigFileAction.LABEL), 'Workspaces: Open Workspace Configuration File', workspacesCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderAsWorkspaceInNewWindowAction, OpenFolderAsWorkspaceInNewWindowAction.ID, OpenFolderAsWorkspaceInNewWindowAction.LABEL), 'Workspaces: Open Folder as Workspace in New Window', workspacesCategory);

// Developer related actions
const developerCategory = nls.localize('developer', "Developer");
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowStartupPerformance, ShowStartupPerformance.ID, ShowStartupPerformance.LABEL), 'Developer: Startup Performance', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSharedProcessAction, ToggleSharedProcessAction.ID, ToggleSharedProcessAction.LABEL), 'Developer: Toggle Shared Process', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(InspectContextKeysAction, InspectContextKeysAction.ID, InspectContextKeysAction.LABEL), 'Developer: Inspect Context Keys', developerCategory);

const recentFilesPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));

const quickOpenNavigateNextInRecentFilesPickerId = 'workbench.action.quickOpenNavigateNextInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInRecentFilesPickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigateNextInRecentFilesPickerId, true),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R }
});

const quickOpenNavigatePreviousInRecentFilesPicker = 'workbench.action.quickOpenNavigatePreviousInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInRecentFilesPicker,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInRecentFilesPicker, false),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_R }
});

// Configuration: Workbench
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'workbench',
	'order': 7,
	'title': nls.localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
	'properties': {
		'workbench.editor.showTabs': {
			'type': 'boolean',
			'description': nls.localize('showEditorTabs', "Controls if opened editors should show in tabs or not."),
			'default': true
		},
		'workbench.editor.labelFormat': {
			'type': 'string',
			'enum': ['default', 'short', 'medium', 'long'],
			'enumDescriptions': [
				nls.localize('workbench.editor.labelFormat.default', "Show the name of the file. When tabs are enabled and two files have the same name in one group the distinguinshing sections of each file's path are added. When tabs are disabled, the path relative to the workspace folder is shown if the editor is active."),
				nls.localize('workbench.editor.labelFormat.short', "Show the name of the file followed by it's directory name."),
				nls.localize('workbench.editor.labelFormat.medium', "Show the name of the file followed by it's path relative to the workspace folder."),
				nls.localize('workbench.editor.labelFormat.long', "Show the name of the file followed by it's absolute path.")
			],
			'default': 'default',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by parenthesis are not to be translated.'], key: 'tabDescription' },
				"Controls the format of the label for an editor. Changing this setting can for example make it easier to understand the location of a file:\n- short:   'parent'\n- medium:  'workspace/src/parent'\n- long:    '/home/user/workspace/src/parent'\n- default: '.../parent', when another tab shares the same title, or the relative workspace path if tabs are disabled"),
		},
		'workbench.editor.tabCloseButton': {
			'type': 'string',
			'enum': ['left', 'right', 'off'],
			'default': 'right',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorTabCloseButton' }, "Controls the position of the editor's tabs close buttons or disables them when set to 'off'.")
		},
		'workbench.editor.tabSizing': {
			'type': 'string',
			'enum': ['fit', 'shrink'],
			'default': 'fit',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'tabSizing' }, "Controls the sizing of editor tabs. Set to 'fit' to keep tabs always large enough to show the full editor label. Set to 'shrink' to allow tabs to get smaller when the available space is not enough to show all tabs at once.")
		},
		'workbench.editor.showIcons': {
			'type': 'boolean',
			'description': nls.localize('showIcons', "Controls if opened editors should show with an icon or not. This requires an icon theme to be enabled as well."),
			'default': true
		},
		'workbench.editor.enablePreview': {
			'type': 'boolean',
			'description': nls.localize('enablePreview', "Controls if opened editors show as preview. Preview editors are reused until they are kept (e.g. via double click or editing) and show up with an italic font style."),
			'default': true
		},
		'workbench.editor.enablePreviewFromQuickOpen': {
			'type': 'boolean',
			'description': nls.localize('enablePreviewFromQuickOpen', "Controls if opened editors from Quick Open show as preview. Preview editors are reused until they are kept (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.closeOnFileDelete': {
			'type': 'boolean',
			'description': nls.localize('closeOnFileDelete', "Controls if editors showing a file should close automatically when the file is deleted or renamed by some other process. Disabling this will keep the editor open as dirty on such an event. Note that deleting from within the application will always close the editor and that dirty files will never close to preserve your data."),
			'default': true
		},
		'workbench.editor.openPositioning': {
			'type': 'string',
			'enum': ['left', 'right', 'first', 'last'],
			'default': 'right',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorOpenPositioning' }, "Controls where editors open. Select 'left' or 'right' to open editors to the left or right of the currently active one. Select 'first' or 'last' to open editors independently from the currently active one.")
		},
		'workbench.editor.revealIfOpen': {
			'type': 'boolean',
			'description': nls.localize('revealIfOpen', "Controls if an editor is revealed in any of the visible groups if opened. If disabled, an editor will prefer to open in the currently active editor group. If enabled, an already opened editor will be revealed instead of opened again in the currently active editor group. Note that there are some cases where this setting is ignored, e.g. when forcing an editor to open in a specific group or to the side of the currently active group."),
			'default': false
		},
		'workbench.editor.swipeToNavigate': {
			'type': 'boolean',
			'description': nls.localize('swipeToNavigate', "Navigate between open files using three-finger swipe horizontally."),
			'default': false,
			'included': isMacintosh
		},
		'workbench.commandPalette.history': {
			'type': 'number',
			'description': nls.localize('commandHistory', "Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history."),
			'default': 50
		},
		'workbench.commandPalette.preserveInput': {
			'type': 'boolean',
			'description': nls.localize('preserveInput', "Controls if the last typed input to the command palette should be restored when opening it the next time."),
			'default': false
		},
		'workbench.quickOpen.closeOnFocusLost': {
			'type': 'boolean',
			'description': nls.localize('closeOnFocusLost', "Controls if Quick Open should close automatically once it loses focus."),
			'default': true
		},
		'workbench.settings.openDefaultSettings': {
			'type': 'boolean',
			'description': nls.localize('openDefaultSettings', "Controls if opening settings also opens an editor showing all default settings."),
			'default': true
		},
		'workbench.sideBar.location': {
			'type': 'string',
			'enum': ['left', 'right'],
			'default': 'left',
			'description': nls.localize('sideBarLocation', "Controls the location of the sidebar. It can either show on the left or right of the workbench.")
		},
		'workbench.panel.defaultLocation': {
			'type': 'string',
			'enum': ['bottom', 'right'],
			'default': 'bottom',
			'description': nls.localize('panelDefaultLocation', "Controls the default location of the panel. It can either show at the bottom or on the right of the workbench.")
		},
		'workbench.statusBar.visible': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('statusBarVisibility', "Controls the visibility of the status bar at the bottom of the workbench.")
		},
		'workbench.activityBar.visible': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('activityBarVisibility', "Controls the visibility of the activity bar in the workbench.")
		},
		'workbench.view.alwaysShowHeaderActions': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('viewVisibility', "Controls the visibility of view header actions. View header actions may either be always visible, or only visible when that view is focused or hovered over.")
		},
		'workbench.fontAliasing': {
			'type': 'string',
			'enum': ['default', 'antialiased', 'none', 'auto'],
			'default': 'default',
			'description':
				nls.localize('fontAliasing', "Controls font aliasing method in the workbench.\n- default: Sub-pixel font smoothing. On most non-retina displays this will give the sharpest text\n- antialiased: Smooth the font on the level of the pixel, as opposed to the subpixel. Can make the font appear lighter overall\n- none: Disables font smoothing. Text will show with jagged sharp edges\n- auto: Applies `default` or `antialiased` automatically based on the DPI of displays."),
			'enumDescriptions': [
				nls.localize('workbench.fontAliasing.default', "Sub-pixel font smoothing. On most non-retina displays this will give the sharpest text."),
				nls.localize('workbench.fontAliasing.antialiased', "Smooth the font on the level of the pixel, as opposed to the subpixel. Can make the font appear lighter overall."),
				nls.localize('workbench.fontAliasing.none', "Disables font smoothing. Text will show with jagged sharp edges."),
				nls.localize('workbench.fontAliasing.auto', "Applies `default` or `antialiased` automatically based on the DPI of displays.")
			],
			'included': isMacintosh
		},
		'workbench.settings.enableNaturalLanguageSearch': {
			'type': 'boolean',
			'description': nls.localize('enableNaturalLanguageSettingsSearch', "Controls whether to enable the natural language search mode for settings."),
			'default': true
		}
	}
});

// Configuration: Window

configurationRegistry.registerConfiguration({
	'id': 'window',
	'order': 8,
	'title': nls.localize('windowConfigurationTitle', "Window"),
	'type': 'object',
	'properties': {
		'window.openFilesInNewWindow': {
			'type': 'string',
			'enum': ['on', 'off', 'default'],
			'enumDescriptions': [
				nls.localize('window.openFilesInNewWindow.on', "Files will open in a new window"),
				nls.localize('window.openFilesInNewWindow.off', "Files will open in the window with the files' folder open or the last active window"),
				nls.localize('window.openFilesInNewWindow.default', "Files will open in the window with the files' folder open or the last active window unless opened via the dock or from finder (macOS only)")
			],
			'default': 'off',
			'description':
				nls.localize('openFilesInNewWindow', "Controls if files should open in a new window.\n- default: files will open in the window with the files' folder open or the last active window unless opened via the dock or from finder (macOS only)\n- on: files will open in a new window\n- off: files will open in the window with the files' folder open or the last active window\nNote that there can still be cases where this setting is ignored (e.g. when using the -new-window or -reuse-window command line option).")
		},
		'window.openFoldersInNewWindow': {
			'type': 'string',
			'enum': ['on', 'off', 'default'],
			'enumDescriptions': [
				nls.localize('window.openFoldersInNewWindow.on', "Folders will open in a new window"),
				nls.localize('window.openFoldersInNewWindow.off', "Folders will replace the last active window"),
				nls.localize('window.openFoldersInNewWindow.default', "Folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu)")
			],
			'default': 'default',
			'description': nls.localize('openFoldersInNewWindow', "Controls if folders should open in a new window or replace the last active window.\n- default: folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu)\n- on: folders will open in a new window\n- off: folders will replace the last active window\nNote that there can still be cases where this setting is ignored (e.g. when using the -new-window or -reuse-window command line option).")
		},
		'window.restoreWindows': {
			'type': 'string',
			'enum': ['all', 'folders', 'one', 'none'],
			'enumDescriptions': [
				nls.localize('window.reopenFolders.all', "Reopen all windows."),
				nls.localize('window.reopenFolders.folders', "Reopen all folders. Empty workspaces will not be restored."),
				nls.localize('window.reopenFolders.one', "Reopen the last active window."),
				nls.localize('window.reopenFolders.none', "Never reopen a window. Always start with an empty one.")
			],
			'default': 'one',
			'description': nls.localize('restoreWindows', "Controls how windows are being reopened after a restart. Select 'none' to always start with an empty workspace, 'one' to reopen the last window you worked on, 'folders' to reopen all windows that had folders opened or 'all' to reopen all windows of your last session.")
		},
		'window.restoreFullscreen': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('restoreFullscreen', "Controls if a window should restore to full screen mode if it was exited in full screen mode.")
		},
		'window.zoomLevel': {
			'type': 'number',
			'default': 0,
			'description': nls.localize('zoomLevel', "Adjust the zoom level of the window. The original size is 0 and each increment above (e.g. 1) or below (e.g. -1) represents zooming 20% larger or smaller. You can also enter decimals to adjust the zoom level with a finer granularity.")
		},
		'window.title': {
			'type': 'string',
			'default': isMacintosh ? '${activeEditorShort}${separator}${rootName}' : '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by parenthesis are not to be translated.'], key: 'title' },
				"Controls the window title based on the active editor. Variables are substituted based on the context:\n\${activeEditorShort}: the file name (e.g. myFile.txt)\n\${activeEditorMedium}: the path of the file relative to the workspace folder (e.g. myFolder/myFile.txt)\n\${activeEditorLong}: the full path of the file (e.g. /Users/Development/myProject/myFolder/myFile.txt)\n\${folderName}: name of the workspace folder the file is contained in (e.g. myFolder)\n\${folderPath}: file path of the workspace folder the file is contained in (e.g. /Users/Development/myFolder)\n\${rootName}: name of the workspace (e.g. myFolder or myWorkspace)\n\${rootPath}: file path of the workspace (e.g. /Users/Development/myWorkspace)\n\${appName}: e.g. VS Code\n\${dirty}: a dirty indicator if the active editor is dirty\n\${separator}: a conditional separator (\" - \") that only shows when surrounded by variables with values or static text")
		},
		'window.newWindowDimensions': {
			'type': 'string',
			'enum': ['default', 'inherit', 'maximized', 'fullscreen'],
			'enumDescriptions': [
				nls.localize('window.newWindowDimensions.default', "Open new windows in the center of the screen."),
				nls.localize('window.newWindowDimensions.inherit', "Open new windows with same dimension as last active one."),
				nls.localize('window.newWindowDimensions.maximized', "Open new windows maximized."),
				nls.localize('window.newWindowDimensions.fullscreen', "Open new windows in full screen mode.")
			],
			'default': 'default',
			'description': nls.localize('newWindowDimensions', "Controls the dimensions of opening a new window when at least one window is already opened. By default, a new window will open in the center of the screen with small dimensions. When set to 'inherit', the window will get the same dimensions as the last window that was active. When set to 'maximized', the window will open maximized and fullscreen if configured to 'fullscreen'. Note that this setting does not have an impact on the first window that is opened. The first window will always restore the size and location as you left it before closing.")
		},
		'window.closeWhenEmpty': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('closeWhenEmpty', "Controls if closing the last editor should also close the window. This setting only applies for windows that do not show folders.")
		},
		'window.menuBarVisibility': {
			'type': 'string',
			'enum': ['default', 'visible', 'toggle', 'hidden'],
			'enumDescriptions': [
				nls.localize('window.menuBarVisibility.default', "Menu is only hidden in full screen mode."),
				nls.localize('window.menuBarVisibility.visible', "Menu is always visible even in full screen mode."),
				nls.localize('window.menuBarVisibility.toggle', "Menu is hidden but can be displayed via Alt key."),
				nls.localize('window.menuBarVisibility.hidden', "Menu is always hidden.")
			],
			'default': 'default',
			'description': nls.localize('menuBarVisibility', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. By default, the menu bar will be visible, unless the window is full screen."),
			'included': isWindows || isLinux
		},
		'window.enableMenuBarMnemonics': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('enableMenuBarMnemonics', "If enabled, the main menus can be opened via Alt-key shortcuts. Disabling mnemonics allows to bind these Alt-key shortcuts to editor commands instead."),
			'included': isWindows || isLinux
		},
		'window.autoDetectHighContrast': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('autoDetectHighContrast', "If enabled, will automatically change to high contrast theme if Windows is using a high contrast theme, and to dark theme when switching away from a Windows high contrast theme."),
			'included': isWindows
		},
		'window.titleBarStyle': {
			'type': 'string',
			'enum': ['native', 'custom'],
			'default': 'custom',
			'description': nls.localize('titleBarStyle', "Adjust the appearance of the window title bar. Changes require a full restart to apply."),
			'included': isMacintosh
		},
		'window.nativeTabs': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('window.nativeTabs', "Enables macOS Sierra window tabs. Note that changes require a full restart to apply and that native tabs will disable a custom title bar style if configured."),
			'included': isMacintosh && parseFloat(os.release()) >= 16 // Minimum: macOS Sierra (10.12.x = darwin 16.x)
		}
	}
});

// Configuration: Zen Mode
configurationRegistry.registerConfiguration({
	'id': 'zenMode',
	'order': 9,
	'title': nls.localize('zenModeConfigurationTitle', "Zen Mode"),
	'type': 'object',
	'properties': {
		'zenMode.fullScreen': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.fullScreen', "Controls if turning on Zen Mode also puts the workbench into full screen mode.")
		},
		'zenMode.centerLayout': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.centerLayout', "Controls if turning on Zen Mode also centers the layout.")
		},
		'zenMode.hideTabs': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideTabs', "Controls if turning on Zen Mode also hides workbench tabs.")
		},
		'zenMode.hideStatusBar': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideStatusBar', "Controls if turning on Zen Mode also hides the status bar at the bottom of the workbench.")
		},
		'zenMode.hideActivityBar': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideActivityBar', "Controls if turning on Zen Mode also hides the activity bar at the left of the workbench.")
		},
		'zenMode.restore': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('zenMode.restore', "Controls if a window should restore to zen mode if it was exited in zen mode.")
		}
	}
});
