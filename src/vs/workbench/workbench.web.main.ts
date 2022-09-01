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
import 'vs/workbench/services/textMate/browser/browserTextMateService';
import 'vs/workbench/services/search/browser/searchService';
import 'vs/workbench/services/textfile/browser/browserTextFileService';
import 'vs/workbench/services/keybinding/browser/keyboardLayoutService';
import 'vs/workbench/services/extensions/browser/extensionService';
import 'vs/workbench/services/extensionManagement/browser/webExtensionsScannerService';
import 'vs/workbench/services/extensionManagement/common/extensionManagementServerService';
import 'vs/workbench/services/extensionManagement/browser/extensionUrlTrustService';
import 'vs/workbench/services/telemetry/browser/telemetryService';
import 'vs/workbench/services/credentials/browser/credentialsService';
import 'vs/workbench/services/url/browser/urlService';
import 'vs/workbench/services/update/browser/updateService';
import 'vs/workbench/services/workspaces/browser/workspacesService';
import 'vs/workbench/services/workspaces/browser/workspaceEditingService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
import 'vs/workbench/services/host/browser/browserHostService';
import 'vs/workbench/services/lifecycle/browser/lifecycleService';
import 'vs/workbench/services/clipboard/browser/clipboardService';
import 'vs/workbench/services/extensionResourceLoader/browser/extensionResourceLoaderService';
import 'vs/workbench/services/path/browser/pathService';
import 'vs/workbench/services/themes/browser/browserHostColorSchemeService';
import 'vs/workbench/services/encryption/browser/encryptionService';
import 'vs/workbench/services/workingCopy/browser/workingCopyBackupService';
import 'vs/workbench/services/tunnel/browser/tunnelService';
import 'vs/workbench/services/files/browser/elevatedFileService';
import 'vs/workbench/services/workingCopy/browser/workingCopyHistoryService';
import 'vs/workbench/services/userDataSync/browser/webUserDataSyncEnablementService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionTipsService';
import { IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';
import { ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { FileLoggerService } from 'vs/platform/log/common/fileLog';
import { UserDataSyncMachinesService, IUserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { IUserDataSyncStoreService, IUserDataSyncService, IUserDataAutoSyncService, IUserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { UserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSyncBackupStoreService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { AccessibilityService } from 'vs/platform/accessibility/browser/accessibilityService';
import { ICustomEndpointTelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullEndpointTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { TitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { ITimerService, TimerService } from 'vs/workbench/services/timer/browser/timerService';
import { IDiagnosticsService, NullDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { WebLanguagePacksService } from 'vs/platform/languagePacks/browser/languagePacks';

registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, true);
registerSingleton(IAccessibilityService, AccessibilityService, true);
registerSingleton(IContextMenuService, ContextMenuService, false);
registerSingleton(ILoggerService, FileLoggerService, true);
registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService, true);
registerSingleton(IUserDataSyncMachinesService, UserDataSyncMachinesService, true);
registerSingleton(IUserDataSyncBackupStoreService, UserDataSyncBackupStoreService, true);
registerSingleton(IUserDataSyncAccountService, UserDataSyncAccountService, true);
registerSingleton(IUserDataSyncService, UserDataSyncService, true);
registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService, false);
registerSingleton(ITitleService, TitlebarPart, false);
registerSingleton(IExtensionTipsService, ExtensionTipsService, true);
registerSingleton(ITimerService, TimerService, false);
registerSingleton(ICustomEndpointTelemetryService, NullEndpointTelemetryService, true);
registerSingleton(IDiagnosticsService, NullDiagnosticsService, true);
registerSingleton(ILanguagePackService, WebLanguagePacksService, true);

//#endregion


//#region --- workbench contributions

// Output
import 'vs/workbench/contrib/output/common/outputChannelModelService';

// Logs
import 'vs/workbench/contrib/logs/browser/logs.contribution';

// Explorer
import 'vs/workbench/contrib/files/browser/files.web.contribution';

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
import 'vs/workbench/contrib/issue/browser/issue.web.contribution';

// Splash
import 'vs/workbench/contrib/splash/browser/splash.contribution';

// Offline
import 'vs/workbench/contrib/offline/browser/offline.contribution';

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
import { IWorkbench, ICommand, ICommonTelemetryPropertiesResolver, IDefaultEditor, IDefaultLayout, IDefaultView, IDevelopmentOptions, IExternalUriResolver, IExternalURLOpener, IHomeIndicator, IInitialColorTheme, IPosition, IProductQualityChangeHandler, IRange, IResourceUriProvider, ISettingsSyncOptions, IShowPortCandidate, ITunnel, ITunnelFactory, ITunnelOptions, ITunnelProvider, IWelcomeBanner, IWelcomeBannerAction, IWindowIndicator, IWorkbenchConstructionOptions, Menu } from 'vs/workbench/browser/web.api';
import { UriComponents, URI } from 'vs/base/common/uri';
import { IWebSocketFactory, IWebSocket } from 'vs/platform/remote/browser/browserSocketFactory';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IProductConfiguration } from 'vs/base/common/product';
import { ICredentialsProvider } from 'vs/platform/credentials/common/credentials';
// eslint-disable-next-line no-duplicate-imports
import type { IURLCallbackProvider } from 'vs/workbench/services/url/browser/urlService';
// eslint-disable-next-line no-duplicate-imports
import type { IUpdateProvider, IUpdate } from 'vs/workbench/services/update/browser/updateService';
// eslint-disable-next-line no-duplicate-imports
import type { IWorkspace, IWorkspaceProvider } from 'vs/workbench/services/host/browser/browserHostService';

export {

	// Factory
	create,
	IWorkbenchConstructionOptions,
	IWorkbench,

	// Basic Types
	URI,
	UriComponents,
	Event,
	Emitter,
	IDisposable,
	Disposable,

	// Workspace
	IWorkspace,
	IWorkspaceProvider,

	// WebSockets
	IWebSocketFactory,
	IWebSocket,

	// Resources
	IResourceUriProvider,

	// Credentials
	ICredentialsProvider,

	// Callbacks
	IURLCallbackProvider,

	// LogLevel
	LogLevel,

	// SettingsSync
	ISettingsSyncOptions,

	// Updates/Quality
	IUpdateProvider,
	IUpdate,
	IProductQualityChangeHandler,

	// Telemetry
	ICommonTelemetryPropertiesResolver,

	// External Uris
	IExternalUriResolver,

	// External URL Opener
	IExternalURLOpener,

	// Tunnel
	ITunnelProvider,
	ITunnelFactory,
	ITunnel,
	ITunnelOptions,

	// Ports
	IShowPortCandidate,

	// Commands
	ICommand,
	commands,
	Menu,

	// Logger
	logger,

	// Window
	window,

	// Branding
	IHomeIndicator,
	IWelcomeBanner,
	IWelcomeBannerAction,
	IProductConfiguration,
	IWindowIndicator,
	IInitialColorTheme,

	// Default layout
	IDefaultView,
	IDefaultEditor,
	IDefaultLayout,
	IPosition,
	IRange as ISelection,

	// Env
	env,

	// Workspace
	workspace,

	// Development
	IDevelopmentOptions
};


//#endregion
