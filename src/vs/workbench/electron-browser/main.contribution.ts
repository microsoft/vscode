/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import * as nls from 'vs/nls';
import * as os from 'os';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { KeybindingsReferenceAction, OpenDocumentationUrlAction, OpenIntroductoryVideosUrlAction, OpenTipsAndTricksUrlAction, OpenTwitterUrlAction, OpenRequestFeatureUrlAction, OpenPrivacyStatementUrlAction, OpenLicenseUrlAction, OpenNewsletterSignupUrlAction } from 'vs/workbench/electron-browser/actions/helpActions';
import { ToggleSharedProcessAction, ToggleDevToolsAction } from 'vs/workbench/electron-browser/actions/developerActions';
import { ZoomResetAction, ZoomOutAction, ZoomInAction, CloseCurrentWindowAction, SwitchWindow, NewWindowAction, QuickSwitchWindow, ReloadWindowWithExtensionsDisabledAction, NewWindowTabHandler, ShowPreviousWindowTabHandler, ShowNextWindowTabHandler, MoveWindowTabToNewWindowHandler, MergeWindowTabsHandlerHandler, ToggleWindowTabsBarHandler } from 'vs/workbench/electron-browser/actions/windowActions';
import { AddRootFolderAction, GlobalRemoveRootFolderAction, SaveWorkspaceAsAction, DuplicateWorkspaceInNewWindowAction, CloseWorkspaceAction } from 'vs/workbench/browser/actions/workspaceActions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ADD_ROOT_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { SupportsWorkspacesContext, IsMacContext, HasMacNativeTabsContext, IsDevelopmentContext, WorkbenchStateContext, WorkspaceFolderCountContext } from 'vs/workbench/browser/contextkeys';
import { NoEditorsVisibleContext, SingleEditorGroupsContext } from 'vs/workbench/common/editor';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';

// Actions
(function registerActions(): void {
	const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

	// Actions: File
	(function registerFileActions(): void {
		const fileCategory = nls.localize('file', "File");

		registry.registerWorkbenchAction(new SyncActionDescriptor(CloseWorkspaceAction, CloseWorkspaceAction.ID, CloseWorkspaceAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), 'File: Close Workspace', fileCategory);
	})();

	// Actions: View
	(function registerViewActions(): void {
		const viewCategory = nls.localize('view', "View");

		registry.registerWorkbenchAction(new SyncActionDescriptor(ZoomInAction, ZoomInAction.ID, ZoomInAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_EQUAL, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_EQUAL, KeyMod.CtrlCmd | KeyCode.NUMPAD_ADD] }), 'View: Zoom In', viewCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(ZoomOutAction, ZoomOutAction.ID, ZoomOutAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_MINUS, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS, KeyMod.CtrlCmd | KeyCode.NUMPAD_SUBTRACT], linux: { primary: KeyMod.CtrlCmd | KeyCode.US_MINUS, secondary: [KeyMod.CtrlCmd | KeyCode.NUMPAD_SUBTRACT] } }), 'View: Zoom Out', viewCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(ZoomResetAction, ZoomResetAction.ID, ZoomResetAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.NUMPAD_0 }), 'View: Reset Zoom', viewCategory);
	})();

	// Actions: Window
	(function registerWindowActions(): void {
		registry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowAction, NewWindowAction.ID, NewWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_N }), 'New Window');
		registry.registerWorkbenchAction(new SyncActionDescriptor(CloseCurrentWindowAction, CloseCurrentWindowAction.ID, CloseCurrentWindowAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W }), 'Close Window');
		registry.registerWorkbenchAction(new SyncActionDescriptor(SwitchWindow, SwitchWindow.ID, SwitchWindow.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_W } }), 'Switch Window...');
		registry.registerWorkbenchAction(new SyncActionDescriptor(QuickSwitchWindow, QuickSwitchWindow.ID, QuickSwitchWindow.LABEL), 'Quick Switch Window...');

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: CloseCurrentWindowAction.ID, // close the window when the last editor is closed by reusing the same keybinding
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(NoEditorsVisibleContext, SingleEditorGroupsContext),
			primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
			handler: accessor => {
				const windowService = accessor.get(IWindowService);
				windowService.closeWindow();
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'workbench.action.quit',
			weight: KeybindingWeight.WorkbenchContrib,
			handler(accessor: ServicesAccessor) {
				const windowsService = accessor.get(IWindowsService);
				windowsService.quit();
			},
			when: undefined,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_Q },
			linux: { primary: KeyMod.CtrlCmd | KeyCode.KEY_Q }
		});
	})();

	// Actions: Workspaces
	(function registerWorkspaceActions(): void {
		const workspacesCategory = nls.localize('workspaces', "Workspaces");

		registry.registerWorkbenchAction(new SyncActionDescriptor(AddRootFolderAction, AddRootFolderAction.ID, AddRootFolderAction.LABEL), 'Workspaces: Add Folder to Workspace...', workspacesCategory, SupportsWorkspacesContext);
		registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalRemoveRootFolderAction, GlobalRemoveRootFolderAction.ID, GlobalRemoveRootFolderAction.LABEL), 'Workspaces: Remove Folder from Workspace...', workspacesCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(SaveWorkspaceAsAction, SaveWorkspaceAsAction.ID, SaveWorkspaceAsAction.LABEL), 'Workspaces: Save Workspace As...', workspacesCategory, SupportsWorkspacesContext);
		registry.registerWorkbenchAction(new SyncActionDescriptor(DuplicateWorkspaceInNewWindowAction, DuplicateWorkspaceInNewWindowAction.ID, DuplicateWorkspaceInNewWindowAction.LABEL), 'Workspaces: Duplicate Workspace in New Window', workspacesCategory);
	})();

	// Actions: macOS Native Tabs
	(function registerMacOSNativeTabsActions(): void {
		if (isMacintosh) {
			[
				{ handler: NewWindowTabHandler, id: 'workbench.action.newWindowTab', title: { value: nls.localize('newTab', "New Window Tab"), original: 'New Window Tab' } },
				{ handler: ShowPreviousWindowTabHandler, id: 'workbench.action.showPreviousWindowTab', title: { value: nls.localize('showPreviousTab', "Show Previous Window Tab"), original: 'Show Previous Window Tab' } },
				{ handler: ShowNextWindowTabHandler, id: 'workbench.action.showNextWindowTab', title: { value: nls.localize('showNextWindowTab', "Show Next Window Tab"), original: 'Show Next Window Tab' } },
				{ handler: MoveWindowTabToNewWindowHandler, id: 'workbench.action.moveWindowTabToNewWindow', title: { value: nls.localize('moveWindowTabToNewWindow', "Move Window Tab to New Window"), original: 'Move Window Tab to New Window' } },
				{ handler: MergeWindowTabsHandlerHandler, id: 'workbench.action.mergeAllWindowTabs', title: { value: nls.localize('mergeAllWindowTabs', "Merge All Windows"), original: 'Merge All Windows' } },
				{ handler: ToggleWindowTabsBarHandler, id: 'workbench.action.toggleWindowTabsBar', title: { value: nls.localize('toggleWindowTabsBar', "Toggle Window Tabs Bar"), original: 'Toggle Window Tabs Bar' } }
			].forEach(command => {
				CommandsRegistry.registerCommand(command.id, command.handler);

				MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
					command,
					when: HasMacNativeTabsContext
				});
			});
		}
	})();

	// Actions: Developer
	(function registerDeveloperActions(): void {
		const developerCategory = nls.localize('developer', "Developer");
		registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSharedProcessAction, ToggleSharedProcessAction.ID, ToggleSharedProcessAction.LABEL), 'Developer: Toggle Shared Process', developerCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowWithExtensionsDisabledAction, ReloadWindowWithExtensionsDisabledAction.ID, ReloadWindowWithExtensionsDisabledAction.LABEL), 'Developer: Reload Window With Extensions Disabled', developerCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL), 'Developer: Toggle Developer Tools', developerCategory);

		KeybindingsRegistry.registerKeybindingRule({
			id: ToggleDevToolsAction.ID,
			weight: KeybindingWeight.WorkbenchContrib + 50,
			when: IsDevelopmentContext,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I }
		});
	})();

	// Actions: help
	(function registerHelpActions(): void {
		const helpCategory = nls.localize('help', "Help");

		if (KeybindingsReferenceAction.AVAILABLE) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(KeybindingsReferenceAction, KeybindingsReferenceAction.ID, KeybindingsReferenceAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_R) }), 'Help: Keyboard Shortcuts Reference', helpCategory);
		}

		if (OpenDocumentationUrlAction.AVAILABLE) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDocumentationUrlAction, OpenDocumentationUrlAction.ID, OpenDocumentationUrlAction.LABEL), 'Help: Documentation', helpCategory);
		}

		if (OpenIntroductoryVideosUrlAction.AVAILABLE) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(OpenIntroductoryVideosUrlAction, OpenIntroductoryVideosUrlAction.ID, OpenIntroductoryVideosUrlAction.LABEL), 'Help: Introductory Videos', helpCategory);
		}

		if (OpenTipsAndTricksUrlAction.AVAILABLE) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(OpenTipsAndTricksUrlAction, OpenTipsAndTricksUrlAction.ID, OpenTipsAndTricksUrlAction.LABEL), 'Help: Tips and Tricks', helpCategory);
		}

		if (OpenNewsletterSignupUrlAction.AVAILABLE) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNewsletterSignupUrlAction, OpenNewsletterSignupUrlAction.ID, OpenNewsletterSignupUrlAction.LABEL), 'Help: Tips and Tricks', helpCategory);
		}

		registry.registerWorkbenchAction(new SyncActionDescriptor(OpenTwitterUrlAction, OpenTwitterUrlAction.ID, OpenTwitterUrlAction.LABEL), 'Help: Join Us on Twitter', helpCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(OpenRequestFeatureUrlAction, OpenRequestFeatureUrlAction.ID, OpenRequestFeatureUrlAction.LABEL), 'Help: Search Feature Requests', helpCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(OpenLicenseUrlAction, OpenLicenseUrlAction.ID, OpenLicenseUrlAction.LABEL), 'Help: View License', helpCategory);
		registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPrivacyStatementUrlAction, OpenPrivacyStatementUrlAction.ID, OpenPrivacyStatementUrlAction.LABEL), 'Help: Privacy Statement', helpCategory);
	})();
})();

// Menu
(function registerMenu(): void {
	MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
		group: '1_new',
		command: {
			id: NewWindowAction.ID,
			title: nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
		group: '3_workspace',
		command: {
			id: ADD_ROOT_FOLDER_COMMAND_ID,
			title: nls.localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
		},
		order: 1,
		when: SupportsWorkspacesContext
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
		group: '3_workspace',
		command: {
			id: SaveWorkspaceAsAction.ID,
			title: nls.localize('miSaveWorkspaceAs', "Save Workspace As...")
		},
		order: 2,
		when: SupportsWorkspacesContext
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
		group: '6_close',
		command: {
			id: CloseWorkspaceAction.ID,
			title: nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"),
			precondition: WorkspaceFolderCountContext.notEqualsTo('0')
		},
		order: 3,
		when: WorkbenchStateContext.notEqualsTo('workspace')
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
		group: '6_close',
		command: {
			id: CloseWorkspaceAction.ID,
			title: nls.localize({ key: 'miCloseWorkspace', comment: ['&& denotes a mnemonic'] }, "Close &&Workspace")
		},
		order: 3,
		when: WorkbenchStateContext.isEqualTo('workspace')
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
			id: 'workbench.action.quit',
			title: nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")
		},
		order: 1,
		when: IsMacContext.toNegated()
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
			id: OpenDocumentationUrlAction.ID,
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
			id: KeybindingsReferenceAction.ID,
			title: nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: OpenIntroductoryVideosUrlAction.ID,
			title: nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: OpenTipsAndTricksUrlAction.ID,
			title: nls.localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "Tips and Tri&&cks")
		},
		order: 3
	});

	// Feedback
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: OpenTwitterUrlAction.ID,
			title: nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join Us on Twitter")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: OpenRequestFeatureUrlAction.ID,
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
			id: OpenLicenseUrlAction.ID,
			title: nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '4_legal',
		command: {
			id: OpenPrivacyStatementUrlAction.ID,
			title: nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "Privac&&y Statement")
		},
		order: 2
	});

	// Tools
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '5_tools',
		command: {
			id: ToggleDevToolsAction.ID,
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
})();

// Configuration
(function registerConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	// Window
	registry.registerConfiguration({
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
			'window.autoDetectHighContrast': {
				'type': 'boolean',
				'default': true,
				'description': nls.localize('autoDetectHighContrast', "If enabled, will automatically change to high contrast theme if Windows is using a high contrast theme, and to dark theme when switching away from a Windows high contrast theme."),
				'scope': ConfigurationScope.APPLICATION,
				'included': isWindows
			},
			'window.doubleClickIconToClose': {
				'type': 'boolean',
				'default': false,
				'scope': ConfigurationScope.APPLICATION,
				'markdownDescription': nls.localize('window.doubleClickIconToClose', "If enabled, double clicking the application icon in the title bar will close the window and the window cannot be dragged by the icon. This setting only has an effect when `#window.titleBarStyle#` is set to `custom`.")
			},
			'window.titleBarStyle': {
				'type': 'string',
				'enum': ['native', 'custom'],
				'default': isLinux ? 'native' : 'custom',
				'scope': ConfigurationScope.APPLICATION,
				'description': nls.localize('titleBarStyle', "Adjust the appearance of the window title bar. On Linux and Windows, this setting also affects the application and context menu appearances. Changes require a full restart to apply.")
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
				'scope': ConfigurationScope.APPLICATION,
				'included': isMacintosh
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

	// Telemetry
	registry.registerConfiguration({
		'id': 'telemetry',
		'order': 110,
		title: nls.localize('telemetryConfigurationTitle', "Telemetry"),
		'type': 'object',
		'properties': {
			'telemetry.enableCrashReporter': {
				'type': 'boolean',
				'description': nls.localize('telemetry.enableCrashReporting', "Enable crash reports to be sent to a Microsoft online service. \nThis option requires restart to take effect."),
				'default': true,
				'tags': ['usesOnlineServices']
			}
		}
	});
})();
