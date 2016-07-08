/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Base
import 'vs/base/common/strings';
import 'vs/base/common/errors';

// Editor
import 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import 'vs/editor/browser/editor.all';

// Languages
import 'vs/languages/languages.main';

// Menus/Actions
import 'vs/platform/actions/browser/menusExtensionPoint';

// Workbench
import 'vs/workbench/browser/actions/toggleStatusbarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarVisibility';
import 'vs/workbench/browser/actions/toggleSidebarPosition';
import 'vs/workbench/browser/actions/openSettings';
import 'vs/workbench/browser/actions/configureLocale';

import 'vs/workbench/parts/quickopen/browser/quickopen.contribution';
import 'vs/workbench/browser/parts/editor/editorPicker';

import 'vs/workbench/parts/files/browser/explorerViewlet';
import 'vs/workbench/parts/files/browser/fileActions.contribution';
import 'vs/workbench/parts/files/browser/files.contribution';
import 'vs/workbench/parts/files/electron-browser/files.electron.contribution';

import 'vs/workbench/parts/search/browser/search.contribution';

import 'vs/workbench/parts/git/electron-browser/git.contribution';
import 'vs/workbench/parts/git/browser/gitQuickOpen';
import 'vs/workbench/parts/git/browser/gitActions.contribution';

import 'vs/workbench/parts/debug/electron-browser/debug.contribution';

import 'vs/workbench/parts/markers/markers.contribution';

import 'vs/workbench/parts/html/browser/html.contribution';

import 'vs/workbench/parts/extensions/electron-browser/extensions.contribution';
import 'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen';


import 'vs/workbench/parts/output/browser/output.contribution';

import 'vs/workbench/parts/terminal/electron-browser/terminal.contribution';

import 'vs/workbench/electron-browser/workbench';

import 'vs/workbench/parts/tasks/electron-browser/task.contribution';

import 'vs/workbench/parts/emmet/node/emmet.contribution';

import 'vs/workbench/parts/execution/electron-browser/execution.contribution';
import 'vs/workbench/parts/execution/electron-browser/terminal.contribution';

import 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';

import 'vs/workbench/parts/contentprovider/common/contentprovider.contribution';

import 'vs/workbench/parts/themes/electron-browser/themes.contribution';

import 'vs/workbench/parts/feedback/electron-browser/feedback.contribution';

import 'vs/workbench/parts/welcome/electron-browser/electronGettingStarted.contribution';

import 'vs/workbench/parts/update/electron-browser/update.contribution';

import 'vs/workbench/electron-browser/darwin/cli.contribution';

import 'vs/workbench/api/node/extHost.contribution';

import 'vs/workbench/electron-browser/main.contribution';
import 'vs/workbench/electron-browser/main';

import 'vs/workbench/parts/themes/test/electron-browser/themes.test.contribution';
