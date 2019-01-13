/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import * as os from 'os';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { KeybindingsReferenceAction, OpenDocumentationUrlAction, OpenIntroductoryVideosUrlAction, OpenTipsAndTricksUrlAction, OpenIssueReporterAction, ReportPerformanceIssueUsingReporterAction, ZoomResetAction, ZoomOutAction, ZoomInAction, ToggleFullScreenAction, ToggleMenuBarAction, CloseWorkspaceAction, CloseCurrentWindowAction, SwitchWindow, NewWindowAction, NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction, IncreaseViewSizeAction, DecreaseViewSizeAction, ToggleSharedProcessAction, QuickSwitchWindow, QuickOpenRecentAction, inRecentFilesPickerContextKey, ShowAboutDialogAction, InspectContextKeysAction, OpenProcessExplorer, OpenTwitterUrlAction, OpenRequestFeatureUrlAction, OpenPrivacyStatementUrlAction, OpenLicenseUrlAction, OpenRecentAction, ToggleScreencastModeAction } from 'vs/workbench/electron-browser/actions';
import { registerCommands, QUIT_ID } from 'vs/workbench/electron-browser/commands';
import { AddRootFolderAction, GlobalRemoveRootFolderAction, OpenWorkspaceAction, SaveWorkspaceAsAction, OpenWorkspaceConfigFileAction, DuplicateWorkspaceInNewWindowAction, OpenFileFolderAction, OpenFileAction, OpenFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { inQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ADD_ROOT_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { IsMacContext } from 'vs/platform/workbench/common/contextkeys';

// Contribute Commands
registerCommands();

// Contribute Global Actions
const viewCategory = nls.localize('view', "View");
const helpCategory = nls.localize('help', "Help");
const fileCategory = nls.localize('file', "File");
const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }), 'New Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloseCurrentWindowAction, CloseCurrentWindowAction.ID, CloseCurrentWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }), 'Close Window');
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SwitchWindow, SwitchWindow.ID, SwitchWindow.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_W } }), 'Switch Window...');
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

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenTwitterUrlAction, OpenTwitterUrlAction.ID, OpenTwitterUrlAction.LABEL), 'Help: Join Us on Twitter', helpCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenRequestFeatureUrlAction, OpenRequestFeatureUrlAction.ID, OpenRequestFeatureUrlAction.LABEL), 'Help: Search Feature Requests', helpCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLicenseUrlAction, OpenLicenseUrlAction.ID, OpenLicenseUrlAction.LABEL), 'Help: View License', helpCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenPrivacyStatementUrlAction, OpenPrivacyStatementUrlAction.ID, OpenPrivacyStatementUrlAction.LABEL), 'Help: Privacy Statement', helpCategory);
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
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(DuplicateWorkspaceInNewWindowAction, DuplicateWorkspaceInNewWindowAction.ID, DuplicateWorkspaceInNewWindowAction.LABEL), 'Workspaces: Duplicate Workspace in New Window', workspacesCategory);

CommandsRegistry.registerCommand(OpenWorkspaceConfigFileAction.ID, serviceAccessor => {
	serviceAccessor.get(IInstantiationService).createInstance(OpenWorkspaceConfigFileAction, OpenWorkspaceConfigFileAction.ID, OpenWorkspaceConfigFileAction.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OpenWorkspaceConfigFileAction.ID,
		title: { value: `${workspacesCategory}: ${OpenWorkspaceConfigFileAction.LABEL}`, original: 'Workspaces: Open Workspace Configuration File' },
	},
	when: new RawContextKey<string>('workbenchState', '').isEqualTo('workspace')
});

// Developer related actions
const developerCategory = nls.localize('developer', "Developer");
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSharedProcessAction, ToggleSharedProcessAction.ID, ToggleSharedProcessAction.LABEL), 'Developer: Toggle Shared Process', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(InspectContextKeysAction, InspectContextKeysAction.ID, InspectContextKeysAction.LABEL), 'Developer: Inspect Context Keys', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleScreencastModeAction, ToggleScreencastModeAction.ID, ToggleScreencastModeAction.LABEL), 'Developer: Toggle Mouse Clicks', developerCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenProcessExplorer, OpenProcessExplorer.ID, OpenProcessExplorer.LABEL), 'Developer: Open Process Explorer', developerCategory);

const recentFilesPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));

const quickOpenNavigateNextInRecentFilesPickerId = 'workbench.action.quickOpenNavigateNextInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInRecentFilesPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInRecentFilesPickerId, true),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R }
});

const quickOpenNavigatePreviousInRecentFilesPicker = 'workbench.action.quickOpenNavigatePreviousInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInRecentFilesPicker,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInRecentFilesPicker, false),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_R }
});

// Menu registration - file menu

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '1_new',
	command: {
		id: NewWindowAction.ID,
		title: nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFileAction.ID,
		title: nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")
	},
	order: 1,
	when: IsMacContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFolderAction.ID,
		title: nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")
	},
	order: 2,
	when: IsMacContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFileFolderAction.ID,
		title: nls.localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")
	},
	order: 1,
	when: IsMacContext
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenWorkspaceAction.ID,
		title: nls.localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace...")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent"),
	submenu: MenuId.MenubarRecentMenu,
	group: '2_open',
	order: 4
});


// More
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: 'y_more',
	command: {
		id: OpenRecentAction.ID,
		title: nls.localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: ADD_ROOT_FOLDER_COMMAND_ID,
		title: nls.localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: SaveWorkspaceAsAction.ID,
		title: nls.localize('miSaveWorkspaceAs', "Save Workspace As...")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences"),
	submenu: MenuId.MenubarPreferencesMenu,
	group: '5_autosave',
	order: 2,
	when: IsMacContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseWorkspaceAction.ID,
		title: nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"),
		precondition: new RawContextKey<number>('workspaceFolderCount', 0).notEqualsTo('0')
	},
	order: 3,
	when: new RawContextKey<string>('workbenchState', '').notEqualsTo('workspace')
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseWorkspaceAction.ID,
		title: nls.localize({ key: 'miCloseWorkspace', comment: ['&& denotes a mnemonic'] }, "Close &&Workspace")
	},
	order: 3,
	when: new RawContextKey<string>('workbenchState', '').isEqualTo('workspace')
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseCurrentWindowAction.ID,
		title: nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: 'z_Exit',
	command: {
		id: QUIT_ID,
		title: nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")
	},
	order: 1,
	when: IsMacContext.toNegated()
});

// Appereance menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '2_appearance',
	title: nls.localize({ key: 'miAppearance', comment: ['&& denotes a mnemonic'] }, "&&Appearance"),
	submenu: MenuId.MenubarAppearanceMenu,
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleFullScreenAction.ID,
		title: nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleMenuBarAction.ID,
		title: nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar")
	},
	when: IsMacContext.toNegated(),
	order: 4
});

// Zoom

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_zoom',
	command: {
		id: ZoomInAction.ID,
		title: nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_zoom',
	command: {
		id: ZoomOutAction.ID,
		title: nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "&&Zoom Out")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_zoom',
	command: {
		id: ZoomResetAction.ID,
		title: nls.localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom")
	},
	order: 3
});

// Help

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'workbench.action.openDocumentationUrl',
		title: nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'update.showCurrentReleaseNotes',
		title: nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")
	},
	order: 4
});

// Reference
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '2_reference',
	command: {
		id: 'workbench.action.keybindingsReference',
		title: nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '2_reference',
	command: {
		id: 'workbench.action.openIntroductoryVideosUrl',
		title: nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '2_reference',
	command: {
		id: 'workbench.action.openTipsAndTricksUrl',
		title: nls.localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "Tips and Tri&&cks")
	},
	order: 3
});

// Feedback
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '3_feedback',
	command: {
		id: 'workbench.action.openTwitterUrl',
		title: nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join Us on Twitter")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '3_feedback',
	command: {
		id: 'workbench.action.openRequestFeatureUrl',
		title: nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '3_feedback',
	command: {
		id: 'workbench.action.openIssueReporter',
		title: nls.localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
	},
	order: 3
});

// Legal
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '4_legal',
	command: {
		id: 'workbench.action.openLicenseUrl',
		title: nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '4_legal',
	command: {
		id: 'workbench.action.openPrivacyStatementUrl',
		title: nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "Privac&&y Statement")
	},
	order: 2
});

// Tools
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: 'workbench.action.toggleDevTools',
		title: nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: 'workbench.action.openProcessExplorer',
		title: nls.localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
	},
	order: 2
});

// About
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: 'z_about',
	command: {
		id: 'workbench.action.showAboutDialog',
		title: nls.localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About")
	},
	order: 1,
	when: IsMacContext.toNegated()
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
			'description': nls.localize('showEditorTabs', "Controls whether opened editors should show in tabs or not."),
			'default': true
		},
		'workbench.editor.highlightModifiedTabs': {
			'type': 'boolean',
			'description': nls.localize('highlightModifiedTabs', "Controls whether a top border is drawn on modified (dirty) editor tabs or not."),
			'default': false
		},
		'workbench.editor.labelFormat': {
			'type': 'string',
			'enum': ['default', 'short', 'medium', 'long'],
			'enumDescriptions': [
				nls.localize('workbench.editor.labelFormat.default', "Show the name of the file. When tabs are enabled and two files have the same name in one group the distinguishing sections of each file's path are added. When tabs are disabled, the path relative to the workspace folder is shown if the editor is active."),
				nls.localize('workbench.editor.labelFormat.short', "Show the name of the file followed by its directory name."),
				nls.localize('workbench.editor.labelFormat.medium', "Show the name of the file followed by its path relative to the workspace folder."),
				nls.localize('workbench.editor.labelFormat.long', "Show the name of the file followed by its absolute path.")
			],
			'default': 'default',
			'description': nls.localize({
				comment: ['This is the description for a setting. Values surrounded by parenthesis are not to be translated.'],
				key: 'tabDescription'
			}, "Controls the format of the label for an editor."),
		},
		'workbench.editor.tabCloseButton': {
			'type': 'string',
			'enum': ['left', 'right', 'off'],
			'default': 'right',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorTabCloseButton' }, "Controls the position of the editor's tabs close buttons, or disables them when set to 'off'.")
		},
		'workbench.editor.tabSizing': {
			'type': 'string',
			'enum': ['fit', 'shrink'],
			'default': 'fit',
			'enumDescriptions': [
				nls.localize('workbench.editor.tabSizing.fit', "Always keep tabs large enough to show the full editor label."),
				nls.localize('workbench.editor.tabSizing.shrink', "Allow tabs to get smaller when the available space is not enough to show all tabs at once.")
			],
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'tabSizing' }, "Controls the sizing of editor tabs.")
		},
		'workbench.editor.showIcons': {
			'type': 'boolean',
			'description': nls.localize('showIcons', "Controls whether opened editors should show with an icon or not. This requires an icon theme to be enabled as well."),
			'default': true
		},
		'workbench.editor.enablePreview': {
			'type': 'boolean',
			'description': nls.localize('enablePreview', "Controls whether opened editors show as preview. Preview editors are reused until they are pinned (e.g. via double click or editing) and show up with an italic font style."),
			'default': true
		},
		'workbench.editor.enablePreviewFromQuickOpen': {
			'type': 'boolean',
			'description': nls.localize('enablePreviewFromQuickOpen', "Controls whether opened editors from Quick Open show as preview. Preview editors are reused until they are pinned (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.closeOnFileDelete': {
			'type': 'boolean',
			'description': nls.localize('closeOnFileDelete', "Controls whether editors showing a file that was opened during the session should close automatically when getting deleted or renamed by some other process. Disabling this will keep the editor open  on such an event. Note that deleting from within the application will always close the editor and that dirty files will never close to preserve your data."),
			'default': false
		},
		'workbench.editor.openPositioning': {
			'type': 'string',
			'enum': ['left', 'right', 'first', 'last'],
			'default': 'right',
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'editorOpenPositioning' }, "Controls where editors open. Select `left` or `right` to open editors to the left or right of the currently active one. Select `first` or `last` to open editors independently from the currently active one.")
		},
		'workbench.editor.openSideBySideDirection': {
			'type': 'string',
			'enum': ['right', 'down'],
			'default': 'right',
			'markdownDescription': nls.localize('sideBySideDirection', "Controls the default direction of editors that are opened side by side (e.g. from the explorer). By default, editors will open on the right hand side of the currently active one. If changed to `down`, the editors will open below the currently active one.")
		},
		'workbench.editor.closeEmptyGroups': {
			'type': 'boolean',
			'description': nls.localize('closeEmptyGroups', "Controls the behavior of empty editor groups when the last tab in the group is closed. When enabled, empty groups will automatically close. When disabled, empty groups will remain part of the grid."),
			'default': true
		},
		'workbench.editor.revealIfOpen': {
			'type': 'boolean',
			'description': nls.localize('revealIfOpen', "Controls whether an editor is revealed in any of the visible groups if opened. If disabled, an editor will prefer to open in the currently active editor group. If enabled, an already opened editor will be revealed instead of opened again in the currently active editor group. Note that there are some cases where this setting is ignored, e.g. when forcing an editor to open in a specific group or to the side of the currently active group."),
			'default': false
		},
		'workbench.editor.swipeToNavigate': {
			'type': 'boolean',
			'description': nls.localize('swipeToNavigate', "Navigate between open files using three-finger swipe horizontally."),
			'default': false,
			'included': isMacintosh
		},
		'workbench.editor.restoreViewState': {
			'type': 'boolean',
			'description': nls.localize('restoreViewState', "Restores the last view state (e.g. scroll position) when re-opening files after they have been closed."),
			'default': true,
		},
		'workbench.editor.centeredLayoutAutoResize': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('centeredLayoutAutoResize', "Controls if the centered layout should automatically resize to maximum width when more than one group is open. Once only one group is open it will resize back to the original centered width.")
		},
		'workbench.commandPalette.history': {
			'type': 'number',
			'description': nls.localize('commandHistory', "Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history."),
			'default': 50
		},
		'workbench.commandPalette.preserveInput': {
			'type': 'boolean',
			'description': nls.localize('preserveInput', "Controls whether the last typed input to the command palette should be restored when opening it the next time."),
			'default': false
		},
		'workbench.quickOpen.closeOnFocusLost': {
			'type': 'boolean',
			'description': nls.localize('closeOnFocusLost', "Controls whether Quick Open should close automatically once it loses focus."),
			'default': true
		},
		'workbench.quickOpen.preserveInput': {
			'type': 'boolean',
			'description': nls.localize('workbench.quickOpen.preserveInput', "Controls whether the last typed input to Quick Open should be restored when opening it the next time."),
			'default': false
		},
		'workbench.settings.openDefaultSettings': {
			'type': 'boolean',
			'description': nls.localize('openDefaultSettings', "Controls whether opening settings also opens an editor showing all default settings."),
			'default': false
		},
		'workbench.settings.useSplitJSON': {
			'type': 'boolean',
			'markdownDescription': nls.localize('useSplitJSON', "Controls whether to use the split JSON editor when editing settings as JSON."),
			'default': false
		},
		'workbench.settings.openDefaultKeybindings': {
			'type': 'boolean',
			'description': nls.localize('openDefaultKeybindings', "Controls whether opening keybinding settings also opens an editor showing all default keybindings."),
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
			'description': nls.localize('panelDefaultLocation', "Controls the default location of the panel (terminal, debug console, output, problems). It can either show at the bottom or on the right of the workbench.")
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
				nls.localize('fontAliasing', "Controls font aliasing method in the workbench."),
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
			'description': nls.localize('enableNaturalLanguageSettingsSearch', "Controls whether to enable the natural language search mode for settings. The natural language search is provided by a Microsoft online service."),
			'default': true,
			'scope': ConfigurationScope.WINDOW,
			'tags': ['usesOnlineServices']
		},
		'workbench.settings.settingsSearchTocBehavior': {
			'type': 'string',
			'enum': ['hide', 'filter'],
			'enumDescriptions': [
				nls.localize('settingsSearchTocBehavior.hide', "Hide the Table of Contents while searching."),
				nls.localize('settingsSearchTocBehavior.filter', "Filter the Table of Contents to just categories that have matching settings. Clicking a category will filter the results to that category."),
			],
			'description': nls.localize('settingsSearchTocBehavior', "Controls the behavior of the settings editor Table of Contents while searching."),
			'default': 'filter',
			'scope': ConfigurationScope.WINDOW
		},
		'workbench.settings.editor': {
			'type': 'string',
			'enum': ['ui', 'json'],
			'enumDescriptions': [
				nls.localize('settings.editor.ui', "Use the settings UI editor."),
				nls.localize('settings.editor.json', "Use the JSON file editor."),
			],
			'description': nls.localize('settings.editor.desc', "Determines which settings editor to use by default."),
			'default': 'ui',
			'scope': ConfigurationScope.WINDOW
		},
		'workbench.enableExperiments': {
			'type': 'boolean',
			'description': nls.localize('workbench.enableExperiments', "Fetches experiments to run from a Microsoft online service."),
			'default': true,
			'tags': ['usesOnlineServices']
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
				nls.localize('window.openFilesInNewWindow.on', "Files will open in a new window."),
				nls.localize('window.openFilesInNewWindow.off', "Files will open in the window with the files' folder open or the last active window."),
				isMacintosh ?
					nls.localize('window.openFilesInNewWindow.defaultMac', "Files will open in the window with the files' folder open or the last active window unless opened via the Dock or from Finder.") :
					nls.localize('window.openFilesInNewWindow.default', "Files will open in a new window unless picked from within the application (e.g. via the File menu).")
			],
			'default': 'off',
			'scope': ConfigurationScope.APPLICATION,
			'markdownDescription':
				isMacintosh ?
					nls.localize('openFilesInNewWindowMac', "Controls whether files should open in a new window. \nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).") :
					nls.localize('openFilesInNewWindow', "Controls whether files should open in a new window.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).")
		},
		'window.openFoldersInNewWindow': {
			'type': 'string',
			'enum': ['on', 'off', 'default'],
			'enumDescriptions': [
				nls.localize('window.openFoldersInNewWindow.on', "Folders will open in a new window."),
				nls.localize('window.openFoldersInNewWindow.off', "Folders will replace the last active window."),
				nls.localize('window.openFoldersInNewWindow.default', "Folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu).")
			],
			'default': 'default',
			'scope': ConfigurationScope.APPLICATION,
			'markdownDescription': nls.localize('openFoldersInNewWindow', "Controls whether folders should open in a new window or replace the last active window.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).")
		},
		'window.openWithoutArgumentsInNewWindow': {
			'type': 'string',
			'enum': ['on', 'off'],
			'enumDescriptions': [
				nls.localize('window.openWithoutArgumentsInNewWindow.on', "Open a new empty window."),
				nls.localize('window.openWithoutArgumentsInNewWindow.off', "Focus the last active running instance.")
			],
			'default': isMacintosh ? 'off' : 'on',
			'scope': ConfigurationScope.APPLICATION,
			'markdownDescription': nls.localize('openWithoutArgumentsInNewWindow', "Controls whether a new empty window should open when starting a second instance without arguments or if the last running instance should get focus.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).")
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
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('restoreWindows', "Controls how windows are being reopened after a restart.")
		},
		'window.restoreFullscreen': {
			'type': 'boolean',
			'default': false,
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('restoreFullscreen', "Controls whether a window should restore to full screen mode if it was exited in full screen mode.")
		},
		'window.zoomLevel': {
			'type': 'number',
			'default': 0,
			'description': nls.localize('zoomLevel', "Adjust the zoom level of the window. The original size is 0 and each increment above (e.g. 1) or below (e.g. -1) represents zooming 20% larger or smaller. You can also enter decimals to adjust the zoom level with a finer granularity.")
		},
		'window.title': {
			'type': 'string',
			'default': isMacintosh ? '${activeEditorShort}${separator}${rootName}' : '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}',
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by parenthesis are not to be translated.'], key: 'title' },
				"Controls the window title based on the active editor. Variables are substituted based on the context:\n- `\${activeEditorShort}`: the file name (e.g. myFile.txt).\n- `\${activeEditorMedium}`: the path of the file relative to the workspace folder (e.g. myFolder/myFile.txt).\n- `\${activeEditorLong}`: the full path of the file (e.g. /Users/Development/myProject/myFolder/myFile.txt).\n- `\${folderName}`: name of the workspace folder the file is contained in (e.g. myFolder).\n- `\${folderPath}`: file path of the workspace folder the file is contained in (e.g. /Users/Development/myFolder).\n- `\${rootName}`: name of the workspace (e.g. myFolder or myWorkspace).\n- `\${rootPath}`: file path of the workspace (e.g. /Users/Development/myWorkspace).\n- `\${appName}`: e.g. VS Code.\n- `\${dirty}`: a dirty indicator if the active editor is dirty.\n- `\${separator}`: a conditional separator (\" - \") that only shows when surrounded by variables with values or static text.")
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
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('newWindowDimensions', "Controls the dimensions of opening a new window when at least one window is already opened. Note that this setting does not have an impact on the first window that is opened. The first window will always restore the size and location as you left it before closing.")
		},
		'window.closeWhenEmpty': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('closeWhenEmpty', "Controls whether closing the last editor should also close the window. This setting only applies for windows that do not show folders.")
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
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('menuBarVisibility', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. By default, the menu bar will be visible, unless the window is full screen."),
			'included': isWindows || isLinux
		},
		'window.enableMenuBarMnemonics': {
			'type': 'boolean',
			'default': true,
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('enableMenuBarMnemonics', "If enabled, the main menus can be opened via Alt-key shortcuts. Disabling mnemonics allows to bind these Alt-key shortcuts to editor commands instead."),
			'included': isWindows || isLinux
		},
		'window.autoDetectHighContrast': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('autoDetectHighContrast', "If enabled, will automatically change to high contrast theme if Windows is using a high contrast theme, and to dark theme when switching away from a Windows high contrast theme."),
			'included': isWindows
		},
		'window.doubleClickIconToClose': {
			'type': 'boolean',
			'default': false,
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('window.doubleClickIconToClose', "If enabled, double clicking the application icon in the title bar will close the window and the window cannot be dragged by the icon. This setting only has an effect when `#window.titleBarStyle#` is set to `custom`.")
		},
		'window.titleBarStyle': {
			'type': 'string',
			'enum': ['native', 'custom'],
			'default': 'custom',
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('titleBarStyle', "Adjust the appearance of the window title bar. Changes require a full restart to apply.")
		},
		'window.nativeTabs': {
			'type': 'boolean',
			'default': false,
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('window.nativeTabs', "Enables macOS Sierra window tabs. Note that changes require a full restart to apply and that native tabs will disable a custom title bar style if configured."),
			'included': isMacintosh && parseFloat(os.release()) >= 16 // Minimum: macOS Sierra (10.12.x = darwin 16.x)
		},
		'window.nativeFullScreen': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('window.nativeFullScreen', "Controls if native full-screen should be used on macOS. Disable this option to prevent macOS from creating a new space when going full-screen."),
			'included': isMacintosh
		},
		'window.smoothScrollingWorkaround': { // TODO@Ben remove once https://github.com/Microsoft/vscode/issues/61824 settles
			'type': 'boolean',
			'default': false,
			'scope': ConfigurationScope.APPLICATION,
			'markdownDescription': nls.localize('window.smoothScrollingWorkaround', "Enable this workaround if scrolling is no longer smooth after restoring a minimized VS Code window. This is a workaround for an issue (https://github.com/Microsoft/vscode/issues/13612) where scrolling starts to lag on devices with precision trackpads like the Surface devices from Microsoft. Enabling this workaround can result in a little bit of layout flickering after restoring the window from minimized state but is otherwise harmless."),
			'included': isWindows
		},
		'window.clickThroughInactive': {
			'type': 'boolean',
			'default': true,
			'scope': ConfigurationScope.APPLICATION,
			'description': nls.localize('window.clickThroughInactive', "If enabled, clicking on an inactive window will both activate the window and trigger the element under the mouse if it is clickable. If disabled, clicking anywhere on an inactive window will activate it only and a second click is required on the element."),
			'included': isMacintosh
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
			'description': nls.localize('zenMode.fullScreen', "Controls whether turning on Zen Mode also puts the workbench into full screen mode.")
		},
		'zenMode.centerLayout': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.centerLayout', "Controls whether turning on Zen Mode also centers the layout.")
		},
		'zenMode.hideTabs': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideTabs', "Controls whether turning on Zen Mode also hides workbench tabs.")
		},
		'zenMode.hideStatusBar': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideStatusBar', "Controls whether turning on Zen Mode also hides the status bar at the bottom of the workbench.")
		},
		'zenMode.hideActivityBar': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideActivityBar', "Controls whether turning on Zen Mode also hides the activity bar at the left of the workbench.")
		},
		'zenMode.hideLineNumbers': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('zenMode.hideLineNumbers', "Controls whether turning on Zen Mode also hides the editor line numbers.")
		},
		'zenMode.restore': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('zenMode.restore', "Controls whether a window should restore to zen mode if it was exited in zen mode.")
		}
	}
});
