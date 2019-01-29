/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- workbench/editor core

import 'vs/editor/editor.all';

import 'vs/workbench/api/electron-browser/extensionHost.contribution';

import 'vs/workbench/electron-browser/shell.contribution';
import 'vs/workbench/browser/workbench.contribution';

import 'vs/workbench/electron-browser/main';

//#endregion


//#region --- workbench actions

import 'vs/workbench/browser/actions/layoutActions';
import 'vs/workbench/browser/actions/listCommands';
import 'vs/workbench/browser/actions/navigationActions';
import 'vs/workbench/browser/parts/quickopen/quickopenActions';
import 'vs/workbench/browser/parts/quickinput/quickInputActions';

//#endregion


//#region --- API Extension Points

import 'vs/workbench/api/common/menusExtensionPoint';
import 'vs/workbench/api/common/configurationExtensionPoint';
import 'vs/workbench/api/browser/viewsExtensionPoint';

//#endregion


//#region --- workbench services

import 'vs/workbench/services/bulkEdit/electron-browser/bulkEditService';

//#endregion


//#region --- workbench parts

// Localizations
import 'vs/workbench/parts/localizations/electron-browser/localizations.contribution';

// Preferences
import 'vs/workbench/parts/preferences/electron-browser/preferences.contribution';
import 'vs/workbench/parts/preferences/browser/keybindingsEditorContribution';

// Logs
import 'vs/workbench/parts/logs/electron-browser/logs.contribution';

// Quick Open Handlers
import 'vs/workbench/parts/quickopen/browser/quickopen.contribution';

// Explorer
import 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import 'vs/workbench/parts/files/electron-browser/fileActions.contribution';
import 'vs/workbench/parts/files/electron-browser/files.contribution';

// Backup
import 'vs/workbench/parts/backup/common/backup.contribution';

// Stats
import 'vs/workbench/parts/stats/node/stats.contribution';

// Rapid Render Splash
import 'vs/workbench/parts/splash/electron-browser/partsSplash.contribution';

// Search
import 'vs/workbench/parts/search/electron-browser/search.contribution';
import 'vs/workbench/parts/search/browser/searchView';
import 'vs/workbench/parts/search/browser/openAnythingHandler';

// SCM
import 'vs/workbench/parts/scm/electron-browser/scm.contribution';
import 'vs/workbench/parts/scm/electron-browser/scmViewlet';

// Debug
import 'vs/workbench/parts/debug/electron-browser/debug.contribution';
import 'vs/workbench/parts/debug/browser/debugQuickOpen';
import 'vs/workbench/parts/debug/electron-browser/repl';
import 'vs/workbench/parts/debug/browser/debugViewlet';

// Markers
import 'vs/workbench/parts/markers/electron-browser/markers.contribution';

// Comments
import 'vs/workbench/parts/comments/electron-browser/comments.contribution';

// HTML Preview
import 'vs/workbench/parts/html/electron-browser/html.contribution';

// URL Support
import 'vs/workbench/parts/url/electron-browser/url.contribution';

// Webview
import 'vs/workbench/parts/webview/electron-browser/webview.contribution';

// Extensions Management
import 'vs/workbench/parts/extensions/electron-browser/extensions.contribution';
import 'vs/workbench/parts/extensions/browser/extensionsQuickOpen';
import 'vs/workbench/parts/extensions/electron-browser/extensionsViewlet';

// Output Panel
import 'vs/workbench/parts/output/electron-browser/output.contribution';
import 'vs/workbench/parts/output/browser/outputPanel';

// Terminal
import 'vs/workbench/parts/terminal/electron-browser/terminal.contribution';
import 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import 'vs/workbench/parts/terminal/electron-browser/terminalPanel';

// Relauncher
import 'vs/workbench/parts/relauncher/electron-browser/relauncher.contribution';

// Tasks
import 'vs/workbench/parts/tasks/electron-browser/task.contribution';

// Emmet
import 'vs/workbench/parts/emmet/browser/emmet.browser.contribution';
import 'vs/workbench/parts/emmet/electron-browser/emmet.contribution';

// CodeEditor Contributions
import 'vs/workbench/parts/codeEditor/electron-browser/codeEditor.contribution';

// Execution
import 'vs/workbench/parts/execution/electron-browser/execution.contribution';

// Snippets
import 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import 'vs/workbench/parts/snippets/electron-browser/insertSnippet';
import 'vs/workbench/parts/snippets/electron-browser/configureSnippets';
import 'vs/workbench/parts/snippets/electron-browser/tabCompletion';

// Send a Smile
import 'vs/workbench/parts/feedback/electron-browser/feedback.contribution';

// Update
import 'vs/workbench/parts/update/electron-browser/update.contribution';

// Surveys
import 'vs/workbench/parts/surveys/electron-browser/nps.contribution';
import 'vs/workbench/parts/surveys/electron-browser/languageSurveys.contribution';

// Performance
import 'vs/workbench/parts/performance/electron-browser/performance.contribution';

// CLI
import 'vs/workbench/parts/cli/electron-browser/cli.contribution';

// Themes Support
import 'vs/workbench/parts/themes/electron-browser/themes.contribution';
import 'vs/workbench/parts/themes/test/electron-browser/themes.test.contribution';

// Watermark
import 'vs/workbench/parts/watermark/electron-browser/watermark';

// Welcome
import 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThrough.contribution';
import 'vs/workbench/parts/welcome/gettingStarted/electron-browser/gettingStarted.contribution';
import 'vs/workbench/parts/welcome/overlay/browser/welcomeOverlay';
import 'vs/workbench/parts/welcome/page/electron-browser/welcomePage.contribution';

// Outline
import 'vs/workbench/parts/outline/electron-browser/outline.contribution';

// Experiments
import 'vs/workbench/parts/experiments/electron-browser/experiments.contribution';

//#endregion