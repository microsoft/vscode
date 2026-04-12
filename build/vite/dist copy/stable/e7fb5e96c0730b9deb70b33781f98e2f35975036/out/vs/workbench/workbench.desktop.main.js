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
import '../platform/meteredConnection/electron-browser/meteredConnectionService.js';
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
import '../platform/sandbox/electron-browser/sandboxHelperService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import '../platform/agentHost/electron-browser/agentHostService.js';
import './services/browserView/electron-browser/playwrightWorkbenchService.js';
import './services/process/electron-browser/processService.js';
import './services/power/electron-browser/powerService.js';
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
// Browser
import './contrib/browserView/electron-browser/browserView.contribution.js';
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
// Encryption
import './contrib/encryption/electron-browser/encryption.contribution.js';
// Emergency Alert
import './contrib/emergencyAlert/electron-browser/emergencyAlert.contribution.js';
// MCP
import './contrib/mcp/electron-browser/mcp.contribution.js';
// Policy Export
import './contrib/policyExport/electron-browser/policyExport.contribution.js';
// Keybindings Export
import './contrib/keybindingsExport/electron-browser/keybindingsExport.contribution.js';
//#endregion
export { main } from './electron-browser/desktop.main.js';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFDMUUsMEVBQTBFO0FBQzFFLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFFMUUsOEJBQThCO0FBRTlCLE9BQU8sNEJBQTRCLENBQUM7QUFFcEMsWUFBWTtBQUdaLHNDQUFzQztBQUV0QyxPQUFPLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sNENBQTRDLENBQUM7QUFFcEQsWUFBWTtBQUdaLDZCQUE2QjtBQUU3QixPQUFPLHlEQUF5RCxDQUFDO0FBRWpFLFlBQVk7QUFHWixnQ0FBZ0M7QUFFaEMsT0FBTywrREFBK0QsQ0FBQztBQUN2RSxPQUFPLDBEQUEwRCxDQUFDO0FBQ2xFLE9BQU8sNkRBQTZELENBQUM7QUFDckUsT0FBTyx1REFBdUQsQ0FBQztBQUMvRCxPQUFPLHFEQUFxRCxDQUFDO0FBQzdELE9BQU8sK0NBQStDLENBQUM7QUFDdkQsT0FBTywyREFBMkQsQ0FBQztBQUNuRSxPQUFPLG1EQUFtRCxDQUFDO0FBQzNELE9BQU8sdURBQXVELENBQUM7QUFDL0QsT0FBTyw0RUFBNEUsQ0FBQztBQUNwRixPQUFPLHVEQUF1RCxDQUFDO0FBQy9ELE9BQU8sMkRBQTJELENBQUM7QUFDbkUsT0FBTywrREFBK0QsQ0FBQztBQUN2RSxPQUFPLG1FQUFtRSxDQUFDO0FBQzNFLE9BQU8sbUZBQW1GLENBQUM7QUFDM0YsT0FBTyxtRUFBbUUsQ0FBQztBQUMzRSxPQUFPLGdFQUFnRSxDQUFDO0FBQ3hFLE9BQU8saURBQWlELENBQUM7QUFDekQsT0FBTyxvRUFBb0UsQ0FBQztBQUM1RSxPQUFPLCtFQUErRSxDQUFDO0FBQ3ZGLE9B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