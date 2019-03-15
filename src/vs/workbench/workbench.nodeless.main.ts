/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- workbench/editor core

import 'vs/editor/editor.all';

// import 'vs/workbench/api/electron-browser/extensionHost.contribution';

// import 'vs/workbench/electron-browser/main.contribution';
import 'vs/workbench/browser/workbench.contribution';

import 'vs/workbench/browser/nodeless.main';

//#endregion


//#region --- workbench actions

import 'vs/workbench/browser/actions/layoutActions';
import 'vs/workbench/browser/actions/listCommands';
import 'vs/workbench/browser/actions/navigationActions';
import 'vs/workbench/browser/parts/quickopen/quickOpenActions';
import 'vs/workbench/browser/parts/quickinput/quickInputActions';

//#endregion


//#region --- API Extension Points

import 'vs/workbench/api/common/menusExtensionPoint';
import 'vs/workbench/api/common/configurationExtensionPoint';
import 'vs/workbench/api/browser/viewsExtensionPoint';

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
// import { IDownloadService } from 'vs/platform/download/common/download';
// import { DownloadService } from 'vs/platform/download/node/downloadService';
// import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
// import { ClipboardService } from 'vs/platform/clipboard/electron-browser/clipboardService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { BrowserAccessibilityService } from 'vs/platform/accessibility/common/accessibilityService';
import { IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
// import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
// import { IRequestService } from 'vs/platform/request/node/request';
// import { RequestService } from 'vs/platform/request/electron-browser/requestService';
// import { LifecycleService } from 'vs/platform/lifecycle/electron-browser/lifecycleService';
// import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
// import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
// import { LocalizationsService } from 'vs/platform/localizations/electron-browser/localizationsService';
// import { ISharedProcessService, SharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
// import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-browser/remoteAuthorityResolverService';
// import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
// import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
// import { TelemetryService } from 'vs/platform/telemetry/electron-browser/telemetryService';
// import { IProductService } from 'vs/platform/product/common/product';
// import { ProductService } from 'vs/platform/product/node/productService';
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

import 'vs/workbench/browser/nodeless.simpleservices';

import 'vs/workbench/services/bulkEdit/browser/bulkEditService';
// import 'vs/workbench/services/integrity/node/integrityService';
import 'vs/workbench/services/keybinding/common/keybindingEditing';
import 'vs/workbench/services/hash/common/hashService';
// import 'vs/workbench/services/textMate/electron-browser/textMateService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
// import 'vs/workbench/services/workspace/node/workspaceEditingService';
// import 'vs/workbench/services/extensions/electron-browser/inactiveExtensionUrlHandler';
import 'vs/workbench/services/decorations/browser/decorationsService';
// import 'vs/workbench/services/search/node/searchService';
import 'vs/workbench/services/progress/browser/progressService2';
import 'vs/workbench/services/editor/browser/codeEditorService';
// import 'vs/workbench/services/broadcast/electron-browser/broadcastService';
import 'vs/workbench/services/preferences/browser/preferencesService';
import 'vs/workbench/services/output/common/outputChannelModelService';
import 'vs/workbench/services/configuration/common/jsonEditingService';
import 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import 'vs/workbench/services/textfile/common/textFileService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
// import 'vs/workbench/services/dialogs/electron-browser/dialogService';
// import 'vs/workbench/services/backup/node/backupFileService';
import 'vs/workbench/services/editor/browser/editorService';
import 'vs/workbench/services/history/browser/history';
// import 'vs/workbench/services/files/node/remoteFileService';
import 'vs/workbench/services/activity/browser/activityService';
import 'vs/workbench/browser/parts/views/views';
// import 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import 'vs/workbench/services/untitled/common/untitledEditorService';
// import 'vs/workbench/services/textfile/node/textResourcePropertiesService';
import 'vs/workbench/services/mode/common/workbenchModeService';
import 'vs/workbench/services/commands/common/commandService';
import 'vs/workbench/services/themes/browser/workbenchThemeService';
// import 'vs/workbench/services/extensions/electron-browser/extensionService';
// import 'vs/workbench/services/contextmenu/electron-browser/contextmenuService';
// import 'vs/workbench/services/extensionManagement/node/multiExtensionManagement';
import 'vs/workbench/services/label/common/labelService';
// import 'vs/workbench/services/extensions/electron-browser/extensionManagementServerService';
// import 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import 'vs/workbench/services/notification/common/notificationService';

registerSingleton(IMenuService, MenuService, true);
registerSingleton(IListService, ListService, true);
registerSingleton(IOpenerService, OpenerService, true);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IMarkerService, MarkerService, true);
// registerSingleton(IDownloadService, DownloadService, true);
// registerSingleton(IClipboardService, ClipboardService, true);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(IModelService, ModelServiceImpl, true);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService);
registerSingleton(IAccessibilityService, BrowserAccessibilityService, true);
registerSingleton(IExtensionEnablementService, ExtensionEnablementService, true);
registerSingleton(IContextViewService, ContextViewService, true);
// registerSingleton(IExtensionGalleryService, ExtensionGalleryService, true);
// registerSingleton(IRequestService, RequestService, true);
// registerSingleton(ILifecycleService, LifecycleService);
// registerSingleton(ILocalizationsService, LocalizationsService);
// registerSingleton(ISharedProcessService, SharedProcessService, true);
// registerSingleton(IRemoteAuthorityResolverService, RemoteAuthorityResolverService, true);
// registerSingleton(ITelemetryService, TelemetryService);
// registerSingleton(IProductService, ProductService, true);
// registerSingleton(IWindowsService, WindowsService);
// registerSingleton(IUpdateService, UpdateService);
// registerSingleton(IIssueService, IssueService);
// registerSingleton(IWorkspacesService, WorkspacesService);
// registerSingleton(IMenubarService, MenubarService);
// registerSingleton(IURLService, RelayURLService);

registerSingleton(IContextMenuService, ContextMenuService);

//#endregion

//#region --- workbench parts

import 'vs/workbench/browser/parts/quickinput/quickInput';
import 'vs/workbench/browser/parts/quickopen/quickOpenController';
import 'vs/workbench/browser/parts/titlebar/titlebarPart';
import 'vs/workbench/browser/parts/editor/editorPart';
import 'vs/workbench/browser/parts/activitybar/activitybarPart';
import 'vs/workbench/browser/parts/panel/panelPart';
import 'vs/workbench/browser/parts/sidebar/sidebarPart';
import 'vs/workbench/browser/parts/statusbar/statusbarPart';

//#endregion

//#region --- workbench contributions

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Localizations
// import 'vs/workbench/contrib/localizations/browser/localizations.contribution';

// Preferences
// import 'vs/workbench/contrib/preferences/electron-browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';

// Logs
import 'vs/workbench/contrib/logs/common/logs.contribution';

// Quick Open Handlers
import 'vs/workbench/contrib/quickopen/browser/quickopen.contribution';

// Explorer
import 'vs/workbench/contrib/files/browser/explorerViewlet';
import 'vs/workbench/contrib/files/browser/fileActions.contribution';
import 'vs/workbench/contrib/files/browser/files.contribution';

// Backup
import 'vs/workbench/contrib/backup/common/backup.contribution';

// Stats
// import 'vs/workbench/contrib/stats/node/stats.contribution';

// Rapid Render Splash
// import 'vs/workbench/contrib/splash/electron-browser/partsSplash.contribution';

// Search
import 'vs/workbench/contrib/search/browser/search.contribution';
import 'vs/workbench/contrib/search/browser/searchView';
import 'vs/workbench/contrib/search/browser/openAnythingHandler';

// SCM
import 'vs/workbench/contrib/scm/browser/scm.contribution';
import 'vs/workbench/contrib/scm/browser/scmViewlet';

// Debug
// import 'vs/workbench/contrib/debug/electron-browser/debug.contribution';
// import 'vs/workbench/contrib/debug/browser/debugQuickOpen';
// import 'vs/workbench/contrib/debug/browser/debugEditorContribution';
// import 'vs/workbench/contrib/debug/browser/repl';
// import 'vs/workbench/contrib/debug/browser/debugViewlet';

// Markers
import 'vs/workbench/contrib/markers/browser/markers.contribution';

// Comments
// import 'vs/workbench/contrib/comments/electron-browser/comments.contribution';

// URL Support
import 'vs/workbench/contrib/url/common/url.contribution';

// Webview
// import 'vs/workbench/contrib/webview/electron-browser/webview.contribution';

// Extensions Management
// import 'vs/workbench/contrib/extensions/electron-browser/extensions.contribution';
// import 'vs/workbench/contrib/extensions/browser/extensionsQuickOpen';
// import 'vs/workbench/contrib/extensions/electron-browser/extensionsViewlet';

// Output Panel
import 'vs/workbench/contrib/output/browser/output.contribution';
import 'vs/workbench/contrib/output/browser/outputPanel';

// Terminal
// import 'vs/workbench/contrib/terminal/browser/terminal.contribution';
// import 'vs/workbench/contrib/terminal/electron-browser/terminal.contribution';
// import 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
// import 'vs/workbench/contrib/terminal/browser/terminalPanel';

// Relauncher
// import 'vs/workbench/contrib/relauncher/electron-browser/relauncher.contribution';

// Tasks
// import 'vs/workbench/contrib/tasks/electron-browser/task.contribution';

// Emmet
import 'vs/workbench/contrib/emmet/browser/emmet.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/browser/codeEditor.contribution';
// import 'vs/workbench/contrib/codeEditor/electron-browser/codeEditor.contribution';

// Execution
// import 'vs/workbench/contrib/externalTerminal/electron-browser/externalTerminal.contribution';

// Snippets
import 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import 'vs/workbench/contrib/snippets/browser/snippetsService';
import 'vs/workbench/contrib/snippets/browser/insertSnippet';
import 'vs/workbench/contrib/snippets/browser/configureSnippets';
import 'vs/workbench/contrib/snippets/browser/tabCompletion';

// Formatter Help
import 'vs/workbench/contrib/format/browser/format.contribution';

// Send a Smile
// import 'vs/workbench/contrib/feedback/electron-browser/feedback.contribution';

// Update
// import 'vs/workbench/contrib/update/electron-browser/update.contribution';

// Surveys
// import 'vs/workbench/contrib/surveys/electron-browser/nps.contribution';
// import 'vs/workbench/contrib/surveys/electron-browser/languageSurveys.contribution';

// Performance
// import 'vs/workbench/contrib/performance/electron-browser/performance.contribution';

// CLI
// import 'vs/workbench/contrib/cli/node/cli.contribution';

// Themes Support
import 'vs/workbench/contrib/themes/browser/themes.contribution';
// import 'vs/workbench/contrib/themes/test/electron-browser/themes.test.contribution';

// Watermark
import 'vs/workbench/contrib/watermark/browser/watermark';

// Welcome
import 'vs/workbench/contrib/welcome/walkThrough/browser/walkThrough.contribution';
// import 'vs/workbench/contrib/welcome/gettingStarted/electron-browser/gettingStarted.contribution';
import 'vs/workbench/contrib/welcome/overlay/browser/welcomeOverlay';
import 'vs/workbench/contrib/welcome/page/browser/welcomePage.contribution';

// Outline
import 'vs/workbench/contrib/outline/browser/outline.contribution';

// Experiments
// import 'vs/workbench/contrib/experiments/electron-browser/experiments.contribution';

// Code Insets
// import 'vs/workbench/contrib/codeinset/electron-browser/codeInset.contribution';

// Issues
// import 'vs/workbench/contrib/issue/electron-browser/issue.contribution';

//#endregion
