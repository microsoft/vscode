/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from '../../../../base/common/path.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import * as strings from '../../../../base/common/strings.js';
import * as glob from '../../../../base/common/glob.js';
import * as resources from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { QueryGlobTester, resolvePatternsForProvider, hasSiblingFn, excludeToGlobPattern, DEFAULT_MAX_SEARCH_RESULTS } from './search.js';
import { OldFileSearchProviderConverter } from './searchExtConversionTypes.js';
import { FolderQuerySearchTree } from './folderQuerySearchTree.js';
class FileSearchEngine {
    constructor(config, provider, sessionLifecycle) {
        this.config = config;
        this.provider = provider;
        this.sessionLifecycle = sessionLifecycle;
        this.isLimitHit = false;
        this.resultCount = 0;
        this.isCanceled = false;
        this.filePattern = config.filePattern;
        const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : undefined;
        this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
        this.maxResults = config.maxResults || undefined;
        this.exists = config.exists;
        this.activeCancellationTokens = new Set();
        this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern, globOptions);
    }
    cancel() {
        this.isCanceled = true;
        this.activeCancellationTokens.forEach(t => t.cancel());
        this.activeCancellationTokens = new Set();
    }
    search(_onResult) {
        const folderQueries = this.config.folderQueries || [];
        return new Promise((resolve, reject) => {
            const onResult = (match) => {
                this.resultCount++;
                _onResult(match);
            };
            // Support that the file pattern is a full path to a file that exists
            if (this.isCanceled) {
                return resolve({ limitHit: this.isLimitHit });
            }
            // For each extra file
            if (this.config.extraFileResources) {
                this.config.extraFileResources
                    .forEach(extraFile => {
                    const extraFileStr = extraFile.toString(); // ?
                    const basename = path.basename(extraFileStr);
                    if (this.globalExcludePattern && this.globalExcludePattern(extraFileStr, basename)) {
                        return; // excluded
                    }
                    // File: Check for match on file pattern and include pattern
                    this.matchFile(onResult, { base: extraFile, basename });
                });
            }
            // For each root folder'
            // NEW: can just call with an array of folder info
            this.doSearch(folderQueries, onResult).then(stats => {
                resolve({
                    limitHit: this.isLimitHit,
                    stats: stats || undefined // Only looking at single-folder workspace stats...
                });
            }, (err) => {
                reject(new Error(toErrorMessage(err)));
            });
        });
    }
    async doSearch(fqs, onResult) {
        const cancellation = new CancellationTokenSource();
        const folderOptions = fqs.map(fq => this.getSearchOptionsForFolder(fq));
        const session = this.provider instanceof OldFileSearchProviderConverter ? this.sessionLifecycle?.tokenSource.token : this.sessionLifecycle?.obj;
        const options = {
            folderOptions,
            maxResults: this.config.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
            session
        };
        const getFolderQueryInfo = (fq) => {
            const queryTester = new QueryGlobTester(this.config, fq);
            const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();
            return { queryTester, noSiblingsClauses, folder: fq.folder, tree: this.initDirectoryTree() };
        };
        const folderMappings = new FolderQuerySearchTree(fqs, getFolderQueryInfo);
        let providerSW;
        try {
            this.activeCancellationTokens.add(cancellation);
            providerSW = StopWatch.create();
            const results = await this.provider.provideFileSearchResults(this.config.filePattern || '', options, cancellation.token);
            const providerTime = providerSW.elapsed();
            const postProcessSW = StopWatch.create();
            if (this.isCanceled && !this.isLimitHit) {
                return null;
            }
            if (results) {
                results.forEach(result => {
                    const fqFolderInfo = folderMappings.findQueryFragmentAwareSubstr(result);
                    const relativePath = path.posix.relative(fqFolderInfo.folder.path, result.path);
                    if (fqFolderInfo.noSiblingsClauses) {
                        const basename = path.basename(result.path);
                        this.matchFile(onResult, { base: fqFolderInfo.folder, relativePath, basename });
                        return;
                    }
                    // TODO: Optimize siblings clauses with ripgrep here.
                    this.addDirectoryEntries(fqFolderInfo.tree, fqFolderInfo.folder, relativePath, onResult);
                });
            }
            if (this.isCanceled && !this.isLimitHit) {
                return null;
            }
            folderMappings.forEachFolderQueryInfo(e => {
                this.matchDirectoryTree(e.tree, e.queryTester, onResult);
            });
            return {
                providerTime,
                postProcessTime: postProcessSW.elapsed()
            };
        }
        finally {
            cancellation.dispose();
            this.activeCancellationTokens.delete(cancellation);
        }
    }
    getSearchOptionsForFolder(fq) {
        const includes = resolvePatternsForProvider(this.config.includePattern, fq.includePattern);
        let excludePattern = fq.excludePattern?.map(e => ({
            folder: e.folder,
            patterns: resolvePatternsForProvider(this.config.excludePattern, e.pattern)
        }));
        if (!excludePattern?.length) {
            excludePattern = [{
                    folder: undefined,
                    patterns: resolvePatternsForProvider(this.config.excludePattern, undefined)
                }];
        }
        const excludes = excludeToGlobPattern(excludePattern);
        return {
            folder: fq.folder,
            excludes,
            includes,
            useIgnoreFiles: {
                local: !fq.disregardIgnoreFiles,
                parent: !fq.disregardParentIgnoreFiles,
                global: !fq.disregardGlobalIgnoreFiles
            },
            followSymlinks: !fq.ignoreSymlinks,
        };
    }
    initDirectoryTree() {
        const tree = {
            rootEntries: [],
            pathToEntries: Object.create(null)
        };
        tree.pathToEntries['.'] = tree.rootEntries;
        return tree;
    }
    addDirectoryEntries({ pathToEntries }, base, relativeFile, onResult) {
        // Support relative paths to files from a root resource (ignores excludes)
        if (this.filePattern && strings.equals(relativeFile, this.filePattern, this.config.ignoreGlobCase)) {
            const basename = path.basename(this.filePattern);
            this.matchFile(onResult, { base: base, relativePath: this.filePattern, basename });
        }
        function add(relativePath) {
            const basename = path.basename(relativePath);
            const dirname = path.dirname(relativePath);
            let entries = pathToEntries[dirname];
            if (!entries) {
                entries = pathToEntries[dirname] = [];
                add(dirname);
            }
            entries.push({
                base,
                relativePath,
                basename
            });
        }
        add(relativeFile);
    }
    matchDirectoryTree({ rootEntries, pathToEntries }, queryTester, onResult) {
        const self = this;
        const filePattern = this.filePattern;
        const ignoreGlobCase = this.config.ignoreGlobCase;
        function matchDirectory(entries) {
            const hasSibling = hasSiblingFn(() => entries.map(entry => entry.basename));
            for (let i = 0, n = entries.length; i < n; i++) {
                const entry = entries[i];
                const { relativePath, basename } = entry;
                // Check exclude pattern
                // If the user searches for the exact file name, we adjust the glob matching
                // to ignore filtering by siblings because the user seems to know what they
                // are searching for and we want to include the result in that case anyway
                if (queryTester.matchesExcludesSync(relativePath, basename, !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : undefined)) {
                    continue;
                }
                const sub = pathToEntries[relativePath];
                if (sub) {
                    matchDirectory(sub);
                }
                else {
                    if (strings.equals(relativePath, filePattern, ignoreGlobCase)) {
                        continue; // ignore file if its path matches with the file pattern because that is already matched above
                    }
                    self.matchFile(onResult, entry);
                }
                if (self.isLimitHit) {
                    break;
                }
            }
        }
        matchDirectory(rootEntries);
    }
    matchFile(onResult, candidate) {
        if (!this.includePattern || (candidate.relativePath && this.includePattern(candidate.relativePath, candidate.basename))) {
            if (this.exists || (this.maxResults && this.resultCount >= this.maxResults)) {
                this.isLimitHit = true;
                this.cancel();
            }
            if (!this.isLimitHit) {
                onResult(candidate);
            }
        }
    }
}
/**
 * For backwards compatibility, store both a cancellation token and a session object. The session object is the new implementation, where
 */
class SessionLifecycle {
    constructor() {
        this._obj = new Object();
        this.tokenSource = new CancellationTokenSource();
    }
    get obj() {
        if (this._obj) {
            return this._obj;
        }
        throw new Error('Session object has been dereferenced.');
    }
    cancel() {
        this.tokenSource.cancel();
        this._obj = undefined; // dereference
    }
}
export class FileSearchManager {
    constructor() {
        this.sessions = new Map();
    }
    static { this.BATCH_SIZE = 512; }
    fileSearch(config, provider, onBatch, token) {
        const sessionTokenSource = this.getSessionTokenSource(config.cacheKey);
        const engine = new FileSearchEngine(config, provider, sessionTokenSource);
        let resultCount = 0;
        const onInternalResult = (batch) => {
            resultCount += batch.length;
            onBatch(batch.map(m => this.rawMatchToSearchItem(m)));
        };
        return this.doSearch(engine, FileSearchManager.BATCH_SIZE, onInternalResult, token).then(result => {
            return {
                limitHit: result.limitHit,
                stats: result.stats ? {
                    fromCache: false,
                    type: 'fileSearchProvider',
                    resultCount,
                    detailStats: result.stats
                } : undefined,
                messages: []
            };
        });
    }
    clearCache(cacheKey) {
        // cancel the token
        this.sessions.get(cacheKey)?.cancel();
        // with no reference to this, it will be removed from WeakMaps
        this.sessions.delete(cacheKey);
    }
    getSessionTokenSource(cacheKey) {
        if (!cacheKey) {
            return undefined;
        }
        if (!this.sessions.has(cacheKey)) {
            this.sessions.set(cacheKey, new SessionLifecycle());
        }
        return this.sessions.get(cacheKey);
    }
    rawMatchToSearchItem(match) {
        if (match.relativePath) {
            return {
                resource: resources.joinPath(match.base, match.relativePath)
            };
        }
        else {
            // extraFileResources
            return {
                resource: match.base
            };
        }
    }
    doSearch(engine, batchSize, onResultBatch, token) {
        const listener = token.onCancellationRequested(() => {
            engine.cancel();
        });
        const _onResult = (match) => {
            if (match) {
                batch.push(match);
                if (batchSize > 0 && batch.length >= batchSize) {
                    onResultBatch(batch);
                    batch = [];
                }
            }
        };
        let batch = [];
        return engine.search(_onResult).then(result => {
            if (batch.length) {
                onResultBatch(batch);
            }
            listener.dispose();
            return result;
        }, error => {
            if (batch.length) {
                onResultBatch(batch);
            }
            listener.dispose();
            return Promise.reject(error);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVNlYXJjaE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL2NvbW1vbi9maWxlU2VhcmNoTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBd0YsZUFBZSxFQUFFLDBCQUEwQixFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVoTyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQTRCbkUsTUFBTSxnQkFBZ0I7SUFhckIsWUFBb0IsTUFBa0IsRUFBVSxRQUE2QixFQUFVLGdCQUFtQztRQUF0RyxXQUFNLEdBQU4sTUFBTSxDQUFZO1FBQVUsYUFBUSxHQUFSLFFBQVEsQ0FBcUI7UUFBVSxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBUmxILGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsZ0JBQVcsR0FBRyxDQUFDLENBQUM7UUFDaEIsZUFBVSxHQUFHLEtBQUssQ0FBQztRQU8xQixJQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUM7UUFDdEMsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM3RSxJQUFJLENBQUMsY0FBYyxHQUFHLE1BQU0sQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzlGLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLFVBQVUsSUFBSSxTQUFTLENBQUM7UUFDakQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzVCLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztRQUVuRSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDckcsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUN2QixJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7SUFDM0MsQ0FBQztJQUVELE1BQU0sQ0FBQyxTQUE4QztRQUNwRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUM7UUFFdEQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUN0QyxNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQXlCLEVBQUUsRUFBRTtnQkFDOUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNuQixTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsQ0FBQyxDQUFDO1lBRUYscUVBQXFFO1lBQ3JFLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNyQixPQUFPLE9BQU8sQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUMvQyxDQUFDO1lBRUQsc0JBQXNCO1lBQ3RCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUNwQyxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQjtxQkFDNUIsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO29CQUNwQixNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJO29CQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUM3QyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUM7d0JBQ3BGLE9BQU8sQ0FBQyxXQUFXO29CQUNwQixDQUFDO29CQUVELDREQUE0RDtvQkFDNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ3pELENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELHdCQUF3QjtZQUV4QixrREFBa0Q7WUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUNuRCxPQUFPLENBQUM7b0JBQ1AsUUFBUSxFQUFFLElBQUksQ0FBQyxVQUFVO29CQUN6QixLQUFLLEVBQUUsS0FBSyxJQUFJLFNBQVMsQ0FBQyxtREFBbUQ7aUJBQzdFLENBQUMsQ0FBQztZQUNKLENBQUMsRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO2dCQUNqQixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUdPLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBd0IsRUFBRSxRQUE2QztRQUM3RixNQUFNLFlBQVksR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDbkQsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLFlBQVksOEJBQThCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDO1FBQ2hKLE1BQU0sT0FBTyxHQUE4QjtZQUMxQyxhQUFhO1lBQ2IsVUFBVSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxJQUFJLDBCQUEwQjtZQUNoRSxPQUFPO1NBQ1AsQ0FBQztRQUdGLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxFQUFnQixFQUFFLEVBQUU7WUFDL0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN6RCxNQUFNLGlCQUFpQixHQUFHLENBQUMsV0FBVyxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDbEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQztRQUM5RixDQUFDLENBQUM7UUFFRixNQUFNLGNBQWMsR0FBMkMsSUFBSSxxQkFBcUIsQ0FBa0IsR0FBRyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFbkksSUFBSSxVQUFxQixDQUFDO1FBRTFCLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFaEQsVUFBVSxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQzNELElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLEVBQUUsRUFDN0IsT0FBTyxFQUNQLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyQixNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBRXpDLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDekMsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBR0QsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUN4QixNQUFNLFlBQVksR0FBRyxjQUFjLENBQUMsNEJBQTRCLENBQUMsTUFBTSxDQUFFLENBQUM7b0JBQzFFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFFaEYsSUFBSSxZQUFZLENBQUMsaUJBQWlCLEVBQUUsQ0FBQzt3QkFDcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQzVDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7d0JBRWhGLE9BQU87b0JBQ1IsQ0FBQztvQkFFRCxxREFBcUQ7b0JBQ3JELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUMxRixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7WUFFRCxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3pDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUVELGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDekMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxRCxDQUFDLENBQUMsQ0FBQztZQUVILE9BQU87Z0JBQ04sWUFBWTtnQkFDWixlQUFlLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRTthQUN4QyxDQUFDO1FBQ0gsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNGLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxFQUFxQjtRQUN0RCxNQUFNLFFBQVEsR0FBRywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDM0YsSUFBSSxjQUFjLEdBQUcsRUFBRSxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTTtZQUNoQixRQUFRLEVBQUUsMEJBQTBCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQztTQUMzRSxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxjQUFjLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDN0IsY0FBYyxHQUFHLENBQUM7b0JBQ2pCLE1BQU0sRUFBRSxTQUFTO29CQUNqQixRQUFRLEVBQUUsMEJBQTBCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDO2lCQUMzRSxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFdEQsT0FBTztZQUNOLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTTtZQUNqQixRQUFRO1lBQ1IsUUFBUTtZQUNSLGNBQWMsRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsb0JBQW9CO2dCQUMvQixNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsMEJBQTBCO2dCQUN0QyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsMEJBQTBCO2FBQ3RDO1lBQ0QsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLGNBQWM7U0FDbEMsQ0FBQztJQUNILENBQUM7SUFFTyxpQkFBaUI7UUFDeEIsTUFBTSxJQUFJLEdBQW1CO1lBQzVCLFdBQVcsRUFBRSxFQUFFO1lBQ2YsYUFBYSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1NBQ2xDLENBQUM7UUFDRixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDM0MsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU8sbUJBQW1CLENBQUMsRUFBRSxhQUFhLEVBQWtCLEVBQUUsSUFBUyxFQUFFLFlBQW9CLEVBQUUsUUFBOEM7UUFDN0ksMEVBQTBFO1FBQzFFLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNwRyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNwRixDQUFDO1FBRUQsU0FBUyxHQUFHLENBQUMsWUFBb0I7WUFDaEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM3QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzNDLElBQUksT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQ3RDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNkLENBQUM7WUFDRCxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNaLElBQUk7Z0JBQ0osWUFBWTtnQkFDWixRQUFRO2FBQ1IsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRU8sa0JBQWtCLENBQUMsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFrQixFQUFFLFdBQTRCLEVBQUUsUUFBOEM7UUFDdEosTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUM7UUFDbEQsU0FBUyxjQUFjLENBQUMsT0FBMEI7WUFDakQsTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUM1RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2hELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekIsTUFBTSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLLENBQUM7Z0JBRXpDLHdCQUF3QjtnQkFDeEIsNEVBQTRFO2dCQUM1RSwyRUFBMkU7Z0JBQzNFLDBFQUEwRTtnQkFDMUUsSUFBSSxXQUFXLENBQUMsbUJBQW1CLENBQUMsWUFBWSxFQUFFLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO29CQUM5SSxTQUFTO2dCQUNWLENBQUM7Z0JBRUQsTUFBTSxHQUFHLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLEdBQUcsRUFBRSxDQUFDO29CQUNULGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDckIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUM7d0JBQy9ELFNBQVMsQ0FBQyw4RkFBOEY7b0JBQ3pHLENBQUM7b0JBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2pDLENBQUM7Z0JBRUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ3JCLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFTyxTQUFTLENBQUMsUUFBOEMsRUFBRSxTQUE2QjtRQUM5RixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDekgsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUM3RSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDdkIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2YsQ0FBQztZQUVELElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3RCLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNyQixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQU9EOztHQUVHO0FBQ0gsTUFBTSxnQkFBZ0I7SUFJckI7UUFDQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksTUFBTSxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7SUFDbEQsQ0FBQztJQUVELElBQVcsR0FBRztRQUNiLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2YsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsY0FBYztJQUN0QyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8saUJBQWlCO0lBQTlCO1FBSWtCLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztJQTJGakUsQ0FBQzthQTdGd0IsZUFBVSxHQUFHLEdBQUcsQUFBTixDQUFPO0lBSXpDLFVBQVUsQ0FBQyxNQUFrQixFQUFFLFFBQTZCLEVBQUUsT0FBd0MsRUFBRSxLQUF3QjtRQUMvSCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFMUUsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxLQUEyQixFQUFFLEVBQUU7WUFDeEQsV0FBVyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDNUIsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQztRQUVGLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsVUFBVSxFQUFFLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FDdkYsTUFBTSxDQUFDLEVBQUU7WUFDUixPQUFPO2dCQUNOLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUTtnQkFDekIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNyQixTQUFTLEVBQUUsS0FBSztvQkFDaEIsSUFBSSxFQUFFLG9CQUFvQjtvQkFDMUIsV0FBVztvQkFDWCxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ2IsUUFBUSxFQUFFLEVBQUU7YUFDWixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsVUFBVSxDQUFDLFFBQWdCO1FBQzFCLG1CQUFtQjtRQUNuQixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUN0Qyw4REFBOEQ7UUFDOUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLHFCQUFxQixDQUFDLFFBQTRCO1FBQ3pELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVPLG9CQUFvQixDQUFDLEtBQXlCO1FBQ3JELElBQUksS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hCLE9BQU87Z0JBQ04sUUFBUSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDO2FBQzVELENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNQLHFCQUFxQjtZQUNyQixPQUFPO2dCQUNOLFFBQVEsRUFBRSxLQUFLLENBQUMsSUFBSTthQUNwQixDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFFTyxRQUFRLENBQUMsTUFBd0IsRUFBRSxTQUFpQixFQUFFLGFBQXNELEVBQUUsS0FBd0I7UUFDN0ksTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtZQUNuRCxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQXlCLEVBQUUsRUFBRTtZQUMvQyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2xCLElBQUksU0FBUyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNoRCxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3JCLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ1osQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUM7UUFFRixJQUFJLEtBQUssR0FBeUIsRUFBRSxDQUFDO1FBQ3JDLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDN0MsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2xCLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QixDQUFDO1lBRUQsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ1YsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2xCLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QixDQUFDO1lBRUQsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMifQ==