/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isThenable } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FolderQuerySearchTree } from './folderQuerySearchTree.js';
import { DEFAULT_MAX_SEARCH_RESULTS, hasSiblingPromiseFn, excludeToGlobPattern, QueryGlobTester, resolvePatternsForProvider, DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from './search.js';
import { TextSearchMatch2, AISearchKeyword } from './searchExtTypes.js';
export class TextSearchManager {
    constructor(queryProviderPair, fileUtils, processType) {
        this.queryProviderPair = queryProviderPair;
        this.fileUtils = fileUtils;
        this.processType = processType;
        this.collector = null;
        this.isLimitHit = false;
        this.resultCount = 0;
    }
    get query() {
        return this.queryProviderPair.query;
    }
    search(onProgress, token, onKeywordResult) {
        const folderQueries = this.query.folderQueries || [];
        const tokenSource = new CancellationTokenSource(token);
        return new Promise((resolve, reject) => {
            this.collector = new TextSearchResultsCollector(onProgress);
            let isCanceled = false;
            const onResult = (result, folderIdx) => {
                if (result instanceof AISearchKeyword) {
                    // Already processed by the callback.
                    return;
                }
                if (isCanceled) {
                    return;
                }
                if (!this.isLimitHit) {
                    const resultSize = this.resultSize(result);
                    if (result instanceof TextSearchMatch2 && typeof this.query.maxResults === 'number' && this.resultCount + resultSize > this.query.maxResults) {
                        this.isLimitHit = true;
                        isCanceled = true;
                        tokenSource.cancel();
                        result = this.trimResultToSize(result, this.query.maxResults - this.resultCount);
                    }
                    const newResultSize = this.resultSize(result);
                    this.resultCount += newResultSize;
                    const a = result instanceof TextSearchMatch2;
                    if (newResultSize > 0 || !a) {
                        this.collector.add(result, folderIdx);
                    }
                }
            };
            // For each root folder
            this.doSearch(folderQueries, onResult, tokenSource.token, onKeywordResult).then(result => {
                tokenSource.dispose();
                this.collector.flush();
                resolve({
                    limitHit: this.isLimitHit || result?.limitHit,
                    messages: this.getMessagesFromResults(result),
                    stats: {
                        type: this.processType
                    }
                });
            }, (err) => {
                tokenSource.dispose();
                const errMsg = toErrorMessage(err);
                reject(new Error(errMsg));
            });
        });
    }
    getMessagesFromResults(result) {
        if (!result?.message) {
            return [];
        }
        if (Array.isArray(result.message)) {
            return result.message;
        }
        return [result.message];
    }
    resultSize(result) {
        if (result instanceof TextSearchMatch2) {
            return Array.isArray(result.ranges) ?
                result.ranges.length :
                1;
        }
        else {
            // #104400 context lines shoudn't count towards result count
            return 0;
        }
    }
    trimResultToSize(result, size) {
        return new TextSearchMatch2(result.uri, result.ranges.slice(0, size), result.previewText);
    }
    async doSearch(folderQueries, onResult, token, onKeywordResult) {
        const folderMappings = new FolderQuerySearchTree(folderQueries, (fq, i) => {
            const queryTester = new QueryGlobTester(this.query, fq);
            return { queryTester, folder: fq.folder, folderIdx: i };
        }, () => true);
        const testingPs = [];
        const progress = {
            report: (result) => {
                if (result instanceof AISearchKeyword) {
                    onKeywordResult?.(result);
                }
                else {
                    if (result.uri === undefined) {
                        throw Error('Text search result URI is undefined. Please check provider implementation.');
                    }
                    const folderQuery = folderMappings.findQueryFragmentAwareSubstr(result.uri);
                    if (folderQuery?.folder?.scheme) {
                        const hasSibling = folderQuery.folder.scheme === Schemas.file ?
                            hasSiblingPromiseFn(() => {
                                return this.fileUtils.readdir(resources.dirname(result.uri));
                            }) :
                            undefined;
                        const relativePath = resources.relativePath(folderQuery.folder, result.uri);
                        if (relativePath) {
                            // This method is only async when the exclude contains sibling clauses
                            const included = folderQuery.queryTester.includedInQuery(relativePath, path.basename(relativePath), hasSibling);
                            if (isThenable(included)) {
                                testingPs.push(included.then(isIncluded => {
                                    if (isIncluded) {
                                        onResult(result, folderQuery.folderIdx);
                                    }
                                }));
                            }
                            else if (included) {
                                onResult(result, folderQuery.folderIdx);
                            }
                        }
                    }
                }
            }
        };
        const folderOptions = folderQueries.map(fq => this.getSearchOptionsForFolder(fq));
        const searchOptions = {
            folderOptions,
            maxFileSize: this.query.maxFileSize,
            maxResults: this.query.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
            previewOptions: this.query.previewOptions ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS,
            surroundingContext: this.query.surroundingContext ?? 0,
        };
        if ('usePCRE2' in this.query) {
            searchOptions.usePCRE2 = this.query.usePCRE2;
        }
        let result;
        if (this.queryProviderPair.query.type === 3 /* QueryType.aiText */) {
            result = await this.queryProviderPair.provider.provideAITextSearchResults(this.queryProviderPair.query.contentPattern, searchOptions, progress, token);
        }
        else {
            result = await this.queryProviderPair.provider.provideTextSearchResults(patternInfoToQuery(this.queryProviderPair.query.contentPattern), searchOptions, progress, token);
        }
        if (testingPs.length) {
            await Promise.all(testingPs);
        }
        return result;
    }
    getSearchOptionsForFolder(fq) {
        const includes = resolvePatternsForProvider(this.query.includePattern, fq.includePattern);
        let excludePattern = fq.excludePattern?.map(e => ({
            folder: e.folder,
            patterns: resolvePatternsForProvider(this.query.excludePattern, e.pattern)
        }));
        if (!excludePattern || excludePattern.length === 0) {
            excludePattern = [{
                    folder: undefined,
                    patterns: resolvePatternsForProvider(this.query.excludePattern, undefined)
                }];
        }
        const excludes = excludeToGlobPattern(excludePattern);
        const options = {
            folder: URI.from(fq.folder),
            excludes,
            includes,
            useIgnoreFiles: {
                local: !fq.disregardIgnoreFiles,
                parent: !fq.disregardParentIgnoreFiles,
                global: !fq.disregardGlobalIgnoreFiles
            },
            followSymlinks: !fq.ignoreSymlinks,
            encoding: (fq.fileEncoding && this.fileUtils.toCanonicalName(fq.fileEncoding)) ?? '',
            ignoreGlobCase: this.query.ignoreGlobCase || fq.ignoreGlobCase,
        };
        return options;
    }
}
function patternInfoToQuery(patternInfo) {
    return {
        isCaseSensitive: patternInfo.isCaseSensitive || false,
        isRegExp: patternInfo.isRegExp || false,
        isWordMatch: patternInfo.isWordMatch || false,
        isMultiline: patternInfo.isMultiline || false,
        pattern: patternInfo.pattern
    };
}
export class TextSearchResultsCollector {
    constructor(_onResult) {
        this._onResult = _onResult;
        this._currentFolderIdx = -1;
        this._currentFileMatch = null;
        this._batchedCollector = new BatchedCollector(512, items => this.sendItems(items));
    }
    add(data, folderIdx) {
        // Collects TextSearchResults into IInternalFileMatches and collates using BatchedCollector.
        // This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
        // providers that send results in random order. We could do this step afterwards instead.
        if (this._currentFileMatch && (this._currentFolderIdx !== folderIdx || !resources.isEqual(this._currentUri, data.uri))) {
            this.pushToCollector();
            this._currentFileMatch = null;
        }
        if (!this._currentFileMatch) {
            this._currentFolderIdx = folderIdx;
            this._currentUri = data.uri;
            this._currentFileMatch = {
                resource: data.uri,
                results: []
            };
        }
        this._currentFileMatch.results.push(extensionResultToFrontendResult(data));
    }
    pushToCollector() {
        const size = this._currentFileMatch && this._currentFileMatch.results ?
            this._currentFileMatch.results.length :
            0;
        this._batchedCollector.addItem(this._currentFileMatch, size);
    }
    flush() {
        this.pushToCollector();
        this._batchedCollector.flush();
    }
    sendItems(items) {
        this._onResult(items);
    }
}
function extensionResultToFrontendResult(data) {
    // Warning: result from RipgrepTextSearchEH has fake Range. Don't depend on any other props beyond these...
    if (data instanceof TextSearchMatch2) {
        return {
            previewText: data.previewText,
            rangeLocations: data.ranges.map(r => ({
                preview: {
                    startLineNumber: r.previewRange.start.line,
                    startColumn: r.previewRange.start.character,
                    endLineNumber: r.previewRange.end.line,
                    endColumn: r.previewRange.end.character
                },
                source: {
                    startLineNumber: r.sourceRange.start.line,
                    startColumn: r.sourceRange.start.character,
                    endLineNumber: r.sourceRange.end.line,
                    endColumn: r.sourceRange.end.character
                },
            })),
        };
    }
    else {
        return {
            text: data.text,
            lineNumber: data.lineNumber
        };
    }
}
/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
export class BatchedCollector {
    static { this.TIMEOUT = 4000; }
    // After START_BATCH_AFTER_COUNT items have been collected, stop flushing on timeout
    static { this.START_BATCH_AFTER_COUNT = 50; }
    constructor(maxBatchSize, cb) {
        this.maxBatchSize = maxBatchSize;
        this.cb = cb;
        this.totalNumberCompleted = 0;
        this.batch = [];
        this.batchSize = 0;
    }
    addItem(item, size) {
        if (!item) {
            return;
        }
        this.addItemToBatch(item, size);
    }
    addItems(items, size) {
        if (!items) {
            return;
        }
        this.addItemsToBatch(items, size);
    }
    addItemToBatch(item, size) {
        this.batch.push(item);
        this.batchSize += size;
        this.onUpdate();
    }
    addItemsToBatch(item, size) {
        this.batch = this.batch.concat(item);
        this.batchSize += size;
        this.onUpdate();
    }
    onUpdate() {
        if (this.totalNumberCompleted < BatchedCollector.START_BATCH_AFTER_COUNT) {
            // Flush because we aren't batching yet
            this.flush();
        }
        else if (this.batchSize >= this.maxBatchSize) {
            // Flush because the batch is full
            this.flush();
        }
        else if (!this.timeoutHandle) {
            // No timeout running, start a timeout to flush
            this.timeoutHandle = setTimeout(() => {
                this.flush();
            }, BatchedCollector.TIMEOUT);
        }
    }
    flush() {
        if (this.batchSize) {
            this.totalNumberCompleted += this.batchSize;
            this.cb(this.batch);
            this.batch = [];
            this.batchSize = 0;
            if (this.timeoutHandle) {
                clearTimeout(this.timeoutHandle);
                this.timeoutHandle = undefined;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL2NvbW1vbi90ZXh0U2VhcmNoTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQTJFLG9CQUFvQixFQUE2SCxlQUFlLEVBQWEsMEJBQTBCLEVBQWdCLG1DQUFtQyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ25aLE9BQU8sRUFBdUIsZ0JBQWdCLEVBQThKLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBbUJ6UCxNQUFNLE9BQU8saUJBQWlCO0lBTzdCLFlBQW9CLGlCQUFvRSxFQUMvRSxTQUFxQixFQUNyQixXQUFxQztRQUYxQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1EO1FBQy9FLGNBQVMsR0FBVCxTQUFTLENBQVk7UUFDckIsZ0JBQVcsR0FBWCxXQUFXLENBQTBCO1FBUHRDLGNBQVMsR0FBc0MsSUFBSSxDQUFDO1FBRXBELGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsZ0JBQVcsR0FBRyxDQUFDLENBQUM7SUFJMEIsQ0FBQztJQUVuRCxJQUFZLEtBQUs7UUFDaEIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBMkMsRUFBRSxLQUF3QixFQUFFLGVBQW9EO1FBQ2pJLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQztRQUNyRCxNQUFNLFdBQVcsR0FBRyxJQUFJLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZELE9BQU8sSUFBSSxPQUFPLENBQXVCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQzVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSwwQkFBMEIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUU1RCxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDdkIsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUF5QixFQUFFLFNBQWlCLEVBQUUsRUFBRTtnQkFDakUsSUFBSSxNQUFNLFlBQVksZUFBZSxFQUFFLENBQUM7b0JBQ3ZDLHFDQUFxQztvQkFDckMsT0FBTztnQkFDUixDQUFDO2dCQUNELElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2hCLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUN0QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUMzQyxJQUFJLE1BQU0sWUFBWSxnQkFBZ0IsSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO3dCQUM5SSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQzt3QkFDdkIsVUFBVSxHQUFHLElBQUksQ0FBQzt3QkFDbEIsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUVyQixNQUFNLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQ2xGLENBQUM7b0JBRUQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDOUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxhQUFhLENBQUM7b0JBQ2xDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sWUFBWSxnQkFBZ0IsQ0FBQztvQkFFN0MsSUFBSSxhQUFhLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzdCLElBQUksQ0FBQyxTQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDeEMsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDO1lBRUYsdUJBQXVCO1lBQ3ZCLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDeEYsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsU0FBVSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUV4QixPQUFPLENBQUM7b0JBQ1AsUUFBUSxFQUFFLElBQUksQ0FBQyxVQUFVLElBQUksTUFBTSxFQUFFLFFBQVE7b0JBQzdDLFFBQVEsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDO29CQUM3QyxLQUFLLEVBQUU7d0JBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXO3FCQUN0QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLEVBQUUsQ0FBQyxHQUFVLEVBQUUsRUFBRTtnQkFDakIsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN0QixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sc0JBQXNCLENBQUMsTUFBOEM7UUFDNUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUFDLE9BQU8sRUFBRSxDQUFDO1FBQUMsQ0FBQztRQUNwQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFBQyxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFBQyxDQUFDO1FBQzdELE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVPLFVBQVUsQ0FBQyxNQUF5QjtRQUMzQyxJQUFJLE1BQU0sWUFBWSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDcEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDdEIsQ0FBQyxDQUFDO1FBQ0osQ0FBQzthQUNJLENBQUM7WUFDTCw0REFBNEQ7WUFDNUQsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO0lBQ0YsQ0FBQztJQUVPLGdCQUFnQixDQUFDLE1BQXdCLEVBQUUsSUFBWTtRQUM5RCxPQUFPLElBQUksZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzNGLENBQUM7SUFFTyxLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWtDLEVBQUUsUUFBZ0UsRUFBRSxLQUF3QixFQUFFLGVBQW9EO1FBQzFNLE1BQU0sY0FBYyxHQUEyQyxJQUFJLHFCQUFxQixDQUN2RixhQUFhLEVBQ2IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDVCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3pELENBQUMsRUFDRCxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQ1YsQ0FBQztRQUVGLE1BQU0sU0FBUyxHQUFvQixFQUFFLENBQUM7UUFDdEMsTUFBTSxRQUFRLEdBQUc7WUFDaEIsTUFBTSxFQUFFLENBQUMsTUFBMEMsRUFBRSxFQUFFO2dCQUN0RCxJQUFJLE1BQU0sWUFBWSxlQUFlLEVBQUUsQ0FBQztvQkFDdkMsZUFBZSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLE1BQU0sQ0FBQyxHQUFHLEtBQUssU0FBUyxFQUFFLENBQUM7d0JBQzlCLE1BQU0sS0FBSyxDQUFDLDRFQUE0RSxDQUFDLENBQUM7b0JBQzNGLENBQUM7b0JBQ0QsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLDRCQUE0QixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDNUUsSUFBSSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO3dCQUNqQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7NEJBQzlELG1CQUFtQixDQUFDLEdBQUcsRUFBRTtnQ0FDeEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDOzRCQUM5RCxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUNKLFNBQVMsQ0FBQzt3QkFFWCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUM1RSxJQUFJLFlBQVksRUFBRSxDQUFDOzRCQUNsQixzRUFBc0U7NEJBQ3RFLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDOzRCQUNoSCxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2dDQUMxQixTQUFTLENBQUMsSUFBSSxDQUNiLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUU7b0NBQzFCLElBQUksVUFBVSxFQUFFLENBQUM7d0NBQ2hCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO29DQUN6QyxDQUFDO2dDQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ04sQ0FBQztpQ0FBTSxJQUFJLFFBQVEsRUFBRSxDQUFDO2dDQUNyQixRQUFRLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQzs0QkFDekMsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDO1FBRUYsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sYUFBYSxHQUE4QjtZQUNoRCxhQUFhO1lBQ2IsV0FBVyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVztZQUNuQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLElBQUksMEJBQTBCO1lBQy9ELGNBQWMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsSUFBSSxtQ0FBbUM7WUFDaEYsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsSUFBSSxDQUFDO1NBQ3RELENBQUM7UUFDRixJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDSSxhQUFjLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2pGLENBQUM7UUFFRCxJQUFJLE1BQU0sQ0FBQztRQUNYLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxJQUFJLDZCQUFxQixFQUFFLENBQUM7WUFDNUQsTUFBTSxHQUFHLE1BQU8sSUFBSSxDQUFDLGlCQUE4QyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RMLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLE1BQU8sSUFBSSxDQUFDLGlCQUE0QyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdE0sQ0FBQztRQUNELElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3RCLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM5QixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU8seUJBQXlCLENBQUMsRUFBcUI7UUFDdEQsTUFBTSxRQUFRLEdBQUcsMEJBQTBCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRTFGLElBQUksY0FBYyxHQUFHLEVBQUUsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqRCxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU07WUFDaEIsUUFBUSxFQUFFLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUM7U0FDMUUsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsY0FBYyxJQUFJLGNBQWMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEQsY0FBYyxHQUFHLENBQUM7b0JBQ2pCLE1BQU0sRUFBRSxTQUFTO29CQUNqQixRQUFRLEVBQUUsMEJBQTBCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDO2lCQUMxRSxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFdEQsTUFBTSxPQUFPLEdBQUc7WUFDZixNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDO1lBQzNCLFFBQVE7WUFDUixRQUFRO1lBQ1IsY0FBYyxFQUFFO2dCQUNmLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxvQkFBb0I7Z0JBQy9CLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQywwQkFBMEI7Z0JBQ3RDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQywwQkFBMEI7YUFDdEM7WUFDRCxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUMsY0FBYztZQUNsQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDcEYsY0FBYyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQyxjQUFjO1NBQzlELENBQUM7UUFDRixPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0NBQ0Q7QUFFRCxTQUFTLGtCQUFrQixDQUFDLFdBQXlCO0lBQ3BELE9BQU87UUFDTixlQUFlLEVBQUUsV0FBVyxDQUFDLGVBQWUsSUFBSSxLQUFLO1FBQ3JELFFBQVEsRUFBRSxXQUFXLENBQUMsUUFBUSxJQUFJLEtBQUs7UUFDdkMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxXQUFXLElBQUksS0FBSztRQUM3QyxXQUFXLEVBQUUsV0FBVyxDQUFDLFdBQVcsSUFBSSxLQUFLO1FBQzdDLE9BQU8sRUFBRSxXQUFXLENBQUMsT0FBTztLQUM1QixDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sT0FBTywwQkFBMEI7SUFPdEMsWUFBb0IsU0FBeUM7UUFBekMsY0FBUyxHQUFULFNBQVMsQ0FBZ0M7UUFKckQsc0JBQWlCLEdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFL0Isc0JBQWlCLEdBQXNCLElBQUksQ0FBQztRQUduRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBYSxHQUFHLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVELEdBQUcsQ0FBQyxJQUF1QixFQUFFLFNBQWlCO1FBQzdDLDRGQUE0RjtRQUM1Rix1SEFBdUg7UUFDdkgseUZBQXlGO1FBQ3pGLElBQUksSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixLQUFLLFNBQVMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3hILElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1FBQy9CLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFNBQVMsQ0FBQztZQUNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7WUFDNUIsSUFBSSxDQUFDLGlCQUFpQixHQUFHO2dCQUN4QixRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUc7Z0JBQ2xCLE9BQU8sRUFBRSxFQUFFO2FBQ1gsQ0FBQztRQUNILENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBUSxDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFTyxlQUFlO1FBQ3RCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2QyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxpQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsS0FBSztRQUNKLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVPLFNBQVMsQ0FBQyxLQUFtQjtRQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7Q0FDRDtBQUVELFNBQVMsK0JBQStCLENBQUMsSUFBdUI7SUFDL0QsMkdBQTJHO0lBQzNHLElBQUksSUFBSSxZQUFZLGdCQUFnQixFQUFFLENBQUM7UUFDdEMsT0FBTztZQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixjQUFjLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQyxPQUFPLEVBQUU7b0JBQ1IsZUFBZSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUk7b0JBQzFDLFdBQVcsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxTQUFTO29CQUMzQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSTtvQkFDdEMsU0FBUyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFNBQVM7aUJBQ2hCO2dCQUN4QixNQUFNLEVBQUU7b0JBQ1AsZUFBZSxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUk7b0JBQ3pDLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTO29CQUMxQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSTtvQkFDckMsU0FBUyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFNBQVM7aUJBQ2Y7YUFDeEIsQ0FBQyxDQUFDO1NBQ3dCLENBQUM7SUFDOUIsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPO1lBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO1NBQ0UsQ0FBQztJQUNoQyxDQUFDO0FBQ0YsQ0FBQztBQUdEOzs7OztHQUtHO0FBQ0gsTUFBTSxPQUFPLGdCQUFnQjthQUNKLFlBQU8sR0FBRyxJQUFJLEFBQVAsQ0FBUTtJQUV2QyxvRkFBb0Y7YUFDNUQsNEJBQXVCLEdBQUcsRUFBRSxBQUFMLENBQU07SUFPckQsWUFBb0IsWUFBb0IsRUFBVSxFQUF3QjtRQUF0RCxpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUFVLE9BQUUsR0FBRixFQUFFLENBQXNCO1FBTGxFLHlCQUFvQixHQUFHLENBQUMsQ0FBQztRQUN6QixVQUFLLEdBQVEsRUFBRSxDQUFDO1FBQ2hCLGNBQVMsR0FBRyxDQUFDLENBQUM7SUFJdEIsQ0FBQztJQUVELE9BQU8sQ0FBQyxJQUFPLEVBQUUsSUFBWTtRQUM1QixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxRQUFRLENBQUMsS0FBVSxFQUFFLElBQVk7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRU8sY0FBYyxDQUFDLElBQU8sRUFBRSxJQUFZO1FBQzNDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBRU8sZUFBZSxDQUFDLElBQVMsRUFBRSxJQUFZO1FBQzlDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFTyxRQUFRO1FBQ2YsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsZ0JBQWdCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUMxRSx1Q0FBdUM7WUFDdkMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2QsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDaEQsa0NBQWtDO1lBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLENBQUM7YUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ2hDLCtDQUErQztZQUMvQyxJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNkLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsb0JBQW9CLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUM1QyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNwQixJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztZQUVuQixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEIsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDakMsSUFBSSxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDIn0=