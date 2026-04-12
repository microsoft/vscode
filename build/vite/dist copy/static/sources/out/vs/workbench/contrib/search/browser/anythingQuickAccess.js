/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AnythingQuickAccessProvider_1;
import './media/anythingQuickAccess.css';
import { quickPickItemScorerAccessor, QuickPickItemScorerAccessor, QuickInputHideReason, IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { prepareQuery, compareItemsByFuzzyScore, scoreItemFuzzy } from '../../../../base/common/fuzzyScorer.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getOutOfWorkspaceEditorResources, extractRangeFromFilter } from '../common/search.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { untildify } from '../../../../base/common/labels.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { URI } from '../../../../base/common/uri.js';
import { toLocalResource, dirname, basenameOrAuthority } from '../../../../base/common/resources.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { DisposableStore, toDisposable, MutableDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorResourceAccessor, isEditorInput } from '../../../common/editor.js';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { top } from '../../../../base/common/arrays.js';
import { FileQueryCacheState } from '../common/cacheState.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { Schemas } from '../../../../base/common/network.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { SymbolsQuickAccessProvider } from './symbolsQuickAccess.js';
import { DefaultQuickAccessFilterValue, Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { PickerEditorState } from '../../../browser/quickaccess.js';
import { GotoSymbolQuickAccessProvider } from '../../codeEditor/browser/quickaccess/gotoSymbolQuickAccess.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ASK_QUICK_QUESTION_ACTION_ID } from '../../chat/browser/actions/chatQuickInputActions.js';
import { IChatWidgetService, IQuickChatService } from '../../chat/browser/chat.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
function isEditorSymbolQuickPickItem(pick) {
    const candidate = pick;
    return !!candidate?.range && !!candidate.resource;
}
let AnythingQuickAccessProvider = class AnythingQuickAccessProvider extends PickerQuickAccessProvider {
    static { AnythingQuickAccessProvider_1 = this; }
    static { this.PREFIX = ''; }
    static { this.NO_RESULTS_PICK = {
        label: localize('noAnythingResults', "No matching results")
    }; }
    static { this.MAX_RESULTS = 512; }
    static { this.TYPING_SEARCH_DELAY = 200; } // this delay accommodates for the user typing a word and then stops typing to start searching
    static { this.SYMBOL_PICKS_MERGE_DELAY = 200; } // allow some time to merge fast and slow picks to reduce flickering
    get defaultFilterValue() {
        if (this.configuration.preserveInput) {
            return DefaultQuickAccessFilterValue.LAST;
        }
        return undefined;
    }
    constructor(instantiationService, searchService, contextService, pathService, environmentService, fileService, labelService, modelService, languageService, workingCopyService, configurationService, editorService, historyService, filesConfigurationService, textModelService, uriIdentityService, quickInputService, keybindingService, contextKeyService, quickChatService, logService, customEditorLabelService, chatWidgetService) {
        super(AnythingQuickAccessProvider_1.PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: AnythingQuickAccessProvider_1.NO_RESULTS_PICK
        });
        this.instantiationService = instantiationService;
        this.searchService = searchService;
        this.contextService = contextService;
        this.pathService = pathService;
        this.environmentService = environmentService;
        this.fileService = fileService;
        this.labelService = labelService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.workingCopyService = workingCopyService;
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.historyService = historyService;
        this.filesConfigurationService = filesConfigurationService;
        this.textModelService = textModelService;
        this.uriIdentityService = uriIdentityService;
        this.quickInputService = quickInputService;
        this.keybindingService = keybindingService;
        this.contextKeyService = contextKeyService;
        this.quickChatService = quickChatService;
        this.logService = logService;
        this.customEditorLabelService = customEditorLabelService;
        this.chatWidgetService = chatWidgetService;
        //#region Editor History
        this.labelOnlyEditorHistoryPickAccessor = new QuickPickItemScorerAccessor({ skipDescription: true });
        //#endregion
        //#region File Search
        this.fileQueryDelayer = this._register(new ThrottledDelayer(AnythingQuickAccessProvider_1.TYPING_SEARCH_DELAY));
        //#endregion
        //#region Command Center (if enabled)
        this.lazyRegistry = new Lazy(() => Registry.as(Extensions.Quickaccess));
        this.pickState = this._register(new class extends Disposable {
            constructor(provider, instantiationService) {
                super();
                this.provider = provider;
                this.picker = undefined;
                this.scorerCache = Object.create(null);
                this.fileQueryCache = undefined;
                this.lastOriginalFilter = undefined;
                this.lastFilter = undefined;
                this.lastRange = undefined;
                this.lastGlobalPicks = undefined;
                this.isQuickNavigating = undefined;
                this.editorViewState = this._register(instantiationService.createInstance(PickerEditorState));
            }
            set(picker) {
                // Picker for this run
                this.picker = picker;
                Event.once(picker.onDispose)(() => {
                    if (picker === this.picker) {
                        this.picker = undefined; // clear the picker when disposed to not keep it in memory for too long
                    }
                });
                // Caches
                const isQuickNavigating = !!picker.quickNavigate;
                if (!isQuickNavigating) {
                    this.fileQueryCache = this.provider.createFileQueryCache();
                    this.scorerCache = Object.create(null);
                }
                // Other
                this.isQuickNavigating = isQuickNavigating;
                this.lastOriginalFilter = undefined;
                this.lastFilter = undefined;
                this.lastRange = undefined;
                this.lastGlobalPicks = undefined;
                this.editorViewState.reset();
            }
        }(this, instantiationService));
        this.fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);
        this.workspaceSymbolsQuickAccess = this._register(instantiationService.createInstance(SymbolsQuickAccessProvider));
        this.editorSymbolsQuickAccess = this.instantiationService.createInstance(GotoSymbolQuickAccessProvider);
    }
    get configuration() {
        const editorConfig = this.configurationService.getValue().workbench?.editor;
        const searchConfig = this.configurationService.getValue().search;
        const quickAccessConfig = this.configurationService.getValue().workbench.quickOpen;
        return {
            openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
            openSideBySideDirection: editorConfig?.openSideBySideDirection,
            includeSymbols: searchConfig?.quickOpen.includeSymbols,
            includeHistory: searchConfig?.quickOpen.includeHistory,
            historyFilterSortOrder: searchConfig?.quickOpen.history.filterSortOrder,
            preserveInput: quickAccessConfig.preserveInput
        };
    }
    provide(picker, token, runOptions) {
        const disposables = new DisposableStore();
        // Update the pick state for this run
        this.pickState.set(picker);
        // Add editor decorations for active editor symbol picks
        const editorDecorationsDisposable = disposables.add(new MutableDisposable());
        disposables.add(picker.onDidChangeActive(() => {
            // Clear old decorations
            editorDecorationsDisposable.value = undefined;
            // Add new decoration if editor symbol is active
            const [item] = picker.activeItems;
            if (isEditorSymbolQuickPickItem(item)) {
                editorDecorationsDisposable.value = this.decorateAndRevealSymbolRange(item);
            }
        }));
        // Restore view state upon cancellation if we changed it
        // but only when the picker was closed via explicit user
        // gesture and not e.g. when focus was lost because that
        // could mean the user clicked into the editor directly.
        disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
            if (reason === QuickInputHideReason.Gesture) {
                this.pickState.editorViewState.restore();
            }
        }));
        // Start picker
        disposables.add(super.provide(picker, token, runOptions));
        return disposables;
    }
    decorateAndRevealSymbolRange(pick) {
        const activeEditor = this.editorService.activeEditor;
        if (!this.uriIdentityService.extUri.isEqual(pick.resource, activeEditor?.resource)) {
            return Disposable.None; // active editor needs to be for resource
        }
        const activeEditorControl = this.editorService.activeTextEditorControl;
        if (!activeEditorControl) {
            return Disposable.None; // we need a text editor control to decorate and reveal
        }
        // we must remember our current view state to be able to restore
        this.pickState.editorViewState.set();
        // Reveal
        activeEditorControl.revealRangeInCenter(pick.range.selection, 0 /* ScrollType.Smooth */);
        // Decorate
        this.addDecorations(activeEditorControl, pick.range.decoration);
        return toDisposable(() => this.clearDecorations(activeEditorControl));
    }
    _getPicks(originalFilter, disposables, token, runOptions) {
        // Find a suitable range from the pattern looking for ":", "#" or ","
        // unless we have the `@` editor symbol character inside the filter
        const filterWithRange = extractRangeFromFilter(originalFilter, [GotoSymbolQuickAccessProvider.PREFIX]);
        // Update filter with normalized values
        let filter;
        if (filterWithRange) {
            filter = filterWithRange.filter;
        }
        else {
            filter = originalFilter;
        }
        // Remember as last range
        this.pickState.lastRange = filterWithRange?.range;
        // If the original filter value has changed but the normalized
        // one has not, we return early with a `null` result indicating
        // that the results should preserve because the range information
        // (:<line>:<column>) does not need to trigger any re-sorting.
        if (originalFilter !== this.pickState.lastOriginalFilter && filter === this.pickState.lastFilter) {
            return null;
        }
        // Remember as last filter
        const lastWasFiltering = !!this.pickState.lastOriginalFilter;
        this.pickState.lastOriginalFilter = originalFilter;
        this.pickState.lastFilter = filter;
        // Remember our pick state before returning new picks
        // unless we are inside an editor symbol filter or result.
        // We can use this state to return back to the global pick
        // when the user is narrowing back out of editor symbols.
        const picks = this.pickState.picker?.items;
        const activePick = this.pickState.picker?.activeItems[0];
        if (picks && activePick) {
            const activePickIsEditorSymbol = isEditorSymbolQuickPickItem(activePick);
            const activePickIsNoResultsInEditorSymbols = activePick === AnythingQuickAccessProvider_1.NO_RESULTS_PICK && filter.indexOf(GotoSymbolQuickAccessProvider.PREFIX) >= 0;
            if (!activePickIsEditorSymbol && !activePickIsNoResultsInEditorSymbols) {
                this.pickState.lastGlobalPicks = {
                    items: picks,
                    active: activePick
                };
            }
        }
        // `enableEditorSymbolSearch`: this will enable local editor symbol
        // search if the filter value includes `@` character. We only want
        // to enable this support though if the user was filtering in the
        // picker because this feature depends on an active item in the result
        // list to get symbols from. If we would simply trigger editor symbol
        // search without prior filtering, you could not paste a file name
        // including the `@` character to open it (e.g. /some/file@path)
        // refs: https://github.com/microsoft/vscode/issues/93845
        return this.doGetPicks(filter, {
            ...runOptions,
            enableEditorSymbolSearch: lastWasFiltering
        }, disposables, token);
    }
    doGetPicks(filter, options, disposables, token) {
        const query = prepareQuery(filter);
        // Return early if we have editor symbol picks. We support this by:
        // - having a previously active global pick (e.g. a file)
        // - the user typing `@` to start the local symbol query
        if (options.enableEditorSymbolSearch) {
            const editorSymbolPicks = this.getEditorSymbolPicks(query, disposables, token);
            if (editorSymbolPicks) {
                return editorSymbolPicks;
            }
        }
        // If we have a known last active editor symbol pick, we try to restore
        // the last global pick to support the case of narrowing out from a
        // editor symbol search back into the global search
        const activePick = this.pickState.picker?.activeItems[0];
        if (isEditorSymbolQuickPickItem(activePick) && this.pickState.lastGlobalPicks) {
            return this.pickState.lastGlobalPicks;
        }
        // Otherwise return normally with history and file/symbol results
        const historyEditorPicks = this.getEditorHistoryPicks(query);
        let picks = new Array();
        if (options.additionPicks) {
            for (const pick of options.additionPicks) {
                if (pick.type === 'separator') {
                    picks.push(pick);
                    continue;
                }
                if (!query.original) {
                    pick.highlights = undefined;
                    picks.push(pick);
                    continue;
                }
                const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(pick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
                if (!score) {
                    continue;
                }
                pick.highlights = {
                    label: labelMatch,
                    description: descriptionMatch
                };
                picks.push(pick);
            }
        }
        if (this.pickState.isQuickNavigating) {
            if (picks.length > 0) {
                picks.push({ type: 'separator', label: localize('recentlyOpenedSeparator', "recently opened") });
            }
            picks = historyEditorPicks;
        }
        else {
            if (options.includeHelp) {
                picks.push(...this.getHelpPicks(query, token, options));
            }
            if (historyEditorPicks.length !== 0) {
                picks.push({ type: 'separator', label: localize('recentlyOpenedSeparator', "recently opened") });
                picks.push(...historyEditorPicks);
            }
        }
        return {
            // Fast picks: help (if included) & editor history
            picks: options.filter ? picks.filter((p) => options.filter?.(p)) : picks,
            // Slow picks: files and symbols
            additionalPicks: (async () => {
                // Exclude any result that is already present in editor history.
                const additionalPicksExcludes = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
                for (const historyEditorPick of historyEditorPicks) {
                    if (historyEditorPick.resource) {
                        additionalPicksExcludes.set(historyEditorPick.resource, true);
                    }
                }
                let additionalPicks = await this.getAdditionalPicks(query, additionalPicksExcludes, this.configuration.includeSymbols, token);
                if (options.filter) {
                    additionalPicks = additionalPicks.filter((p) => options.filter?.(p));
                }
                if (token.isCancellationRequested) {
                    return [];
                }
                return additionalPicks.length > 0 ? [
                    { type: 'separator', label: this.configuration.includeSymbols ? localize('fileAndSymbolResultsSeparator', "file and symbol results") : localize('fileResultsSeparator', "file results") },
                    ...additionalPicks
                ] : [];
            })(),
            // allow some time to merge files and symbols to reduce flickering
            mergeDelay: AnythingQuickAccessProvider_1.SYMBOL_PICKS_MERGE_DELAY
        };
    }
    async getAdditionalPicks(query, excludes, includeSymbols, token) {
        // Resolve file and symbol picks (if enabled)
        const [filePicks, symbolPicks] = await Promise.all([
            this.getFilePicks(query, excludes, token),
            this.getWorkspaceSymbolPicks(query, includeSymbols, token)
        ]);
        if (token.isCancellationRequested) {
            return [];
        }
        // Perform sorting (top results by score)
        const sortedAnythingPicks = top([...filePicks, ...symbolPicks], (anyPickA, anyPickB) => compareItemsByFuzzyScore(anyPickA, anyPickB, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache), AnythingQuickAccessProvider_1.MAX_RESULTS);
        // Perform filtering
        const filteredAnythingPicks = [];
        for (const anythingPick of sortedAnythingPicks) {
            // Always preserve any existing highlights (e.g. from workspace symbols)
            if (anythingPick.highlights) {
                filteredAnythingPicks.push(anythingPick);
            }
            // Otherwise, do the scoring and matching here
            else {
                const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(anythingPick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
                if (!score) {
                    continue;
                }
                anythingPick.highlights = {
                    label: labelMatch,
                    description: descriptionMatch
                };
                filteredAnythingPicks.push(anythingPick);
            }
        }
        return filteredAnythingPicks;
    }
    getEditorHistoryPicks(query) {
        const configuration = this.configuration;
        // Just return all history entries if not searching
        if (!query.normalized) {
            return this.historyService.getHistory().map(editor => this.createAnythingPick(editor, configuration));
        }
        if (!this.configuration.includeHistory) {
            return []; // disabled when searching
        }
        // Perform filtering
        const editorHistoryScorerAccessor = query.containsPathSeparator ? quickPickItemScorerAccessor : this.labelOnlyEditorHistoryPickAccessor; // Only match on label of the editor unless the search includes path separators
        const editorHistoryPicks = [];
        for (const editor of this.historyService.getHistory()) {
            const resource = editor.resource;
            if (!resource) {
                continue;
            }
            const editorHistoryPick = this.createAnythingPick(editor, configuration);
            const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(editorHistoryPick, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache);
            if (!score) {
                continue; // exclude editors not matching query
            }
            editorHistoryPick.highlights = {
                label: labelMatch,
                description: descriptionMatch
            };
            editorHistoryPicks.push(editorHistoryPick);
        }
        // Return without sorting if settings tell to sort by recency
        if (this.configuration.historyFilterSortOrder === 'recency') {
            return editorHistoryPicks;
        }
        // Perform sorting
        return editorHistoryPicks.sort((editorA, editorB) => compareItemsByFuzzyScore(editorA, editorB, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache));
    }
    createFileQueryCache() {
        return new FileQueryCacheState(cacheKey => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })), query => this.searchService.fileSearch(query), cacheKey => this.searchService.clearCache(cacheKey), this.pickState.fileQueryCache).load();
    }
    async getFilePicks(query, excludes, token) {
        if (!query.normalized) {
            return [];
        }
        // Absolute path result
        const absolutePathResult = await this.getAbsolutePathFileResult(query, token);
        if (token.isCancellationRequested) {
            return [];
        }
        // Use absolute path result as only results if present
        let fileMatches;
        if (absolutePathResult) {
            if (excludes.has(absolutePathResult)) {
                return []; // excluded
            }
            // Create a single result pick and make sure to apply full
            // highlights to ensure the pick is displayed. Since a
            // ~ might have been used for searching, our fuzzy scorer
            // may otherwise not properly respect the pick as a result
            const absolutePathPick = this.createAnythingPick(absolutePathResult, this.configuration);
            absolutePathPick.highlights = {
                label: [{ start: 0, end: absolutePathPick.label.length }],
                description: absolutePathPick.description ? [{ start: 0, end: absolutePathPick.description.length }] : undefined
            };
            return [absolutePathPick];
        }
        // Otherwise run the file search (with a delayer if cache is not ready yet)
        if (this.pickState.fileQueryCache?.isLoaded) {
            fileMatches = await this.doFileSearch(query, token);
        }
        else {
            fileMatches = await this.fileQueryDelayer.trigger(async () => {
                if (token.isCancellationRequested) {
                    return [];
                }
                return this.doFileSearch(query, token);
            });
        }
        if (token.isCancellationRequested) {
            return [];
        }
        // Filter excludes & convert to picks
        const configuration = this.configuration;
        return fileMatches
            .filter(resource => !excludes.has(resource))
            .map(resource => this.createAnythingPick(resource, configuration));
    }
    async doFileSearch(query, token) {
        const [fileSearchResults, relativePathFileResults] = await Promise.all([
            // File search: this is a search over all files of the workspace using the provided pattern
            this.getFileSearchResults(query, token),
            // Relative path search: we also want to consider results that match files inside the workspace
            // by looking for relative paths that the user typed as query. This allows to return even excluded
            // results into the picker if found (e.g. helps for opening compilation results that are otherwise
            // excluded)
            this.getRelativePathFileResults(query, token)
        ]);
        if (token.isCancellationRequested) {
            return [];
        }
        // Return quickly if no relative results are present
        if (!relativePathFileResults) {
            return fileSearchResults;
        }
        // Otherwise, make sure to filter relative path results from
        // the search results to prevent duplicates
        const relativePathFileResultsMap = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        for (const relativePathFileResult of relativePathFileResults) {
            relativePathFileResultsMap.set(relativePathFileResult, true);
        }
        return [
            ...fileSearchResults.filter(result => !relativePathFileResultsMap.has(result)),
            ...relativePathFileResults
        ];
    }
    async getFileSearchResults(query, token) {
        // filePattern for search depends on the number of queries in input:
        // - with multiple: only take the first one and let the filter later drop non-matching results
        // - with single: just take the original in full
        //
        // This enables to e.g. search for "someFile someFolder" by only returning
        // search results for "someFile" and not both that would normally not match.
        //
        let filePattern = '';
        if (query.values && query.values.length > 1) {
            filePattern = query.values[0].original;
        }
        else {
            filePattern = query.original;
        }
        const fileSearchResults = await this.doGetFileSearchResults(filePattern, token);
        if (token.isCancellationRequested) {
            return [];
        }
        // If we detect that the search limit has been hit and we have a query
        // that was composed of multiple inputs where we only took the first part
        // we run another search with the full original query included to make
        // sure we are including all possible results that could match.
        if (fileSearchResults.limitHit && query.values && query.values.length > 1) {
            const additionalFileSearchResults = await this.doGetFileSearchResults(query.original, token);
            if (token.isCancellationRequested) {
                return [];
            }
            // Remember which result we already covered
            const existingFileSearchResultsMap = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
            for (const fileSearchResult of fileSearchResults.results) {
                existingFileSearchResultsMap.set(fileSearchResult.resource, true);
            }
            // Add all additional results to the original set for inclusion
            for (const additionalFileSearchResult of additionalFileSearchResults.results) {
                if (!existingFileSearchResultsMap.has(additionalFileSearchResult.resource)) {
                    fileSearchResults.results.push(additionalFileSearchResult);
                }
            }
        }
        return fileSearchResults.results.map(result => result.resource);
    }
    doGetFileSearchResults(filePattern, token) {
        const start = Date.now();
        return this.searchService.fileSearch(this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({
            filePattern,
            cacheKey: this.pickState.fileQueryCache?.cacheKey,
            maxResults: AnythingQuickAccessProvider_1.MAX_RESULTS
        })), token).finally(() => {
            this.logService.trace(`QuickAccess fileSearch ${Date.now() - start}ms`);
        });
    }
    getFileQueryOptions(input) {
        return {
            _reason: 'openFileHandler', // used for telemetry - do not change
            extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
            filePattern: input.filePattern || '',
            cacheKey: input.cacheKey,
            maxResults: input.maxResults || 0,
            sortByScore: true
        };
    }
    async getAbsolutePathFileResult(query, token) {
        if (!query.containsPathSeparator) {
            return;
        }
        const userHome = await this.pathService.userHome();
        const detildifiedQuery = untildify(query.original, userHome.scheme === Schemas.file ? userHome.fsPath : userHome.path);
        if (token.isCancellationRequested) {
            return;
        }
        const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(detildifiedQuery);
        if (token.isCancellationRequested) {
            return;
        }
        if (isAbsolutePathQuery) {
            const resource = toLocalResource(await this.pathService.fileURI(detildifiedQuery), this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
            if (token.isCancellationRequested) {
                return;
            }
            try {
                const stat = await this.fileService.stat(resource);
                if (stat.isFile) {
                    return await this.matchFilenameCasing(resource);
                }
            }
            catch (error) {
                // ignore if file does not exist
            }
        }
        return;
    }
    async getRelativePathFileResults(query, token) {
        if (!query.containsPathSeparator) {
            return;
        }
        // Convert relative paths to absolute paths over all folders of the workspace
        // and return them as results if the absolute paths exist
        const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(query.original);
        if (!isAbsolutePathQuery) {
            const resources = [];
            for (const folder of this.contextService.getWorkspace().folders) {
                if (token.isCancellationRequested) {
                    break;
                }
                const resource = toLocalResource(folder.toResource(query.original), this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
                try {
                    const stat = await this.fileService.stat(resource);
                    if (stat.isFile) {
                        resources.push(await this.matchFilenameCasing(resource));
                    }
                }
                catch (error) {
                    // ignore if file does not exist
                }
            }
            return resources;
        }
        return;
    }
    /**
     * Attempts to match the filename casing to file system by checking the parent folder's children.
     */
    async matchFilenameCasing(resource) {
        const parent = dirname(resource);
        const stat = await this.fileService.resolve(parent, { resolveTo: [resource] });
        if (stat?.children) {
            const match = stat.children.find(child => this.uriIdentityService.extUri.isEqual(child.resource, resource));
            if (match) {
                return URI.joinPath(parent, match.name);
            }
        }
        return resource;
    }
    getHelpPicks(query, token, runOptions) {
        if (query.normalized) {
            return []; // If there's a filter, we don't show the help
        }
        const providers = this.lazyRegistry.value.getQuickAccessProviders(this.contextKeyService)
            .filter(p => p.helpEntries.some(h => h.commandCenterOrder !== undefined))
            .flatMap(provider => provider.helpEntries
            .filter(h => h.commandCenterOrder !== undefined)
            .map(helpEntry => {
            const providerSpecificOptions = {
                ...runOptions,
                includeHelp: provider.prefix === AnythingQuickAccessProvider_1.PREFIX ? false : runOptions?.includeHelp
            };
            const label = helpEntry.commandCenterLabel ?? helpEntry.description;
            return {
                label,
                description: helpEntry.prefix ?? provider.prefix,
                commandCenterOrder: helpEntry.commandCenterOrder,
                keybinding: helpEntry.commandId ? this.keybindingService.lookupKeybinding(helpEntry.commandId) : undefined,
                ariaLabel: localize('helpPickAriaLabel', "{0}, {1}", label, helpEntry.description),
                accept: () => {
                    this.quickInputService.quickAccess.show(provider.prefix, {
                        preserveValue: true,
                        providerOptions: providerSpecificOptions
                    });
                }
            };
        }));
        // TODO: There has to be a better place for this, but it's the first time we are adding a non-quick access provider
        // to the command center, so for now, let's do this.
        if (this.quickChatService.enabled) {
            providers.push({
                label: localize('chat', "Open Quick Chat"),
                commandCenterOrder: 30,
                keybinding: this.keybindingService.lookupKeybinding(ASK_QUICK_QUESTION_ACTION_ID),
                accept: () => this.quickChatService.toggle()
            });
        }
        return providers.sort((a, b) => a.commandCenterOrder - b.commandCenterOrder);
    }
    async getWorkspaceSymbolPicks(query, includeSymbols, token) {
        if (!query.normalized || // we need a value for search for
            !includeSymbols || // we need to enable symbols in search
            this.pickState.lastRange // a range is an indicator for just searching for files
        ) {
            return [];
        }
        // Delegate to the existing symbols quick access
        // but skip local results and also do not score
        return this.workspaceSymbolsQuickAccess.getSymbolPicks(query.original, {
            skipLocal: true,
            skipSorting: true,
            delay: AnythingQuickAccessProvider_1.TYPING_SEARCH_DELAY
        }, token);
    }
    getEditorSymbolPicks(query, disposables, token) {
        const filterSegments = query.original.split(GotoSymbolQuickAccessProvider.PREFIX);
        const filter = filterSegments.length > 1 ? filterSegments[filterSegments.length - 1].trim() : undefined;
        if (typeof filter !== 'string') {
            return null; // we need to be searched for editor symbols via `@`
        }
        const activeGlobalPick = this.pickState.lastGlobalPicks?.active;
        if (!activeGlobalPick) {
            return null; // we need an active global pick to find symbols for
        }
        const activeGlobalResource = activeGlobalPick.resource;
        if (!activeGlobalResource || (!this.fileService.hasProvider(activeGlobalResource) && activeGlobalResource.scheme !== Schemas.untitled)) {
            return null; // we need a resource that we can resolve
        }
        if (activeGlobalPick.label.includes(GotoSymbolQuickAccessProvider.PREFIX) || activeGlobalPick.description?.includes(GotoSymbolQuickAccessProvider.PREFIX)) {
            if (filterSegments.length < 3) {
                return null; // require at least 2 `@` if our active pick contains `@` in label or description
            }
        }
        return this.doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token);
    }
    async doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token) {
        // Bring the editor to front to review symbols to go to
        try {
            // we must remember our current view state to be able to restore
            this.pickState.editorViewState.set();
            // open it
            await this.pickState.editorViewState.openTransientEditor({
                resource: activeGlobalResource,
                options: { preserveFocus: true, revealIfOpened: true, ignoreError: true }
            });
        }
        catch (error) {
            return []; // return if resource cannot be opened
        }
        if (token.isCancellationRequested) {
            return [];
        }
        // Obtain model from resource
        let model = this.modelService.getModel(activeGlobalResource);
        if (!model) {
            try {
                const modelReference = disposables.add(await this.textModelService.createModelReference(activeGlobalResource));
                if (token.isCancellationRequested) {
                    return [];
                }
                model = modelReference.object.textEditorModel;
            }
            catch (error) {
                return []; // return if model cannot be resolved
            }
        }
        // Ask provider for editor symbols
        const editorSymbolPicks = (await this.editorSymbolsQuickAccess.getSymbolPicks(model, filter, { extraContainerLabel: stripIcons(activeGlobalPick.label) }, disposables, token));
        if (token.isCancellationRequested) {
            return [];
        }
        return editorSymbolPicks.map(editorSymbolPick => {
            // Preserve separators
            if (editorSymbolPick.type === 'separator') {
                return editorSymbolPick;
            }
            // Convert editor symbols to anything pick
            return {
                ...editorSymbolPick,
                resource: activeGlobalResource,
                description: editorSymbolPick.description,
                trigger: (buttonIndex, keyMods) => {
                    this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, forceOpenSideBySide: true });
                    return TriggerAction.CLOSE_PICKER;
                },
                accept: (keyMods, event) => this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, preserveFocus: event.inBackground, forcePinned: event.inBackground })
            };
        });
    }
    addDecorations(editor, range) {
        this.editorSymbolsQuickAccess.addDecorations(editor, range);
    }
    clearDecorations(editor) {
        this.editorSymbolsQuickAccess.clearDecorations(editor);
    }
    //#endregion
    //#region Helpers
    createAnythingPick(resourceOrEditor, configuration) {
        const isEditorHistoryEntry = !URI.isUri(resourceOrEditor);
        let resource;
        let label;
        let description = undefined;
        let isDirty = undefined;
        let extraClasses;
        let icon = undefined;
        if (isEditorInput(resourceOrEditor)) {
            resource = EditorResourceAccessor.getOriginalUri(resourceOrEditor);
            label = resourceOrEditor.getName();
            description = resourceOrEditor.getDescription();
            isDirty = resourceOrEditor.isDirty() && !resourceOrEditor.isSaving();
            extraClasses = resourceOrEditor.getLabelExtraClasses();
            icon = resourceOrEditor.getIcon();
        }
        else {
            resource = URI.isUri(resourceOrEditor) ? resourceOrEditor : resourceOrEditor.resource;
            const customLabel = this.customEditorLabelService.getName(resource);
            label = customLabel || basenameOrAuthority(resource);
            description = this.labelService.getUriLabel(!!customLabel ? resource : dirname(resource), { relative: true });
            isDirty = this.workingCopyService.isDirty(resource) && !this.filesConfigurationService.hasShortAutoSaveDelay(resource);
            extraClasses = [];
        }
        const labelAndDescription = description ? `${label} ${description}` : label;
        const iconClassesValue = new Lazy(() => getIconClasses(this.modelService, this.languageService, resource, undefined, icon).concat(extraClasses));
        const buttonsValue = new Lazy(() => {
            const openSideBySideDirection = configuration.openSideBySideDirection;
            const buttons = [];
            // Open to side / below
            buttons.push({
                iconClass: openSideBySideDirection === 'right' ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
                tooltip: openSideBySideDirection === 'right' ?
                    localize({ key: 'openToSide', comment: ['Open this file in a split editor on the left/right side'] }, "Open to the Side") :
                    localize({ key: 'openToBottom', comment: ['Open this file in a split editor on the bottom'] }, "Open to the Bottom")
            });
            // Remove from History
            if (isEditorHistoryEntry) {
                buttons.push({
                    iconClass: isDirty ? ('dirty-anything ' + ThemeIcon.asClassName(Codicon.circleFilled)) : ThemeIcon.asClassName(Codicon.close),
                    tooltip: localize('closeEditor', "Remove from Recently Opened"),
                    alwaysVisible: isDirty
                });
            }
            return buttons;
        });
        return {
            resource,
            label,
            ariaLabel: isDirty ? localize('filePickAriaLabelDirty', "{0} unsaved changes", labelAndDescription) : labelAndDescription,
            description,
            iconPath: URI.isUri(icon) ? { dark: icon } : undefined,
            get iconClasses() { return iconClassesValue.value; },
            get buttons() { return buttonsValue.value; },
            trigger: (buttonIndex, keyMods) => {
                switch (buttonIndex) {
                    // Open to side / below
                    case 0:
                        this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, forceOpenSideBySide: true });
                        return TriggerAction.CLOSE_PICKER;
                    // Remove from History
                    case 1:
                        if (!URI.isUri(resourceOrEditor)) {
                            this.historyService.removeFromHistory(resourceOrEditor);
                            return TriggerAction.REMOVE_ITEM;
                        }
                }
                return TriggerAction.NO_ACTION;
            },
            accept: (keyMods, event) => this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
            attach: (keyMods, event) => {
                // Only support adding context to chat when shift is pressed
                if (keyMods.shift) {
                    const widget = this.chatWidgetService.lastFocusedWidget;
                    if (widget && resource) {
                        widget.attachmentModel.addContext(widget.attachmentModel.asFileVariableEntry(resource));
                    }
                    return;
                }
                // Fallback to accept behavior.
                this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground });
            }
        };
    }
    async openAnything(resourceOrEditor, options) {
        // Craft some editor options based on quick access usage
        const editorOptions = {
            preserveFocus: options.preserveFocus,
            pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
            selection: options.range ? Range.collapseToStart(options.range) : undefined
        };
        const targetGroup = options.keyMods?.alt || (this.configuration.openEditorPinned && options.keyMods?.ctrlCmd) || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;
        // Restore any view state if the target is the side group
        if (targetGroup === SIDE_GROUP) {
            await this.pickState.editorViewState.restore();
        }
        // Open editor (typed)
        if (isEditorInput(resourceOrEditor)) {
            await this.editorService.openEditor(resourceOrEditor, editorOptions, targetGroup);
        }
        // Open editor (untyped)
        else {
            let resourceEditorInput;
            if (URI.isUri(resourceOrEditor)) {
                resourceEditorInput = {
                    resource: resourceOrEditor,
                    options: editorOptions
                };
            }
            else {
                resourceEditorInput = {
                    ...resourceOrEditor,
                    options: {
                        ...resourceOrEditor.options,
                        ...editorOptions
                    }
                };
            }
            await this.editorService.openEditor(resourceEditorInput, targetGroup);
        }
    }
};
AnythingQuickAccessProvider = AnythingQuickAccessProvider_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, ISearchService),
    __param(2, IWorkspaceContextService),
    __param(3, IPathService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IFileService),
    __param(6, ILabelService),
    __param(7, IModelService),
    __param(8, ILanguageService),
    __param(9, IWorkingCopyService),
    __param(10, IConfigurationService),
    __param(11, IEditorService),
    __param(12, IHistoryService),
    __param(13, IFilesConfigurationService),
    __param(14, ITextModelService),
    __param(15, IUriIdentityService),
    __param(16, IQuickInputService),
    __param(17, IKeybindingService),
    __param(18, IContextKeyService),
    __param(19, IQuickChatService),
    __param(20, ILogService),
    __param(21, ICustomEditorLabelService),
    __param(22, IChatWidgetService)
], AnythingQuickAccessProvider);
export { AnythingQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW55dGhpbmdRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL2FueXRoaW5nUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8saUNBQWlDLENBQUM7QUFDekMsT0FBTyxFQUErQiwyQkFBMkIsRUFBRSwyQkFBMkIsRUFBMEMsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQXVCLE1BQU0sc0RBQXNELENBQUM7QUFDcFEsT0FBTyxFQUEwQix5QkFBeUIsRUFBRSxhQUFhLEVBQTRDLE1BQU0sOERBQThELENBQUM7QUFDMUwsT0FBTyxFQUFFLFlBQVksRUFBa0Isd0JBQXdCLEVBQUUsY0FBYyxFQUFvQixNQUFNLHdDQUF3QyxDQUFDO0FBQ2xKLE9BQU8sRUFBNEIsWUFBWSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLHNCQUFzQixFQUFpQyxNQUFNLHFCQUFxQixDQUFDO0FBQzlILE9BQU8sRUFBRSxjQUFjLEVBQW1CLE1BQU0sMkNBQTJDLENBQUM7QUFDNUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRyxPQUFPLEVBQUUsNEJB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