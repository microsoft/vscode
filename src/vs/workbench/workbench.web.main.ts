/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO WORKBENCH.COMMON.MAIN.TS !!! ###
// ###                                                                 ###
// #######################################################################


//#region --- workbench common

import 'vs/workbench/workbench.common.main';

//#endregion


//#region --- workbench parts

import 'vs/workbench/browser/parts/dialogs/dialog.web.contribution';

//#endregion


//#region --- workbench (web main)

import 'vs/workbench/browser/web.main';

//#endregion


//#region --- workbench services

import 'vs/workbench/services/integrity/browser/integrityService';
import 'vs/workbench/services/search/browser/searchService';
import 'vs/workbench/services/textfile/browser/browserTextFileService';
import 'vs/workbench/services/keybinding/browser/keyboardLayoutService';
import 'vs/workbench/services/extensions/browser/extensionService';
import 'vs/workbench/services/extensionManagement/browser/extensionsProfileScannerService';
import 'vs/workbench/services/extensions/browser/extensionsScannerService';
import 'vs/workbench/services/extensionManagement/browser/webExtensionsScannerService';
import 'vs/workbench/services/extensionManagement/common/extensionManagementServerService';
import 'vs/workbench/services/telemetry/browser/telemetryService';
import 'vs/workbench/services/url/browser/urlService';
import 'vs/workbench/services/update/browser/updateService';
import 'vs/workbench/services/workspaces/browser/workspacesService';
import 'vs/workbench/services/workspaces/browser/workspaceEditingService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
import 'vs/workbench/services/host/browser/browserHostService';
import 'vs/workbench/services/lifecycle/browser/lifecycleService';
import 'vs/workbench/services/clipboard/browser/clipboardService';
import 'vs/workbench/services/localization/browser/localeService';
import 'vs/workbench/services/path/browser/pathService';
import 'vs/workbench/services/themes/browser/browserHostColorSchemeService';
import 'vs/workbench/services/encryption/browser/encryptionService';
import 'vs/workbench/services/secrets/browser/secretStorageService';
import 'vs/workbench/services/workingCopy/browser/workingCopyBackupService';
import 'vs/workbench/services/tunnel/browser/tunnelService';
import 'vs/workbench/services/files/browser/elevatedFileService';
import 'vs/workbench/services/workingCopy/browser/workingCopyHistoryService';
import 'vs/workbench/services/userDataSync/browser/webUserDataSyncEnablementService';
import 'vs/workbench/services/userDataProfile/browser/userDataProfileStorageService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
import 'vs/platform/extensionResourceLoader/browser/extensionResourceLoaderService';
import 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionTipsService';
import { IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';
import { LogLevel } from 'vs/platform/log/common/log';
import { UserDataSyncMachinesService, IUserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { IUserDataSyncStoreService, IUserDataSyncService, IUserDataAutoSyncService, IUserDataSyncLocalStoreService, IUserDataSyncResourceProviderService } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { UserDataSyncLocalStoreService } from 'vs/platform/userDataSync/common/userDataSyncLocalStoreService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { AccessibilityService } from 'vs/platform/accessibility/browser/accessibilityService';
import { ICustomEndpointTelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullEndpointTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { BrowserTitleService } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { ITimerService, TimerService } from 'vs/workbench/services/timer/browser/timerService';
import { IDiagnosticsService, NullDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { WebLanguagePacksService } from 'vs/platform/languagePacks/browser/languagePacks';

registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, InstantiationType.Delayed);
registerSingleton(IAccessibilityService, AccessibilityService, InstantiationType.Delayed);
registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncMachinesService, UserDataSyncMachinesService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncLocalStoreService, UserDataSyncLocalStoreService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncAccountService, UserDataSyncAccountService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncService, UserDataSyncService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncResourceProviderService, UserDataSyncResourceProviderService, InstantiationType.Delayed);
registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService, InstantiationType.Eager /* Eager to start auto sync */);
registerSingleton(ITitleService, BrowserTitleService, InstantiationType.Eager);
registerSingleton(IExtensionTipsService, ExtensionTipsService, InstantiationType.Delayed);
registerSingleton(ITimerService, TimerService, InstantiationType.Delayed);
registerSingleton(ICustomEndpointTelemetryService, NullEndpointTelemetryService, InstantiationType.Delayed);
registerSingleton(IDiagnosticsService, NullDiagnosticsService, InstantiationType.Delayed);
registerSingleton(ILanguagePackService, WebLanguagePacksService, InstantiationType.Delayed);

//#endregion


//#region --- workbench contributions

// Logs
import 'vs/workbench/contrib/logs/browser/logs.contribution';

// Localization
import 'vs/workbench/contrib/localization/browser/localization.contribution';

// Performance
import 'vs/workbench/contrib/performance/browser/performance.web.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/keyboardLayoutPicker';

// Debug
import 'vs/workbench/contrib/debug/browser/extensionHostDebugService';

// Welcome Banner
import 'vs/workbench/contrib/welcomeBanner/browser/welcomeBanner.contribution';

// Welcome Dialog
import 'vs/workbench/contrib/welcomeDialog/browser/welcomeDialog.contribution';

// Webview
import 'vs/workbench/contrib/webview/browser/webview.web.contribution';

// Extensions Management
import 'vs/workbench/contrib/extensions/browser/extensions.web.contribution';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminal.web.contribution';
import 'vs/workbench/contrib/externalTerminal/browser/externalTerminal.contribution';
import 'vs/workbench/contrib/terminal/browser/terminalInstanceService';

// Tasks
import 'vs/workbench/contrib/tasks/browser/taskService';

// Tags
import 'vs/workbench/contrib/tags/browser/workspaceTagsService';

// Issues
import 'vs/workbench/contrib/issue/browser/issue.contribution';

// Splash
import 'vs/workbench/contrib/splash/browser/splash.contribution';

// Remote Start Entry for the Web
import 'vs/workbench/contrib/remote/browser/remoteStartEntry.contribution';

//#endregion


//#region --- export workbench factory

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//
// Do NOT change these exports in a way that something is removed unless
// intentional. These exports are used by web embedders and thus require
// an adoption when something changes.
//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

import { create, commands, env, window, workspace, logger } from 'vs/workbench/browser/web.factory';
import { Menu } from 'vs/workbench/browser/web.api';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { GroupOrientation } from 'vs/workbench/services/editor/common/editorGroupsService';
import { UserDataSyncResourceProviderService } from 'vs/platform/userDataSync/common/userDataSyncResourceProvider';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from 'vs/platform/remote/common/remoteAuthorityResolver';

export {

	// Factory
	create,

	// Basic Types
	URI,
	Event,
	Emitter,
	Disposable,
	GroupOrientation,
	LogLevel,
	RemoteAuthorityResolverError,
	RemoteAuthorityResolverErrorCode,

	// Facade API
	env,
	window,
	workspace,
	commands,
	logger,
	Menu
};

//#endregion
