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
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import * as errors from '../../../../../base/common/errors.js';
import { Emitter, Event, PauseableEmitter } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';
import { ReplacePattern } from '../../../../services/search/common/replace.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { mergeSearchResultEvents, SearchModelLocation, SEARCH_MODEL_PREFIX } from './searchTreeCommon.js';
import { SearchResultImpl } from './searchResult.js';
let SearchModelImpl = class SearchModelImpl extends Disposable {
    constructor(searchService, telemetryService, configurationService, instantiationService, logService, notebookSearchService) {
        super();
        this.searchService = searchService;
        this.telemetryService = telemetryService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.notebookSearchService = notebookSearchService;
        this._searchQuery = null;
        this._replaceActive = false;
        this._replaceString = null;
        this._replacePattern = null;
        this._preserveCase = false;
        this._startStreamDelay = Promise.resolve();
        this._resultQueue = [];
        this._aiResultQueue = [];
        this._onReplaceTermChanged = this._register(new Emitter());
        this.onReplaceTermChanged = this._onReplaceTermChanged.event;
        this._onSearchResultChanged = this._register(new PauseableEmitter({
            merge: mergeSearchResultEvents
        }));
        this.onSearchResultChanged = this._onSearchResultChanged.event;
        this.currentCancelTokenSource = null;
        this.currentAICancelTokenSource = null;
        this.searchCancelledForNewSearch = false;
        this.aiSearchCancelledForNewSearch = false;
        this.location = SearchModelLocation.PANEL;
        this._searchResult = this.instantiationService.createInstance(SearchResultImpl, this);
        this._register(this._searchResult.onChange((e) => this._onSearchResultChanged.fire(e)));
        this._aiTextResultProviderName = new Lazy(async () => this.searchService.getAIName());
        this._id = SEARCH_MODEL_PREFIX + Date.now().toString();
    }
    id() {
        return this._id;
    }
    async getAITextResultProviderName() {
        const result = await this._aiTextResultProviderName.value;
        if (!result) {
            throw Error('Fetching AI name when no provider present.');
        }
        return result;
    }
    isReplaceActive() {
        return this._replaceActive;
    }
    set replaceActive(replaceActive) {
        this._replaceActive = replaceActive;
    }
    get replacePattern() {
        return this._replacePattern;
    }
    get replaceString() {
        return this._replaceString || '';
    }
    set preserveCase(value) {
        this._preserveCase = value;
    }
    get preserveCase() {
        return this._preserveCase;
    }
    set replaceString(replaceString) {
        this._replaceString = replaceString;
        if (this._searchQuery) {
            this._replacePattern = new ReplacePattern(replaceString, this._searchQuery.contentPattern);
        }
        this._onReplaceTermChanged.fire();
    }
    get searchResult() {
        return this._searchResult;
    }
    aiSearch(onResult) {
        if (this.hasAIResults) {
            // already has matches or pending matches
            throw Error('AI results already exist');
        }
        if (!this._searchQuery) {
            throw Error('No search query');
        }
        const searchInstanceID = Date.now().toString();
        const tokenSource = new CancellationTokenSource();
        this.currentAICancelTokenSource = tokenSource;
        const start = Date.now();
        const asyncAIResults = this.searchService.aiTextSearch({ ...this._searchQuery, contentPattern: this._searchQuery.contentPattern.pattern, type: 3 /* QueryType.aiText */ }, tokenSource.token, async (p) => {
            onResult(p);
            this.onSearchProgress(p, searchInstanceID, false, true);
        }).finally(() => {
            tokenSource.dispose(true);
        }).then(value => {
            if (value.results.length === 0) {
                // alert of no results since onProgress won't be called
                onResult(undefined);
            }
            this.onSearchCompleted(value, Date.now() - start, searchInstanceID, true);
            return value;
        }, e => {
            this.onSearchError(e, Date.now() - start, true);
            throw e;
        });
        return asyncAIResults;
    }
    doSearch(query, progressEmitter, searchQuery, searchInstanceID, onProgress, callerToken) {
        const asyncGenerateOnProgress = async (p) => {
            progressEmitter.fire();
            this.onSearchProgress(p, searchInstanceID, false, false);
            onProgress?.(p);
        };
        const syncGenerateOnProgress = (p) => {
            progressEmitter.fire();
            this.onSearchProgress(p, searchInstanceID, true);
            onProgress?.(p);
        };
        const tokenSource = this.currentCancelTokenSource = new CancellationTokenSource(callerToken);
        const notebookResult = this.notebookSearchService.notebookSearch(query, tokenSource.token, searchInstanceID, asyncGenerateOnProgress);
        const textResult = this.searchService.textSearchSplitSyncAsync(searchQuery, tokenSource.token, asyncGenerateOnProgress, notebookResult.openFilesToScan, notebookResult.allScannedFiles);
        const syncResults = textResult.syncResults.results;
        syncResults.forEach(p => { if (p) {
            syncGenerateOnProgress(p);
        } });
        const getAsyncResults = async () => {
            const searchStart = Date.now();
            // resolve async parts of search
            const allClosedEditorResults = await textResult.asyncResults;
            const resolvedNotebookResults = await notebookResult.completeData;
            const searchLength = Date.now() - searchStart;
            const resolvedResult = {
                results: [...allClosedEditorResults.results, ...resolvedNotebookResults.results],
                messages: [...allClosedEditorResults.messages, ...resolvedNotebookResults.messages],
                limitHit: allClosedEditorResults.limitHit || resolvedNotebookResults.limitHit,
                exit: allClosedEditorResults.exit,
                stats: allClosedEditorResults.stats,
            };
            this.logService.trace(`whole search time | ${searchLength}ms`);
            return resolvedResult;
        };
        return {
            asyncResults: getAsyncResults()
                .finally(() => tokenSource.dispose(true)),
            syncResults
        };
    }
    get hasAIResults() {
        return !!(this.searchResult.getCachedSearchComplete(true)) || (!!this.currentAICancelTokenSource && !this.currentAICancelTokenSource.token.isCancellationRequested);
    }
    get hasPlainResults() {
        return !!(this.searchResult.getCachedSearchComplete(false)) || (!!this.currentCancelTokenSource && !this.currentCancelTokenSource.token.isCancellationRequested);
    }
    search(query, onProgress, callerToken) {
        this.cancelSearch(true);
        this._searchQuery = query;
        if (!this.searchConfig.searchOnType) {
            this.searchResult.clear();
        }
        const searchInstanceID = Date.now().toString();
        this._searchResult.query = this._searchQuery;
        const progressEmitter = this._register(new Emitter());
        this._replacePattern = new ReplacePattern(this.replaceString, this._searchQuery.contentPattern);
        // In search on type case, delay the streaming of results just a bit, so that we don't flash the only "local results" fast path
        this._startStreamDelay = new Promise(resolve => setTimeout(resolve, this.searchConfig.searchOnType ? 150 : 0));
        const req = this.doSearch(query, progressEmitter, this._searchQuery, searchInstanceID, onProgress, callerToken);
        const asyncResults = req.asyncResults;
        const syncResults = req.syncResults;
        if (onProgress) {
            syncResults.forEach(p => {
                if (p) {
                    onProgress(p);
                }
            });
        }
        const start = Date.now();
        let event;
        const progressEmitterPromise = new Promise(resolve => {
            event = Event.once(progressEmitter.event)(resolve);
            return event;
        });
        Promise.race([asyncResults, progressEmitterPromise]).finally(() => {
            /* __GDPR__
                "searchResultsFirstRender" : {
                    "owner": "roblourens",
                    "duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
                }
            */
            event?.dispose();
            this.telemetryService.publicLog('searchResultsFirstRender', { duration: Date.now() - start });
        });
        try {
            return {
                asyncResults: asyncResults.then(value => {
                    this.onSearchCompleted(value, Date.now() - start, searchInstanceID, false);
                    return value;
                }, e => {
                    this.onSearchError(e, Date.now() - start, false);
                    throw e;
                }),
                syncResults
            };
        }
        finally {
            /* __GDPR__
                "searchResultsFinished" : {
                    "owner": "roblourens",
                    "duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
                }
            */
            this.telemetryService.publicLog('searchResultsFinished', { duration: Date.now() - start });
        }
    }
    onSearchCompleted(completed, duration, searchInstanceID, ai) {
        if (!this._searchQuery) {
            throw new Error('onSearchCompleted must be called after a search is started');
        }
        if (ai) {
            this._searchResult.add(this._aiResultQueue, searchInstanceID, true);
            this._aiResultQueue.length = 0;
        }
        else {
            this._searchResult.add(this._resultQueue, searchInstanceID, false);
            this._resultQueue.length = 0;
        }
        this.searchResult.setCachedSearchComplete(completed, ai);
        const options = Object.assign({}, this._searchQuery.contentPattern);
        // eslint-disable-next-line local/code-no-any-casts
        delete options.pattern;
        const stats = completed && completed.stats;
        const fileSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme === Schemas.file);
        const otherSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme !== Schemas.file);
        const scheme = fileSchemeOnly ? Schemas.file :
            otherSchemeOnly ? 'other' :
                'mixed';
        /* __GDPR__
            "searchResultsShown" : {
                "owner": "roblourens",
                "count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "fileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "options": { "${inline}": [ "${IPatternInfo}" ] },
                "duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
                "type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                "scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                "searchOnTypeEnabled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        this.telemetryService.publicLog('searchResultsShown', {
            count: this._searchResult.count(),
            fileCount: this._searchResult.fileCount(),
            options,
            duration,
            type: stats && stats.type,
            scheme,
            searchOnTypeEnabled: this.searchConfig.searchOnType
        });
        return completed;
    }
    onSearchError(e, duration, ai) {
        if (errors.isCancellationError(e)) {
            this.onSearchCompleted((ai ? this.aiSearchCancelledForNewSearch : this.searchCancelledForNewSearch)
                ? { exit: 1 /* SearchCompletionExitCode.NewSearchStarted */, results: [], messages: [] }
                : undefined, duration, '', ai);
            if (ai) {
                this.aiSearchCancelledForNewSearch = false;
            }
            else {
                this.searchCancelledForNewSearch = false;
            }
        }
    }
    onSearchProgress(p, searchInstanceID, sync = true, ai = false) {
        const targetQueue = ai ? this._aiResultQueue : this._resultQueue;
        if (p.resource) {
            targetQueue.push(p);
            if (sync) {
                if (targetQueue.length) {
                    this._searchResult.add(targetQueue, searchInstanceID, false, true);
                    targetQueue.length = 0;
                }
            }
            else {
                this._startStreamDelay.then(() => {
                    if (targetQueue.length) {
                        this._searchResult.add(targetQueue, searchInstanceID, ai, !ai);
                        targetQueue.length = 0;
                    }
                });
            }
        }
    }
    get searchConfig() {
        return this.configurationService.getValue('search');
    }
    cancelSearch(cancelledForNewSearch = false) {
        if (this.currentCancelTokenSource) {
            this.searchCancelledForNewSearch = cancelledForNewSearch;
            this.currentCancelTokenSource.cancel();
            return true;
        }
        return false;
    }
    cancelAISearch(cancelledForNewSearch = false) {
        if (this.currentAICancelTokenSource) {
            this.aiSearchCancelledForNewSearch = cancelledForNewSearch;
            this.currentAICancelTokenSource.cancel();
            return true;
        }
        return false;
    }
    clearAiSearchResults() {
        this._aiResultQueue.length = 0;
        // it's not clear all as we are only clearing the AI results
        this._searchResult.aiTextSearchResult.clear(false);
    }
    dispose() {
        this.cancelSearch();
        this.cancelAISearch();
        this.searchResult.dispose();
        super.dispose();
    }
};
SearchModelImpl = __decorate([
    __param(0, ISearchService),
    __param(1, ITelemetryService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, ILogService),
    __param(5, INotebookSearchService)
], SearchModelImpl);
export { SearchModelImpl };
let SearchViewModelWorkbenchService = class SearchViewModelWorkbenchService {
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
        this._searchModel = null;
    }
    get searchModel() {
        if (!this._searchModel) {
            this._searchModel = this.instantiationService.createInstance(SearchModelImpl);
        }
        return this._searchModel;
    }
    set searchModel(searchModel) {
        this._searchModel?.dispose();
        this._searchModel = searchModel;
    }
};
SearchViewModelWorkbenchService = __decorate([
    __param(0, IInstantiationService)
], SearchViewModelWorkbenchService);
export { SearchViewModelWorkbenchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hHLE9BQU8sS0FBSyxNQUFNLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQy9FLE9BQU8sRUFBa0csY0FBYyxFQUFxRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pQLE9BQU8sRUFBZ0IsdUJBQXVCLEVBQUUsbUJBQW1CLEVBQStCLG1CQUFtQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDckosT0FBTyxFQUFFLGdCQUFn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