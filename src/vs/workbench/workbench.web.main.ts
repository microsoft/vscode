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

import './workbench.common.main';

//#endregion


//#region --- workbench parts

import './browser/parts/dialogs/dialog.web.contribution';

//#endregion


//#region --- workbench (web main)

import './browser/web.main';

//#endregion


//#region --- workbench services

import './services/integrity/browser/integrityService';
import './services/search/browser/searchService';
import './services/textfile/browser/browserTextFileService';
import './services/keybinding/browser/keyboardLayoutService';
import './services/extensions/browser/extensionService';
import './services/extensionManagement/browser/extensionsProfileScannerService';
import './services/extensions/browser/extensionsScannerService';
import './services/extensionManagement/browser/webExtensionsScannerService';
import './services/extensionManagement/common/extensionManagementServerService';
import './services/telemetry/browser/telemetryService';
import './services/url/browser/urlService';
import './services/update/browser/updateService';
import './services/workspaces/browser/workspacesService';
import './services/workspaces/browser/workspaceEditingService';
import './services/dialogs/browser/fileDialogService';
import './services/host/browser/browserHostService';
import './services/lifecycle/browser/lifecycleService';
import './services/clipboard/browser/clipboardService';
import './services/localization/browser/localeService';
import './services/path/browser/pathService';
import './services/themes/browser/browserHostColorSchemeService';
import './services/encryption/browser/encryptionService';
import './services/secrets/browser/secretStorageService';
import './services/workingCopy/browser/workingCopyBackupService';
import './services/tunnel/browser/tunnelService';
import './services/files/browser/elevatedFileService';
import './services/workingCopy/browser/workingCopyHistoryService';
import './services/userDataSync/browser/webUserDataSyncEnablementService';
import './services/userDataProfile/browser/userDataProfileStorageService';
import './services/configurationResolver/browser/configurationResolverService';
import '../platform/extensionResourceLoader/browser/extensionResourceLoaderService';
import './services/auxiliaryWindow/browser/auxiliaryWindowService';

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions';
import { IAccessibilityService } from '../platform/accessibility/common/accessibility';
import { IContextMenuService } from '../platform/contextview/browser/contextView';
import { ContextMenuService } from '../platform/contextview/browser/contextMenuService';
import { IExtensionTipsService } from '../platform/extensionManagement/common/extensionManagement';
import { ExtensionTipsService } from '../platform/extensionManagement/common/extensionTipsService';
import { IWorkbenchExtensionManagementService } from './services/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from './services/extensionManagement/common/extensionManagementService';
import { LogLevel } from '../platform/log/common/log';
import { UserDataSyncMachinesService, IUserDataSyncMachinesService } from '../platform/userDataSync/common/userDataSyncMachines';
import { IUserDataSyncStoreService, IUserDataSyncService, IUserDataAutoSyncService, IUserDataSyncLocalStoreService, IUserDataSyncResourceProviderService } from '../platform/userDataSync/common/userDataSync';
import { UserDataSyncStoreService } from '../platform/userDataSync/common/userDataSyncStoreService';
import { UserDataSyncLocalStoreService } from '../platform/userDataSync/common/userDataSyncLocalStoreService';
import { UserDataSyncService } from '../platform/userDataSync/common/userDataSyncService';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../platform/userDataSync/common/userDataSyncAccount';
import { UserDataAutoSyncService } from '../platform/userDataSync/common/userDataAutoSyncService';
import { AccessibilityService } from '../platform/accessibility/browser/accessibilityService';
import { ICustomEndpointTelemetryService } from '../platform/telemetry/common/telemetry';
import { NullEndpointTelemetryService } from '../platform/telemetry/common/telemetryUtils';
import { ITitleService } from './services/title/browser/titleService';
import { BrowserTitleService } from './browser/parts/titlebar/titlebarPart';
import { ITimerService, TimerService } from './services/timer/browser/timerService';
import { IDiagnosticsService, NullDiagnosticsService } from '../platform/diagnostics/common/diagnostics';
import { ILanguagePackService } from '../platform/languagePacks/common/languagePacks';
import { WebLanguagePacksService } from '../platform/languagePacks/browser/languagePacks';

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
import './contrib/logs/browser/logs.contribution';

// Localization
import './contrib/localization/browser/localization.contribution';

// Performance
import './contrib/performance/browser/performance.web.contribution';

// Preferences
import './contrib/preferences/browser/keyboardLayoutPicker';

// Debug
import './contrib/debug/browser/extensionHostDebugService';

// Welcome Banner
import './contrib/welcomeBanner/browser/welcomeBanner.contribution';

// Welcome Dialog
import './contrib/welcomeDialog/browser/welcomeDialog.contribution';

// Webview
import './contrib/webview/browser/webview.web.contribution';

// Extensions Management
import './contrib/extensions/browser/extensions.web.contribution';

// Terminal
import './contrib/terminal/browser/terminal.web.contribution';
import './contrib/externalTerminal/browser/externalTerminal.contribution';
import './contrib/terminal/browser/terminalInstanceService';

// Tasks
import './contrib/tasks/browser/taskService';

// Tags
import './contrib/tags/browser/workspaceTagsService';

// Issues
import './contrib/issue/browser/issue.contribution';

// Splash
import './contrib/splash/browser/splash.contribution';

// Remote Start Entry for the Web
import './contrib/remote/browser/remoteStartEntry.contribution';

//#endregion


//#region --- export workbench factory

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//
// Do NOT change these exports in a way that something is removed unless
// intentional. These exports are used by web embedders and thus require
// an adoption when something changes.
//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

import { create, commands, env, window, workspace, logger } from './browser/web.factory';
import { Menu } from './browser/web.api';
import { URI } from '../base/common/uri';
import { Event, Emitter } from '../base/common/event';
import { Disposable } from '../base/common/lifecycle';
import { GroupOrientation } from './services/editor/common/editorGroupsService';
import { UserDataSyncResourceProviderService } from '../platform/userDataSync/common/userDataSyncResourceProvider';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from '../platform/remote/common/remoteAuthorityResolver';

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
