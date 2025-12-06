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

import './workbench.common.main.js';

//#endregion


//#region --- workbench parts

import './browser/parts/dialogs/dialog.web.contribution.js';

//#endregion


//#region --- workbench (web main)

import './browser/web.main.js';

//#endregion


//#region --- workbench services

import './services/integrity/browser/integrityService.js';
import './services/search/browser/searchService.js';
import './services/textfile/browser/browserTextFileService.js';
import './services/keybinding/browser/keyboardLayoutService.js';
import './services/extensions/browser/extensionService.js';
import './services/extensionManagement/browser/extensionsProfileScannerService.js';
import './services/extensions/browser/extensionsScannerService.js';
import './services/extensionManagement/browser/webExtensionsScannerService.js';
import './services/extensionManagement/common/extensionManagementServerService.js';
import './services/mcp/browser/mcpWorkbenchManagementService.js';
import './services/extensionManagement/browser/extensionGalleryManifestService.js';
import './services/telemetry/browser/telemetryService.js';
import './services/url/browser/urlService.js';
import './services/update/browser/updateService.js';
import './services/workspaces/browser/workspacesService.js';
import './services/workspaces/browser/workspaceEditingService.js';
import './services/dialogs/browser/fileDialogService.js';
import './services/host/browser/browserHostService.js';
import './services/lifecycle/browser/lifecycleService.js';
import './services/clipboard/browser/clipboardService.js';
import './services/localization/browser/localeService.js';
import './services/path/browser/pathService.js';
import './services/themes/browser/browserHostColorSchemeService.js';
import './services/encryption/browser/encryptionService.js';
import './services/imageResize/browser/imageResizeService.js';
import './services/secrets/browser/secretStorageService.js';
import './services/workingCopy/browser/workingCopyBackupService.js';
import './services/tunnel/browser/tunnelService.js';
import './services/files/browser/elevatedFileService.js';
import './services/workingCopy/browser/workingCopyHistoryService.js';
import './services/userDataSync/browser/webUserDataSyncEnablementService.js';
import './services/userDataProfile/browser/userDataProfileStorageService.js';
import './services/configurationResolver/browser/configurationResolverService.js';
import '../platform/extensionResourceLoader/browser/extensionResourceLoaderService.js';
import './services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import './services/browserElements/browser/webBrowserElementsService.js';

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IAccessibilityService } from '../platform/accessibility/common/accessibility.js';
import { IContextMenuService } from '../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../platform/contextview/browser/contextMenuService.js';
import { IExtensionTipsService } from '../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionTipsService } from '../platform/extensionManagement/common/extensionTipsService.js';
import { IWorkbenchExtensionManagementService } from './services/extensionManagement/common/extensionManagement.js';
import { ExtensionManagementService } from './services/extensionManagement/common/extensionManagementService.js';
import { LogLevel } from '../platform/log/common/log.js';
import { UserDataSyncMachinesService, IUserDataSyncMachinesService } from '../platform/userDataSync/common/userDataSyncMachines.js';
import { IUserDataSyncStoreService, IUserDataSyncService, IUserDataAutoSyncService, IUserDataSyncLocalStoreService, IUserDataSyncResourceProviderService } from '../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncStoreService } from '../platform/userDataSync/common/userDataSyncStoreService.js';
import { UserDataSyncLocalStoreService } from '../platform/userDataSync/common/userDataSyncLocalStoreService.js';
import { UserDataSyncService } from '../platform/userDataSync/common/userDataSyncService.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../platform/userDataSync/common/userDataSyncAccount.js';
import { UserDataAutoSyncService } from '../platform/userDataSync/common/userDataAutoSyncService.js';
import { AccessibilityService } from '../platform/accessibility/browser/accessibilityService.js';
import { ICustomEndpointTelemetryService } from '../platform/telemetry/common/telemetry.js';
import { NullEndpointTelemetryService } from '../platform/telemetry/common/telemetryUtils.js';
import { ITitleService } from './services/title/browser/titleService.js';
import { BrowserTitleService } from './browser/parts/titlebar/titlebarPart.js';
import { ITimerService, TimerService } from './services/timer/browser/timerService.js';
import { IDiagnosticsService, NullDiagnosticsService } from '../platform/diagnostics/common/diagnostics.js';
import { ILanguagePackService } from '../platform/languagePacks/common/languagePacks.js';
import { WebLanguagePacksService } from '../platform/languagePacks/browser/languagePacks.js';
import { IWebContentExtractorService, NullWebContentExtractorService, ISharedWebContentExtractorService, NullSharedWebContentExtractorService } from '../platform/webContentExtractor/common/webContentExtractor.js';
import { IMcpGalleryManifestService } from '../platform/mcp/common/mcpGalleryManifest.js';
import { WorkbenchMcpGalleryManifestService } from './services/mcp/browser/mcpGalleryManifestService.js';

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
registerSingleton(IWebContentExtractorService, NullWebContentExtractorService, InstantiationType.Delayed);
registerSingleton(ISharedWebContentExtractorService, NullSharedWebContentExtractorService, InstantiationType.Delayed);
registerSingleton(IMcpGalleryManifestService, WorkbenchMcpGalleryManifestService, InstantiationType.Delayed);

//#endregion


//#region --- workbench contributions

// Logs
import './contrib/logs/browser/logs.contribution.js';

// Localization
import './contrib/localization/browser/localization.contribution.js';

// Performance
import './contrib/performance/browser/performance.web.contribution.js';

// Preferences
import './contrib/preferences/browser/keyboardLayoutPicker.js';

// Debug
import './contrib/debug/browser/extensionHostDebugService.js';

// Welcome Banner
import './contrib/welcomeBanner/browser/welcomeBanner.contribution.js';

// Webview
import './contrib/webview/browser/webview.web.contribution.js';

// Extensions Management
import './contrib/extensions/browser/extensions.web.contribution.js';

// Terminal
import './contrib/terminal/browser/terminal.web.contribution.js';
import './contrib/externalTerminal/browser/externalTerminal.contribution.js';
import './contrib/terminal/browser/terminalInstanceService.js';

// Tasks
import './contrib/tasks/browser/taskService.js';

// Tags
import './contrib/tags/browser/workspaceTagsService.js';

// Issues
import './contrib/issue/browser/issue.contribution.js';

// Splash
import './contrib/splash/browser/splash.contribution.js';

// Remote Start Entry for the Web
import './contrib/remote/browser/remoteStartEntry.contribution.js';

// Process Explorer
import './contrib/processExplorer/browser/processExplorer.web.contribution.js';

//#endregion


//#region --- export workbench factory

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//
// Do NOT change these exports in a way that something is removed unless
// intentional. These exports are used by web embedders and thus require
// an adoption when something changes.
//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

import { create, commands, env, window, workspace, logger } from './browser/web.factory.js';
import { Menu } from './browser/web.api.js';
import { URI } from '../base/common/uri.js';
import { Event, Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';
import { GroupOrientation } from './services/editor/common/editorGroupsService.js';
import { UserDataSyncResourceProviderService } from '../platform/userDataSync/common/userDataSyncResourceProvider.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from '../platform/remote/common/remoteAuthorityResolver.js';

// TODO@esm remove me once we stop supporting our web-esm-bridge
// eslint-disable-next-line local/code-no-any-casts
if ((globalThis as any).__VSCODE_WEB_ESM_PROMISE) {
	const exports = {

		// Factory
		create: create,

		// Basic Types
		URI: URI,
		Event: Event,
		Emitter: Emitter,
		Disposable: Disposable,
		// GroupOrientation,
		LogLevel: LogLevel,
		RemoteAuthorityResolverError: RemoteAuthorityResolverError,
		RemoteAuthorityResolverErrorCode: RemoteAuthorityResolverErrorCode,

		// Facade API
		env: env,
		window: window,
		workspace: workspace,
		commands: commands,
		logger: logger,
		Menu: Menu
	};
	// eslint-disable-next-line local/code-no-any-casts
	(globalThis as any).__VSCODE_WEB_ESM_PROMISE(exports);
	// eslint-disable-next-line local/code-no-any-casts
	delete (globalThis as any).__VSCODE_WEB_ESM_PROMISE;
}

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
