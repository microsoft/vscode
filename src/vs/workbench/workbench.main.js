/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

require.config({
	ignoreDuplicateModules: [
		'vs/workbench/parts/search/common/searchModel',
		'vs/workbench/parts/search/common/searchQuery'
	]
});

define([

	// Base
	'vs/base/common/strings',
	'vs/base/common/errors',

	// Editor
	'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard',
	'vs/editor/browser/editor.all',

	// Languages
	'vs/languages/languages.main',

	// Workbench
	'vs/workbench/browser/actions/toggleStatusbarVisibility',
	'vs/workbench/browser/actions/toggleSidebarVisibility',
	'vs/workbench/browser/actions/toggleSidebarPosition',
	'vs/workbench/browser/actions/openSettings',
	'vs/workbench/browser/actions/configureLocale',

	'vs/workbench/parts/quickopen/browser/quickopen.contribution',
	'vs/workbench/browser/parts/editor/editorPicker',

	'vs/workbench/parts/files/browser/explorerViewlet',
	'vs/workbench/parts/files/browser/fileActions.contribution',
	'vs/workbench/parts/files/browser/files.contribution',
	'vs/workbench/parts/files/electron-browser/files.electron.contribution',

	'vs/workbench/parts/search/browser/search.contribution',

	'vs/workbench/parts/git/electron-browser/git.contribution',
	'vs/workbench/parts/git/browser/gitQuickOpen',
	'vs/workbench/parts/git/browser/gitActions.contribution',

	'vs/workbench/parts/debug/electron-browser/debug.contribution',

	'vs/workbench/parts/markers/markers.contribution',

	'vs/workbench/parts/html/browser/html.contribution',

	'vs/workbench/parts/extensions/electron-browser/extensions.contribution',
	'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen',

	'vs/workbench/parts/output/browser/output.contribution',

	'vs/workbench/parts/terminal/electron-browser/terminal.contribution',

	'vs/workbench/parts/markdown/browser/markdown.contribution',
	'vs/workbench/parts/markdown/browser/markdownActions.contribution',

	'vs/workbench/browser/workbench',

	'vs/workbench/parts/tasks/electron-browser/task.contribution',

	'vs/workbench/parts/emmet/node/emmet.contribution',

	'vs/workbench/parts/execution/electron-browser/execution.contribution',
	'vs/workbench/parts/execution/electron-browser/terminal.contribution',

	'vs/workbench/parts/snippets/electron-browser/snippets.contribution',

	'vs/workbench/parts/contentprovider/common/contentprovider.contribution',

	'vs/workbench/parts/themes/electron-browser/themes.contribution',

	'vs/workbench/parts/feedback/electron-browser/feedback.contribution',

	'vs/workbench/parts/welcome/electron-browser/electronGettingStarted.contribution',

	'vs/workbench/parts/update/electron-browser/update.contribution',

	'vs/workbench/electron-browser/darwin/cli.contribution',

	'vs/workbench/api/node/extHost.contribution',

	'vs/workbench/electron-browser/main.contribution',
	'vs/workbench/electron-browser/main',

	'vs/workbench/parts/themes/test/electron-browser/themes.test.contribution'

], function() {
	'use strict';
});
