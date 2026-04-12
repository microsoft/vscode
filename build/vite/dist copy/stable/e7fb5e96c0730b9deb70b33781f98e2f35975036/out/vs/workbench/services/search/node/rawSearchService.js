/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from '../../../../base/common/arrays.js';
import { createCancelablePromise } from '../../../../base/common/async.js';
import { canceled } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { compareItemsByFuzzyScore, prepareQuery } from '../../../../base/common/fuzzyScorer.js';
import { revive } from '../../../../base/common/marshalling.js';
import { basename, dirname, join, sep } from '../../../../base/common/path.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { DEFAULT_MAX_SEARCH_RESULTS, isFilePatternMatch } from '../common/search.js';
import { Engine as FileSearchEngine } from './fileSearch.js';
import { TextSearchEngineAdapter } from './textSearchAdapter.js';
export class SearchService {
    static { this.BATCH_SIZE = 512; }
    constructor(processType = 'searchProcess', getNumThreads) {
        this.processType = processType;
        this.getNumThreads = getNumThreads;
        this.caches = Object.create(null);
    }
    fileSearch(config) {
        let promise;
        const query = reviveQuery(config);
        const emitter = new Emitter({
            onDidAddFirstListener: () => {
                promise = createCancelablePromise(async (token) => {
                    const numThreads = await this.getNumThreads?.();
                    return this.doFileSearchWithEngine(FileSearchEngine, query, p => emitter.fire(p), token, SearchService.BATCH_SIZE, numThreads);
                });
                promise.then(c => emitter.fire(c), err => emitter.fire({ type: 'error', error: { message: err.message, stack: err.stack } }));
            },
            onDidRemoveLastListener: () => {
                promise.cancel();
            }
        });
        return emitter.event;
    }
    textSearch(rawQuery) {
        let promise;
        const query = reviveQuery(rawQuery);
        const emitter = new Emitter({
            onDidAddFirstListener: () => {
                promise = createCancelablePromise(token => {
                    return this.ripgrepTextSearch(query, p => emitter.fire(p), token);
                });
                promise.then(c => emitter.fire(c), err => emitter.fire({ type: 'error', error: { message: err.message, stack: err.stack } }));
            },
            onDidRemoveLastListener: () => {
                promise.cancel();
            }
        });
        return emitter.event;
    }
    async ripgrepTextSearch(config, progressCallback, token) {
        config.maxFileSize = this.getPlatformFileLimits().maxFileSize;
        const numThreads = await this.getNumThreads?.();
        const engine = new TextSearchEngineAdapter(config, numThreads);
        return engine.search(token, progressCallback, progressCallback);
    }
    getPlatformFileLimits() {
        return {
            maxFileSize: 16 * ByteSize.GB
        };
    }
    doFileSearch(config, numThreads, progressCallback, token) {
        return this.doFileSearchWithEngine(FileSearchEngine, config, progressCallback, token, SearchService.BATCH_SIZE, numThreads);
    }
    doFileSearchWithEngine(EngineClass, config, progressCallback, token, batchSize = SearchService.BATCH_SIZE, threads) {
        let resultCount = 0;
        const fileProgressCallback = progress => {
            if (Array.isArray(progress)) {
                resultCount += progress.length;
                progressCallback(progress.map(m => this.rawMatchToSearchItem(m)));
            }
            else if (progress.relativePath) {
                resultCount++;
                progressCallback(this.rawMatchToSearchItem(progress));
            }
            else {
                progressCallback(progress);
            }
        };
        if (config.sortByScore) {
            let sortedSearch = this.trySortedSearchFromCache(config, fileProgressCallback, token);
            if (!sortedSearch) {
                const walkerConfig = config.maxResults ? Object.assign({}, config, { maxResults: null }) : config;
                const engine = new EngineClass(walkerConfig, threads);
                sortedSearch = this.doSortedSearch(engine, config, progressCallback, fileProgressCallback, token);
            }
            return new Promise((c, e) => {
                sortedSearch.then(([result, rawMatches]) => {
                    const serializedMatches = rawMatches.map(rawMatch => this.rawMatchToSearchItem(rawMatch));
                    this.sendProgress(serializedMatches, progressCallback, batchSize);
                    c(result);
                }, e);
            });
        }
        const engine = new EngineClass(config, threads);
        return this.doSearch(engine, fileProgressCallback, batchSize, token).then(complete => {
            return {
                limitHit: complete.limitHit,
                type: 'success',
                stats: {
                    detailStats: complete.stats,
                    type: this.processType,
                    fromCache: false,
                    resultCount,
                    sortingTime: undefined
                },
                messages: []
            };
        });
    }
    rawMatchToSearchItem(match) {
        return { path: match.base ? join(match.base, match.relativePath) : match.relativePath };
    }
    doSortedSearch(engine, config, progressCallback, fileProgressCallback, token) {
        const emitter = new Emitter();
        let allResultsPromise = createCancelablePromise(token => {
            let results = [];
            const innerProgressCallback = progress => {
                if (Array.isArray(progress)) {
                    results = progress;
                }
                else {
                    fileProgressCallback(progress);
                    emitter.fire(progress);
                }
            };
            return this.doSearch(engine, innerProgressCallback, -1, token)
                .then(result => {
                return [result, results];
            });
        });
        let cache;
        if (config.cacheKey) {
            cache = this.getOrCreateCache(config.cacheKey);
            const cacheRow = {
                promise: allResultsPromise,
                event: emitter.event,
                resolved: false
            };
            cache.resultsToSearchCache[config.filePattern || ''] = cacheRow;
            allResultsPromise.then(() => {
                cacheRow.resolved = true;
            }, err => {
                delete cache.resultsToSearchCache[config.filePattern || ''];
            });
            allResultsPromise = this.preventCancellation(allResultsPromise);
        }
        return allResultsPromise.then(([result, results]) => {
            const scorerCache = cache ? cache.scorerCache : Object.create(null);
            const sortSW = (typeof config.maxResults !== 'number' || config.maxResults > 0) && StopWatch.create(false);
            return this.sortResults(config, results, scorerCache, token)
                .then(sortedResults => {
                // sortingTime: -1 indicates a "sorted" search that was not sorted, i.e. populating the cache when quickaccess is opened.
                // Contrasting with findFiles which is not sorted and will have sortingTime: undefined
                const sortingTime = sortSW ? sortSW.elapsed() : -1;
                return [{
                        type: 'success',
                        stats: {
                            detailStats: result.stats,
                            sortingTime,
                            fromCache: false,
                            type: this.processType,
                            resultCount: sortedResults.length
                        },
                        messages: result.messages,
                        limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults
                    }, sortedResults];
            });
        });
    }
    getOrCreateCache(cacheKey) {
        const existing = this.caches[cacheKey];
        if (existing) {
            return existing;
        }
        return this.caches[cacheKey] = new Cache();
    }
    trySortedSearchFromCache(config, progressCallback, token) {
        const cache = config.cacheKey && this.caches[config.cacheKey];
        if (!cache) {
            return undefined;
        }
        const cached = this.getResultsFromCache(cache, config.filePattern || '', progressCallback, token);
        if (cached) {
            return cached.then(([result, results, cacheStats]) => {
                const sortSW = StopWatch.create(false);
                return this.sortResults(config, results, cache.scorerCache, token)
                    .then(sortedResults => {
                    const sortingTime = sortSW.elapsed();
                    const stats = {
                        fromCache: true,
                        detailStats: cacheStats,
                        type: this.processType,
                        resultCount: results.length,
                        sortingTime
                    };
                    return [
                        {
                            type: 'success',
                            limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults,
                            stats,
                            messages: [],
                        },
                        sortedResults
                    ];
                });
            });
        }
        return undefined;
    }
    sortResults(config, results, scorerCache, token) {
        // we use the same compare function that is used later when showing the results using fuzzy scoring
        // this is very important because we are also limiting the number of results by config.maxResults
        // and as such we want the top items to be included in this result set if the number of items
        // exceeds config.maxResults.
        const query = prepareQuery(config.filePattern || '');
        const compare = (matchA, matchB) => compareItemsByFuzzyScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);
        const maxResults = typeof config.maxResults === 'number' ? config.maxResults : DEFAULT_MAX_SEARCH_RESULTS;
        return arrays.topAsync(results, compare, maxResults, 10000, token);
    }
    sendProgress(results, progressCb, batchSize) {
        if (batchSize && batchSize > 0) {
            for (let i = 0; i < results.length; i += batchSize) {
                progressCb(results.slice(i, i + batchSize));
            }
        }
        else {
            progressCb(results);
        }
    }
    getResultsFromCache(cache, searchValue, progressCallback, token) {
        const cacheLookupSW = StopWatch.create(false);
        // Find cache entries by prefix of search value
        const hasPathSep = searchValue.indexOf(sep) >= 0;
        let cachedRow;
        for (const previousSearch in cache.resultsToSearchCache) {
            // If we narrow down, we might be able to reuse the cached results
            if (searchValue.startsWith(previousSearch)) {
                if (hasPathSep && previousSearch.indexOf(sep) < 0 && previousSearch !== '') {
                    continue; // since a path character widens the search for potential more matches, require it in previous search too
                }
                const row = cache.resultsToSearchCache[previousSearch];
                cachedRow = {
                    promise: this.preventCancellation(row.promise),
                    event: row.event,
                    resolved: row.resolved
                };
                break;
            }
        }
        if (!cachedRow) {
            return null;
        }
        const cacheLookupTime = cacheLookupSW.elapsed();
        const cacheFilterSW = StopWatch.create(false);
        const listener = cachedRow.event(progressCallback);
        if (token) {
            token.onCancellationRequested(() => {
                listener.dispose();
            });
        }
        return cachedRow.promise.then(([complete, cachedEntries]) => {
            if (token && token.isCancellationRequested) {
                throw canceled();
            }
            // Pattern match on results
            const results = [];
            const normalizedSearchValueLowercase = prepareQuery(searchValue).normalizedLowercase;
            for (const entry of cachedEntries) {
                // Check if this entry is a match for the search value
                if (!isFilePatternMatch(entry, normalizedSearchValueLowercase)) {
                    continue;
                }
                results.push(entry);
            }
            return [complete, results, {
                    cacheWasResolved: cachedRow.resolved,
                    cacheLookupTime,
                    cacheFilterTime: cacheFilterSW.elapsed(),
                    cacheEntryCount: cachedEntries.length
                }];
        });
    }
    doSearch(engine, progressCallback, batchSize, token) {
        return new Promise((c, e) => {
            let batch = [];
            token?.onCancellationRequested(() => engine.cancel());
            engine.search((match) => {
                if (match) {
                    if (batchSize) {
                        batch.push(match);
                        if (batchSize > 0 && batch.length >= batchSize) {
                            progressCallback(batch);
                            batch = [];
                        }
                    }
                    else {
                        progressCallback(match);
                    }
                }
            }, (progress) => {
                progressCallback(progress);
            }, (error, complete) => {
                if (batch.length) {
                    progressCallback(batch);
                }
                if (error) {
                    progressCallback({ message: 'Search finished. Error: ' + error.message });
                    e(error);
                }
                else {
                    progressCallback({ message: 'Search finished. Stats: ' + JSON.stringify(complete.stats) });
                    c(complete);
                }
            });
        });
    }
    clearCache(cacheKey) {
        delete this.caches[cacheKey];
        return Promise.resolve(undefined);
    }
    /**
     * Return a CancelablePromise which is not actually cancelable
     * TODO@rob - Is this really needed?
     */
    preventCancellation(promise) {
        return new class {
            get [Symbol.toStringTag]() { return this.toString(); }
            cancel() {
                // Do nothing
            }
            then(resolve, reject) {
                return promise.then(resolve, reject);
            }
            catch(reject) {
                return this.then(undefined, reject);
            }
            finally(onFinally) {
                return promise.finally(onFinally);
            }
        };
    }
}
class Cache {
    constructor() {
        this.resultsToSearchCache = Object.create(null);
        this.scorerCache = Object.create(null);
    }
}
const FileMatchItemAccessor = new class {
    getItemLabel(match) {
        return basename(match.relativePath); // e.g. myFile.txt
    }
    getItemDescription(match) {
        return dirname(match.relativePath); // e.g. some/path/to/file
    }
    getItemPath(match) {
        return match.relativePath; // e.g. some/path/to/file/myFile.txt
    }
};
function reviveQuery(rawQuery) {
    return {
        // eslint-disable-next-line local/code-no-any-casts
        ...rawQuery, // TODO
        ...{
            folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
            extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map(components => URI.revive(components))
        }
    };
}
function reviveFolderQuery(rawFolderQuery) {
    return revive(rawFolderQuery);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF3U2VhcmNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9yYXdTZWFyY2hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTlGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHdCQUF3QixFQUFtQyxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqSSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsMEJBQTBCLEVBQXVVLGtCQUFrQixFQUFjLE1BQU0scUJBQXFCLENBQUM7QUFDdGEsT0FBTyxFQUFFLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzdELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBS2pFLE1BQU0sT0FBTyxhQUFhO2FBRUQsZUFBVSxHQUFHLEdBQUcsQUFBTixDQUFPO0lBSXpDLFlBQTZCLGNBQXdD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