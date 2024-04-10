/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { AbstractGotoLineQuickAccessProvider } from 'vs/editor/contrib/quickAccess/browser/gotoLineQuickAccess';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Extensions as QuickAccessExtensions, IQuickAccessRegistry } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { defaultQuickAccessContextKeyValue } from 'vs/workbench/browser/quickaccess';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { GotoSymbolQuickAccessProvider } from 'vs/workbench/contrib/codeEditor/browser/quickaccess/gotoSymbolQuickAccess';
import { AnythingQuickAccessProvider } from 'vs/workbench/contrib/search/browser/anythingQuickAccess';
import { registerContributions as replaceContributions } from 'vs/workbench/contrib/search/browser/replaceContributions';
import { registerContributions as notebookSearchContributions } from 'vs/workbench/contrib/search/browser/notebookSearch/notebookSearchContributions';
import { searchViewIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import { registerContributions as searchWidgetContributions } from 'vs/workbench/contrib/search/browser/searchWidget';
import { SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { ISearchHistoryService, SearchHistoryService } from 'vs/workbench/contrib/search/common/searchHistoryService';
import { ISearchViewModelWorkbenchService, SearchViewModelWorkbenchService } from 'vs/workbench/contrib/search/browser/searchModel';
import { SearchSortOrder, SEARCH_EXCLUDE_CONFIG, VIEWLET_ID, ViewMode, VIEW_ID } from 'vs/workbench/services/search/common/search';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { assertType } from 'vs/base/common/types';
import { getWorkspaceSymbols, IWorkspaceSymbol } from 'vs/workbench/contrib/search/common/search';
import * as Constants from 'vs/workbench/contrib/search/common/constants';

import 'vs/workbench/contrib/search/browser/searchActionsCopy';
import 'vs/workbench/contrib/search/browser/searchActionsFind';
import 'vs/workbench/contrib/search/browser/searchActionsNav';
import 'vs/workbench/contrib/search/browser/searchActionsRemoveReplace';
import 'vs/workbench/contrib/search/browser/searchActionsSymbol';
import 'vs/workbench/contrib/search/browser/searchActionsTopBar';
import 'vs/workbench/contrib/search/browser/searchActionsTextQuickAccess';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX, TextSearchQuickAccess } from 'vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess';

registerSingleton(ISearchViewModelWorkbenchService, SearchViewModelWorkbenchService, InstantiationType.Delayed);
registerSingleton(ISearchHistoryService, SearchHistoryService, InstantiationType.Delayed);

replaceContributions();
notebookSearchContributions();
searchWidgetContributions();

const SEARCH_MODE_CONFIG = 'search.mode';

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEWLET_ID,
	title: nls.localize2('search', "Search"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	icon: searchViewIcon,
	order: 1,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	containerIcon: searchViewIcon,
	name: nls.localize2('search', "Search"),
	ctorDescriptor: new SyncDescriptor(SearchView),
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: viewContainer.id,
		mnemonicTitle: nls.localize({ key: 'miViewSearch', comment: ['&& denotes a mnemonic'] }, "&&Search"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
			// Yes, this is weird. See #116188, #115556, #115511, and now #124146, for examples of what can go wrong here.
			when: ContextKeyExpr.regex('neverMatch', /doesNotMatch/)
		},
		order: 1
	}
};

// Register search default location to sidebar
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

// Register Quick Access Handler
const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess);

quickAccessRegistry.registerQuickAccessProvider({
	ctor: AnythingQuickAccessProvider,
	prefix: AnythingQuickAccessProvider.PREFIX,
	placeholder: nls.localize('anythingQuickAccessPlaceholder', "Search files by name (append {0} to go to line or {1} to go to symbol)", AbstractGotoLineQuickAccessProvider.PREFIX, GotoSymbolQuickAccessProvider.PREFIX),
	contextKey: defaultQuickAccessContextKeyValue,
	helpEntries: [{
		description: nls.localize('anythingQuickAccess', "Go to File"),
		commandId: 'workbench.action.quickOpen',
		commandCenterOrder: 10
	}]
});

quickAccessRegistry.registerQuickAccessProvider({
	ctor: SymbolsQuickAccessProvider,
	prefix: SymbolsQuickAccessProvider.PREFIX,
	placeholder: nls.localize('symbolsQuickAccessPlaceholder', "Type the name of a symbol to open."),
	contextKey: 'inWorkspaceSymbolsPicker',
	helpEntries: [{ description: nls.localize('symbolsQuickAccess', "Go to Symbol in Workspace"), commandId: Constants.SearchCommandIds.ShowAllSymbolsActionId }]
});

quickAccessRegistry.registerQuickAccessProvider({
	ctor: TextSearchQuickAccess,
	prefix: TEXT_SEARCH_QUICK_ACCESS_PREFIX,
	contextKey: 'inTextSearchPicker',
	placeholder: nls.localize('textSearchPickerPlaceholder', "Search for text in your workspace files (experimental)."),
	helpEntries: [
		{
			description: nls.localize('textSearchPickerHelp', "Search for Text (Experimental)"),
			commandId: Constants.SearchCommandIds.QuickTextSearchActionId,
			commandCenterOrder: 65,
		}
	]
});

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'search',
	order: 13,
	title: nls.localize('searchConfigurationTitle', "Search"),
	type: 'object',
	properties: {
		[SEARCH_EXCLUDE_CONFIG]: {
			type: 'object',
			markdownDescription: nls.localize('exclude', "Configure [glob patterns](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) for excluding files and folders in fulltext searches and file search in quick open. To exclude files from the recently opened list in quick open, patterns must be absolute (for example `**/node_modules/**`). Inherits all glob patterns from the `#files.exclude#` setting."),
			default: { '**/node_modules': true, '**/bower_components': true, '**/*.code-search': true },
			additionalProperties: {
				anyOf: [
					{
						type: 'boolean',
						description: nls.localize('exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						type: 'object',
						properties: {
							when: {
								type: 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								pattern: '\\w*\\$\\(basename\\)\\w*',
								default: '$(basename).ext',
								markdownDescription: nls.localize({ key: 'exclude.when', comment: ['\\$(basename) should not be translated'] }, 'Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.')
							}
						}
					}
				]
			},
			scope: ConfigurationScope.RESOURCE
		},
		[SEARCH_MODE_CONFIG]: {
			type: 'string',
			enum: ['view', 'reuseEditor', 'newEditor'],
			default: 'view',
			markdownDescription: nls.localize('search.mode', "Controls where new `Search: Find in Files` and `Find in Folder` operations occur: either in the search view, or in a search editor."),
			enumDescriptions: [
				nls.localize('search.mode.view', "Search in the search view, either in the panel or side bars."),
				nls.localize('search.mode.reuseEditor', "Search in an existing search editor if present, otherwise in a new search editor."),
				nls.localize('search.mode.newEditor', "Search in a new search editor."),
			]
		},
		'search.useRipgrep': {
			type: 'boolean',
			description: nls.localize('useRipgrep', "This setting is deprecated and now falls back on \"search.usePCRE2\"."),
			deprecationMessage: nls.localize('useRipgrepDeprecated', "Deprecated. Consider \"search.usePCRE2\" for advanced regex feature support."),
			default: true
		},
		'search.maintainFileSearchCache': {
			type: 'boolean',
			deprecationMessage: nls.localize('maintainFileSearchCacheDeprecated', "The search cache is kept in the extension host which never shuts down, so this setting is no longer needed."),
			description: nls.localize('search.maintainFileSearchCache', "When enabled, the searchService process will be kept alive instead of being shut down after an hour of inactivity. This will keep the file search cache in memory."),
			default: false
		},
		'search.useIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useIgnoreFiles', "Controls whether to use `.gitignore` and `.ignore` files when searching for files."),
			default: true,
			scope: ConfigurationScope.RESOURCE
		},
		'search.useGlobalIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useGlobalIgnoreFiles', "Controls whether to use your global gitignore file (for example, from `$HOME/.config/git/ignore`) when searching for files. Requires `#search.useIgnoreFiles#` to be enabled."),
			default: false,
			scope: ConfigurationScope.RESOURCE
		},
		'search.useParentIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useParentIgnoreFiles', "Controls whether to use `.gitignore` and `.ignore` files in parent directories when searching for files. Requires `#search.useIgnoreFiles#` to be enabled."),
			default: false,
			scope: ConfigurationScope.RESOURCE
		},
		'search.quickOpen.includeSymbols': {
			type: 'boolean',
			description: nls.localize('search.quickOpen.includeSymbols', "Whether to include results from a global symbol search in the file results for Quick Open."),
			default: false
		},
		'search.quickOpen.includeHistory': {
			type: 'boolean',
			description: nls.localize('search.quickOpen.includeHistory', "Whether to include results from recently opened files in the file results for Quick Open."),
			default: true
		},
		'search.quickOpen.history.filterSortOrder': {
			'type': 'string',
			'enum': ['default', 'recency'],
			'default': 'default',
			'enumDescriptions': [
				nls.localize('filterSortOrder.default', 'History entries are sorted by relevance based on the filter value used. More relevant entries appear first.'),
				nls.localize('filterSortOrder.recency', 'History entries are sorted by recency. More recently opened entries appear first.')
			],
			'description': nls.localize('filterSortOrder', "Controls sorting order of editor history in quick open when filtering.")
		},
		'search.followSymlinks': {
			type: 'boolean',
			description: nls.localize('search.followSymlinks', "Controls whether to follow symlinks while searching."),
			default: true
		},
		'search.smartCase': {
			type: 'boolean',
			description: nls.localize('search.smartCase', "Search case-insensitively if the pattern is all lowercase, otherwise, search case-sensitively."),
			default: false
		},
		'search.globalFindClipboard': {
			type: 'boolean',
			default: false,
			description: nls.localize('search.globalFindClipboard', "Controls whether the search view should read or modify the shared find clipboard on macOS."),
			included: platform.isMacintosh
		},
		'search.location': {
			type: 'string',
			enum: ['sidebar', 'panel'],
			default: 'sidebar',
			description: nls.localize('search.location', "Controls whether the search will be shown as a view in the sidebar or as a panel in the panel area for more horizontal space."),
			deprecationMessage: nls.localize('search.location.deprecationMessage', "This setting is deprecated. You can drag the search icon to a new location instead.")
		},
		'search.maxResults': {
			type: ['number', 'null'],
			default: 20000,
			markdownDescription: nls.localize('search.maxResults', "Controls the maximum number of search results, this can be set to `null` (empty) to return unlimited results.")
		},
		'search.collapseResults': {
			type: 'string',
			enum: ['auto', 'alwaysCollapse', 'alwaysExpand'],
			enumDescriptions: [
				nls.localize('search.collapseResults.auto', "Files with less than 10 results are expanded. Others are collapsed."),
				'',
				''
			],
			default: 'alwaysExpand',
			description: nls.localize('search.collapseAllResults', "Controls whether the search results will be collapsed or expanded."),
		},
		'search.useReplacePreview': {
			type: 'boolean',
			default: true,
			description: nls.localize('search.useReplacePreview', "Controls whether to open Replace Preview when selecting or replacing a match."),
		},
		'search.showLineNumbers': {
			type: 'boolean',
			default: false,
			description: nls.localize('search.showLineNumbers', "Controls whether to show line numbers for search results."),
		},
		'search.usePCRE2': {
			type: 'boolean',
			default: false,
			description: nls.localize('search.usePCRE2', "Whether to use the PCRE2 regex engine in text search. This enables using some advanced regex features like lookahead and backreferences. However, not all PCRE2 features are supported - only features that are also supported by JavaScript."),
			deprecationMessage: nls.localize('usePCRE2Deprecated', "Deprecated. PCRE2 will be used automatically when using regex features that are only supported by PCRE2."),
		},
		'search.actionsPosition': {
			type: 'string',
			enum: ['auto', 'right'],
			enumDescriptions: [
				nls.localize('search.actionsPositionAuto', "Position the actionbar to the right when the search view is narrow, and immediately after the content when the search view is wide."),
				nls.localize('search.actionsPositionRight', "Always position the actionbar to the right."),
			],
			default: 'right',
			description: nls.localize('search.actionsPosition', "Controls the positioning of the actionbar on rows in the search view.")
		},
		'search.searchOnType': {
			type: 'boolean',
			default: true,
			description: nls.localize('search.searchOnType', "Search all files as you type.")
		},
		'search.seedWithNearestWord': {
			type: 'boolean',
			default: false,
			description: nls.localize('search.seedWithNearestWord', "Enable seeding search from the word nearest the cursor when the active editor has no selection.")
		},
		'search.seedOnFocus': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('search.seedOnFocus', "Update the search query to the editor's selected text when focusing the search view. This happens either on click or when triggering the `workbench.views.search.focus` command.")
		},
		'search.searchOnTypeDebouncePeriod': {
			type: 'number',
			default: 300,
			markdownDescription: nls.localize('search.searchOnTypeDebouncePeriod', "When {0} is enabled, controls the timeout in milliseconds between a character being typed and the search starting. Has no effect when {0} is disabled.", '`#search.searchOnType#`')
		},
		'search.searchEditor.doubleClickBehaviour': {
			type: 'string',
			enum: ['selectWord', 'goToLocation', 'openLocationToSide'],
			default: 'goToLocation',
			enumDescriptions: [
				nls.localize('search.searchEditor.doubleClickBehaviour.selectWord', "Double-clicking selects the word under the cursor."),
				nls.localize('search.searchEditor.doubleClickBehaviour.goToLocation', "Double-clicking opens the result in the active editor group."),
				nls.localize('search.searchEditor.doubleClickBehaviour.openLocationToSide', "Double-clicking opens the result in the editor group to the side, creating one if it does not yet exist."),
			],
			markdownDescription: nls.localize('search.searchEditor.doubleClickBehaviour', "Configure effect of double-clicking a result in a search editor.")
		},
		'search.searchEditor.singleClickBehaviour': {
			type: 'string',
			enum: ['default', 'peekDefinition',],
			default: 'default',
			enumDescriptions: [
				nls.localize('search.searchEditor.singleClickBehaviour.default', "Single-clicking does nothing."),
				nls.localize('search.searchEditor.singleClickBehaviour.peekDefinition', "Single-clicking opens a Peek Definition window."),
			],
			markdownDescription: nls.localize('search.searchEditor.singleClickBehaviour', "Configure effect of single-clicking a result in a search editor.")
		},
		'search.searchEditor.reusePriorSearchConfiguration': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize({ key: 'search.searchEditor.reusePriorSearchConfiguration', comment: ['"Search Editor" is a type of editor that can display search results. "includes, excludes, and flags" refers to the "files to include" and "files to exclude" input boxes, and the flags that control whether a query is case-sensitive or a regex.'] }, "When enabled, new Search Editors will reuse the includes, excludes, and flags of the previously opened Search Editor.")
		},
		'search.searchEditor.defaultNumberOfContextLines': {
			type: ['number', 'null'],
			default: 1,
			markdownDescription: nls.localize('search.searchEditor.defaultNumberOfContextLines', "The default number of surrounding context lines to use when creating new Search Editors. If using `#search.searchEditor.reusePriorSearchConfiguration#`, this can be set to `null` (empty) to use the prior Search Editor's configuration.")
		},
		'search.sortOrder': {
			'type': 'string',
			'enum': [SearchSortOrder.Default, SearchSortOrder.FileNames, SearchSortOrder.Type, SearchSortOrder.Modified, SearchSortOrder.CountDescending, SearchSortOrder.CountAscending],
			'default': SearchSortOrder.Default,
			'enumDescriptions': [
				nls.localize('searchSortOrder.default', "Results are sorted by folder and file names, in alphabetical order."),
				nls.localize('searchSortOrder.filesOnly', "Results are sorted by file names ignoring folder order, in alphabetical order."),
				nls.localize('searchSortOrder.type', "Results are sorted by file extensions, in alphabetical order."),
				nls.localize('searchSortOrder.modified', "Results are sorted by file last modified date, in descending order."),
				nls.localize('searchSortOrder.countDescending', "Results are sorted by count per file, in descending order."),
				nls.localize('searchSortOrder.countAscending', "Results are sorted by count per file, in ascending order.")
			],
			'description': nls.localize('search.sortOrder', "Controls sorting order of search results.")
		},
		'search.decorations.colors': {
			type: 'boolean',
			description: nls.localize('search.decorations.colors', "Controls whether search file decorations should use colors."),
			default: true
		},
		'search.decorations.badges': {
			type: 'boolean',
			description: nls.localize('search.decorations.badges', "Controls whether search file decorations should use badges."),
			default: true
		},
		'search.defaultViewMode': {
			'type': 'string',
			'enum': [ViewMode.Tree, ViewMode.List],
			'default': ViewMode.List,
			'enumDescriptions': [
				nls.localize('scm.defaultViewMode.tree', "Shows search results as a tree."),
				nls.localize('scm.defaultViewMode.list', "Shows search results as a list.")
			],
			'description': nls.localize('search.defaultViewMode', "Controls the default search result view mode.")
		},
		'search.experimental.closedNotebookRichContentResults': {
			type: 'boolean',
			description: nls.localize('search.experimental.closedNotebookResults', "Show notebook editor rich content results for closed notebooks. Please refresh your search results after changing this setting."),
			default: false
		},
		'search.experimental.quickAccess.preserveInput': {
			'type': 'boolean',
			'description': nls.localize('search.experimental.quickAccess.preserveInput', "Controls whether the last typed input to Quick Search should be restored when opening it the next time."),
			'default': false
		},
	}
});

CommandsRegistry.registerCommand('_executeWorkspaceSymbolProvider', async function (accessor, ...args): Promise<IWorkspaceSymbol[]> {
	const [query] = args;
	assertType(typeof query === 'string');
	const result = await getWorkspaceSymbols(query);
	return result.map(item => item.symbol);
});
