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

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions.js';
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

registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, InstantiationType.Delayed);
registerSingleton(IAccessibilityService, AccessibilityService, InstantiationType.Delayed);
registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncMachinesService, UserDataSyncMachinesService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncLocalStoreService, UserDataSyncLocalStoreService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncAccountService, UserDataSyncAccountService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncService, UserDataSyncService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncResourceProviderService, UserDataSyncResourceProviderService, InstantiationType.Delayed);
registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService, InstantiationType.Eager);
registerSingleton(IExtensionTipsService, ExtensionTipsService, InstantiationType.Delayed);
registerSingleton(ITimerService, TimerService, InstantiationType.Delayed);
registerSingleton(ICustomEndpointTelemetryService, NullEndpointTelemetryService, InstantiationType.Delayed);
registerSingleton(IDiagnosticsService, NullDiagnosticsService, InstantiationType.Delayed);
registerSingleton(ILanguagePackService, WebLanguagePacksService, InstantiationType.Delayed);
registerSingleton(IWebContentExtractorService, NullWebContentExtractorService, InstantiationType.Delayed);
registerSingleton(ISharedWebContentExtractorService, NullSharedWebContentExtractorService, InstantiationType.Delayed);
registerSingleton(IMcpGalleryManifestService, WorkbenchMcpGalleryManifestService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostService, NullRemoteAgentHostService, InstantiationType.Delayed);

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


//#region --- sessions contributions (same as desktop — these are all browser-safe)

import './browser/paneCompositePartService.js';
import './browser/layoutActions.js';

import './contrib/accountMenu/browser/account.contribution.js';
import './contrib/aiCustomizationTreeView/browser/aiCustomizationTreeView.contribution.js';
import './contrib/applyCommitsToParentRepo/browser/applyChangesToParentRepo.js';
import './contrib/chat/browser/chat.contribution.js';
import './contrib/terminal/browser/sessionsTerminalContribution.js';
import './contrib/sessions/browser/sessions.contribution.js';
import './contrib/sessions/browser/customizationsToolbar.contribution.js';
import './contrib/changes/browser/changesView.contribution.js';
import './contrib/codeReview/browser/codeReview.contributions.js';
import './contrib/github/browser/github.contribution.js';
import './contrib/fileTreeView/browser/fileTreeView.contribution.js';
import './contrib/configuration/browser/configuration.contribution.js';
import './contrib/welcome/browser/welcome.contribution.js';

//#endregion
