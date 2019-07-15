/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- workbench/editor core

import 'vs/editor/editor.all';

import 'vs/workbench/api/browser/extensionHost.contribution';

import 'vs/workbench/browser/workbench.contribution';

import 'vs/workbench/browser/web.main';

//#endregion


//#region --- workbench actions

import 'vs/workbench/browser/actions/layoutActions';
import 'vs/workbench/browser/actions/windowActions';
import 'vs/workbench/browser/actions/developerActions';
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
// import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
// import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { BrowserLifecycleService } from 'vs/platform/lifecycle/browser/lifecycleService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/platform/dialogs/browser/dialogService';
// import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
// import { LocalizationsService } from 'vs/platform/localizations/electron-browser/localizationsService';
// import { ISharedProcessService, SharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
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
// import 'vs/workbench/services/extensions/electron-browser/extensionHostDebugService';
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
// import 'vs/workbench/services/extensionManagement/node/extensionEnablementService';
import 'vs/workbench/services/extensions/browser/extensionService';
// import 'vs/workbench/services/contextmenu/electron-browser/contextmenuService';
// import 'vs/workbench/services/extensions/node/multiExtensionManagement';
import 'vs/workbench/services/label/common/labelService';
// import 'vs/workbench/services/extensions/electron-browser/extensionManagementServerService';
// import 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import 'vs/workbench/services/notification/common/notificationService';
// import 'vs/workbench/services/window/electron-browser/windowService';
// import 'vs/workbench/services/telemetry/electron-browser/telemetryService';
import 'vs/workbench/services/configurationResolver/browser/configurationResolverService';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';

import 'vs/workbench/browser/web.simpleservices';

registerSingleton(IBackupFileService, BackupFileService);
registerSingleton(IDialogService, DialogService, true);
registerSingleton(IMenuService, MenuService, true);
registerSingleton(IListService, ListService, true);
registerSingleton(IOpenerService, OpenerService, true);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IMarkerService, MarkerService, true);
// registerSingleton(IDownloadService, DownloadService, true);
registerSingleton(IClipboardService, BrowserClipboardService, true);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(IModelService, ModelServiceImpl, true);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService);
registerSingleton(IAccessibilityService, BrowserAccessibilityService, true);
registerSingleton(IContextViewService, ContextViewService, true);
// registerSingleton(IExtensionGalleryService, ExtensionGalleryService, true);
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

// Resource Service Worker
import 'vs/workbench/contrib/resources/browser/resourceServiceWorkerClient';

// Workspace File Watching
import 'vs/workbench/services/files/common/workspaceWatcher';

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Localizations
// import 'vs/workbench/contrib/localizations/browser/localizations.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/contrib/preferences/browser/keyboardLayoutPicker';
import { IPreferencesSearchService } from 'vs/workbench/contrib/preferences/common/preferences';
import { PreferencesSearchService } from 'vs/workbench/contrib/preferences/browser/preferencesSearch';
registerSingleton(IPreferencesSearchService, PreferencesSearchService, true);

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
// import 'vs/workbench/contrib/stats/electron-browser/stats.contribution';

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
import 'vs/workbench/contrib/debug/browser/debug.contribution';
import 'vs/workbench/contrib/debug/browser/debugQuickOpen';
import 'vs/workbench/contrib/debug/browser/debugEditorContribution';
import 'vs/workbench/contrib/debug/browser/repl';
import 'vs/workbench/contrib/debug/browser/debugViewlet';
import 'vs/workbench/contrib/debug/browser/debugHelperService';

// Markers
import 'vs/workbench/contrib/markers/browser/markers.contribution';

// Comments
import 'vs/workbench/contrib/comments/browser/comments.contribution';

// URL Support
import 'vs/workbench/contrib/url/common/url.contribution';

// Webview
import 'vs/workbench/contrib/webview/browser/webview.contribution';

import { IWebviewService } from 'vs/workbench/contrib/webview/common/webview';
import { WebviewService } from 'vs/workbench/contrib/webview/browser/webviewService';
import { IWebviewEditorService, WebviewEditorService } from 'vs/workbench/contrib/webview/browser/webviewEditorService';
registerSingleton(IWebviewService, WebviewService, true);
registerSingleton(IWebviewEditorService, WebviewEditorService, true);

// Extensions Management
// import 'vs/workbench/contrib/extensions/electron-browser/extensions.contribution';
// import 'vs/workbench/contrib/extensions/browser/extensionsQuickOpen';
// import 'vs/workbench/contrib/extensions/electron-browser/extensionsViewlet';

// Output Panel
import 'vs/workbench/contrib/output/browser/output.contribution';
import 'vs/workbench/contrib/output/browser/outputPanel';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminal.contribution';
// import 'vs/workbench/contrib/terminal/electron-browser/terminal.contribution';
import 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
import 'vs/workbench/contrib/terminal/browser/terminalPanel';

import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalNativeService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalNativeService } from 'vs/workbench/contrib/terminal/browser/terminalNativeService';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService';
registerSingleton(ITerminalNativeService, TerminalNativeService, true);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);

// Relauncher
// import 'vs/workbench/contrib/relauncher/electron-browser/relauncher.contribution';

// Tasks
import 'vs/workbench/contrib/tasks/browser/task.contribution';
import { TaskService } from 'vs/workbench/contrib/tasks/browser/taskService';
import { ITaskService } from 'vs/workbench/contrib/tasks/common/taskService';
registerSingleton(ITaskService, TaskService, true);

// Remote
import 'vs/workbench/contrib/remote/common/remote.contribution';
// import 'vs/workbench/contrib/remote/electron-browser/remote.contribution';

// Emmet
import 'vs/workbench/contrib/emmet/browser/emmet.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/browser/codeEditor.contribution';
// import 'vs/workbench/contrib/codeEditor/electron-browser/codeEditor.contribution';

// External terminal
import 'vs/workbench/contrib/externalTerminal/browser/externalTerminal.contribution';

// Snippets
import 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import 'vs/workbench/contrib/snippets/browser/snippetsService';
import 'vs/workbench/contrib/snippets/browser/insertSnippet';
import 'vs/workbench/contrib/snippets/browser/configureSnippets';
import 'vs/workbench/contrib/snippets/browser/tabCompletion';

// Formatter Help
import 'vs/workbench/contrib/format/browser/format.contribution';

// Send a Smile
// import 'vs/workbench/contrib/feedback/browser/feedback.contribution';

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
// import 'vs/workbench/contrib/welcome/page/browser/welcomePage.contribution';

// Call Hierarchy
import 'vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution';

// Outline
import 'vs/workbench/contrib/outline/browser/outline.contribution';

// Experiments
// import 'vs/workbench/contrib/experiments/electron-browser/experiments.contribution';

// Issues
// import 'vs/workbench/contrib/issue/electron-browser/issue.contribution';

//#endregion
