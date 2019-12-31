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


//#region --- workbench (web main)

import 'vs/workbench/browser/web.main';

//#endregion


//#region --- workbench services
import 'vs/workbench/services/integrity/browser/integrityService';
import 'vs/workbench/services/textMate/browser/textMateService';
import 'vs/workbench/services/search/common/searchService';
import 'vs/workbench/services/output/common/outputChannelModelService';
import 'vs/workbench/services/textfile/browser/browserTextFileService';
import 'vs/workbench/services/keybinding/browser/keymapService';
import 'vs/workbench/services/extensions/browser/extensionService';
import 'vs/workbench/services/extensionManagement/common/extensionManagementServerService';
import 'vs/workbench/services/telemetry/browser/telemetryService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
import 'vs/workbench/services/credentials/browser/credentialsService';
import 'vs/workbench/services/url/browser/urlService';
import 'vs/workbench/services/update/browser/updateService';
import 'vs/workbench/contrib/tags/browser/workspaceTagsService';
import 'vs/workbench/services/workspaces/browser/workspacesService';
import 'vs/workbench/services/workspaces/browser/workspaceEditingService';
import 'vs/workbench/services/dialogs/browser/dialogService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
import 'vs/workbench/services/host/browser/browserHostService';
import 'vs/workbench/services/request/browser/requestService';
import 'vs/workbench/services/lifecycle/browser/lifecycleService';
import 'vs/workbench/services/clipboard/browser/clipboardService';
import 'vs/workbench/services/extensionResourceLoader/browser/extensionResourceLoaderService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { BrowserAccessibilityService } from 'vs/platform/accessibility/common/accessibilityService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { NoOpTunnelService } from 'vs/platform/remote/common/tunnelService';
import { ILoggerService } from 'vs/platform/log/common/log';
import { FileLoggerService } from 'vs/platform/log/common/fileLogService';
import { IAuthTokenService } from 'vs/platform/auth/common/auth';
import { AuthTokenService } from 'vs/workbench/services/authToken/browser/authTokenService';
import { IUserDataSyncStoreService, IUserDataSyncService, IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSyncLog';
import { UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';

registerSingleton(IExtensionManagementService, ExtensionManagementService);
registerSingleton(IBackupFileService, BackupFileService);
registerSingleton(IAccessibilityService, BrowserAccessibilityService, true);
registerSingleton(IContextMenuService, ContextMenuService);
registerSingleton(ITunnelService, NoOpTunnelService, true);
registerSingleton(ILoggerService, FileLoggerService);
registerSingleton(IAuthTokenService, AuthTokenService);
registerSingleton(IUserDataSyncLogService, UserDataSyncLogService);
registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService);
registerSingleton(IUserDataSyncService, UserDataSyncService);

//#endregion


//#region --- workbench contributions

// Explorer
import 'vs/workbench/contrib/files/browser/files.web.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/keyboardLayoutPicker';

// Debug
import 'vs/workbench/contrib/debug/browser/extensionHostDebugService';

// Webview
import 'vs/workbench/contrib/webview/browser/webviewService';
import 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminalNativeService';
import 'vs/workbench/contrib/terminal/browser/terminalInstanceService';

// Tasks
import 'vs/workbench/contrib/tasks/browser/taskService';

// Telemetry Opt Out
import 'vs/workbench/contrib/welcome/telemetryOptOut/browser/telemetryOptOut.contribution';

// Issues
import 'vs/workbench/contrib/issue/browser/issue.contribution';

//#endregion
