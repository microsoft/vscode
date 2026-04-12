/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO SESSIONS.COMMON.MAIN.TS !!!  ###
// ###                                                                 ###
// #######################################################################
//#region --- sessions common
import './sessions.common.main.js';
//#endregion
//#region --- workbench parts
import '../workbench/browser/parts/dialogs/dialog.web.contribution.js';
//#endregion
//#region --- sessions (web main) — sessions-specific web bootstrap
import './browser/web.main.js';
//#endregion
//#region --- workbench services (browser equivalents of the electron services)
import '../workbench/services/integrity/browser/integrityService.js';
import '../workbench/services/search/browser/searchService.js';
import '../workbench/services/textfile/browser/browserTextFileService.js';
import '../workbench/services/keybinding/browser/keyboardLayoutService.js';
import '../workbench/services/extensions/browser/extensionService.js';
import '../workbench/services/extensionManagement/browser/extensionsProfileScannerService.js';
import '../workbench/services/extensions/browser/extensionsScannerService.js';
import '../workbench/services/extensionManagement/browser/webExtensionsScannerService.js';
import '../workbench/services/extensionManagement/common/extensionManagementServerService.js';
import '../workbench/services/mcp/browser/mcpWorkbenchManagementService.js';
import '../workbench/services/extensionManagement/browser/extensionGalleryManifestService.js';
import '../workbench/services/telemetry/browser/telemetryService.js';
import '../workbench/services/url/browser/urlService.js';
import '../workbench/services/update/browser/updateService.js';
import '../workbench/services/workspaces/browser/workspacesService.js';
import '../workbench/services/workspaces/browser/workspaceEditingService.js';
import '../workbench/services/dialogs/browser/fileDialogService.js';
import '../workbench/services/host/browser/browserHostService.js';
import '../platform/meteredConnection/browser/meteredConnectionService.js';
import '../workbench/services/lifecycle/browser/lifecycleService.js';
import '../workbench/services/clipboard/browser/clipboardService.js';
import '../workbench/services/localization/browser/localeService.js';
import '../workbench/services/path/browser/pathService.js';
import '../workbench/services/themes/browser/browserHostColorSchemeService.js';
import '../workbench/services/encryption/browser/encryptionService.js';
import '../workbench/services/imageResize/browser/imageResizeService.js';
import '../workbench/services/secrets/browser/secretStorageService.js';
import '../workbench/services/workingCopy/browser/workingCopyBackupService.js';
import '../workbench/services/tunnel/browser/tunnelService.js';
import '../workbench/services/files/browser/elevatedFileService.js';
import '../workbench/services/workingCopy/browser/workingCopyHistoryService.js';
import '../workbench/services/userDataSync/browser/webUserDataSyncEnablementService.js';
import '../workbench/services/userDataProfile/browser/userDataProfileStorageService.js';
import '../workbench/services/configurationResolver/browser/configurationResolverService.js';
import '../platform/extensionResourceLoader/browser/extensionResourceLoaderService.js';
import '../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import '../workbench/services/browserElements/browser/webBrowserElementsService.js';
import '../workbench/services/power/browser/powerService.js';
import '../platform/sandbox/browser/sandboxHelperService.js';
import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IAccessibilityService } from '../platform/accessibility/common/accessibility.js';
import { IContextMenuService } from '../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../platform/contextview/browser/contextMenuService.js';
import { IExtensionTipsService } from '../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionTipsService } from '../platform/extensionManagement/common/extensionTipsService.js';
import { IWorkbenchExtensionManagementService } from '../workbench/services/extensionManagement/common/extensionManagement.js';
import { ExtensionManagementService } from '../workbench/services/extensionManagement/common/extensionManagementService.js';
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
import './services/title/browser/titleService.js';
import { ITimerService, TimerService } from '../workbench/services/timer/browser/timerService.js';
import { IDiagnosticsService, NullDiagnosticsService } from '../platform/diagnostics/common/diagnostics.js';
import { ILanguagePackService } from '../platform/languagePacks/common/languagePacks.js';
import { WebLanguagePacksService } from '../platform/languagePacks/browser/languagePacks.js';
import { IWebContentExtractorService, NullWebContentExtractorService, ISharedWebContentExtractorService, NullSharedWebContentExtractorService } from '../platform/webContentExtractor/common/webContentExtractor.js';
import { IMcpGalleryManifestService } from '../platform/mcp/common/mcpGalleryManifest.js';
import { WorkbenchMcpGalleryManifestService } from '../workbench/services/mcp/browser/mcpGalleryManifestService.js';
import { UserDataSyncResourceProviderService } from '../platform/userDataSync/common/userDataSyncResourceProvider.js';
import { IRemoteAgentHostService, NullRemoteAgentHostService } from '../platform/agentHost/common/remoteAgentHostService.js';
registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAccessibilityService, AccessibilityService, 1 /* InstantiationType.Delayed */);
registerSingleton(IContextMenuService, ContextMenuService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncMachinesService, UserDataSyncMachinesService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncLocalStoreService, UserDataSyncLocalStoreService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncAccountService, UserDataSyncAccountService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncService, UserDataSyncService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataSyncResourceProviderService, UserDataSyncResourceProviderService, 1 /* InstantiationType.Delayed */);
registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtensionTipsService, ExtensionTipsService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITimerService, TimerService, 1 /* InstantiationType.Delayed */);
registerSingleton(ICustomEndpointTelemetryService, NullEndpointTelemetryService, 1 /* InstantiationType.Delayed */);
registerSingleton(IDiagnosticsService, NullDiagnosticsService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguagePackService, WebLanguagePacksService, 1 /* InstantiationType.Delayed */);
registerSingleton(IWebContentExtractorService, NullWebContentExtractorService, 1 /* InstantiationType.Delayed */);
registerSingleton(ISharedWebContentExtractorService, NullSharedWebContentExtractorService, 1 /* InstantiationType.Delayed */);
registerSingleton(IMcpGalleryManifestService, WorkbenchMcpGalleryManifestService, 1 /* InstantiationType.Delayed */);
registerSingleton(IRemoteAgentHostService, NullRemoteAgentHostService, 1 /* InstantiationType.Delayed */);
//#endregion
//#region --- workbench contributions (browser versions)
import '../workbench/contrib/logs/browser/logs.contribution.js';
import '../workbench/contrib/localization/browser/localization.contribution.js';
import '../workbench/contrib/performance/browser/performance.web.contribution.js';
import '../workbench/contrib/preferences/browser/keyboardLayoutPicker.js';
import '../workbench/contrib/debug/browser/extensionHostDebugService.js';
import '../workbench/contrib/welcomeBanner/browser/welcomeBanner.contribution.js';
import '../workbench/contrib/webview/browser/webview.web.contribution.js';
import '../workbench/contrib/extensions/browser/extensions.web.contribution.js';
import '../workbench/contrib/terminal/browser/terminal.web.contribution.js';
import '../workbench/contrib/externalTerminal/browser/externalTerminal.contribution.js';
import '../workbench/contrib/terminal/browser/terminalInstanceService.js';
import '../workbench/contrib/tasks/browser/taskService.js';
import '../workbench/contrib/tags/browser/workspaceTagsService.js';
import '../workbench/contrib/issue/browser/issue.contribution.js';
import '../workbench/contrib/splash/browser/splash.contribution.js';
import '../workbench/contrib/remote/browser/remoteStartEntry.contribution.js';
import '../workbench/contrib/processExplorer/browser/processExplorer.web.contribution.js';
import '../workbench/contrib/browserView/browser/browserView.contribution.js';
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMud2ViLm1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9zZXNzaW9ucy53ZWIubWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRywwRUFBMEU7QUFDMUUsMEVBQTBFO0FBQzFFLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFDMUUsMEVBQTBFO0FBRTFFLDZCQUE2QjtBQUU3QixPQUFPLDJCQUEyQixDQUFDO0FBRW5DLFlBQVk7QUFHWiw2QkFBNkI7QUFFN0IsT0FBTywrREFBK0QsQ0FBQztBQUV2RSxZQUFZO0FBR1osbUVBQW1FO0FBRW5FLE9BQU8sdUJBQXVCLENBQUM7QUFFL0IsWUFBWTtBQUdaLCtFQUErRTtBQUUvRSxPQUFPLDZEQUE2RCxDQUFDO0FBQ3JFLE9BQU8sdURBQXVELENBQUM7QUFDL0QsT0FBTyxrRUFBa0UsQ0FBQztBQUMxRSxPQUFPLG1FQUFtRSxDQUFDO0FBQzNFLE9BQU8sOERBQThELENBQUM7QUFDdEUsT0FBTyxzRkFBc0YsQ0FBQztBQUM5RixPQUFPLHNFQUFzRSxDQUFDO0FBQzlFLE9BQU8sa0ZBQWtGLENBQUM7QUFDMUYsT0FBTyxzRkFBc0YsQ0FBQztBQUM5RixPQUFPLG9FQUFvRSxDQUFDO0FBQzVFLE9BQU8sc0ZBQXNGLENBQUM7QUFDOUYsT0FBTyw2REFBNkQsQ0FBQztBQUNyRSxPQUFPLGlEQUFpRCxDQUFDO0FBQ3pELE9BQU8sdURBQXVELENBQUM7QUFDL0QsT0FBTywrREFBK0QsQ0FBQztBQUN2RSxPQUFPLHFFQUFxRSxDQUFDO0FBQzdFLE9BQU8sNERBQTRELENBQUM7QUFDcEUsT0FBTywwREFBMEQsQ0FBQztBQUNsRSxPQUFPLG1FQUFtRSxDQUFDO0FBQzNFLE9BQU8sNkRBQTZELENBQUM7QUFDckUsT0FBTyw2REFBNkQsQ0FBQztBQUNyRSxPQUFPLDZEQUE2RCxD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