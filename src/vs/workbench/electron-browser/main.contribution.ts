/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Registry } from 'vs/platform/platform';
import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { CloseEditorAction, KeybindingsReferenceAction, OpenDocumentationUrlAction, OpenIntroductoryVideosUrlAction, ReportIssueAction, ReportPerformanceIssueAction, ZoomResetAction, ZoomOutAction, ZoomInAction, ToggleFullScreenAction, ToggleMenuBarAction, CloseFolderAction, CloseWindowAction, SwitchWindow, NewWindowAction, CloseMessagesAction, NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction, IncreaseViewSizeAction, DecreaseViewSizeAction } from 'vs/workbench/electron-browser/actions';
import { MessagesVisibleContext } from 'vs/workbench/electron-browser/workbench';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { registerCommands } from 'vs/workbench/electron-browser/commands';

// Contribute Commands
registerCommands();

// Contribute Global Actions
const viewCategory = nls.localize('view', "View");
const helpCategory = nls.localize('help', "Help");
const fileCategory = nls.localize('file', "File");
const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }), 'New Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseWindowAction, CloseWindowAction.ID, CloseWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }), 'Close Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SwitchWindow, SwitchWindow.ID, SwitchWindow.LABEL), 'Switch Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseFolderAction, CloseFolderAction.ID, CloseFolderAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), 'File: Close Folder', fileCategory);
if (!!product.reportIssueUrl) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReportIssueAction, ReportIssueAction.ID, ReportIssueAction.LABEL), 'Help: Report Issues', helpCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReportPerformanceIssueAction, ReportPerformanceIssueAction.ID, ReportPerformanceIssueAction.LABEL), 'Help: Report Performance Issues', helpCategory);
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
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseMessagesAction, CloseMessagesAction.ID, CloseMessagesAction.LABEL, { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, MessagesVisibleContext), 'Close Notification Messages');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_W, win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] } }), 'View: Close Editor', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'View: Toggle Full Screen', viewCategory);
if (isWindows || isLinux) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), 'View: Toggle Menu Bar', viewCategory);
}
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateUpAction, NavigateUpAction.ID, NavigateUpAction.LABEL, null), 'View: Move to the View Above', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateDownAction, NavigateDownAction.ID, NavigateDownAction.LABEL, null), 'View: Move to the View Below', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateLeftAction, NavigateLeftAction.ID, NavigateLeftAction.LABEL, null), 'View: Move to the View on the Left', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NavigateRightAction, NavigateRightAction.ID, NavigateRightAction.LABEL, null), 'View: Move to the View on the Right', viewCategory);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(IncreaseViewSizeAction, IncreaseViewSizeAction.ID, IncreaseViewSizeAction.LABEL, null), 'View: Increase View Size', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(DecreaseViewSizeAction, DecreaseViewSizeAction.ID, DecreaseViewSizeAction.LABEL, null), 'View: Decrease View Size', viewCategory);

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
		'workbench.editor.tabCloseButton': {
			'type': 'string',
			'enum': ['left', 'right', 'off'],
			'default': 'right',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorTabCloseButton' }, "Controls the position of the editor's tabs close buttons or disables them when set to 'off'.")
		},
		'workbench.editor.showIcons': {
			'type': 'boolean',
			'description': nls.localize('showIcons', "Controls if opened editors should show with an icon or not. This requires an icon theme to be enabled as well."),
			'default': true
		},
		'workbench.editor.enablePreview': {
			'type': 'boolean',
			'description': nls.localize('enablePreview', "Controls if opened editors show as preview. Preview editors are reused until they are kept (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.enablePreviewFromQuickOpen': {
			'type': 'boolean',
			'description': nls.localize('enablePreviewFromQuickOpen', "Controls if opened editors from Quick Open show as preview. Preview editors are reused until they are kept (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.openPositioning': {
			'type': 'string',
			'enum': ['left', 'right', 'first', 'last'],
			'default': 'right',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorOpenPositioning' }, "Controls where editors open. Select 'left' or 'right' to open editors to the left or right of the current active one. Select 'first' or 'last' to open editors independently from the currently active one.")
		},
		'workbench.editor.revealIfOpen': {
			'type': 'boolean',
			'description': nls.localize('revealIfOpen', "Controls if an editor is revealed in any of the visible groups if opened. If disabled, an editor will prefer to open in the currently active editor group. If enabled, an already opened editor will be revealed instead of opened again in the currently active editor group. Note that there are some cases where this setting is ignored, e.g. when forcing an editor to open in a specific group or to the side of the currently active group."),
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
		'workbench.editor.closeOnFileDelete': {
			'type': 'boolean',
			'description': nls.localize('closeOnFileDelete', "Controls if editors showing a file should close automatically when the file is deleted or renamed by some other process. Disabling this will keep the editor open as dirty on such an event. Note that deleting from within the application will always close the editor and that dirty files will never close to preserve your data."),
			'default': true
		}
	}
});

// Configuration: Window
let properties: { [path: string]: IJSONSchema; } = {
	'window.openFilesInNewWindow': {
		'type': 'string',
		'enum': ['on', 'off', 'default'],
		'enumDescriptions': [
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFilesInNewWindow.on' }, "Files will open in a new window"),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFilesInNewWindow.off' }, "Files will open in the window with the files' folder open or the last active window"),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFilesInNewWindow.default' }, "Files will open in the window with the files' folder open or the last active window unless opened via the dock or from finder (macOS only)")
		],
		'default': 'default',
		'description':
		nls.localize('openFilesInNewWindow',
			`Controls if files should open in a new window.
- default: files will open in the window with the files' folder open or the last active window unless opened via the dock or from finder (macOS only)
- on: files will open in a new window
- off: files will open in the window with the files' folder open or the last active window
Note that there can still be cases where this setting is ignored (e.g. when using the -new-window or -reuse-window command line option).`
		)
	},
	'window.openFoldersInNewWindow': {
		'type': 'string',
		'enum': ['on', 'off', 'default'],
		'enumDescriptions': [
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFoldersInNewWindow.on' }, "Folders will open in a new window"),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFoldersInNewWindow.off' }, "Folders will replace the last active window"),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.openFoldersInNewWindow.default' }, "Folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu)")
		],
		'default': 'default',
		'description': nls.localize('openFoldersInNewWindow',
			`Controls if folders should open in a new window or replace the last active window.
- default: folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu)
- on: folders will open in a new window
- off: folders will replace the last active window
Note that there can still be cases where this setting is ignored (e.g. when using the -new-window or -reuse-window command line option).`
		)
	},
	'window.reopenFolders': {
		'type': 'string',
		'enum': ['none', 'one', 'all'],
		'enumDescriptions': [
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.reopenFolders.none' }, "Never reopen a folder."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.reopenFolders.one' }, "Reopen the last active folder."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.reopenFolders.all' }, "Reopen all folders of the last session."),
		],
		'default': 'one',
		'description': nls.localize('reopenFolders', "Controls how folders are being reopened after a restart. Select 'none' to never reopen a folder, 'one' to reopen the last folder you worked on or 'all' to reopen all folders of your last session.")
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
			`Controls the window title based on the active editor. Variables are substituted based on the context:
\${activeEditorShort}: e.g. myFile.txt
\${activeEditorMedium}: e.g. myFolder/myFile.txt
\${activeEditorLong}: e.g. /Users/Development/myProject/myFolder/myFile.txt
\${rootName}: e.g. myProject
\${rootPath}: e.g. /Users/Development/myProject
\${appName}: e.g. VS Code
\${dirty}: a dirty indicator if the active editor is dirty
\${separator}: a conditional separator (" - ") that only shows when surrounded by variables with values`)
	},
	'window.newWindowDimensions': {
		'type': 'string',
		'enum': ['default', 'inherit', 'maximized', 'fullscreen'],
		'enumDescriptions': [
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.newWindowDimensions.default' }, "Open new windows in the center of the screen."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.newWindowDimensions.inherit' }, "Open new windows with same dimension as last active one."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.newWindowDimensions.maximized' }, "Open new windows maximized."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.newWindowDimensions.fullscreen' }, "Open new windows in full screen mode.")
		],
		'default': 'default',
		'description': nls.localize('newWindowDimensions', "Controls the dimensions of opening a new window. By default, a new window will open in the center of the screen with small dimensions. When set to  'inherit', the window will get the same dimensions as the last active one. When set to 'maximized', the window will open maximized and fullscreen if configured to 'fullscreen'.")
	},
};

if (isWindows || isLinux) {
	properties['window.menuBarVisibility'] = {
		'type': 'string',
		'enum': ['default', 'visible', 'toggle', 'hidden'],
		'enumDescriptions': [
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.menuBarVisibility.default' }, "Menu is only hidden in full screen mode."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.menuBarVisibility.visible' }, "Menu is always visible even in full screen mode."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.menuBarVisibility.toggle' }, "Menu is hidden but can be displayed via Alt key."),
			nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'window.menuBarVisibility.hidden' }, "Menu is always hidden.")
		],
		'default': 'default',
		'description': nls.localize('menuBarVisibility', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. By default, the menu bar will be visible, unless the window is full screen.")
	};
}

if (isWindows) {
	properties['window.autoDetectHighContrast'] = {
		'type': 'boolean',
		'default': true,
		'description': nls.localize('autoDetectHighContrast', "If enabled, will automatically change to high contrast theme if Windows is using a high contrast theme, and to dark theme when switching away from a Windows high contrast theme."),
	};
}

if (isMacintosh) {
	properties['window.titleBarStyle'] = {
		'type': 'string',
		'enum': ['native', 'custom'],
		'default': 'custom',
		'description': nls.localize('titleBarStyle', "Adjust the appearance of the window title bar. Changes require a full restart to apply.")
	};
}

configurationRegistry.registerConfiguration({
	'id': 'window',
	'order': 8,
	'title': nls.localize('windowConfigurationTitle', "Window"),
	'type': 'object',
	'properties': properties
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
		'zenMode.restore': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('zenMode.restore', "Controls if a window should restore to zen mode if it was exited in zen mode.")
		}
	}
});
