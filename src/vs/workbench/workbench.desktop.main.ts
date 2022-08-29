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


//#region --- workbench (desktop main)

import 'vs/workbench/electron-sandbox/desktop.main';
import 'vs/workbench/electron-sandbox/desktop.contribution';

//#endregion


//#region --- workbench parts

import 'vs/workbench/electron-sandbox/parts/dialogs/dialog.contribution';

//#endregion


//#region --- workbench services

import 'vs/workbench/services/textfile/electron-sandbox/nativeTextFileService';
import 'vs/workbench/services/dialogs/electron-sandbox/fileDialogService';
import 'vs/workbench/services/workspaces/electron-sandbox/workspacesService';
import 'vs/workbench/services/textMate/browser/nativeTextMateService';
import 'vs/workbench/services/menubar/electron-sandbox/menubarService';
import 'vs/workbench/services/issue/electron-sandbox/issueService';
import 'vs/workbench/services/update/electron-sandbox/updateService';
import 'vs/workbench/services/url/electron-sandbox/urlService';
import 'vs/workbench/services/lifecycle/electron-sandbox/lifecycleService';
import 'vs/workbench/services/title/electron-sandbox/titleService';
import 'vs/workbench/services/host/electron-sandbox/nativeHostService';
import 'vs/workbench/services/request/electron-sandbox/requestService';
import 'vs/workbench/services/extensionResourceLoader/electron-sandbox/extensionResourceLoaderService';
import 'vs/workbench/services/clipboard/electron-sandbox/clipboardService';
import 'vs/workbench/services/contextmenu/electron-sandbox/contextmenuService';
import 'vs/workbench/services/workspaces/electron-sandbox/workspaceEditingService';
import 'vs/workbench/services/configurationResolver/electron-sandbox/configurationResolverService';
import 'vs/workbench/services/accessibility/electron-sandbox/accessibilityService';
import 'vs/workbench/services/path/electron-sandbox/pathService';
import 'vs/workbench/services/themes/electron-sandbox/nativeHostColorSchemeService';
import 'vs/workbench/services/extensionManagement/electron-sandbox/extensionManagementService';
import 'vs/workbench/services/extensionManagement/electron-sandbox/extensionUrlTrustService';
import 'vs/workbench/services/credentials/electron-sandbox/credentialsService';
import 'vs/workbench/services/encryption/electron-sandbox/encryptionService';
import 'vs/workbench/services/localization/electron-sandbox/languagePackService';
import 'vs/workbench/services/telemetry/electron-sandbox/telemetryService';
import 'vs/workbench/services/extensions/electron-sandbox/extensionHostStarter';
import 'vs/platform/extensionManagement/electron-sandbox/extensionsScannerService';
import 'vs/workbench/services/extensionManagement/electron-sandbox/extensionManagementServerService';
import 'vs/workbench/services/extensionManagement/electron-sandbox/extensionTipsService';
import 'vs/workbench/services/userDataSync/electron-sandbox/userDataSyncMachinesService';
import 'vs/workbench/services/userDataSync/electron-sandbox/userDataSyncService';
import 'vs/workbench/services/userDataSync/electron-sandbox/userDataSyncAccountService';
import 'vs/workbench/services/userDataSync/electron-sandbox/userDataSyncStoreManagementService';
import 'vs/workbench/services/userDataSync/electron-sandbox/userDataAutoSyncService';
import 'vs/workbench/services/timer/electron-sandbox/timerService';
import 'vs/workbench/services/environment/electron-sandbox/shellEnvironmentService';
import 'vs/workbench/services/integrity/electron-sandbox/integrityService';
import 'vs/workbench/services/workingCopy/electron-sandbox/workingCopyBackupService';
import 'vs/workbench/services/checksum/electron-sandbox/checksumService';
import 'vs/platform/remote/electron-sandbox/sharedProcessTunnelService';
import 'vs/workbench/services/tunnel/electron-sandbox/tunnelService';
import 'vs/platform/diagnostics/electron-sandbox/diagnosticsService';
import 'vs/platform/profiling/electron-sandbox/profilingService';
import 'vs/platform/telemetry/electron-sandbox/customEndpointTelemetryService';
import 'vs/workbench/services/files/electron-sandbox/elevatedFileService';
import 'vs/workbench/services/search/electron-sandbox/searchService';
import 'vs/workbench/services/workingCopy/electron-sandbox/workingCopyHistoryService';
import 'vs/workbench/services/userDataSync/browser/userDataSyncEnablementService';
import 'vs/workbench/services/extensions/electron-sandbox/sandboxExtensionService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataInitializationService, UserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';

registerSingleton(IUserDataInitializationService, UserDataInitializationService, false);

//#endregion


//#region --- workbench contributions

// Logs
import 'vs/workbench/contrib/logs/electron-sandbox/logs.contribution';

// Localizations
import 'vs/workbench/contrib/localization/electron-sandbox/localization.contribution';

// Explorer
import 'vs/workbench/contrib/files/electron-sandbox/files.contribution';
import 'vs/workbench/contrib/files/electron-sandbox/fileActions.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/electron-sandbox/codeEditor.contribution';

// Debug
import 'vs/workbench/contrib/debug/electron-sandbox/extensionHostDebugService';

// Extensions Management
import 'vs/workbench/contrib/extensions/electron-sandbox/extensions.contribution';

// Issues
import 'vs/workbench/contrib/issue/electron-sandbox/issue.contribution';

// Remote
import 'vs/workbench/contrib/remote/electron-sandbox/remote.contribution';

// Configuration Exporter
import 'vs/workbench/contrib/configExporter/electron-sandbox/configurationExportHelper.contribution';

// Terminal
import 'vs/workbench/contrib/terminal/electron-sandbox/terminal.contribution';

// Themes Support
import 'vs/workbench/contrib/themes/browser/themes.test.contribution';

// User Data Sync
import 'vs/workbench/contrib/userDataSync/electron-sandbox/userDataSync.contribution';

// Output
import 'vs/workbench/contrib/output/electron-sandbox/outputChannelModelService';

// Tags
import 'vs/workbench/contrib/tags/electron-sandbox/workspaceTagsService';
import 'vs/workbench/contrib/tags/electron-sandbox/tags.contribution';

// Performance
import 'vs/workbench/contrib/performance/electron-sandbox/performance.contribution';

// Tasks
import 'vs/workbench/contrib/tasks/electron-sandbox/taskService';

// External terminal
import 'vs/workbench/contrib/externalTerminal/electron-sandbox/externalTerminal.contribution';

// Webview
import 'vs/workbench/contrib/webview/electron-sandbox/webview.contribution';

// Splash
import 'vs/workbench/contrib/splash/electron-sandbox/splash.contribution';

// Local History
import 'vs/workbench/contrib/localHistory/electron-sandbox/localHistory.contribution';

// Merge Editor
import 'vs/workbench/contrib/mergeEditor/electron-sandbox/mergeEditor.contribution';

//#endregion
