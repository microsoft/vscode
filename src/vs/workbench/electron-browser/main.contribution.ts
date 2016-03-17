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
import {KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {WorkbenchMessageService} from 'vs/workbench/services/message/browser/messageService';
import {CloseEditorAction, ReloadWindowAction, ShowStartupPerformance, ZoomResetAction, ZoomOutAction, ZoomInAction, ToggleDevToolsAction, ToggleFullScreenAction, ToggleMenuBarAction, OpenRecentAction, CloseFolderAction, CloseWindowAction, NewWindowAction, CloseMessagesAction} from 'vs/workbench/electron-browser/actions';

// Contribute Global Actions
const viewCategory = nls.localize('view', "View");
const developerCategory = nls.localize('developer', "Developer");
const fileCategory = nls.localize('file', "File");
const workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }));
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseWindowAction, CloseWindowAction.ID, CloseWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }));
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseFolderAction, CloseFolderAction.ID, CloseFolderAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), fileCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL), fileCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL), developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ZoomInAction, ZoomInAction.ID, ZoomInAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_EQUAL }), viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ZoomOutAction, ZoomOutAction.ID, ZoomOutAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_MINUS }), viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ZoomResetAction, ZoomResetAction.ID, ZoomResetAction.LABEL), viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowStartupPerformance, ShowStartupPerformance.ID, ShowStartupPerformance.LABEL), developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL));
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseMessagesAction, CloseMessagesAction.ID, CloseMessagesAction.LABEL, { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, KbExpr.has(WorkbenchMessageService.GLOBAL_MESSAGES_SHOWING_CONTEXT)));
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_W, win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] } }), viewCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), viewCategory);
if (platform.isWindows || platform.isLinux) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), viewCategory);
}

// Configuration: Window
const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'window',
	'order': 6,
	'title': nls.localize('windowConfigurationTitle', "Window configuration"),
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
	'order': 10,
	'title': nls.localize('updateConfigurationTitle', "Update configuration"),
	'type': 'object',
	'properties': {
		'update.channel': {
			'type': 'string',
			'enum': ['none', 'default'],
			'default': 'default',
			'description': nls.localize('updateChannel', "Configure the update channel to receive updates from. Requires a restart after change.")
		}
	}
});