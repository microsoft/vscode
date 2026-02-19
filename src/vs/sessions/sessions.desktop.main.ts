/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import './sessions.common.main.js';

//#region --- workbench (agentic desktop main)

import './electron-browser/sessions.main.js';
import './electron-browser/titleService.js';
import '../workbench/electron-browser/desktop.contribution.js';

//#endregion

//#region --- workbench parts

import '../workbench/electron-browser/parts/dialogs/dialog.contribution.js';

//#endregion


//#region --- workbench services

import '../workbench/services/textfile/electron-browser/nativeTextFileService.js';
import '../workbench/services/dialogs/electron-browser/fileDialogService.js';
import '../workbench/services/workspaces/electron-browser/workspacesService.js';
import '../workbench/services/menubar/electron-browser/menubarService.js';
import '../workbench/services/update/electron-browser/updateService.js';
import '../workbench/services/url/electron-browser/urlService.js';
import '../workbench/services/lifecycle/electron-browser/lifecycleService.js';
import '../workbench/services/host/electron-browser/nativeHostService.js';
import '../platform/meteredConnection/electron-browser/meteredConnectionService.js';
import '../workbench/services/request/electron-browser/requestService.js';
import '../workbench/services/clipboard/electron-browser/clipboardService.js';
import '../workbench/services/contextmenu/electron-browser/contextmenuService.js';
import '../workbench/services/workspaces/electron-browser/workspaceEditingService.js';
import '../workbench/services/configurationResolver/electron-browser/configurationResolverService.js';
import '../workbench/services/accessibility/electron-browser/accessibilityService.js';
import '../workbench/services/keybinding/electron-browser/nativeKeyboardLayout.js';
import '../workbench/services/path/electron-browser/pathService.js';
import '../workbench/services/themes/electron-browser/nativeHostColorSchemeService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionManagementService.js';
import '../workbench/services/mcp/electron-browser/mcpGalleryManifestService.js';
import '../workbench/services/mcp/electron-browser/mcpWorkbenchManagementService.js';
import '../workbench/services/encryption/electron-browser/encryptionService.js';
import '../workbench/services/imageResize/electron-browser/imageResizeService.js';
import '../workbench/services/browserElements/electron-browser/browserElementsService.js';
import '../workbench/services/secrets/electron-browser/secretStorageService.js';
import '../workbench/services/localization/electron-browser/languagePackService.js';
import '../workbench/services/telemetry/electron-browser/telemetryService.js';
import '../workbench/services/extensions/electron-browser/extensionHostStarter.js';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import '../workbench/services/localization/electron-browser/localeService.js';
import '../workbench/services/extensions/electron-browser/extensionsScannerService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionManagementServerService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionGalleryManifestService.js';
import '../workbench/services/extensionManagement/electron-browser/extensionTipsService.js';
import '../workbench/services/userDataSync/electron-browser/userDataSyncService.js';
import '../workbench/services/userDataSync/electron-browser/userDataAutoSyncService.js';
import '../workbench/services/timer/electron-browser/timerService.js';
import '../workbench/services/environment/electron-browser/shellEnvironmentService.js';
import '../workbench/services/integrity/electron-browser/integrityService.js';
import '../workbench/services/workingCopy/electron-browser/workingCopyBackupService.js';
import '../workbench/services/checksum/electron-browser/checksumService.js';
import '../platform/remote/electron-browser/sharedProcessTunnelService.js';
import '../workbench/services/tunnel/electron-browser/tunnelService.js';
import '../platform/diagnostics/electron-browser/diagnosticsService.js';
import '../platform/profiling/electron-browser/profilingService.js';
import '../platform/telemetry/electron-browser/customEndpointTelemetryService.js';
import '../platform/remoteTunnel/electron-browser/remoteTunnelService.js';
import '../workbench/services/files/electron-browser/elevatedFileService.js';
import '../workbench/services/search/electron-browser/searchService.js';
import '../workbench/services/workingCopy/electron-browser/workingCopyHistoryService.js';
import '../workbench/services/userDataSync/browser/userDataSyncEnablementService.js';
import '../workbench/services/extensions/electron-browser/nativeExtensionService.js';
import '../platform/userDataProfile/electron-browser/userDataProfileStorageService.js';
import '../workbench/services/auxiliaryWindow/electron-browser/auxiliaryWindowService.js';
import '../platform/extensionManagement/electron-browser/extensionsProfileScannerService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import '../workbench/services/process/electron-browser/processService.js';
import '../workbench/services/power/electron-browser/powerService.js';

import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IUserDataInitializationService, UserDataInitializationService } from '../workbench/services/userData/browser/userDataInit.js';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors.js';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));


//#endregion


//#region --- workbench contributions

// Logs
import '../workbench/contrib/logs/electron-browser/logs.contribution.js';

// Localizations
import '../workbench/contrib/localization/electron-browser/localization.contribution.js';

// Explorer
import '../workbench/contrib/files/electron-browser/fileActions.contribution.js';

// CodeEditor Contributions
import '../workbench/contrib/codeEditor/electron-browser/codeEditor.contribution.js';

// Debug
import '../workbench/contrib/debug/electron-browser/extensionHostDebugService.js';

// Extensions Management
import '../workbench/contrib/extensions/electron-browser/extensions.contribution.js';

// Issues
import '../workbench/contrib/issue/electron-browser/issue.contribution.js';

// Process Explorer
import '../workbench/contrib/processExplorer/electron-browser/processExplorer.contribution.js';

// Remote
import '../workbench/contrib/remote/electron-browser/remote.contribution.js';

// Terminal
import '../workbench/contrib/terminal/electron-browser/terminal.contribution.js';

// Themes
import '../workbench/contrib/themes/browser/themes.test.contribution.js';
import '../workbench/services/themes/electron-browser/themes.contribution.js';
// User Data Sync
import '../workbench/contrib/userDataSync/electron-browser/userDataSync.contribution.js';

// Tags
import '../workbench/contrib/tags/electron-browser/workspaceTagsService.js';
import '../workbench/contrib/tags/electron-browser/tags.contribution.js';
// Performance
import '../workbench/contrib/performance/electron-browser/performance.contribution.js';

// Tasks
import '../workbench/contrib/tasks/electron-browser/taskService.js';

// External terminal
import '../workbench/contrib/externalTerminal/electron-browser/externalTerminal.contribution.js';

// Webview
import '../workbench/contrib/webview/electron-browser/webview.contribution.js';

// Browser
import '../workbench/contrib/browserView/electron-browser/browserView.contribution.js';

// Splash
import '../workbench/contrib/splash/electron-browser/splash.contribution.js';

// Local History
import '../workbench/contrib/localHistory/electron-browser/localHistory.contribution.js';

// Merge Editor
import '../workbench/contrib/mergeEditor/electron-browser/mergeEditor.contribution.js';

// Multi Diff Editor
import '../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';

// Remote Tunnel
import '../workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';

// Chat
import '../workbench/contrib/chat/electron-browser/chat.contribution.js';
//import '../workbench/contrib/inlineChat/electron-browser/inlineChat.contribution.js';

import './contrib/agentFeedback/browser/agentFeedback.contribution.js';

// Encryption
import '../workbench/contrib/encryption/electron-browser/encryption.contribution.js';

// Emergency Alert
import '../workbench/contrib/emergencyAlert/electron-browser/emergencyAlert.contribution.js';

// MCP
import '../workbench/contrib/mcp/electron-browser/mcp.contribution.js';

// Policy Export
import '../workbench/contrib/policyExport/electron-browser/policyExport.contribution.js';

//#endregion


//#region --- sessions contributions

import './browser/paneCompositePartService.js';
import './browser/layoutActions.js';

import './contrib/accountMenu/browser/account.contribution.js';
import './contrib/aiCustomizationTreeView/browser/aiCustomizationTreeView.contribution.js';
import './contrib/aiCustomizationManagement/browser/aiCustomizationManagement.contribution.js';
import './contrib/chat/browser/chat.contribution.js';
import './contrib/sessions/browser/sessions.contribution.js';
import './contrib/sessions/browser/customizationsToolbar.contribution.js';
import './contrib/changesView/browser/changesView.contribution.js';
import './contrib/configuration/browser/configuration.contribution.js';

//#endregion

export { main } from './electron-browser/sessions.main.js';
