/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- editor/workbench core

import 'vs/editor/editor.all';

import 'vs/workbench/api/browser/extensionHost.contribution';
import 'vs/workbench/browser/workbench.contribution';

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


//#region --- workbench parts

import 'vs/workbench/browser/parts/quickinput/quickInput';
import 'vs/workbench/browser/parts/quickopen/quickOpenController';
import 'vs/workbench/browser/parts/titlebar/titlebarPart';
import 'vs/workbench/browser/parts/editor/editorPart';
import 'vs/workbench/browser/parts/activitybar/activitybarPart';
import 'vs/workbench/browser/parts/panel/panelPart';
import 'vs/workbench/browser/parts/sidebar/sidebarPart';
import 'vs/workbench/browser/parts/statusbar/statusbarPart';
import 'vs/workbench/browser/parts/views/views';

//#endregion


//#region --- workbench services

import 'vs/workbench/services/bulkEdit/browser/bulkEditService';
import 'vs/workbench/services/keybinding/common/keybindingEditing';
import 'vs/workbench/services/decorations/browser/decorationsService';
import 'vs/workbench/services/progress/browser/progressService';
import 'vs/workbench/services/editor/browser/codeEditorService';
import 'vs/workbench/services/preferences/browser/preferencesService';
import 'vs/workbench/services/configuration/common/jsonEditingService';
import 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import 'vs/workbench/services/dialogs/browser/fileDialogService';
import 'vs/workbench/services/editor/browser/editorService';
import 'vs/workbench/services/history/browser/history';
import 'vs/workbench/services/activity/browser/activityService';
import 'vs/workbench/services/keybinding/browser/keybindingService';
import 'vs/workbench/services/untitled/common/untitledEditorService';
import 'vs/workbench/services/textfile/common/textResourcePropertiesService';
import 'vs/workbench/services/mode/common/workbenchModeService';
import 'vs/workbench/services/commands/common/commandService';
import 'vs/workbench/services/themes/browser/workbenchThemeService';
import 'vs/workbench/services/label/common/labelService';
import 'vs/workbench/services/extensionManagement/common/extensionEnablementService';
import 'vs/workbench/services/notification/common/notificationService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';

registerSingleton(IExtensionGalleryService, ExtensionGalleryService, true);
registerSingleton(IContextViewService, ContextViewService, true);
registerSingleton(IListService, ListService, true);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IMarkerService, MarkerService, true);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(IModelService, ModelServiceImpl, true);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService);
registerSingleton(IMenuService, MenuService, true);
registerSingleton(IDownloadService, DownloadService, true);

//#endregion


//#region --- workbench contributions

// Workspace File Watching
import 'vs/workbench/services/files/common/workspaceWatcher';

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/contrib/preferences/browser/preferencesSearch';

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

// Markers
import 'vs/workbench/contrib/markers/browser/markers.contribution';

// Comments
import 'vs/workbench/contrib/comments/browser/comments.contribution';

// URL Support
import 'vs/workbench/contrib/url/common/url.contribution';

// Webview
import 'vs/workbench/contrib/webview/browser/webview.contribution';

// Extensions Management
import 'vs/workbench/contrib/extensions/browser/extensions.contribution';
import 'vs/workbench/contrib/extensions/browser/extensionsQuickOpen';
import 'vs/workbench/contrib/extensions/browser/extensionsViewlet';

// Output Panel
import 'vs/workbench/contrib/output/browser/output.contribution';
import 'vs/workbench/contrib/output/browser/outputPanel';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminal.contribution';
import 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
import 'vs/workbench/contrib/terminal/browser/terminalPanel';

// Relauncher
import 'vs/workbench/contrib/relauncher/common/relauncher.contribution';

// Tasks
import 'vs/workbench/contrib/tasks/browser/task.contribution';

// Remote
import 'vs/workbench/contrib/remote/common/remote.contribution';
import 'vs/workbench/contrib/remote/browser/remote';

// Emmet
import 'vs/workbench/contrib/emmet/browser/emmet.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/browser/codeEditor.contribution';

// Execution
import 'vs/workbench/contrib/externalTerminal/browser/externalTerminal.contribution';

// Snippets
import 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import 'vs/workbench/contrib/snippets/browser/snippetsService';
import 'vs/workbench/contrib/snippets/browser/insertSnippet';
import 'vs/workbench/contrib/snippets/browser/configureSnippets';
import 'vs/workbench/contrib/snippets/browser/tabCompletion';

// Formatter Help
import 'vs/workbench/contrib/format/browser/format.contribution';

// Themes
import 'vs/workbench/contrib/themes/browser/themes.contribution';

// Watermark
import 'vs/workbench/contrib/watermark/browser/watermark';

// Welcome
import 'vs/workbench/contrib/welcome/walkThrough/browser/walkThrough.contribution';
import 'vs/workbench/contrib/welcome/overlay/browser/welcomeOverlay';

// Call Hierarchy
import 'vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution';

// Outline
import 'vs/workbench/contrib/outline/browser/outline.contribution';

// Experiments
import 'vs/workbench/contrib/experiments/browser/experiments.contribution';

// Send a Smile
import 'vs/workbench/contrib/feedback/browser/feedback.contribution';

//#endregion
