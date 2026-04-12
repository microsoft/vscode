/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as platform from '../../../../base/common/platform.js';
import { AbstractGotoLineQuickAccessProvider } from '../../../../editor/contrib/quickAccess/browser/gotoLineQuickAccess.js';
import * as nls from '../../../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { defaultQuickAccessContextKeyValue } from '../../../browser/quickaccess.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { GotoSymbolQuickAccessProvider } from '../../codeEditor/browser/quickaccess/gotoSymbolQuickAccess.js';
import { AnythingQuickAccessProvider } from './anythingQuickAccess.js';
import { registerContributions as replaceContributions } from './replaceContributions.js';
import { registerContributions as notebookSearchContributions } from './notebookSearch/notebookSearchContributions.js';
import { searchViewIcon } from './searchIcons.js';
import { SearchView } from './searchView.js';
import { registerContributions as searchWidgetContributions } from './searchWidget.js';
import { SymbolsQuickAccessProvider } from './symbolsQuickAccess.js';
import { ISearchHistoryService, SearchHistoryService } from '../common/searchHistoryService.js';
import { SearchViewModelWorkbenchService } from './searchTreeModel/searchModel.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { SEARCH_EXCLUDE_CONFIG, VIEWLET_ID, VIEW_ID, DEFAULT_MAX_SEARCH_RESULTS } from '../../../services/search/common/search.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { assertType } from '../../../../base/common/types.js';
import { getWorkspaceSymbols } from '../common/search.js';
import { SearchChatContextContribution } from './searchChatContext.js';
import './searchActionsCopy.js';
import './searchActionsFind.js';
import './searchActionsNav.js';
import './searchActionsRemoveReplace.js';
import './searchActionsSymbol.js';
import './searchActionsTopBar.js';
import './searchActionsTextQuickAccess.js';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX, TextSearchQuickAccess } from './quickTextSearch/textSearchQuickAccess.js';
import { Extensions } from '../../../common/configuration.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SearchAccessibilityHelp } from './searchAccessibilityHelp.js';
registerSingleton(ISearchViewModelWorkbenchService, SearchViewModelWorkbenchService, 1 /* InstantiationType.Delayed */);
registerSingleton(ISearchHistoryService, SearchHistoryService, 1 /* InstantiationType.Delayed */);
replaceContributions();
notebookSearchContributions();
searchWidgetContributions();
registerWorkbenchContribution2(SearchChatContextContribution.ID, SearchChatContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
AccessibleViewRegistry.register(new SearchAccessibilityHelp());
const SEARCH_MODE_CONFIG = 'search.mode';
const viewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: VIEWLET_ID,
    title: nls.localize2('search', "Search"),
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
    hideIfEmpty: true,
    icon: searchViewIcon,
    order: 1,
}, 0 /* ViewContainerLocation.Sidebar */, { doNotRegisterOpenCommand: true });
const viewDescriptor = {
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
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 36 /* KeyCode.KeyF */,
            // Yes, this is weird. See #116188, #115556, #115511, and now #124146, for examples of what can go wrong here.
            when: ContextKeyExpr.regex('neverMatch', /doesNotMatch/)
        },
        order: 1
    }
};
// Register search default location to sidebar
Registry.as(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
// Register Quick Access Handler
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
    ctor: AnythingQuickAccessProvider,
    prefix: AnythingQuickAccessProvider.PREFIX,
    placeholder: nls.localize('anythingQuickAccessPlaceholder', "Search files by name (append {0} to go to line or {1} to go to symbol)", AbstractGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX, GotoSymbolQuickAccessProvider.PREFIX),
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
    helpEntries: [{ description: nls.localize('symbolsQuickAccess', "Go to Symbol in Workspace"), commandId: "workbench.action.showAllSymbols" /* Constants.SearchCommandIds.ShowAllSymbolsActionId */ }]
});
quickAccessRegistry.registerQuickAccessProvider({
    ctor: TextSearchQuickAccess,
    prefix: TEXT_SEARCH_QUICK_ACCESS_PREFIX,
    contextKey: 'inTextSearchPicker',
    placeholder: nls.localize('textSearchPickerPlaceholder', "Search for text in your workspace files."),
    helpEntries: [
        {
            description: nls.localize('textSearchPickerHelp', "Search for Text"),
            commandId: "workbench.action.quickTextSearch" /* Constants.SearchCommandIds.QuickTextSearchActionId */,
            commandCenterOrder: 25,
        }
    ]
});
// Configuration
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
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
            scope: 5 /* ConfigurationScope.RESOURCE */
        },
        [SEARCH_MODE_CONFIG]: {
            type: 'string',
            enum: ['view', 'reuseEditor', 'newEditor'],
            default: 'view',
            markdownDescription: nls.localize('search.mode', "Controls where new `Search: Find in Files` and `Find in Folder` operations occur: either in the Search view, or in a search editor."),
            enumDescriptions: [
                nls.localize('search.mode.view', "Search in the Search view, either in the panel or side bars."),
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
            scope: 5 /* ConfigurationScope.RESOURCE */
        },
        'search.useGlobalIgnoreFiles': {
            type: 'boolean',
            markdownDescription: nls.localize('useGlobalIgnoreFiles', "Controls whether to use your global gitignore file (for example, from `$HOME/.config/git/ignore`) when searching for files. Requires {0} to be enabled.", '`#search.useIgnoreFiles#`'),
            default: false,
            scope: 5 /* ConfigurationScope.RESOURCE */
        },
        'search.useParentIgnoreFiles': {
            type: 'boolean',
            markdownDescription: nls.localize('useParentIgnoreFiles', "Controls whether to use `.gitignore` and `.ignore` files in parent directories when searching for files. Requires {0} to be enabled.", '`#search.useIgnoreFiles#`'),
            default: false,
            scope: 5 /* ConfigurationScope.RESOURCE */
        },
        'search.quickOpen.includeSymbols': {
            type: 'boolean',
            description: nls.localize('search.quickOpen.includeSymbols', "Whether to include results from a global symbol search in the file results for Quick Open."),
            default: false
        },
        'search.ripgrep.maxThreads': {
            type: 'number',
            description: nls.localize('search.ripgrep.maxThreads', "Number of threads to use for searching. When set to 0, the engine automatically determines this value."),
            default: 0
        },
        'search.quickOpen.includeHistory': {
            type: 'boolean',
            description: nls.localize('search.quickOpen.includeHistory', "Whether to include results from recently opened files in the file results for Quick Open."),
            default: true
        },
        'search.quickOpen.history.filterSortOrder': {
            type: 'string',
            enum: ['default', 'recency'],
            default: 'default',
            enumDescriptions: [
                nls.localize('filterSortOrder.default', 'History entries are sorted by relevance based on the filter value used. More relevant entries appear first.'),
                nls.localize('filterSortOrder.recency', 'History entries are sorted by recency. More recently opened entries appear first.')
            ],
            description: nls.localize('filterSortOrder', "Controls sorting order of editor history in quick open when filtering.")
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
            description: nls.localize('search.globalFindClipboard', "Controls whether the Search view should read or modify the shared find clipboard on macOS."),
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
            default: DEFAULT_MAX_SEARCH_RESULTS,
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
                nls.localize('search.actionsPositionAuto', "Position the actionbar to the right when the Search view is narrow, and immediately after the content when the Search view is wide."),
                nls.localize('search.actionsPositionRight', "Always position the actionbar to the right."),
            ],
            default: 'right',
            description: nls.localize('search.actionsPosition', "Controls the positioning of the actionbar on rows in the Search view.")
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
            markdownDescription: nls.localize('search.seedOnFocus', "Update the search query to the editor's selected text when focusing the Search view. This happens either on click or when triggering the `workbench.views.search.focus` command.")
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
        'search.searchEditor.focusResultsOnSearch': {
            type: 'boolean',
            default: false,
            markdownDescription: nls.localize('search.searchEditor.focusResultsOnSearch', "When a search is triggered, focus the Search Editor results instead of the Search Editor input.")
        },
        'search.sortOrder': {
            type: 'string',
            enum: ["default" /* SearchSortOrder.Default */, "fileNames" /* SearchSortOrder.FileNames */, "type" /* SearchSortOrder.Type */, "modified" /* SearchSortOrder.Modified */, "countDescending" /* SearchSortOrder.CountDescending */, "countAscending" /* SearchSortOrder.CountAscending */],
            default: "default" /* SearchSortOrder.Default */,
            enumDescriptions: [
                nls.localize('searchSortOrder.default', "Results are sorted by folder and file names, in alphabetical order."),
                nls.localize('searchSortOrder.filesOnly', "Results are sorted by file names ignoring folder order, in alphabetical order."),
                nls.localize('searchSortOrder.type', "Results are sorted by file extensions, in alphabetical order."),
                nls.localize('searchSortOrder.modified', "Results are sorted by file last modified date, in descending order."),
                nls.localize('searchSortOrder.countDescending', "Results are sorted by count per file, in descending order."),
                nls.localize('searchSortOrder.countAscending', "Results are sorted by count per file, in ascending order.")
            ],
            description: nls.localize('search.sortOrder', "Controls sorting order of search results.")
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
            type: 'string',
            enum: ["tree" /* ViewMode.Tree */, "list" /* ViewMode.List */],
            default: "list" /* ViewMode.List */,
            enumDescriptions: [
                nls.localize('scm.defaultViewMode.tree', "Shows search results as a tree."),
                nls.localize('scm.defaultViewMode.list', "Shows search results as a list.")
            ],
            description: nls.localize('search.defaultViewMode', "Controls the default search result view mode.")
        },
        'search.quickAccess.preserveInput': {
            type: 'boolean',
            description: nls.localize('search.quickAccess.preserveInput', "Controls whether the last typed input to Quick Search should be restored when opening it the next time."),
            default: false
        },
        'search.experimental.closedNotebookRichContentResults': {
            type: 'boolean',
            description: nls.localize('search.experimental.closedNotebookResults', "Show notebook editor rich content results for closed notebooks. Please refresh your search results after changing this setting."),
            default: false
        },
        'search.searchView.semanticSearchBehavior': {
            type: 'string',
            description: nls.localize('search.searchView.semanticSearchBehavior', "Controls the behavior of the semantic search results displayed in the Search view."),
            enum: ["manual" /* SemanticSearchBehavior.Manual */, "runOnEmpty" /* SemanticSearchBehavior.RunOnEmpty */, "auto" /* SemanticSearchBehavior.Auto */],
            default: "manual" /* SemanticSearchBehavior.Manual */,
            enumDescriptions: [
                nls.localize('search.searchView.semanticSearchBehavior.manual', "Only request semantic search results manually."),
                nls.localize('search.searchView.semanticSearchBehavior.runOnEmpty', "Request semantic results automatically only when text search results are empty."),
                nls.localize('search.searchView.semanticSearchBehavior.auto', "Request semantic results automatically with every search.")
            ],
            tags: ['preview'],
        },
        'search.searchView.keywordSuggestions': {
            type: 'boolean',
            description: nls.localize('search.searchView.keywordSuggestions', "Enable keyword suggestions in the Search view."),
            default: false,
            tags: ['preview'],
        },
    }
});
CommandsRegistry.registerCommand('_executeWorkspaceSymbolProvider', async function (accessor, ...args) {
    const [query] = args;
    assertType(typeof query === 'string');
    const result = await getWorkspaceSymbols(query);
    return result.map(item => item.symbol);
});
// todo: @andreamah get rid of this after a few iterations
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: 'search.experimental.quickAccess.preserveInput',
        migrateFn: (value, _accessor) => ([
            ['search.quickAccess.preserveInput', { value }],
            ['search.experimental.quickAccess.preserveInput', { value: undefined }]
        ])
    }]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUM1SCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBc0IsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxVQUFVLElBQUkscUJBQXFCLEVBQXdCLE1BQU0sdURBQXVELENBQUM7QUFDbEksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxVQUFVLElBQUksY0FBYyxFQUFtRixNQUFNLDBCQUEwQixDQUFDO0FBQ3pKLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxxQkFBcUIsSUFBSSxvQkFBb0IsRUFBRSxNQUFNLDJC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