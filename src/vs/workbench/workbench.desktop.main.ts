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

import './electron-sandbox/desktop.main.js';
import './electron-sandbox/desktop.contribution.js';

//#endregion


//#region --- workbench parts

import './electron-sandbox/parts/dialogs/dialog.contribution.js';

//#endregion


//#region --- workbench services

import './services/textfile/electron-sandbox/nativeTextFileService.js';
import './services/dialogs/electron-sandbox/fileDialogService.js';
import './services/workspaces/electron-sandbox/workspacesService.js';
import './services/menubar/electron-sandbox/menubarService.js';
import './services/update/electron-sandbox/updateService.js';
import './services/url/electron-sandbox/urlService.js';
import './services/lifecycle/electron-sandbox/lifecycleService.js';
import './services/title/electron-sandbox/titleService.js';
import './services/host/electron-sandbox/nativeHostService.js';
import './services/request/electron-sandbox/requestService.js';
import './services/clipboard/electron-sandbox/clipboardService.js';
import './services/contextmenu/electron-sandbox/contextmenuService.js';
import './services/workspaces/electron-sandbox/workspaceEditingService.js';
import './services/configurationResolver/electron-sandbox/configurationResolverService.js';
import './services/accessibility/electron-sandbox/accessibilityService.js';
import './services/keybinding/electron-sandbox/nativeKeyboardLayout.js';
import './services/path/electron-sandbox/pathService.js';
import './services/themes/electron-sandbox/nativeHostColorSchemeService.js';
import './services/extensionManagement/electron-sandbox/extensionManagementService.js';
import './services/encryption/electron-sandbox/encryptionService.js';
import './services/secrets/electron-sandbox/secretStorageService.js';
import './services/localization/electron-sandbox/languagePackService.js';
import './services/telemetry/electron-sandbox/telemetryService.js';
import './services/extensions/electron-sandbox/extensionHostStarter.js';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import './services/localization/electron-sandbox/localeService.js';
import './services/extensions/electron-sandbox/extensionsScannerService.js';
import './services/extensionManagement/electron-sandbox/extensionManagementServerService.js';
import './services/extensionManagement/electron-sandbox/extensionTipsService.js';
import './services/userDataSync/electron-sandbox/userDataSyncService.js';
import './services/userDataSync/electron-sandbox/userDataAutoSyncService.js';
import './services/timer/electron-sandbox/timerService.js';
import './services/environment/electron-sandbox/shellEnvironmentService.js';
import './services/integrity/electron-sandbox/integrityService.js';
import './services/workingCopy/electron-sandbox/workingCopyBackupService.js';
import './services/checksum/electron-sandbox/checksumService.js';
import '../platform/remote/electron-sandbox/sharedProcessTunnelService.js';
import './services/tunnel/electron-sandbox/tunnelService.js';
import '../platform/diagnostics/electron-sandbox/diagnosticsService.js';
import '../platform/profiling/electron-sandbox/profilingService.js';
import '../platform/telemetry/electron-sandbox/customEndpointTelemetryService.js';
import '../platform/remoteTunnel/electron-sandbox/remoteTunnelService.js';
import './services/files/electron-sandbox/elevatedFileService.js';
import './services/search/electron-sandbox/searchService.js';
import './services/workingCopy/electron-sandbox/workingCopyHistoryService.js';
import './services/userDataSync/browser/userDataSyncEnablementService.js';
import './services/extensions/electron-sandbox/nativeExtensionService.js';
import '../platform/userDataProfile/electron-sandbox/userDataProfileStorageService.js';
import './services/auxiliaryWindow/electron-sandbox/auxiliaryWindowService.js';
import '../platform/extensionManagement/electron-sandbox/extensionsProfileScannerService.js';

import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IUserDataInitializationService, UserDataInitializationService } from './services/userData/browser/userDataInit.js';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors.js';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));


//#endregion


//#region --- workbench contributions

// Logs
import './contrib/logs/electron-sandbox/logs.contribution.js';

// Localizations
import './contrib/localization/electron-sandbox/localization.contribution.js';

// Explorer
import './contrib/files/electron-sandbox/fileActions.contribution.js';

// CodeEditor Contributions
import './contrib/codeEditor/electron-sandbox/codeEditor.contribution.js';

// Debug
import './contrib/debug/electron-sandbox/extensionHostDebugService.js';

// Extensions Management
import './contrib/extensions/electron-sandbox/extensions.contribution.js';

// Issues
import './contrib/issue/electron-sandbox/issue.contribution.js';

// Process
import './contrib/issue/electron-sandbox/process.contribution.js';

// Remote
import './contrib/remote/electron-sandbox/remote.contribution.js';

// Configuration Exporter
import './contrib/configExporter/electron-sandbox/configurationExportHelper.contribution.js';

// Terminal
import './contrib/terminal/electron-sandbox/terminal.contribution.js';

// Themes
import './contrib/themes/browser/themes.test.contribution.js';
import './services/themes/electron-sandbox/themes.contribution.js';

// User Data Sync
import './contrib/userDataSync/electron-sandbox/userDataSync.contribution.js';

// Tags
import './contrib/tags/electron-sandbox/workspaceTagsService.js';
import './contrib/tags/electron-sandbox/tags.contribution.js';

// Performance
import './contrib/performance/electron-sandbox/performance.contribution.js';

// Tasks
import './contrib/tasks/electron-sandbox/taskService.js';

// External terminal
import './contrib/externalTerminal/electron-sandbox/externalTerminal.contribution.js';

// Webview
import './contrib/webview/electron-sandbox/webview.contribution.js';

// Splash
import './contrib/splash/electron-sandbox/splash.contribution.js';

// Local History
import './contrib/localHistory/electron-sandbox/localHistory.contribution.js';

// Merge Editor
import './contrib/mergeEditor/electron-sandbox/mergeEditor.contribution.js';

// Multi Diff Editor
import './contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';

// Remote Tunnel
import './contrib/remoteTunnel/electron-sandbox/remoteTunnel.contribution.js';

// Chat
import './contrib/chat/electron-sandbox/chat.contribution.js';
import './contrib/inlineChat/electron-sandbox/inlineChat.contribution.js';

// Encryption
import './contrib/encryption/electron-sandbox/encryption.contribution.js';

// Emergency Alert
import './contrib/emergencyAlert/electron-sandbox/emergencyAlert.contribution.js';

//#endregion


export { main } from './electron-sandbox/desktop.main.js';
