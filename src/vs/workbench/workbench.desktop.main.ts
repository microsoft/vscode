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


//#region --- workbench (desktop main)

import './electron-browser/desktop.main.js';
import './electron-browser/desktop.contribution.js';

//#endregion


//#region --- workbench parts

import './electron-browser/parts/dialogs/dialog.contribution.js';

//#endregion


//#region --- workbench services

import './services/textfile/electron-browser/nativeTextFileService.js';
import './services/dialogs/electron-browser/fileDialogService.js';
import './services/workspaces/electron-browser/workspacesService.js';
import './services/menubar/electron-browser/menubarService.js';
import './services/update/electron-browser/updateService.js';
import './services/url/electron-browser/urlService.js';
import './services/lifecycle/electron-browser/lifecycleService.js';
import './services/title/electron-browser/titleService.js';
import './services/host/electron-browser/nativeHostService.js';
import './services/request/electron-browser/requestService.js';
import './services/clipboard/electron-browser/clipboardService.js';
import './services/contextmenu/electron-browser/contextmenuService.js';
import './services/workspaces/electron-browser/workspaceEditingService.js';
import './services/configurationResolver/electron-browser/configurationResolverService.js';
import './services/accessibility/electron-browser/accessibilityService.js';
import './services/keybinding/electron-browser/nativeKeyboardLayout.js';
import './services/path/electron-browser/pathService.js';
import './services/themes/electron-browser/nativeHostColorSchemeService.js';
import './services/extensionManagement/electron-browser/extensionManagementService.js';
import './services/mcp/electron-browser/mcpGalleryManifestService.js';
import './services/mcp/electron-browser/mcpWorkbenchManagementService.js';
import './services/encryption/electron-browser/encryptionService.js';
import './services/imageResize/electron-browser/imageResizeService.js';
import './services/browserElements/electron-browser/browserElementsService.js';
import './services/secrets/electron-browser/secretStorageService.js';
import './services/localization/electron-browser/languagePackService.js';
import './services/telemetry/electron-browser/telemetryService.js';
import './services/extensions/electron-browser/extensionHostStarter.js';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import './services/localization/electron-browser/localeService.js';
import './services/extensions/electron-browser/extensionsScannerService.js';
import './services/extensionManagement/electron-browser/extensionManagementServerService.js';
import './services/extensionManagement/electron-browser/extensionGalleryManifestService.js';
import './services/extensionManagement/electron-browser/extensionTipsService.js';
import './services/userDataSync/electron-browser/userDataSyncService.js';
import './services/userDataSync/electron-browser/userDataAutoSyncService.js';
import './services/timer/electron-browser/timerService.js';
import './services/environment/electron-browser/shellEnvironmentService.js';
import './services/integrity/electron-browser/integrityService.js';
import './services/workingCopy/electron-browser/workingCopyBackupService.js';
import './services/checksum/electron-browser/checksumService.js';
import '../platform/remote/electron-browser/sharedProcessTunnelService.js';
import './services/tunnel/electron-browser/tunnelService.js';
import '../platform/diagnostics/electron-browser/diagnosticsService.js';
import '../platform/profiling/electron-browser/profilingService.js';
import '../platform/telemetry/electron-browser/customEndpointTelemetryService.js';
import '../platform/remoteTunnel/electron-browser/remoteTunnelService.js';
import './services/files/electron-browser/elevatedFileService.js';
import './services/search/electron-browser/searchService.js';
import './services/workingCopy/electron-browser/workingCopyHistoryService.js';
import './services/userDataSync/browser/userDataSyncEnablementService.js';
import './services/extensions/electron-browser/nativeExtensionService.js';
import '../platform/userDataProfile/electron-browser/userDataProfileStorageService.js';
import './services/auxiliaryWindow/electron-browser/auxiliaryWindowService.js';
import '../platform/extensionManagement/electron-browser/extensionsProfileScannerService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import './services/process/electron-browser/processService.js';

import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IUserDataInitializationService, UserDataInitializationService } from './services/userData/browser/userDataInit.js';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors.js';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));


//#endregion


//#region --- workbench contributions

// Logs
import './contrib/logs/electron-browser/logs.contribution.js';

// Localizations
import './contrib/localization/electron-browser/localization.contribution.js';

// Explorer
import './contrib/files/electron-browser/fileActions.contribution.js';

// CodeEditor Contributions
import './contrib/codeEditor/electron-browser/codeEditor.contribution.js';

// Debug
import './contrib/debug/electron-browser/extensionHostDebugService.js';

// Extensions Management
import './contrib/extensions/electron-browser/extensions.contribution.js';

// Issues
import './contrib/issue/electron-browser/issue.contribution.js';

// Process Explorer
import './contrib/processExplorer/electron-browser/processExplorer.contribution.js';

// Remote
import './contrib/remote/electron-browser/remote.contribution.js';

// Terminal
import './contrib/terminal/electron-browser/terminal.contribution.js';

// Themes
import './contrib/themes/browser/themes.test.contribution.js';
import './services/themes/electron-browser/themes.contribution.js';
// User Data Sync
import './contrib/userDataSync/electron-browser/userDataSync.contribution.js';

// Tags
import './contrib/tags/electron-browser/workspaceTagsService.js';
import './contrib/tags/electron-browser/tags.contribution.js';
// Performance
import './contrib/performance/electron-browser/performance.contribution.js';

// Tasks
import './contrib/tasks/electron-browser/taskService.js';

// External terminal
import './contrib/externalTerminal/electron-browser/externalTerminal.contribution.js';

// Webview
import './contrib/webview/electron-browser/webview.contribution.js';

// Splash
import './contrib/splash/electron-browser/splash.contribution.js';

// Local History
import './contrib/localHistory/electron-browser/localHistory.contribution.js';

// Merge Editor
import './contrib/mergeEditor/electron-browser/mergeEditor.contribution.js';

// Multi Diff Editor
import './contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';

// Remote Tunnel
import './contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';

// Chat
import './contrib/chat/electron-browser/chat.contribution.js';
import './contrib/inlineChat/electron-browser/inlineChat.contribution.js';
// Encryption
import './contrib/encryption/electron-browser/encryption.contribution.js';

// Emergency Alert
import './contrib/emergencyAlert/electron-browser/emergencyAlert.contribution.js';

// MCP
import './contrib/mcp/electron-browser/mcp.contribution.js';

// Policy Export
import './contrib/policyExport/electron-browser/policyExport.contribution.js';

//#endregion


export { main } from './electron-browser/desktop.main.js';
