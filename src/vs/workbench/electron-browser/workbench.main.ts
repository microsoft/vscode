/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Base
import 'vs/base/common/strings';
import 'vs/base/common/errors';

// Editor
import 'vs/editor/contrib/accessibility/browser/accessibility';
import 'vs/editor/contrib/inspectTMScopes/electron-browser/inspectTMScopes';
import 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import 'vs/editor/browser/editor.all';

// Menus/Actions
import 'vs/platform/actions/electron-browser/menusExtensionPoint';

// Workbench
import 'vs/workbench/browser/actions/toggleActivityBarVisibility';
import 'vs/workbench/browser/actions/toggleStatusbarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarPosition';
import 'vs/workbench/browser/actions/toggleEditorLayout';
import 'vs/workbench/browser/actions/toggleZenMode';
import 'vs/workbench/parts/preferences/browser/preferences.contribution';
import 'vs/workbench/parts/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/browser/actions/configureLocale';

import 'vs/workbench/parts/quickopen/browser/quickopen.contribution';
import 'vs/workbench/browser/parts/editor/editorPicker';

import 'vs/workbench/parts/files/browser/explorerViewlet';
import 'vs/workbench/parts/files/browser/fileActions.contribution';
import 'vs/workbench/parts/files/browser/files.contribution';

import 'vs/workbench/parts/backup/common/backup.contribution';

import 'vs/workbench/parts/search/browser/search.contribution';
import 'vs/workbench/parts/search/browser/searchViewlet'; // can be packaged separately
import 'vs/workbench/parts/search/browser/openAnythingHandler'; // can be packaged separately

import 'vs/workbench/parts/scm/electron-browser/scm.contribution';
import 'vs/workbench/parts/scm/electron-browser/scmViewlet'; // can be packaged separately

import 'vs/workbench/parts/git/electron-browser/git.contribution';
import 'vs/workbench/parts/git/browser/gitQuickOpen';
import 'vs/workbench/parts/git/browser/gitActions.contribution';
import 'vs/workbench/parts/git/browser/gitViewlet'; // can be packaged separately

import 'vs/workbench/parts/debug/electron-browser/debug.contribution';
import 'vs/workbench/parts/debug/browser/debugQuickOpen';
import 'vs/workbench/parts/debug/electron-browser/repl';
import 'vs/workbench/parts/debug/browser/debugEditorActions';
import 'vs/workbench/parts/debug/browser/debugViewlet'; // can be packaged separately

import 'vs/workbench/parts/markers/markers.contribution';
import 'vs/workbench/parts/markers/browser/markersPanel'; // can be packaged separately

import 'vs/workbench/parts/html/browser/html.contribution';

import 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThrough.contribution';

import 'vs/workbench/parts/extensions/electron-browser/extensions.contribution';
import 'vs/workbench/parts/extensions/browser/extensionsQuickOpen';
import 'vs/workbench/parts/extensions/electron-browser/extensionsViewlet'; // can be packaged separately

import 'vs/workbench/parts/welcome/page/electron-browser/welcomePage.contribution';

import 'vs/workbench/parts/explorers/browser/treeExplorer.contribution';
import 'vs/workbench/parts/explorers/browser/treeExplorerViewlet'; // can be packaged separately

import 'vs/workbench/parts/output/browser/output.contribution';
import 'vs/workbench/parts/output/browser/outputPanel'; // can be packaged separately

import 'vs/workbench/parts/terminal/electron-browser/terminal.contribution';
import 'vs/workbench/parts/terminal/electron-browser/terminalPanel'; // can be packaged separately

import 'vs/workbench/electron-browser/workbench';

import 'vs/workbench/parts/trust/electron-browser/unsupportedWorkspaceSettings.contribution';

import 'vs/workbench/parts/relauncher/electron-browser/relauncher.contribution';

import 'vs/workbench/parts/tasks/electron-browser/task.contribution';

import 'vs/workbench/parts/emmet/browser/emmet.browser.contribution';
import 'vs/workbench/parts/emmet/node/emmet.contribution';

// Code Editor enhacements
import 'vs/workbench/parts/codeEditor/codeEditor.contribution';

import 'vs/workbench/parts/execution/electron-browser/execution.contribution';
import 'vs/workbench/parts/execution/electron-browser/terminal.contribution';

import 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';

import 'vs/workbench/parts/themes/electron-browser/themes.contribution';

import 'vs/workbench/parts/feedback/electron-browser/feedback.contribution';

import 'vs/workbench/parts/welcome/gettingStarted/electron-browser/gettingStarted.contribution';

import 'vs/workbench/parts/update/electron-browser/update.contribution';

import 'vs/workbench/parts/nps/electron-browser/nps.contribution';

import 'vs/workbench/parts/performance/electron-browser/performance.contribution';

import 'vs/workbench/parts/cli/electron-browser/cli.contribution';

import 'vs/workbench/api/node/extHost.contribution';

import 'vs/workbench/electron-browser/main.contribution';
import 'vs/workbench/electron-browser/main';

import 'vs/workbench/parts/themes/test/electron-browser/themes.test.contribution';

import 'vs/workbench/parts/watermark/electron-browser/watermark';

import 'vs/workbench/parts/welcome/overlay/browser/welcomeOverlay';
