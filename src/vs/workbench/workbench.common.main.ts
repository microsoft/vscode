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

//#endregion


//#region --- workbench contributions

// Workspace File Watching
import 'vs/workbench/services/files/common/workspaceWatcher';

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';
import { IPreferencesSearchService } from 'vs/workbench/contrib/preferences/common/preferences';
import { PreferencesSearchService } from 'vs/workbench/contrib/preferences/browser/preferencesSearch';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
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

//#endregion
