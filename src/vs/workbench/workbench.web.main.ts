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
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { BrowserAccessibilityService } from 'vs/platform/accessibility/common/accessibilityService';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { BrowserLifecycleService } from 'vs/platform/lifecycle/browser/lifecycleService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/platform/dialogs/browser/dialogService';
// import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
// import { LocalizationsService } from 'vs/platform/localizations/electron-browser/localizationsService';
// import { ISharedProcessService, SharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
// import { IWindowsService } from 'vs/platform/windows/common/windows';
// import { WindowsService } from 'vs/platform/windows/electron-browser/windowsService';
// import { IUpdateService } from 'vs/platform/update/common/update';
// import { UpdateService } from 'vs/platform/update/electron-browser/updateService';
// import { IIssueService } from 'vs/platform/issue/common/issue';
// import { IssueService } from 'vs/platform/issue/electron-browser/issueService';
// import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
// import { WorkspacesService } from 'vs/platform/workspaces/electron-browser/workspacesService';
// import { IMenubarService } from 'vs/platform/menubar/common/menubar';
// import { MenubarService } from 'vs/platform/menubar/electron-browser/menubarService';
// import { IURLService } from 'vs/platform/url/common/url';
// import { RelayURLService } from 'vs/platform/url/electron-browser/urlService';
// import { ITunnelService } from 'vs/platform/remote/common/tunnel';
// import { TunnelService } from 'vs/workbench/services/remote/node/tunnelService';
// import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
// import { KeytarCredentialsService } from 'vs/platform/credentials/node/credentialsService';
import 'vs/workbench/services/bulkEdit/browser/bulkEditService';
// import 'vs/workbench/services/integrity/node/integrityService';
import 'vs/workbench/services/keybinding/common/keybindingEditing';
import 'vs/workbench/services/textMate/browser/textMateService';
// import 'vs/workbench/services/workspace/electron-browser/workspaceEditingService';
// import 'vs/workbench/services/extensions/electron-browser/inactiveExtensionUrlHandler';
import 'vs/workbench/services/decorations/browser/decorationsService';
import 'vs/workbench/services/search/common/searchService';
import 'vs/workbench/services/progress/browser/progressService';
import 'vs/workbench/services/editor/browser/codeEditorService';
import 'vs/workbench/services/preferences/browser/preferencesService';
import 'vs/workbench/services/output/common/outputChannelModelService';
import 'vs/workbench/services/configuration/common/jsonEditingService';
import 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import 'vs/workbench/services/textfile/browser/textFileService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
// import 'vs/workbench/services/dialogs/electron-browser/dialogService';
import 'vs/workbench/services/editor/browser/editorService';
import 'vs/workbench/services/history/browser/history';
import 'vs/workbench/services/activity/browser/activityService';
import 'vs/workbench/browser/parts/views/views';
import 'vs/workbench/services/keybinding/browser/keymapService';
import 'vs/workbench/services/keybinding/browser/keybindingService';
import 'vs/workbench/services/untitled/common/untitledEditorService';
import 'vs/workbench/services/textfile/common/textResourcePropertiesService';
import 'vs/workbench/services/mode/common/workbenchModeService';
import 'vs/workbench/services/commands/common/commandService';
import 'vs/workbench/services/themes/browser/workbenchThemeService';
import 'vs/workbench/services/extensions/browser/extensionService';
// import 'vs/workbench/services/contextmenu/electron-browser/contextmenuService';
import 'vs/workbench/services/label/common/labelService';
import 'vs/workbench/services/extensionManagement/common/extensionManagementServerService';
import 'vs/workbench/services/extensionManagement/common/extensionEnablementService';
// import 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import 'vs/workbench/services/notification/common/notificationService';
// import 'vs/workbench/services/window/electron-browser/windowService';
import 'vs/workbench/services/telemetry/browser/telemetryService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { ExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';

import 'vs/workbench/browser/web.simpleservices';

registerSingleton(IExtensionManagementService, ExtensionManagementService);
registerSingleton(IBackupFileService, BackupFileService);
registerSingleton(IDialogService, DialogService, true);
registerSingleton(IMenuService, MenuService, true);
registerSingleton(IListService, ListService, true);
registerSingleton(IOpenerService, OpenerService, true);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IMarkerService, MarkerService, true);
registerSingleton(IDownloadService, DownloadService, true);
registerSingleton(IClipboardService, BrowserClipboardService, true);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(IModelService, ModelServiceImpl, true);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService);
registerSingleton(IAccessibilityService, BrowserAccessibilityService, true);
registerSingleton(IContextViewService, ContextViewService, true);
registerSingleton(IExtensionGalleryService, ExtensionGalleryService, true);
registerSingleton(ILifecycleService, BrowserLifecycleService);
// registerSingleton(ILocalizationsService, LocalizationsService);
// registerSingleton(ISharedProcessService, SharedProcessService, true);
// registerSingleton(IWindowsService, WindowsService);
// registerSingleton(IUpdateService, UpdateService);
// registerSingleton(IIssueService, IssueService);
// registerSingleton(IWorkspacesService, WorkspacesService);
// registerSingleton(IMenubarService, MenubarService);
// registerSingleton(IURLService, RelayURLService);
// registerSingleton(ITunnelService, TunnelService, true);
// registerSingleton(ICredentialsService, KeytarCredentialsService, true);
registerSingleton(IContextMenuService, ContextMenuService);

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
