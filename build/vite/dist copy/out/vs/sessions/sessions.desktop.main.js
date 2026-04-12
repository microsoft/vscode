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
import './sessions.common.main.js';
//#endregion
//#region --- workbench (sessions desktop main)
import './electron-browser/sessions.main.js';
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
import './services/title/electron-browser/titleService.js';
import '../platform/meteredConnection/electron-browser/meteredConnectionService.js';
import '../workbench/services/request/electron-browser/requestService.js';
import '../workbench/services/clipboard/electron-browser/clipboardService.js';
import '../workbench/services/contextmenu/electron-browser/contextmenuService.js';
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
import '../platform/sandbox/electron-browser/sandboxHelperService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import '../workbench/services/browserView/electron-browser/playwrightWorkbenchService.js';
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
// Remote Agent Host
import '../platform/agentHost/electron-browser/agentHostService.js';
import '../platform/agentHost/electron-browser/remoteAgentHostService.js';
import '../platform/agentHost/electron-browser/sshRemoteAgentHostService.js';
import './contrib/remoteAgentHost/browser/remoteAgentHost.contribution.js';
import './contrib/remoteAgentHost/browser/remoteAgentHostActions.js';
//#endregion
export { main } from './electron-browser/sessions.main.js';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMuZGVza3RvcC5tYWluLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvc2Vzc2lvbnMuZGVza3RvcC5tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFDMUUsMEVBQTBFO0FBQzFFLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFFMUUsOEJBQThCO0FBRTlCLE9BQU8sMkJBQTJCLENBQUM7QUFFbkMsWUFBWTtBQUdaLCtDQUErQztBQUUvQyxPQUFPLHFDQUFxQyxDQUFDO0FBQzdDLE9BQU8sdURBQXVELENBQUM7QUFFL0QsWUFBWTtBQUdaLDZCQUE2QjtBQUU3QixPQUFPLG9FQUFvRSxDQUFDO0FBRTVFLFlBQVk7QUFHWixnQ0FBZ0M7QUFFaEMsT0FBTywwRUFBMEUsQ0FBQztBQUNsRixPQUFPLHFFQUFxRSxDQUFDO0FBQzdFLE9BQU8sd0VBQXdFLENBQUM7QUFDaEYsT0FBTyxrRUFBa0UsQ0FBQztBQUMxRSxPQUFPLGdFQUFnRSxDQUFDO0FBQ3hFLE9BQU8sMERBQTBELENBQUM7QUFDbEUsT0FBTyxzRUFBc0UsQ0FBQztBQUM5RSxPQUFPLGtFQUFrRSxDQUFDO0FBQzFFLE9BQU8sbURBQW1ELENBQUM7QUFDM0QsT0FBTyw0RUFBNEUsQ0FBQztBQUNwRixPQUFPLGtFQUFrRSxDQUFDO0FBQzFFLE9BQU8sc0VBQXNFLENBQUM7QUFDOUUsT0FBTywwRUFBMEUsQ0FBQztBQUNsRixPQUFPLDhGQUE4RixDQUFDO0FBQ3RHLE9BQU8sOEVBQThFLENBQUM7QUFDdEYsT0FBTywyRUFBMkUsQ0FBQztBQUNuRixPQUFPLDREQUE0RCxDQUFDO0FBQ3BFLE9BQU8sK0VBQStFLENBQUM7QUFDdkYsT0FBTywwRkFBMEYsQ0FBQztBQUNsRyxPQUFPLHlFQUF5RSxDQUFDO0FBQ2pGLE9BQU8s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