/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../base/common/glob.js';
import { URI } from '../../../../base/common/uri.js';
import { LocalFileSearchWorkerHost } from '../common/localFileSearchWorkerTypes.js';
import * as paths from '../../../../base/common/path.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getFileResults } from '../common/getFileResults.js';
import { IgnoreFile } from '../common/ignoreFile.js';
import { createRegExp } from '../../../../base/common/strings.js';
import { Promises } from '../../../../base/common/async.js';
import { ExtUri } from '../../../../base/common/resources.js';
import { revive } from '../../../../base/common/marshalling.js';
const PERF = false;
const globalStart = +new Date();
const itrcount = {};
const time = async (name, task) => {
    if (!PERF) {
        return task();
    }
    const start = Date.now();
    const itr = (itrcount[name] ?? 0) + 1;
    console.info(name, itr, 'starting', Math.round((start - globalStart) * 10) / 10000);
    itrcount[name] = itr;
    const r = await task();
    const end = Date.now();
    console.info(name, itr, 'took', end - start);
    return r;
};
export function create(workerServer) {
    return new LocalFileSearchWorker(workerServer);
}
export class LocalFileSearchWorker {
    constructor(workerServer) {
        this._requestHandlerBrand = undefined;
        this.cancellationTokens = new Map();
        this.host = LocalFileSearchWorkerHost.getChannel(workerServer);
    }
    $cancelQuery(queryId) {
        this.cancellationTokens.get(queryId)?.cancel();
    }
    registerCancellationToken(queryId) {
        const source = new CancellationTokenSource();
        this.cancellationTokens.set(queryId, source);
        return source;
    }
    async $listDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
        const revivedFolderQuery = reviveFolderQuery(folderQuery);
        const extUri = new ExtUri(() => ignorePathCasing);
        const token = this.registerCancellationToken(queryId);
        const entries = [];
        let limitHit = false;
        let count = 0;
        const max = query.maxResults || 512;
        const filePatternMatcher = query.filePattern
            ? (name) => query.filePattern.split('').every(c => name.includes(c))
            : (name) => true;
        await time('listDirectory', () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedFolderQuery, extUri, file => {
            if (!filePatternMatcher(file.name)) {
                return;
            }
            count++;
            if (max && count > max) {
                limitHit = true;
                token.cancel();
            }
            return entries.push(file.path);
        }, token.token));
        return {
            results: entries,
            limitHit
        };
    }
    async $searchDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
        const revivedQuery = reviveFolderQuery(folderQuery);
        const extUri = new ExtUri(() => ignorePathCasing);
        return time('searchInFiles', async () => {
            const token = this.registerCancellationToken(queryId);
            const results = [];
            const pattern = createSearchRegExp(query.contentPattern);
            const onGoingProcesses = [];
            let fileCount = 0;
            let resultCount = 0;
            const limitHit = false;
            const processFile = async (file) => {
                if (token.token.isCancellationRequested) {
                    return;
                }
                fileCount++;
                const contents = await file.resolve();
                if (token.token.isCancellationRequested) {
                    return;
                }
                const bytes = new Uint8Array(contents);
                const fileResults = getFileResults(bytes, pattern, {
                    surroundingContext: query.surroundingContext ?? 0,
                    previewOptions: query.previewOptions,
                    remainingResultQuota: query.maxResults ? (query.maxResults - resultCount) : 10000,
                });
                if (fileResults.length) {
                    resultCount += fileResults.length;
                    if (query.maxResults && resultCount > query.maxResults) {
                        token.cancel();
                    }
                    const match = {
                        resource: URI.joinPath(revivedQuery.folder, file.path),
                        results: fileResults,
                    };
                    this.host.$sendTextSearchMatch(match, queryId);
                    results.push(match);
                }
            };
            await time('walkFolderToResolve', () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedQuery, extUri, async (file) => onGoingProcesses.push(processFile(file)), token.token));
            await time('resolveOngoingProcesses', () => Promise.all(onGoingProcesses));
            if (PERF) {
                console.log('Searched in', fileCount, 'files');
            }
            return {
                results,
                limitHit,
            };
        });
    }
    async walkFolderQuery(handle, queryProps, folderQuery, extUri, onFile, token) {
        const ignoreGlobCase = queryProps.ignoreGlobCase || folderQuery.ignoreGlobCase;
        const globOptions = { trimForExclusions: true, ignoreCase: ignoreGlobCase };
        const folderExcludes = folderQuery.excludePattern?.map(excludePattern => glob.parse(excludePattern.pattern ?? {}, globOptions));
        const evalFolderExcludes = (path, basename, hasSibling) => {
            return folderExcludes?.some(folderExclude => {
                return folderExclude(path, basename, hasSibling);
            });
        };
        // For folders, only check if the folder is explicitly excluded so walking continues.
        const isFolderExcluded = (path, basename, hasSibling) => {
            path = path.slice(1);
            if (evalFolderExcludes(path, basename, hasSibling)) {
                return true;
            }
            if (pathExcludedInQuery(queryProps, path)) {
                return true;
            }
            return false;
        };
        // For files ensure the full check takes place.
        const isFileIncluded = (path, basename, hasSibling) => {
            path = path.slice(1);
            if (evalFolderExcludes(path, basename, hasSibling)) {
                return false;
            }
            if (!pathIncludedInQuery(queryProps, path, extUri)) {
                return false;
            }
            return true;
        };
        const processFile = (file, prior) => {
            const resolved = {
                type: 'file',
                name: file.name,
                path: prior,
                resolve: () => file.getFile().then(r => r.arrayBuffer())
            };
            return resolved;
        };
        const isFileSystemDirectoryHandle = (handle) => {
            return handle.kind === 'directory';
        };
        const isFileSystemFileHandle = (handle) => {
            return handle.kind === 'file';
        };
        const processDirectory = async (directory, prior, ignoreFile) => {
            if (!folderQuery.disregardIgnoreFiles) {
                const ignoreFiles = await Promise.all([
                    directory.getFileHandle('.gitignore').catch(e => undefined),
                    directory.getFileHandle('.ignore').catch(e => undefined),
                ]);
                await Promise.all(ignoreFiles.map(async (file) => {
                    if (!file) {
                        return;
                    }
                    const ignoreContents = new TextDecoder('utf8').decode(new Uint8Array(await (await file.getFile()).arrayBuffer()));
                    ignoreFile = new IgnoreFile(ignoreContents, prior, ignoreFile, ignoreGlobCase);
                }));
            }
            const entries = Promises.withAsyncBody(async (c) => {
                const files = [];
                const dirs = [];
                const entries = [];
                const sibilings = new Set();
                for await (const entry of directory.entries()) {
                    entries.push(entry);
                    sibilings.add(entry[0]);
                }
                for (const [basename, handle] of entries) {
                    if (token.isCancellationRequested) {
                        break;
                    }
                    const path = prior + basename;
                    if (ignoreFile && !ignoreFile.isPathIncludedInTraversal(path, handle.kind === 'directory')) {
                        continue;
                    }
                    const hasSibling = (query) => sibilings.has(query);
                    if (isFileSystemDirectoryHandle(handle) && !isFolderExcluded(path, basename, hasSibling)) {
                        dirs.push(processDirectory(handle, path + '/', ignoreFile));
                    }
                    else if (isFileSystemFileHandle(handle) && isFileIncluded(path, basename, hasSibling)) {
                        files.push(processFile(handle, path));
                    }
                }
                c([...await Promise.all(dirs), ...files]);
            });
            return {
                type: 'dir',
                name: directory.name,
                entries
            };
        };
        const resolveDirectory = async (directory, onFile) => {
            if (token.isCancellationRequested) {
                return;
            }
            await Promise.all((await directory.entries)
                .sort((a, b) => -(a.type === 'dir' ? 0 : 1) + (b.type === 'dir' ? 0 : 1))
                .map(async (entry) => {
                if (entry.type === 'dir') {
                    return resolveDirectory(entry, onFile);
                }
                else {
                    return onFile(entry);
                }
            }));
        };
        const processed = await time('process', () => processDirectory(handle, '/'));
        await time('resolve', () => resolveDirectory(processed, onFile));
    }
}
function createSearchRegExp(options) {
    return createRegExp(options.pattern, !!options.isRegExp, {
        wholeWord: options.isWordMatch,
        global: true,
        matchCase: options.isCaseSensitive,
        multiline: true,
        unicode: true,
    });
}
function reviveFolderQuery(folderQuery) {
    // @todo: andrea - try to see why we can't just call 'revive' here
    return revive({
        ...revive(folderQuery),
        excludePattern: folderQuery.excludePattern?.map(ep => ({ folder: URI.revive(ep.folder), pattern: ep.pattern })),
        folder: URI.revive(folderQuery.folder),
    });
}
function reviveQueryProps(queryProps) {
    return {
        ...queryProps,
        extraFileResources: queryProps.extraFileResources?.map(r => URI.revive(r)),
        folderQueries: queryProps.folderQueries.map(fq => reviveFolderQuery(fq)),
    };
}
function pathExcludedInQuery(queryProps, fsPath) {
    const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : undefined;
    if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
        return true;
    }
    return false;
}
function pathIncludedInQuery(queryProps, path, extUri) {
    const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : undefined;
    if (queryProps.excludePattern && glob.match(queryProps.excludePattern, path, globOptions)) {
        return false;
    }
    if (queryProps.includePattern || queryProps.usingSearchPaths) {
        if (queryProps.includePattern && glob.match(queryProps.includePattern, path, globOptions)) {
            return true;
        }
        // If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
        if (queryProps.usingSearchPaths) {
            return !!queryProps.folderQueries && queryProps.folderQueries.some(fq => {
                const searchPath = fq.folder;
                const uri = URI.file(path);
                if (extUri.isEqualOrParent(uri, searchPath)) {
                    const relPath = paths.relative(searchPath.path, uri.path);
                    return !fq.includePattern || !!glob.match(fq.includePattern, relPath, globOptions);
                }
                else {
                    return false;
                }
            });
        }
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxGaWxlU2VhcmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC93b3JrZXIvbG9jYWxGaWxlU2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFpQixHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVwRSxPQUFPLEVBQTBCLHlCQUF5QixFQUFtSCxNQUFNLHlDQUF5QyxDQUFDO0FBRTdOLE9BQU8sS0FBSyxLQUFLLE1BQU0saUNBQWlDLENBQUM7QUFDekQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWhFLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQztBQWVuQixNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7QUFDaEMsTUFBTSxRQUFRLEdBQTJCLEVBQUUsQ0FBQztBQUM1QyxNQUFNLElBQUksR0FBRyxLQUFLLEVBQUssSUFBWSxFQUFFLElBQTBCLEVBQUUsRUFBRTtJQUNsRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFBQyxPQUFPLElBQUksRUFBRSxDQUFDO0lBQUMs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