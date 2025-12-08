/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { streamToBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRelativePattern } from 'vs/base/common/glob';
import { ResourceSet, ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookExclusiveDocumentFilter, NotebookData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookSearchService } from 'vs/workbench/contrib/search/browser/notebookSearch';
import { IFileMatchWithCells, ICellMatch, CellSearchModel, contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { IEditorResolverService, priorityToRank } from 'vs/workbench/services/editor/common/editorResolverService';
import { ITextQuery, IFileQuery, QueryType, ISearchProgressItem, ISearchComplete, ISearchConfigurationProperties, ISearchService } from 'vs/workbench/services/search/common/search';
import * as arrays from 'vs/base/common/arrays';
import { isNumber } from 'vs/base/common/types';

interface INotebookDataEditInfo {
	notebookData: NotebookData;
	mTime: number;
}

interface INotebookSearchMatchResults {
	results: ResourceMap<IFileMatchWithCells | null>;
	limitHit: boolean;
}

class NotebookDataCache {
	private _entries: ResourceMap<INotebookDataEditInfo>;
	// private _serializer: INotebookSerializer | undefined;

	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@INotebookService private readonly notebookService: INotebookService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
	) {
		this._entries = new ResourceMap<INotebookDataEditInfo>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
	}

	private async getSerializer(notebookUri: URI): Promise<INotebookSerializer | undefined> {
		const registeredEditorInfo = this.editorResolverService.getEditors(notebookUri);
		const priorityEditorInfo = registeredEditorInfo.reduce((acc, val) =>
			priorityToRank(acc.priority) > priorityToRank(val.priority) ? acc : val
		);
		const info = await this.notebookService.withNotebookDataProvider(priorityEditorInfo.id);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			return undefined;
		}
		return info.serializer;
	}

	async getNotebookData(notebookUri: URI): Promise<NotebookData> {
		const mTime = (await this.fileService.stat(notebookUri)).mtime;

		const entry = this._entries.get(notebookUri);

		if (entry && entry.mTime === mTime) {
			return entry.notebookData;
		} else {

			let _data: NotebookData = {
				metadata: {},
				cells: []
			};

			const content = await this.fileService.readFileStream(notebookUri);
			const bytes = await streamToBuffer(content.value);
			const serializer = await this.getSerializer(notebookUri);
			if (!serializer) {
				//unsupported
				throw new Error(`serializer not initialized`);
			}
			_data = await serializer.dataToNotebook(bytes);
			this._entries.set(notebookUri, { notebookData: _data, mTime });
			return _data;
		}
	}

}

export class NotebookSearchService implements INotebookSearchService {
	declare readonly _serviceBrand: undefined;
	private _notebookDataCache: NotebookDataCache;
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@ILogService private readonly logService: ILogService,
		@INotebookService private readonly notebookService: INotebookService,
		@ISearchService private readonly searchService: ISearchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,

	) {
		this._notebookDataCache = this.instantiationService.createInstance(NotebookDataCache);
	}

	private async runFileQueries(includes: (string)[], token: CancellationToken, textQuery: ITextQuery): Promise<URI[]> {
		const promises = includes.map(include => {
			const query: IFileQuery = {
				type: QueryType.File,
				filePattern: include,
				folderQueries: textQuery.folderQueries,
				maxResults: textQuery.maxResults,
			};
			return this.searchService.fileSearch(
				query,
				token
			);
		});
		const result = (await Promise.all(promises)).map(sc => sc.results.map(fm => fm.resource)).flat();
		const uris = new ResourceSet(result, uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		return Array.from(uris.keys());
	}

	async notebookSearch(query: ITextQuery, token: CancellationToken, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void): Promise<{ completeData: ISearchComplete; scannedFiles: ResourceSet }> {

		if (query.type !== QueryType.Text) {
			return {
				completeData: {
					messages: [],
					limitHit: false,
					results: [],
				},
				scannedFiles: new ResourceSet()
			};
		}
		const searchStart = Date.now();

		const localNotebookWidgets = this.getLocalNotebookWidgets();
		const localNotebookFiles = localNotebookWidgets.map(widget => widget.viewModel!.uri);
		const localResultPromise = this.getLocalNotebookResults(query, token, localNotebookWidgets, searchInstanceID);
		const searchLocalEnd = Date.now();

		const experimentalNotebooksEnabled = this.configurationService.getValue<ISearchConfigurationProperties>('search').experimental?.closedNotebookRichContentResults ?? false;

		let closedResultsPromise: Promise<INotebookSearchMatchResults | undefined> = Promise.resolve(undefined);
		if (experimentalNotebooksEnabled) {
			closedResultsPromise = this.getClosedNotebookResults(query, new ResourceSet(localNotebookFiles, uri => this.uriIdentityService.extUri.getComparisonKey(uri)), token);
		}

		const resolved = (await Promise.all([localResultPromise, closedResultsPromise])).filter((result): result is INotebookSearchMatchResults => !!result);
		const resultArray = resolved.map(elem => elem.results);

		const results = arrays.coalesce(resultArray.flatMap(map => Array.from(map.values())));
		const scannedFiles = new ResourceSet(resultArray.flatMap(map => Array.from(map.keys())), uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		if (onProgress) {
			results.forEach(onProgress);
		}
		this.logService.trace(`local notebook search time | ${searchLocalEnd - searchStart}ms`);
		return {
			completeData: {
				messages: [],
				limitHit: resolved.reduce((prev, cur) => prev || cur.limitHit, false),
				results,
			},
			scannedFiles
		};
	}

	private async getClosedNotebookResults(textQuery: ITextQuery, scannedFiles: ResourceSet, token: CancellationToken): Promise<INotebookSearchMatchResults> {
		const infoProviders = this.notebookService.getContributedNotebookTypes();
		const includes = infoProviders.flatMap(
			(provider) => {
				return provider.selectors.map((selector) => {
					const globPattern = (selector as INotebookExclusiveDocumentFilter).include || selector as IRelativePattern | string;
					return globPattern.toString();
				}
				);
			}
		);

		const results = new ResourceMap<IFileMatchWithCells | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));

		const start = Date.now();

		const filesToScan = await this.runFileQueries(includes, token, textQuery);
		const deserializedNotebooks = new ResourceMap<NotebookTextModel>();
		const textModels = this.notebookService.getNotebookTextModels();
		for (const notebook of textModels) {
			deserializedNotebooks.set(notebook.uri, notebook);
		}

		const promises = filesToScan.map(async (uri) => {
			const cellMatches: ICellMatch[] = [];
			if (scannedFiles.has(uri)) {
				return;
			}

			try {
				if (token.isCancellationRequested) {
					return;
				}

				const cells = deserializedNotebooks.get(uri)?.cells ?? (await this._notebookDataCache.getNotebookData(uri)).cells;

				if (token.isCancellationRequested) {
					return;
				}

				cells.forEach((cell, index) => {
					const target = textQuery.contentPattern.pattern;
					const cellModel = cell instanceof NotebookCellTextModel ? new CellSearchModel('', cell.textBuffer, uri, index) : new CellSearchModel(cell.source, undefined, uri, index);

					const matches = cellModel.find(target);
					if (matches.length > 0) {
						const cellMatch: ICellMatch = {
							cell: cellModel,
							index: index,
							contentResults: contentMatchesToTextSearchMatches(matches, cellModel),
							webviewResults: []
						};
						cellMatches.push(cellMatch);
					}
				});

				const fileMatch = cellMatches.length > 0 ? {
					resource: uri, cellResults: cellMatches
				} : null;
				results.set(uri, fileMatch);
				return;

			} catch (e) {
				this.logService.info('error: ' + e);
				return;
			}

		});

		await Promise.all(promises);
		const end = Date.now();

		this.logService.trace(`query: ${textQuery.contentPattern.pattern}`);
		this.logService.trace(`closed notebook search time | ${end - start}ms`);
		return {
			results: results,
			limitHit: false
		};
	}

	private async getLocalNotebookResults(query: ITextQuery, token: CancellationToken, widgets: Array<NotebookEditorWidget>, searchID: string): Promise<INotebookSearchMatchResults> {
		const localResults = new ResourceMap<IFileMatchWithCells | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
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
					includeMarkupInput: query.contentPattern.notebookInfo?.isInNotebookMarkdownInput,
					includeMarkupPreview: query.contentPattern.notebookInfo?.isInNotebookMarkdownPreview,
					includeCodeInput: query.contentPattern.notebookInfo?.isInNotebookCellInput,
					includeOutput: query.contentPattern.notebookInfo?.isInNotebookCellOutput,
				}, token, false, true, searchID);


			if (matches.length) {
				if (askMax && matches.length >= askMax) {
					limitHit = true;
					matches = matches.slice(0, askMax - 1);
				}
				const cellResults: ICellMatch[] = matches.map(match => {
					const contentResults = contentMatchesToTextSearchMatches(match.contentMatches, match.cell);
					const webviewResults = webviewMatchesToTextSearchMatches(match.webviewMatches);
					return {
						cell: match.cell,
						index: match.index,
						contentResults: contentResults,
						webviewResults: webviewResults,
					};
				});

				const fileMatch: IFileMatchWithCells = {
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
