var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ResourceSet, ResourceMap } from '../../../../../base/common/map.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from './searchNotebookHelpers.js';
import { pathIncludedInQuery, ISearchService, DEFAULT_MAX_SEARCH_RESULTS } from '../../../../services/search/common/search.js';
import * as arrays from '../../../../../base/common/arrays.js';
import { isNumber } from '../../../../../base/common/types.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
let NotebookSearchService = class NotebookSearchService {
    constructor(uriIdentityService, notebookEditorService, logService, notebookService, configurationService, editorResolverService, searchService, instantiationService) {
        this.uriIdentityService = uriIdentityService;
        this.notebookEditorService = notebookEditorService;
        this.logService = logService;
        this.notebookService = notebookService;
        this.configurationService = configurationService;
        this.editorResolverService = editorResolverService;
        this.searchService = searchService;
        this.queryBuilder = instantiationService.createInstance(QueryBuilder);
    }
    notebookSearch(query, token, searchInstanceID, onProgress) {
        if (query.type !== 2 /* QueryType.Text */) {
            return {
                openFilesToScan: new ResourceSet(),
                completeData: Promise.resolve({
                    messages: [],
                    limitHit: false,
                    results: [],
                }),
                allScannedFiles: Promise.resolve(new ResourceSet()),
            };
        }
        const localNotebookWidgets = this.getLocalNotebookWidgets();
        const localNotebookFiles = localNotebookWidgets.map(widget => widget.viewModel.uri);
        const getAllResults = () => {
            const searchStart = Date.now();
            const localResultPromise = this.getLocalNotebookResults(query, token ?? CancellationToken.None, localNotebookWidgets, searchInstanceID);
            const searchLocalEnd = Date.now();
            const experimentalNotebooksEnabled = this.configurationService.getValue('search').experimental?.closedNotebookRichContentResults ?? false;
            let closedResultsPromise = Promise.resolve(undefined);
            if (experimentalNotebooksEnabled) {
                closedResultsPromise = this.getClosedNotebookResults(query, new ResourceSet(localNotebookFiles, uri => this.uriIdentityService.extUri.getComparisonKey(uri)), token ?? CancellationToken.None);
            }
            const promise = Promise.all([localResultPromise, closedResultsPromise]);
            return {
                completeData: promise.then((resolvedPromise) => {
                    const openNotebookResult = resolvedPromise[0];
                    const closedNotebookResult = resolvedPromise[1];
                    const resolved = resolvedPromise.filter((e) => !!e);
                    const resultArray = [...openNotebookResult.results.values(), ...closedNotebookResult?.results.values() ?? []];
                    const results = arrays.coalesce(resultArray);
                    if (onProgress) {
                        results.forEach(onProgress);
                    }
                    this.logService.trace(`local notebook search time | ${searchLocalEnd - searchStart}ms`);
                    return {
                        messages: [],
                        limitHit: resolved.reduce((prev, cur) => prev || cur.limitHit, false),
                        results,
                    };
                }),
                allScannedFiles: promise.then(resolvedPromise => {
                    const openNotebookResults = resolvedPromise[0];
                    const closedNotebookResults = resolvedPromise[1];
                    const results = arrays.coalesce([...openNotebookResults.results.keys(), ...closedNotebookResults?.results.keys() ?? []]);
                    return new ResourceSet(results, uri => this.uriIdentityService.extUri.getComparisonKey(uri));
                })
            };
        };
        const promiseResults = getAllResults();
        return {
            openFilesToScan: new ResourceSet(localNotebookFiles),
            completeData: promiseResults.completeData,
            allScannedFiles: promiseResults.allScannedFiles
        };
    }
    async doesFileExist(includes, folderQueries, token) {
        const promises = includes.map(async (includePattern) => {
            const query = this.queryBuilder.file(folderQueries.map(e => e.folder), {
                includePattern: includePattern.startsWith('/') ? includePattern : '**/' + includePattern, // todo: find cleaner way to ensure that globs match all appropriate filetypes
                exists: true,
                onlyFileScheme: true,
            });
            return this.searchService.fileSearch(query, token).then((ret) => {
                return !!ret.limitHit;
            });
        });
        return Promise.any(promises);
    }
    async getClosedNotebookResults(textQuery, scannedFiles, token) {
        const userAssociations = this.editorResolverService.getAllUserAssociations();
        const allPriorityInfo = new Map();
        const contributedNotebookTypes = this.notebookService.getContributedNotebookTypes();
        userAssociations.forEach(association => {
            // we gather the editor associations here, but cannot check them until we actually have the files that the glob matches
            // this is because longer patterns take precedence over shorter ones, and even if there is a user association that
            // specifies the exact same glob as a contributed notebook type, there might be another user association that is longer/more specific
            // that still matches the path and should therefore take more precedence.
            if (!association.filenamePattern) {
                return;
            }
            const info = {
                isFromSettings: true,
                filenamePatterns: [association.filenamePattern]
            };
            const existingEntry = allPriorityInfo.get(association.viewType);
            if (existingEntry) {
                allPriorityInfo.set(association.viewType, existingEntry.concat(info));
            }
            else {
                allPriorityInfo.set(association.viewType, [info]);
            }
        });
        const promises = [];
        contributedNotebookTypes.forEach((notebook) => {
            if (notebook.selectors.length > 0) {
                promises.push((async () => {
                    const includes = notebook.selectors.map((selector) => {
                        const globPattern = selector.include || selector;
                        return globPattern.toString();
                    });
                    const isInWorkspace = await this.doesFileExist(includes, textQuery.folderQueries, token);
                    if (isInWorkspace) {
                        const canResolve = await this.notebookService.canResolve(notebook.id);
                        if (!canResolve) {
                            return undefined;
                        }
                        const serializer = (await this.notebookService.withNotebookDataProvider(notebook.id)).serializer;
                        return await serializer.searchInNotebooks(textQuery, token, allPriorityInfo);
                    }
                    else {
                        return undefined;
                    }
                })());
            }
        });
        const start = Date.now();
        const searchComplete = arrays.coalesce(await Promise.all(promises));
        const results = searchComplete.flatMap(e => e.results);
        let limitHit = searchComplete.some(e => e.limitHit);
        // results are already sorted with high priority first, filter out duplicates.
        const uniqueResults = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        let numResults = 0;
        for (const result of results) {
            if (textQuery.maxResults && numResults >= textQuery.maxResults) {
                limitHit = true;
                break;
            }
            if (!scannedFiles.has(result.resource) && !uniqueResults.has(result.resource)) {
                uniqueResults.set(result.resource, result.cellResults.length > 0 ? result : null);
                numResults++;
            }
        }
        const end = Date.now();
        this.logService.trace(`query: ${textQuery.contentPattern.pattern}`);
        this.logService.trace(`closed notebook search time | ${end - start}ms`);
        return {
            results: uniqueResults,
            limitHit
        };
    }
    async getLocalNotebookResults(query, token, widgets, searchID) {
        const localResults = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        let limitHit = false;
        for (const widget of widgets) {
            if (!widget.hasModel()) {
                continue;
            }
            const askMax = (isNumber(query.maxResults) ? query.maxResults : DEFAULT_MAX_SEARCH_RESULTS) + 1;
            const uri = widget.viewModel.uri;
            if (!pathIncludedInQuery(query, uri.fsPath)) {
                continue;
            }
            let matches = await widget
                .find(query.contentPattern.pattern, {
                regex: query.contentPattern.isRegExp,
                wholeWord: query.contentPattern.isWordMatch,
                caseSensitive: query.contentPattern.isCaseSensitive,
                includeMarkupInput: query.contentPattern.notebookInfo?.isInNotebookMarkdownInput ?? true,
                includeMarkupPreview: query.contentPattern.notebookInfo?.isInNotebookMarkdownPreview ?? true,
                includeCodeInput: query.contentPattern.notebookInfo?.isInNotebookCellInput ?? true,
                includeOutput: query.contentPattern.notebookInfo?.isInNotebookCellOutput ?? true,
            }, token, false, true, searchID);
            if (matches.length) {
                if (askMax && matches.length >= askMax) {
                    limitHit = true;
                    matches = matches.slice(0, askMax - 1);
                }
                const cellResults = matches.map(match => {
                    const contentResults = contentMatchesToTextSearchMatches(match.contentMatches, match.cell);
                    const webviewResults = webviewMatchesToTextSearchMatches(match.webviewMatches);
                    return {
                        cell: match.cell,
                        index: match.index,
                        contentResults: contentResults,
                        webviewResults: webviewResults,
                    };
                });
                const fileMatch = {
                    resource: uri, cellResults: cellResults
                };
                localResults.set(uri, fileMatch);
            }
            else {
                localResults.set(uri, null);
            }
        }
        return {
            results: localResults,
            limitHit
        };
    }
    getLocalNotebookWidgets() {
        const notebookWidgets = this.notebookEditorService.retrieveAllExistingWidgets();
        return notebookWidgets
            .map(widget => widget.value)
            .filter((val) => !!val && val.hasModel());
    }
};
NotebookSearchService = __decorate([
    __param(0, IUriIdentityService),
    __param(1, INotebookEditorService),
    __param(2, ILogService),
    __param(3, INotebookService),
    __param(4, IConfigurationService),
    __param(5, IEditorResolverService),
    __param(6, ISearchService),
    __param(7, IInstantiationService)
], NotebookSearchService);
export { NotebookSearchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZWFyY2hTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvbm90ZWJvb2tTZWFyY2gvbm90ZWJvb2tTZWFyY2hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFN0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRS9FLE9BQU8sRUFBNEQsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1SyxPQUFPLEVBQStGLG1CQUFtQixFQUFFLGNBQWMsRUFBZ0IsMEJBQTBCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMxTyxPQUFPLEtBQUssTUFBTSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVyRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUdyRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7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