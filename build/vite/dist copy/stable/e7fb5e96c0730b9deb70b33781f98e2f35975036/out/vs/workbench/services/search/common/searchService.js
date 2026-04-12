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
import * as arrays from '../../../../base/common/arrays.js';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { randomChance } from '../../../../base/common/numbers.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { isNumber } from '../../../../base/common/types.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { DEFAULT_MAX_SEARCH_RESULTS, deserializeSearchError, FileMatch, isAIKeyword, isFileMatch, isProgressMessage, pathIncludedInQuery, SEARCH_RESULT_LANGUAGE_ID, SearchErrorCode } from './search.js';
import { getTextSearchMatchWithModelContext, editorMatchesToTextSearchResults } from './searchHelpers.js';
let SearchService = class SearchService extends Disposable {
    constructor(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService) {
        super();
        this.modelService = modelService;
        this.editorService = editorService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.extensionService = extensionService;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.fileSearchProviders = new Map();
        this.textSearchProviders = new Map();
        this.aiTextSearchProviders = new Map();
        this.deferredFileSearchesByScheme = new Map();
        this.deferredTextSearchesByScheme = new Map();
        this.deferredAITextSearchesByScheme = new Map();
        this.loggedSchemesMissingProviders = new Set();
    }
    registerSearchResultProvider(scheme, type, provider) {
        let list;
        let deferredMap;
        if (type === 0 /* SearchProviderType.file */) {
            list = this.fileSearchProviders;
            deferredMap = this.deferredFileSearchesByScheme;
        }
        else if (type === 1 /* SearchProviderType.text */) {
            list = this.textSearchProviders;
            deferredMap = this.deferredTextSearchesByScheme;
        }
        else if (type === 2 /* SearchProviderType.aiText */) {
            list = this.aiTextSearchProviders;
            deferredMap = this.deferredAITextSearchesByScheme;
        }
        else {
            throw new Error('Unknown SearchProviderType');
        }
        list.set(scheme, provider);
        if (deferredMap.has(scheme)) {
            deferredMap.get(scheme).complete(provider);
            deferredMap.delete(scheme);
        }
        return toDisposable(() => {
            list.delete(scheme);
        });
    }
    async textSearch(query, token, onProgress) {
        const results = this.textSearchSplitSyncAsync(query, token, onProgress);
        const openEditorResults = results.syncResults;
        const otherResults = await results.asyncResults;
        return {
            limitHit: otherResults.limitHit || openEditorResults.limitHit,
            results: [...otherResults.results, ...openEditorResults.results],
            messages: [...otherResults.messages, ...openEditorResults.messages]
        };
    }
    async aiTextSearch(query, token, onProgress) {
        const onProviderProgress = (progress) => {
            // Match
            if (onProgress) { // don't override open editor results
                if (isFileMatch(progress) || isAIKeyword(progress)) {
                    onProgress(progress);
                }
                else {
                    onProgress(progress);
                }
            }
            if (isProgressMessage(progress)) {
                this.logService.debug('SearchService#search', progress.message);
            }
        };
        return this.doSearch(query, token, onProviderProgress);
    }
    async getAIName() {
        const provider = this.getSearchProvider(3 /* QueryType.aiText */).get(Schemas.file);
        return await provider?.getAIName();
    }
    textSearchSplitSyncAsync(query, token, onProgress, notebookFilesToIgnore, asyncNotebookFilesToIgnore) {
        // Get open editor results from dirty/untitled
        const openEditorResults = this.getOpenEditorResults(query);
        if (onProgress) {
            arrays.coalesce([...openEditorResults.results.values()]).filter(e => !(notebookFilesToIgnore && notebookFilesToIgnore.has(e.resource))).forEach(onProgress);
        }
        const syncResults = {
            results: arrays.coalesce([...openEditorResults.results.values()]),
            limitHit: openEditorResults.limitHit ?? false,
            messages: []
        };
        const getAsyncResults = async () => {
            const resolvedAsyncNotebookFilesToIgnore = await asyncNotebookFilesToIgnore ?? new ResourceSet();
            const onProviderProgress = (progress) => {
                if (isFileMatch(progress)) {
                    // Match
                    if (!openEditorResults.results.has(progress.resource) && !resolvedAsyncNotebookFilesToIgnore.has(progress.resource) && onProgress) { // don't override open editor results
                        onProgress(progress);
                    }
                }
                else if (onProgress) {
                    // Progress
                    onProgress(progress);
                }
                if (isProgressMessage(progress)) {
                    this.logService.debug('SearchService#search', progress.message);
                }
            };
            return await this.doSearch(query, token, onProviderProgress);
        };
        return {
            syncResults,
            asyncResults: getAsyncResults()
        };
    }
    fileSearch(query, token) {
        return this.doSearch(query, token);
    }
    schemeHasFileSearchProvider(scheme) {
        return this.fileSearchProviders.has(scheme);
    }
    doSearch(query, token, onProgress) {
        this.logService.trace('SearchService#search', JSON.stringify(query));
        const schemesInQuery = this.getSchemesInQuery(query);
        const providerActivations = [Promise.resolve(null)];
        schemesInQuery.forEach(scheme => providerActivations.push(this.extensionService.activateByEvent(`onSearch:${scheme}`)));
        providerActivations.push(this.extensionService.activateByEvent('onSearch:file'));
        const providerPromise = (async () => {
            await Promise.all(providerActivations);
            await this.extensionService.whenInstalledExtensionsRegistered();
            // Cancel faster if search was canceled while waiting for extensions
            if (token && token.isCancellationRequested) {
                return Promise.reject(new CancellationError());
            }
            const progressCallback = (item) => {
                if (token && token.isCancellationRequested) {
                    return;
                }
                onProgress?.(item);
            };
            const exists = await Promise.all(query.folderQueries.map(query => this.fileService.exists(query.folder)));
            query.folderQueries = query.folderQueries.filter((_, i) => exists[i]);
            let completes = await this.searchWithProviders(query, progressCallback, token);
            completes = arrays.coalesce(completes);
            if (!completes.length) {
                return {
                    limitHit: false,
                    results: [],
                    messages: [],
                };
            }
            return {
                limitHit: completes[0] && completes[0].limitHit,
                stats: completes[0].stats,
                messages: arrays.coalesce(completes.flatMap(i => i.messages)).filter(arrays.uniqueFilter(message => message.type + message.text + message.trusted)),
                results: completes.flatMap((c) => c.results),
                aiKeywords: completes.flatMap((c) => c.aiKeywords).filter(keyword => keyword !== undefined),
            };
        })();
        return token ? raceCancellationError(providerPromise, token) : providerPromise;
    }
    getSchemesInQuery(query) {
        const schemes = new Set();
        query.folderQueries?.forEach(fq => schemes.add(fq.folder.scheme));
        query.extraFileResources?.forEach(extraFile => schemes.add(extraFile.scheme));
        return schemes;
    }
    async waitForProvider(queryType, scheme) {
        const deferredMap = this.getDeferredTextSearchesByScheme(queryType);
        if (deferredMap.has(scheme)) {
            return deferredMap.get(scheme).p;
        }
        else {
            const deferred = new DeferredPromise();
            deferredMap.set(scheme, deferred);
            return deferred.p;
        }
    }
    getSearchProvider(type) {
        switch (type) {
            case 1 /* QueryType.File */:
                return this.fileSearchProviders;
            case 2 /* QueryType.Text */:
                return this.textSearchProviders;
            case 3 /* QueryType.aiText */:
                return this.aiTextSearchProviders;
            default:
                throw new Error(`Unknown query type: ${type}`);
        }
    }
    getDeferredTextSearchesByScheme(type) {
        switch (type) {
            case 1 /* QueryType.File */:
                return this.deferredFileSearchesByScheme;
            case 2 /* QueryType.Text */:
                return this.deferredTextSearchesByScheme;
            case 3 /* QueryType.aiText */:
                return this.deferredAITextSearchesByScheme;
            default:
                throw new Error(`Unknown query type: ${type}`);
        }
    }
    async searchWithProviders(query, onProviderProgress, token) {
        const e2eSW = StopWatch.create(false);
        const searchPs = [];
        const fqs = this.groupFolderQueriesByScheme(query);
        const someSchemeHasProvider = [...fqs.keys()].some(scheme => {
            return this.getSearchProvider(query.type).has(scheme);
        });
        await Promise.all([...fqs.keys()].map(async (scheme) => {
            if (query.onlyFileScheme && scheme !== Schemas.file) {
                return;
            }
            const schemeFQs = fqs.get(scheme);
            let provider = this.getSearchProvider(query.type).get(scheme);
            if (!provider) {
                if (someSchemeHasProvider) {
                    if (!this.loggedSchemesMissingProviders.has(scheme)) {
                        this.logService.warn(`No search provider registered for scheme: ${scheme}. Another scheme has a provider, not waiting for ${scheme}`);
                        this.loggedSchemesMissingProviders.add(scheme);
                    }
                    return;
                }
                else {
                    if (!this.loggedSchemesMissingProviders.has(scheme)) {
                        this.logService.warn(`No search provider registered for scheme: ${scheme}, waiting`);
                        this.loggedSchemesMissingProviders.add(scheme);
                    }
                    provider = await this.waitForProvider(query.type, scheme);
                }
            }
            const oneSchemeQuery = {
                ...query,
                ...{
                    folderQueries: schemeFQs
                }
            };
            const doProviderSearch = () => {
                switch (query.type) {
                    case 1 /* QueryType.File */:
                        return provider.fileSearch(oneSchemeQuery, token);
                    case 2 /* QueryType.Text */:
                        return provider.textSearch(oneSchemeQuery, onProviderProgress, token);
                    default:
                        return provider.textSearch(oneSchemeQuery, onProviderProgress, token);
                }
            };
            searchPs.push(doProviderSearch());
        }));
        return Promise.all(searchPs).then(completes => {
            const endToEndTime = e2eSW.elapsed();
            this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
            completes.forEach(complete => {
                this.sendTelemetry(query, endToEndTime, complete);
            });
            return completes;
        }, err => {
            const endToEndTime = e2eSW.elapsed();
            this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
            const searchError = deserializeSearchError(err);
            this.logService.trace(`SearchService#searchError: ${searchError.message}`);
            this.sendTelemetry(query, endToEndTime, undefined, searchError);
            throw searchError;
        });
    }
    groupFolderQueriesByScheme(query) {
        const queries = new Map();
        query.folderQueries.forEach(fq => {
            const schemeFQs = queries.get(fq.folder.scheme) || [];
            schemeFQs.push(fq);
            queries.set(fq.folder.scheme, schemeFQs);
        });
        return queries;
    }
    sendTelemetry(query, endToEndTime, complete, err) {
        if (!randomChance(5 / 100)) {
            // Noisy events, only send 5% of them
            return;
        }
        const fileSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme === Schemas.file);
        const otherSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme !== Schemas.file);
        const scheme = fileSchemeOnly ? Schemas.file :
            otherSchemeOnly ? 'other' :
                'mixed';
        if (query.type === 1 /* QueryType.File */ && complete && complete.stats) {
            const fileSearchStats = complete.stats;
            if (fileSearchStats.fromCache) {
                const cacheStats = fileSearchStats.detailStats;
                this.telemetryService.publicLog2('cachedSearchComplete', {
                    reason: query._reason,
                    resultCount: fileSearchStats.resultCount,
                    workspaceFolderCount: query.folderQueries.length,
                    endToEndTime: endToEndTime,
                    sortingTime: fileSearchStats.sortingTime,
                    cacheWasResolved: cacheStats.cacheWasResolved,
                    cacheLookupTime: cacheStats.cacheLookupTime,
                    cacheFilterTime: cacheStats.cacheFilterTime,
                    cacheEntryCount: cacheStats.cacheEntryCount,
                    scheme
                });
            }
            else {
                const searchEngineStats = fileSearchStats.detailStats;
                this.telemetryService.publicLog2('searchComplete', {
                    reason: query._reason,
                    resultCount: fileSearchStats.resultCount,
                    workspaceFolderCount: query.folderQueries.length,
                    endToEndTime: endToEndTime,
                    sortingTime: fileSearchStats.sortingTime,
                    fileWalkTime: searchEngineStats.fileWalkTime,
                    directoriesWalked: searchEngineStats.directoriesWalked,
                    filesWalked: searchEngineStats.filesWalked,
                    cmdTime: searchEngineStats.cmdTime,
                    cmdResultCount: searchEngineStats.cmdResultCount,
                    scheme
                });
            }
        }
        else if (query.type === 2 /* QueryType.Text */) {
            let errorType;
            if (err) {
                errorType = err.code === SearchErrorCode.regexParseError ? 'regex' :
                    err.code === SearchErrorCode.unknownEncoding ? 'encoding' :
                        err.code === SearchErrorCode.globParseError ? 'glob' :
                            err.code === SearchErrorCode.invalidLiteral ? 'literal' :
                                err.code === SearchErrorCode.other ? 'other' :
                                    err.code === SearchErrorCode.canceled ? 'canceled' :
                                        'unknown';
            }
            this.telemetryService.publicLog2('textSearchComplete', {
                reason: query._reason,
                workspaceFolderCount: query.folderQueries.length,
                endToEndTime: endToEndTime,
                scheme,
                error: errorType,
            });
        }
    }
    getOpenEditorResults(query) {
        const openEditorResults = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        let limitHit = false;
        if (query.type === 2 /* QueryType.Text */) {
            const canonicalToOriginalResources = new ResourceMap();
            for (const editorInput of this.editorService.editors) {
                const canonical = EditorResourceAccessor.getCanonicalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });
                const original = EditorResourceAccessor.getOriginalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });
                if (canonical) {
                    canonicalToOriginalResources.set(canonical, original ?? canonical);
                }
            }
            const models = this.modelService.getModels();
            models.forEach((model) => {
                const resource = model.uri;
                if (!resource) {
                    return;
                }
                if (limitHit) {
                    return;
                }
                const originalResource = canonicalToOriginalResources.get(resource);
                if (!originalResource) {
                    return;
                }
                // Skip search results
                if (model.getLanguageId() === SEARCH_RESULT_LANGUAGE_ID && !(query.includePattern && query.includePattern['**/*.code-search'])) {
                    // TODO: untitled search editors will be excluded from search even when include *.code-search is specified
                    return;
                }
                // Block walkthrough, webview, etc.
                if (originalResource.scheme !== Schemas.untitled && !this.fileService.hasProvider(originalResource)) {
                    return;
                }
                // Exclude files from the git FileSystemProvider, e.g. to prevent open staged files from showing in search results
                if (originalResource.scheme === 'git') {
                    return;
                }
                if (!this.matches(originalResource, query)) {
                    return; // respect user filters
                }
                // Use editor API to find matches
                const askMax = (isNumber(query.maxResults) ? query.maxResults : DEFAULT_MAX_SEARCH_RESULTS) + 1;
                let matches = model.findMatches(query.contentPattern.pattern, false, !!query.contentPattern.isRegExp, !!query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, askMax);
                if (matches.length) {
                    if (askMax && matches.length >= askMax) {
                        limitHit = true;
                        matches = matches.slice(0, askMax - 1);
                    }
                    const fileMatch = new FileMatch(originalResource);
                    openEditorResults.set(originalResource, fileMatch);
                    const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
                    fileMatch.results = getTextSearchMatchWithModelContext(textSearchResults, model, query);
                }
                else {
                    openEditorResults.set(originalResource, null);
                }
            });
        }
        return {
            results: openEditorResults,
            limitHit
        };
    }
    matches(resource, query) {
        return pathIncludedInQuery(query, resource.fsPath);
    }
    async clearCache(cacheKey) {
        const clearPs = Array.from(this.fileSearchProviders.values())
            .map(provider => provider && provider.clearCache(cacheKey));
        await Promise.all(clearPs);
    }
};
SearchService = __decorate([
    __param(0, IModelService),
    __param(1, IEditorService),
    __param(2, ITelemetryService),
    __param(3, ILogService),
    __param(4, IExtensionService),
    __param(5, IFileService),
    __param(6, IUriIdentityService)
], SearchService);
export { SearchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztB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