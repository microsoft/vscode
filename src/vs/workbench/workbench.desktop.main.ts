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


//#region --- workbench (desktop main)

import './electron-sandbox/desktop.main';
import './electron-sandbox/desktop.contribution';

//#endregion


//#region --- workbench parts

import './electron-sandbox/parts/dialogs/dialog.contribution';

//#endregion


//#region --- workbench services

import './services/textfile/electron-sandbox/nativeTextFileService';
import './services/dialogs/electron-sandbox/fileDialogService';
import './services/workspaces/electron-sandbox/workspacesService';
import './services/menubar/electron-sandbox/menubarService';
import './services/update/electron-sandbox/updateService';
import './services/url/electron-sandbox/urlService';
import './services/lifecycle/electron-sandbox/lifecycleService';
import './services/title/electron-sandbox/titleService';
import './services/host/electron-sandbox/nativeHostService';
import './services/request/electron-sandbox/requestService';
import './services/clipboard/electron-sandbox/clipboardService';
import './services/contextmenu/electron-sandbox/contextmenuService';
import './services/workspaces/electron-sandbox/workspaceEditingService';
import './services/configurationResolver/electron-sandbox/configurationResolverService';
import './services/accessibility/electron-sandbox/accessibilityService';
import './services/keybinding/electron-sandbox/nativeKeyboardLayout';
import './services/path/electron-sandbox/pathService';
import './services/themes/electron-sandbox/nativeHostColorSchemeService';
import './services/extensionManagement/electron-sandbox/extensionManagementService';
import './services/encryption/electron-sandbox/encryptionService';
import './services/secrets/electron-sandbox/secretStorageService';
import './services/localization/electron-sandbox/languagePackService';
import './services/telemetry/electron-sandbox/telemetryService';
import './services/extensions/electron-sandbox/extensionHostStarter';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService';
import './services/localization/electron-sandbox/localeService';
import './services/extensions/electron-sandbox/extensionsScannerService';
import './services/extensionManagement/electron-sandbox/extensionManagementServerService';
import './services/extensionManagement/electron-sandbox/extensionTipsService';
import './services/userDataSync/electron-sandbox/userDataSyncService';
import './services/userDataSync/electron-sandbox/userDataAutoSyncService';
import './services/timer/electron-sandbox/timerService';
import './services/environment/electron-sandbox/shellEnvironmentService';
import './services/integrity/electron-sandbox/integrityService';
import './services/workingCopy/electron-sandbox/workingCopyBackupService';
import './services/checksum/electron-sandbox/checksumService';
import '../platform/remote/electron-sandbox/sharedProcessTunnelService';
import './services/tunnel/electron-sandbox/tunnelService';
import '../platform/diagnostics/electron-sandbox/diagnosticsService';
import '../platform/profiling/electron-sandbox/profilingService';
import '../platform/telemetry/electron-sandbox/customEndpointTelemetryService';
import '../platform/remoteTunnel/electron-sandbox/remoteTunnelService';
import './services/files/electron-sandbox/elevatedFileService';
import './services/search/electron-sandbox/searchService';
import './services/workingCopy/electron-sandbox/workingCopyHistoryService';
import './services/userDataSync/browser/userDataSyncEnablementService';
import './services/extensions/electron-sandbox/nativeExtensionService';
import '../platform/userDataProfile/electron-sandbox/userDataProfileStorageService';
import './services/auxiliaryWindow/electron-sandbox/auxiliaryWindowService';
import '../platform/extensionManagement/electron-sandbox/extensionsProfileScannerService';

import { registerSingleton } from '../platform/instantiation/common/extensions';
import { IUserDataInitializationService, UserDataInitializationService } from './services/userData/browser/userDataInit';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));


//#endregion


//#region --- workbench contributions

// Logs
import './contrib/logs/electron-sandbox/logs.contribution';

// Localizations
import './contrib/localization/electron-sandbox/localization.contribution';

// Explorer
import './contrib/files/electron-sandbox/fileActions.contribution';

// CodeEditor Contributions
import './contrib/codeEditor/electron-sandbox/codeEditor.contribution';

// Debug
import './contrib/debug/electron-sandbox/extensionHostDebugService';

// Extensions Management
import './contrib/extensions/electron-sandbox/extensions.contribution';

// Issues
import './contrib/issue/electron-sandbox/issue.contribution';

// Process
import './contrib/issue/electron-sandbox/process.contribution';

// Remote
import './contrib/remote/electron-sandbox/remote.contribution';

// Configuration Exporter
import './contrib/configExporter/electron-sandbox/configurationExportHelper.contribution';

// Terminal
import './contrib/terminal/electron-sandbox/terminal.contribution';

// Themes
import './contrib/themes/browser/themes.test.contribution';
import './services/themes/electron-sandbox/themes.contribution';

// User Data Sync
import './contrib/userDataSync/electron-sandbox/userDataSync.contribution';

// Tags
import './contrib/tags/electron-sandbox/workspaceTagsService';
import './contrib/tags/electron-sandbox/tags.contribution';

// Performance
import './contrib/performance/electron-sandbox/performance.contribution';

// Tasks
import './contrib/tasks/electron-sandbox/taskService';

// External terminal
import './contrib/externalTerminal/electron-sandbox/externalTerminal.contribution';

// Webview
import './contrib/webview/electron-sandbox/webview.contribution';

// Splash
import './contrib/splash/electron-sandbox/splash.contribution';

// Local History
import './contrib/localHistory/electron-sandbox/localHistory.contribution';

// Merge Editor
import './contrib/mergeEditor/electron-sandbox/mergeEditor.contribution';

// Multi Diff Editor
import './contrib/multiDiffEditor/browser/multiDiffEditor.contribution';

// Remote Tunnel
import './contrib/remoteTunnel/electron-sandbox/remoteTunnel.contribution';

// Chat
import './contrib/chat/electron-sandbox/chat.contribution';
import './contrib/inlineChat/electron-sandbox/inlineChat.contribution';

// Encryption
import './contrib/encryption/electron-sandbox/encryption.contribution';

//#endregion


export { main } from './electron-sandbox/desktop.main';
