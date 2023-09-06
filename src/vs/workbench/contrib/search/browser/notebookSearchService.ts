/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceSet, ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookSearchService } from 'vs/workbench/contrib/search/common/notebookSearch';
import { ICompleteNotebookCellMatch, ICompleteNotebookFileMatch, contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { ITextQuery, QueryType, ISearchProgressItem, ISearchComplete, ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import * as arrays from 'vs/base/common/arrays';
import { isNumber } from 'vs/base/common/types';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { IIncompleteNotebookFileMatch } from 'vs/workbench/contrib/search/common/cellSearchModel';

interface IOpenNotebookSearchResults {
	results: ResourceMap<ICompleteNotebookFileMatch | null>;
	limitHit: boolean;
}
interface IClosedNotebookSearchResults {
	results: IIncompleteNotebookFileMatch<URI>[];
	limitHit: boolean;
}
export class NotebookSearchService implements INotebookSearchService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@ILogService private readonly logService: ILogService,
		@INotebookService private readonly notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
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
				completeData: promise.then((resolvedPromise) => {
					const openNotebookResult = resolvedPromise[0];
					const closedNotebookResult = resolvedPromise[1];

					const resolved = resolvedPromise.filter((e): e is IOpenNotebookSearchResults => !!e);
					const resultArray = [...Array.from(openNotebookResult.results.values()), ...closedNotebookResult?.results ?? []];
					const results = arrays.coalesce(resultArray);
					if (onProgress) {
						results.forEach(onProgress);
					}
					this.logService.trace(`local notebook search time | ${searchLocalEnd - searchStart}ms`);
					return <ISearchComplete>{
						messages: [],
						limitHit: resolved.reduce((prev, cur) => prev || cur.limitHit, false),
						results,
					};
				}),
				allScannedFiles: promise.then(resolvedPromise => {
					const openNotebookResult = resolvedPromise[0];
					const results = arrays.coalesce([...openNotebookResult.results.keys()]);
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

	private async getClosedNotebookResults(textQuery: ITextQuery, scannedFiles: ResourceSet, token: CancellationToken): Promise<IClosedNotebookSearchResults> {


		const contributedTypes = this.notebookService.getContributedNotebookTypes();

		const getResultsFromProviderInfo = async (providerInfo: NotebookProviderInfo) => {
			const serializer = (await this.notebookService.withNotebookDataProvider(providerInfo.id)).serializer;
			return await serializer.searchInNotebooks(textQuery, token);
		};

		const start = Date.now();
		const results = (await Promise.all(contributedTypes.map(async e => await getResultsFromProviderInfo(e)))).flat();

		const end = Date.now();
		this.logService.trace(`query: ${textQuery.contentPattern.pattern}`);
		this.logService.trace(`closed notebook search time | ${end - start}ms`);

		return {
			results: results.filter(e => !scannedFiles.has(e.resource)),
			limitHit: false
		};
	}

	private async getLocalNotebookResults(query: ITextQuery, token: CancellationToken, widgets: Array<NotebookEditorWidget>, searchID: string): Promise<IOpenNotebookSearchResults> {
		const localResults = new ResourceMap<ICompleteNotebookFileMatch | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		let limitHit = false;

		for (const widget of widgets) {
			if (!widget.viewModel) {
				continue;
			}
			const askMax = isNumber(query.maxResults) ? query.maxResults + 1 : Number.MAX_SAFE_INTEGER;
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
				const cellResults: ICompleteNotebookCellMatch[] = matches.map(match => {
					const contentResults = contentMatchesToTextSearchMatches(match.contentMatches, match.cell);
					const webviewResults = webviewMatchesToTextSearchMatches(match.webviewMatches);
					return {
						cell: match.cell,
						index: match.index,
						contentResults: contentResults,
						webviewResults: webviewResults,
					};
				});

				const fileMatch: ICompleteNotebookFileMatch = {
					resource: widget.viewModel.uri, cellResults: cellResults
				};
				localResults.set(widget.viewModel.uri, fileMatch);
			} else {
				localResults.set(widget.viewModel.uri, null);
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
			.filter((val): val is NotebookEditorWidget => !!val && !!(val.viewModel));
	}
}


