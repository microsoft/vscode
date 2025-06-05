/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isThenable } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FolderQuerySearchTree } from './folderQuerySearchTree.js';
import { DEFAULT_MAX_SEARCH_RESULTS, hasSiblingPromiseFn, IAITextQuery, IExtendedExtensionSearchOptions, IFileMatch, IFolderQuery, excludeToGlobPattern, IPatternInfo, ISearchCompleteStats, ITextQuery, ITextSearchContext, ITextSearchMatch, ITextSearchResult, ITextSearchStats, QueryGlobTester, QueryType, resolvePatternsForProvider, ISearchRange, DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from './search.js';
import { TextSearchComplete2, TextSearchMatch2, TextSearchProviderFolderOptions, TextSearchProvider2, TextSearchProviderOptions, TextSearchQuery2, TextSearchResult2, AITextSearchProvider, AISearchResult, AISearchKeyword } from './searchExtTypes.js';

export interface IFileUtils {
	readdir: (resource: URI) => Promise<string[]>;
	toCanonicalName: (encoding: string) => string;
}
interface IAITextQueryProviderPair {
	query: IAITextQuery; provider: AITextSearchProvider;
}

interface ITextQueryProviderPair {
	query: ITextQuery; provider: TextSearchProvider2;
}
interface FolderQueryInfo {
	queryTester: QueryGlobTester;
	folder: URI;
	folderIdx: number;
}

export class TextSearchManager {

	private collector: TextSearchResultsCollector | null = null;

	private isLimitHit = false;
	private resultCount = 0;

	constructor(private queryProviderPair: IAITextQueryProviderPair | ITextQueryProviderPair,
		private fileUtils: IFileUtils,
		private processType: ITextSearchStats['type']) { }

	private get query() {
		return this.queryProviderPair.query;
	}

	search(onProgress: (matches: IFileMatch[]) => void, token: CancellationToken, onKeywordResult?: (keyword: AISearchKeyword) => void): Promise<ISearchCompleteStats> {
		const folderQueries = this.query.folderQueries || [];
		const tokenSource = new CancellationTokenSource(token);

		return new Promise<ISearchCompleteStats>((resolve, reject) => {
			this.collector = new TextSearchResultsCollector(onProgress);

			let isCanceled = false;
			const onResult = (result: TextSearchResult2, folderIdx: number) => {
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
						this.collector!.add(result, folderIdx);
					}
				}
			};

			// For each root folder
			this.doSearch(folderQueries, onResult, tokenSource.token, onKeywordResult).then(result => {
				tokenSource.dispose();
				this.collector!.flush();

				resolve({
					limitHit: this.isLimitHit || result?.limitHit,
					messages: this.getMessagesFromResults(result),
					stats: {
						type: this.processType
					}
				});
			}, (err: Error) => {
				tokenSource.dispose();
				const errMsg = toErrorMessage(err);
				reject(new Error(errMsg));
			});
		});
	}

	private getMessagesFromResults(result: TextSearchComplete2 | null | undefined) {
		if (!result?.message) { return []; }
		if (Array.isArray(result.message)) { return result.message; }
		return [result.message];
	}

	private resultSize(result: TextSearchResult2): number {
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

	private trimResultToSize(result: TextSearchMatch2, size: number): TextSearchMatch2 {
		return new TextSearchMatch2(result.uri, result.ranges.slice(0, size), result.previewText);
	}

	private async doSearch(folderQueries: IFolderQuery<URI>[], onResult: (result: TextSearchResult2, folderIdx: number) => void, token: CancellationToken, onKeywordResult?: (keyword: AISearchKeyword) => void): Promise<TextSearchComplete2 | null | undefined> {
		const folderMappings: FolderQuerySearchTree<FolderQueryInfo> = new FolderQuerySearchTree<FolderQueryInfo>(
			folderQueries,
			(fq, i) => {
				const queryTester = new QueryGlobTester(this.query, fq);
				return { queryTester, folder: fq.folder, folderIdx: i };
			},
			() => true
		);

		const testingPs: Promise<void>[] = [];
		const progress = {
			report: (result: TextSearchResult2 | AISearchResult) => {
				if (result instanceof AISearchKeyword) {
					onKeywordResult?.(result);
				} else {
					if (result.uri === undefined) {
						throw Error('Text search result URI is undefined. Please check provider implementation.');
					}
					const folderQuery = folderMappings.findQueryFragmentAwareSubstr(result.uri)!;
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
							testingPs.push(
								included.then(isIncluded => {
									if (isIncluded) {
										onResult(result, folderQuery.folderIdx);
									}
								}));
						} else if (included) {
							onResult(result, folderQuery.folderIdx);
						}
					}
				}
			}
		};

		const folderOptions = folderQueries.map(fq => this.getSearchOptionsForFolder(fq));
		const searchOptions: TextSearchProviderOptions = {
			folderOptions,
			maxFileSize: this.query.maxFileSize,
			maxResults: this.query.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
			previewOptions: this.query.previewOptions ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS,
			surroundingContext: this.query.surroundingContext ?? 0,
		};
		if ('usePCRE2' in this.query) {
			(<IExtendedExtensionSearchOptions>searchOptions).usePCRE2 = this.query.usePCRE2;
		}

		let result;
		if (this.queryProviderPair.query.type === QueryType.aiText) {
			result = await (this.queryProviderPair as IAITextQueryProviderPair).provider.provideAITextSearchResults(this.queryProviderPair.query.contentPattern, searchOptions, progress, token);
		} else {
			result = await (this.queryProviderPair as ITextQueryProviderPair).provider.provideTextSearchResults(patternInfoToQuery(this.queryProviderPair.query.contentPattern), searchOptions, progress, token);
		}
		if (testingPs.length) {
			await Promise.all(testingPs);
		}

		return result;
	}

	private getSearchOptionsForFolder(fq: IFolderQuery<URI>): TextSearchProviderFolderOptions {
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
		};
		return options;
	}
}

function patternInfoToQuery(patternInfo: IPatternInfo): TextSearchQuery2 {
	return {
		isCaseSensitive: patternInfo.isCaseSensitive || false,
		isRegExp: patternInfo.isRegExp || false,
		isWordMatch: patternInfo.isWordMatch || false,
		isMultiline: patternInfo.isMultiline || false,
		pattern: patternInfo.pattern
	};
}

export class TextSearchResultsCollector {
	private _batchedCollector: BatchedCollector<IFileMatch>;

	private _currentFolderIdx: number = -1;
	private _currentUri: URI | undefined;
	private _currentFileMatch: IFileMatch | null = null;

	constructor(private _onResult: (result: IFileMatch[]) => void) {
		this._batchedCollector = new BatchedCollector<IFileMatch>(512, items => this.sendItems(items));
	}

	add(data: TextSearchResult2, folderIdx: number): void {
		// Collects TextSearchResults into IInternalFileMatches and collates using BatchedCollector.
		// This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
		// providers that send results in random order. We could do this step afterwards instead.
		if (this._currentFileMatch && (this._currentFolderIdx !== folderIdx || !resources.isEqual(this._currentUri, data.uri))) {
			this.pushToCollector();
			this._currentFileMatch = null;
		}

		if (!this._currentFileMatch) {
			this._currentFolderIdx = folderIdx;
			this._currentFileMatch = {
				resource: data.uri,
				results: []
			};
		}

		this._currentFileMatch.results!.push(extensionResultToFrontendResult(data));
	}

	private pushToCollector(): void {
		const size = this._currentFileMatch && this._currentFileMatch.results ?
			this._currentFileMatch.results.length :
			0;
		this._batchedCollector.addItem(this._currentFileMatch!, size);
	}

	flush(): void {
		this.pushToCollector();
		this._batchedCollector.flush();
	}

	private sendItems(items: IFileMatch[]): void {
		this._onResult(items);
	}
}

function extensionResultToFrontendResult(data: TextSearchResult2): ITextSearchResult {
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
				} satisfies ISearchRange,
				source: {
					startLineNumber: r.sourceRange.start.line,
					startColumn: r.sourceRange.start.character,
					endLineNumber: r.sourceRange.end.line,
					endColumn: r.sourceRange.end.character
				} satisfies ISearchRange,
			})),
		} satisfies ITextSearchMatch;
	} else {
		return {
			text: data.text,
			lineNumber: data.lineNumber
		} satisfies ITextSearchContext;
	}
}


/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
export class BatchedCollector<T> {
	private static readonly TIMEOUT = 4000;

	// After START_BATCH_AFTER_COUNT items have been collected, stop flushing on timeout
	private static readonly START_BATCH_AFTER_COUNT = 50;

	private totalNumberCompleted = 0;
	private batch: T[] = [];
	private batchSize = 0;
	private timeoutHandle: Timeout | undefined;

	constructor(private maxBatchSize: number, private cb: (items: T[]) => void) {
	}

	addItem(item: T, size: number): void {
		if (!item) {
			return;
		}

		this.addItemToBatch(item, size);
	}

	addItems(items: T[], size: number): void {
		if (!items) {
			return;
		}

		this.addItemsToBatch(items, size);
	}

	private addItemToBatch(item: T, size: number): void {
		this.batch.push(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private addItemsToBatch(item: T[], size: number): void {
		this.batch = this.batch.concat(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private onUpdate(): void {
		if (this.totalNumberCompleted < BatchedCollector.START_BATCH_AFTER_COUNT) {
			// Flush because we aren't batching yet
			this.flush();
		} else if (this.batchSize >= this.maxBatchSize) {
			// Flush because the batch is full
			this.flush();
		} else if (!this.timeoutHandle) {
			// No timeout running, start a timeout to flush
			this.timeoutHandle = setTimeout(() => {
				this.flush();
			}, BatchedCollector.TIMEOUT);
		}
	}

	flush(): void {
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
