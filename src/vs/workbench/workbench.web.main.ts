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
import 'vs/workbench/services/textfile/browser/textFileService';
import 'vs/workbench/services/keybinding/browser/keymapService';
import 'vs/workbench/services/extensions/browser/extensionService';
import 'vs/workbench/services/extensionManagement/common/extensionManagementServerService';
import 'vs/workbench/services/telemetry/browser/telemetryService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
import 'vs/workbench/services/credentials/browser/credentialsService';
import 'vs/workbench/browser/web.simpleservices';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/workbench/services/request/browser/requestService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { BrowserAccessibilityService } from 'vs/platform/accessibility/common/accessibilityService';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { BrowserLifecycleService } from 'vs/platform/lifecycle/browser/lifecycleService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/platform/dialogs/browser/dialogService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { ExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';

registerSingleton(IRequestService, RequestService, true);
registerSingleton(IExtensionManagementService, ExtensionManagementService);
registerSingleton(IBackupFileService, BackupFileService);
registerSingleton(IDialogService, DialogService, true);
registerSingleton(IClipboardService, BrowserClipboardService, true);
registerSingleton(IAccessibilityService, BrowserAccessibilityService, true);
registerSingleton(ILifecycleService, BrowserLifecycleService);
registerSingleton(IContextMenuService, ContextMenuService);
registerSingleton(IOpenerService, OpenerService, true);

//#endregion


//#region --- workbench contributions

// Resource Service Worker
import 'vs/workbench/contrib/resources/browser/resourceServiceWorkerClient';

// Preferences
import 'vs/workbench/contrib/preferences/browser/keyboardLayoutPicker';

// Debug
import 'vs/workbench/contrib/debug/browser/extensionHostDebugService';

// Webview
import 'vs/workbench/contrib/webview/browser/webviewService';
import 'vs/workbench/contrib/webview/browser/webviewEditorService';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminalNativeService';
import 'vs/workbench/contrib/terminal/browser/terminalInstanceService';

// Tasks
import 'vs/workbench/contrib/tasks/browser/taskService';

//#endregion
