/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Registry} from 'vs/platform/platform';
import nls = require('vs/nls');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IConfigurationRegistry, Extensions as ConfigurationExtensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import platform = require('vs/base/common/platform');
import {IKeybindings} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {CloseEditorAction, ReloadWindowAction, ShowStartupPerformance, ZoomResetAction, ZoomOutAction, ZoomInAction, ToggleDevToolsAction, ToggleFullScreenAction, ToggleMenuBarAction, OpenRecentAction, CloseFolderAction, CloseWindowAction, NewWindowAction, CloseMessagesAction} from 'vs/workbench/electron-browser/actions';
import {MessagesVisibleContext, NoEditorsVisibleContext} from 'vs/workbench/electron-browser/workbench';

const closeEditorOrWindowKeybindings: IKeybindings = { primary: KeyMod.CtrlCmd | KeyCode.KEY_W, win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] }};

// Contribute Global Actions
const viewCategory = nls.localize('view', "View");
const developerCategory = nls.localize('developer', "Developer");
const fileCategory = nls.localize('file', "File");
const workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }), 'New Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseWindowAction, CloseWindowAction.ID, CloseWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }), 'Close Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseFolderAction, CloseFolderAction.ID, CloseFolderAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), 'File: Close Folder', fileCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_R, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R } }), 'File: Open Recent', fileCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL), 'Developer: Toggle Developer Tools', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ZoomInAction, ZoomInAction.ID, ZoomInAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_EQUAL, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_EQUAL] }), 'View: Zoom In', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ZoomOutAction, ZoomOutAction.ID, ZoomOutAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.US_MINUS,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS],
		linux: { primary: KeyMod.CtrlCmd | KeyCode.US_MINUS, secondary: []}
	}), 'View: Zoom Out', viewCategory
);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ZoomResetAction, ZoomResetAction.ID, ZoomResetAction.LABEL), 'View: Reset Zoom', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowStartupPerformance, ShowStartupPerformance.ID, ShowStartupPerformance.LABEL), 'Developer: Startup Performance', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL), 'Reload Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseMessagesAction, CloseMessagesAction.ID, CloseMessagesAction.LABEL, { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, MessagesVisibleContext), 'Close Notification Messages');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL, closeEditorOrWindowKeybindings), 'View: Close Editor', viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'View: Toggle Full Screen', viewCategory);
if (platform.isWindows || platform.isLinux) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), 'View: Toggle Menu Bar', viewCategory);
}

// close the window when the last editor is closed by reusing the same keybinding
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeWindow',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: NoEditorsVisibleContext,
	primary: closeEditorOrWindowKeybindings.primary,
	handler: accessor => {
		const windowService = accessor.get(IWindowService);
		windowService.getWindow().close();
	}
});

// Configuration: Workbench
const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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
			'description': nls.localize('editorOpenPositioning', "Controls where editors open. Select 'left' or 'right' to open editors to the left or right of the current active one. Select 'first' or 'last' to open editors independently from the currently active one.")
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
			'type': 'boolean',
			'default': true,
			'description': nls.localize('openFilesInNewWindow', "When enabled, will open files in a new window instead of reusing an existing instance.")
		},
		'window.reopenFolders': {
			'type': 'string',
			'enum': ['none', 'one', 'all'],
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
		}
	}
});

// Configuration: Update
configurationRegistry.registerConfiguration({
	'id': 'update',
	'order': 15,
	'title': nls.localize('updateConfigurationTitle', "Update"),
	'type': 'object',
	'properties': {
		'update.channel': {
			'type': 'string',
			'enum': ['none', 'default'],
			'default': 'default',
			'description': nls.localize('updateChannel', "Configure whether you receive automatic updates from an update channel. Requires a restart after change.")
		}
	}
});