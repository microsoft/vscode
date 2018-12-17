/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Base
import 'vs/base/common/strings';
import 'vs/base/common/errors';

// Configuration
import 'vs/workbench/services/configuration/common/configurationExtensionPoint';

// Editor
import 'vs/editor/editor.all';

// Platform
import 'vs/platform/widget/browser/contextScopedHistoryWidget';

// Menus/Actions
import 'vs/workbench/services/actions/electron-browser/menusExtensionPoint';

// Views
import 'vs/workbench/api/browser/viewsContainersExtensionPoint';
import 'vs/workbench/api/browser/viewsExtensionPoint';

// Localizations
import 'vs/workbench/parts/localizations/electron-browser/localizations.contribution';

// Workbench
import 'vs/workbench/browser/actions/toggleActivityBarVisibility';
import 'vs/workbench/browser/actions/toggleStatusbarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarPosition';
import 'vs/workbench/browser/actions/toggleEditorLayout';
import 'vs/workbench/browser/actions/toggleZenMode';
import 'vs/workbench/browser/actions/toggleCenteredLayout';
import 'vs/workbench/browser/actions/toggleTabsVisibility';
import 'vs/workbench/parts/preferences/electron-browser/preferences.contribution';
import 'vs/workbench/parts/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/parts/logs/electron-browser/logs.contribution';

import 'vs/workbench/browser/parts/quickopen/quickopen.contribution';
import 'vs/workbench/parts/quickopen/browser/quickopen.contribution';
import 'vs/workbench/browser/parts/editor/editorPicker';
import 'vs/workbench/browser/parts/quickinput/quickInput.contribution';

import 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import 'vs/workbench/parts/files/electron-browser/fileActions.contribution';
import 'vs/workbench/parts/files/electron-browser/files.contribution';

import 'vs/workbench/parts/backup/common/backup.contribution';

import 'vs/workbench/parts/stats/node/stats.contribution';

import 'vs/workbench/parts/splash/electron-browser/partsSplash.contribution';

import 'vs/workbench/parts/search/electron-browser/search.contribution';
import 'vs/workbench/parts/search/browser/searchView';
import 'vs/workbench/parts/search/browser/openAnythingHandler';

import 'vs/workbench/parts/scm/electron-browser/scm.contribution';
import 'vs/workbench/parts/scm/electron-browser/scmViewlet';

import 'vs/workbench/parts/debug/electron-browser/debug.contribution';
import 'vs/workbench/parts/debug/browser/debugQuickOpen';
import 'vs/workbench/parts/debug/electron-browser/repl';
import 'vs/workbench/parts/debug/browser/debugViewlet';

import 'vs/workbench/parts/markers/electron-browser/markers.contribution';
import 'vs/workbench/parts/comments/electron-browser/comments.contribution';

import 'vs/workbench/parts/html/electron-browser/html.contribution';

import 'vs/workbench/parts/url/electron-browser/url.contribution';
import 'vs/workbench/parts/webview/electron-browser/webview.contribution';

import 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThrough.contribution';

import 'vs/workbench/parts/extensions/electron-browser/extensions.contribution';
import 'vs/workbench/parts/extensions/browser/extensionsQuickOpen';
import 'vs/workbench/parts/extensions/electron-browser/extensionsViewlet';

import 'vs/workbench/parts/welcome/page/electron-browser/welcomePage.contribution';

import 'vs/workbench/parts/output/electron-browser/output.contribution';
import 'vs/workbench/parts/output/browser/outputPanel';

import 'vs/workbench/parts/terminal/electron-browser/terminal.contribution';
import 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import 'vs/workbench/parts/terminal/electron-browser/terminalPanel';

import 'vs/workbench/electron-browser/workbench';

import 'vs/workbench/parts/relauncher/electron-browser/relauncher.contribution';

import 'vs/workbench/parts/tasks/electron-browser/task.contribution';

import 'vs/workbench/parts/emmet/browser/emmet.browser.contribution';
import 'vs/workbench/parts/emmet/electron-browser/emmet.contribution';

import 'vs/workbench/parts/codeEditor/codeEditor.contribution';

import 'vs/workbench/parts/execution/electron-browser/execution.contribution';

import 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import 'vs/workbench/parts/snippets/electron-browser/insertSnippet';
import 'vs/workbench/parts/snippets/electron-browser/configureSnippets';
import 'vs/workbench/parts/snippets/electron-browser/tabCompletion';

import 'vs/workbench/parts/themes/electron-browser/themes.contribution';

import 'vs/workbench/parts/feedback/electron-browser/feedback.contribution';

import 'vs/workbench/parts/welcome/gettingStarted/electron-browser/gettingStarted.contribution';

import 'vs/workbench/parts/update/electron-browser/update.contribution';

import 'vs/workbench/parts/surveys/electron-browser/nps.contribution';
import 'vs/workbench/parts/surveys/electron-browser/languageSurveys.contribution';

import 'vs/workbench/parts/performance/electron-browser/performance.contribution';

import 'vs/workbench/parts/cli/electron-browser/cli.contribution';

import 'vs/workbench/api/electron-browser/extensionHost.contribution';

import 'vs/workbench/electron-browser/main.contribution';
import 'vs/workbench/electron-browser/main';

import 'vs/workbench/parts/themes/test/electron-browser/themes.test.contribution';

import 'vs/workbench/parts/watermark/electron-browser/watermark';

import 'vs/workbench/parts/welcome/overlay/browser/welcomeOverlay';

import 'vs/workbench/parts/outline/electron-browser/outline.contribution';

import 'vs/workbench/services/bulkEdit/electron-browser/bulkEditService';

import 'vs/workbench/parts/experiments/electron-browser/experiments.contribution';
