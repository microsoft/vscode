/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import * as glob from 'vs/base/common/glob';
import { ResourceSet, ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookSearchService } from 'vs/workbench/contrib/search/common/notebookSearch';
import { INotebookCellMatchWithModel, INotebookFileMatchWithModel, contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from 'vs/workbench/contrib/search/browser/notebookSearch/searchNotebookHelpers';
import { ITextQuery, QueryType, ISearchProgressItem, ISearchComplete, ISearchConfigurationProperties, pathIncludedInQuery, ISearchService, IFolderQuery, DEFAULT_MAX_SEARCH_RESULTS } from 'vs/workbench/services/search/common/search';
import * as arrays from 'vs/base/common/arrays';
import { isNumber } from 'vs/base/common/types';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { INotebookFileMatchNoModel } from 'vs/workbench/contrib/search/common/searchNotebookHelpers';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookPriorityInfo } from 'vs/workbench/contrib/search/common/search';
import { INotebookExclusiveDocumentFilter } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

interface IOpenNotebookSearchResults {
	results: ResourceMap<INotebookFileMatchWithModel | null>;
	limitHit: boolean;
}
interface IClosedNotebookSearchResults {
	results: ResourceMap<INotebookFileMatchNoModel<URI> | null>;
	limitHit: boolean;
}
export class NotebookSearchService implements INotebookSearchService {
	declare readonly _serviceBrand: undefined;
	private queryBuilder: QueryBuilder;
	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@ILogService private readonly logService: ILogService,
		@INotebookService private readonly notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ISearchService private readonly searchService: ISearchService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.queryBuilder = instantiationService.createInstance(QueryBuilder);
	}

	notebookSearch(query: ITextQuery, token: CancellationToken | undefined, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void): {
		openFilesToScan: ResourceSet;
		completeData: Promise<ISearchComplete>;
		allScannedFiles: Promise<ResourceSet>;
	} {

		if (query.type !== QueryType.Text) {
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
		const localNotebookFiles = localNotebookWidgets.map(widget => widget.viewModel!.uri);
		const getAllResults = (): { completeData: Promise<ISearchComplete>; allScannedFiles: Promise<ResourceSet> } => {
			const searchStart = Date.now();

			const localResultPromise = this.getLocalNotebookResults(query, token ?? CancellationToken.None, localNotebookWidgets, searchInstanceID);
			const searchLocalEnd = Date.now();

			const experimentalNotebooksEnabled = this.configurationService.getValue<ISearchConfigurationProperties>('search').experimental?.closedNotebookRichContentResults ?? false;

			let closedResultsPromise: Promise<IClosedNotebookSearchResults | undefined> = Promise.resolve(undefined);
			if (experimentalNotebooksEnabled) {
				closedResultsPromise = this.getClosedNotebookResults(query, new ResourceSet(localNotebookFiles, uri => this.uriIdentityService.extUri.getComparisonKey(uri)), token ?? CancellationToken.None);
			}

			const promise = Promise.all([localResultPromise, closedResultsPromise]);
			return {
				completeData: promise.then((resolvedPromise): ISearchComplete => {
					const openNotebookResult = resolvedPromise[0];
					const closedNotebookResult = resolvedPromise[1];

					const resolved = resolvedPromise.filter((e): e is IOpenNotebookSearchResults | IClosedNotebookSearchResults => !!e);
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

	private async doesFileExist(includes: string[], folderQueries: IFolderQuery<URI>[], token: CancellationToken): Promise<boolean> {
		const promises: Promise<boolean>[] = includes.map(async includePattern => {
			const query = this.queryBuilder.file(folderQueries.map(e => e.folder), {
				includePattern: includePattern.startsWith('/') ? includePattern : '**/' + includePattern, // todo: find cleaner way to ensure that globs match all appropriate filetypes
				exists: true,
				onlyFileScheme: true,
			});
			return this.searchService.fileSearch(
				query,
				token
			).then((ret) => {
				return !!ret.limitHit;
			});
		});

		return Promise.any(promises);
	}

	private async getClosedNotebookResults(textQuery: ITextQuery, scannedFiles: ResourceSet, token: CancellationToken): Promise<IClosedNotebookSearchResults> {

		const userAssociations = this.editorResolverService.getAllUserAssociations();
		const allPriorityInfo: Map<string, NotebookPriorityInfo[]> = new Map();
		const contributedNotebookTypes = this.notebookService.getContributedNotebookTypes();


		userAssociations.forEach(association => {

			// we gather the editor associations here, but cannot check them until we actually have the files that the glob matches
			// this is because longer patterns take precedence over shorter ones, and even if there is a user association that
			// specifies the exact same glob as a contributed notebook type, there might be another user association that is longer/more specific
			// that still matches the path and should therefore take more precedence.
			if (!association.filenamePattern) {
				return;
			}

			const info: NotebookPriorityInfo = {
				isFromSettings: true,
				filenamePatterns: [association.filenamePattern]
			};

			const existingEntry = allPriorityInfo.get(association.viewType);
			if (existingEntry) {
				allPriorityInfo.set(association.viewType, existingEntry.concat(info));
			} else {
				allPriorityInfo.set(association.viewType, [info]);
			}
		});

		const promises: Promise<{
			results: INotebookFileMatchNoModel<URI>[];
			limitHit: boolean;
		} | undefined>[] = [];

		contributedNotebookTypes.forEach((notebook) => {
			if (notebook.selectors.length > 0) {
				promises.push((async () => {
					const includes = notebook.selectors.map((selector) => {
						const globPattern = (selector as INotebookExclusiveDocumentFilter).include || selector as glob.IRelativePattern | string;
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
					} else {
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
		const uniqueResults = new ResourceMap<INotebookFileMatchNoModel | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));

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

	private async getLocalNotebookResults(query: ITextQuery, token: CancellationToken, widgets: Array<NotebookEditorWidget>, searchID: string): Promise<IOpenNotebookSearchResults> {
		const localResults = new ResourceMap<INotebookFileMatchWithModel | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		let limitHit = false;

		for (const widget of widgets) {
			if (!widget.hasModel()) {
				continue;
			}
			const askMax = (isNumber(query.maxResults) ? query.maxResults : DEFAULT_MAX_SEARCH_RESULTS) + 1;
			const uri = widget.viewModel!.uri;

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
				const cellResults: INotebookCellMatchWithModel[] = matches.map(match => {
					const contentResults = contentMatchesToTextSearchMatches(match.contentMatches, match.cell);
					const webviewResults = webviewMatchesToTextSearchMatches(match.webviewMatches);
					return {
						cell: match.cell,
						index: match.index,
						contentResults: contentResults,
						webviewResults: webviewResults,
					};
				});

				const fileMatch: INotebookFileMatchWithModel = {
					resource: uri, cellResults: cellResults
				};
				localResults.set(uri, fileMatch);
			} else {
				localResults.set(uri, null);
			}
		}

		return {
			results: localResults,
			limitHit
		};
	}


	private getLocalNotebookWidgets(): Array<NotebookEditorWidget> {
		const notebookWidgets = this.notebookEditorService.retrieveAllExistingWidgets();
		return notebookWidgets
			.map(widget => widget.value)
			.filter((val): val is NotebookEditorWidget => !!val && val.hasModel());
	}
}


