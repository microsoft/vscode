/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import { toDisposable } from 'vs/base/common/lifecycle';
import * as resources from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import { IFileMatch, IFileSearchProviderStats, IFolderQuery, IPatternInfo, IRawSearchQuery, ISearchCompleteStats, ISearchQuery, ITextSearchResult } from 'vs/platform/search/common/search';
import { FileIndexSearchManager, IDirectoryEntry, IDirectoryTree, IInternalFileMatch, QueryGlobTester, resolvePatternsForProvider } from 'vs/workbench/api/node/extHostSearch.fileIndex';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider>();
	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider>();
	private readonly _fileIndexProvider = new Map<number, vscode.FileIndexProvider>();
	private _handlePool: number = 0;

	private _fileSearchManager: FileSearchManager;
	private _fileIndexSearchManager: FileIndexSearchManager;

	constructor(mainContext: IMainContext, private _schemeTransformer: ISchemeTransformer, private _extfs = extfs) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager();
		this._fileIndexSearchManager = new FileIndexSearchManager();
	}

	private _transformScheme(scheme: string): string {
		if (this._schemeTransformer) {
			return this._schemeTransformer.transformOutgoing(scheme);
		}
		return scheme;
	}

	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider) {
		const handle = this._handlePool++;
		this._fileSearchProvider.set(handle, provider);
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider) {
		const handle = this._handlePool++;
		this._textSearchProvider.set(handle, provider);
		this._proxy.$registerTextSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._textSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileIndexProvider(scheme: string, provider: vscode.FileIndexProvider) {
		const handle = this._handlePool++;
		this._fileIndexProvider.set(handle, provider);
		this._proxy.$registerFileIndexProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle); // TODO@roblou - unregisterFileIndexProvider
		});
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawSearchQuery, token: CancellationToken): Thenable<ISearchCompleteStats> {
		const provider = this._fileSearchProvider.get(handle);
		const query = reviveQuery(rawQuery);
		if (provider) {
			return this._fileSearchManager.fileSearch(query, provider, batch => {
				this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
			}, token);
		} else {
			const indexProvider = this._fileIndexProvider.get(handle);
			return this._fileIndexSearchManager.fileSearch(query, indexProvider, batch => {
				this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
			}, token);
		}
	}

	$clearCache(cacheKey: string): Thenable<void> {
		// Actually called once per provider.
		// Only relevant to file index search.
		return this._fileIndexSearchManager.clearCache(cacheKey);
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, rawQuery: IRawSearchQuery, token: CancellationToken): Thenable<ISearchCompleteStats> {
		const provider = this._textSearchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchEngine(pattern, query, provider, this._extfs);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}
}

function reviveQuery(rawQuery: IRawSearchQuery): ISearchQuery {
	return {
		...rawQuery,
		...{
			folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
			extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map(components => URI.revive(components))
		}
	};
}

function reviveFolderQuery(rawFolderQuery: IFolderQuery<UriComponents>): IFolderQuery<URI> {
	return {
		...rawFolderQuery,
		folder: URI.revive(rawFolderQuery.folder)
	};
}

class TextSearchResultsCollector {
	private _batchedCollector: BatchedCollector<IFileMatch>;

	private _currentFolderIdx: number;
	private _currentUri: URI;
	private _currentFileMatch: IFileMatch;

	constructor(private _onResult: (result: IFileMatch[]) => void) {
		this._batchedCollector = new BatchedCollector<IFileMatch>(512, items => this.sendItems(items));
	}

	add(data: vscode.TextSearchResult, folderIdx: number): void {
		// Collects TextSearchResults into IInternalFileMatches and collates using BatchedCollector.
		// This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
		// providers that send results in random order. We could do this step afterwards instead.
		if (this._currentFileMatch && (this._currentFolderIdx !== folderIdx || resources.isEqual(this._currentUri, data.uri))) {
			this.pushToCollector();
			this._currentFileMatch = null;
		}

		if (!this._currentFileMatch) {
			this._currentFileMatch = {
				resource: data.uri,
				matches: []
			};
		}

		this._currentFileMatch.matches.push(extensionResultToFrontendResult(data));
	}

	private pushToCollector(): void {
		const size = this._currentFileMatch ?
			this._currentFileMatch.matches.length :
			0;
		this._batchedCollector.addItem(this._currentFileMatch, size);
	}

	flush(): void {
		this.pushToCollector();
		this._batchedCollector.flush();
	}

	private sendItems(items: IFileMatch[]): void {
		this._onResult(items);
	}
}

function extensionResultToFrontendResult(data: vscode.TextSearchResult): ITextSearchResult {
	return {
		preview: {
			match: {
				startLineNumber: data.preview.match.start.line,
				startColumn: data.preview.match.start.character,
				endLineNumber: data.preview.match.end.line,
				endColumn: data.preview.match.end.character
			},
			text: data.preview.text
		},
		range: {
			startLineNumber: data.range.start.line,
			startColumn: data.range.start.character,
			endLineNumber: data.range.end.line,
			endColumn: data.range.end.character
		}
	};
}

/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
class BatchedCollector<T> {
	private static readonly TIMEOUT = 4000;

	// After START_BATCH_AFTER_COUNT items have been collected, stop flushing on timeout
	private static readonly START_BATCH_AFTER_COUNT = 50;

	private totalNumberCompleted = 0;
	private batch: T[] = [];
	private batchSize = 0;
	private timeoutHandle: number;

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

		if (this.maxBatchSize > 0) {
			this.addItemsToBatch(items, size);
		} else {
			this.cb(items);
		}
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
				this.timeoutHandle = 0;
			}
		}
	}
}

class TextSearchEngine {

	private collector: TextSearchResultsCollector;

	private isLimitHit: boolean;
	private resultCount = 0;

	constructor(private pattern: IPatternInfo, private config: ISearchQuery, private provider: vscode.TextSearchProvider, private _extfs: typeof extfs) {
	}

	public search(onProgress: (matches: IFileMatch[]) => void, token: CancellationToken): TPromise<ISearchCompleteStats> {
		const folderQueries = this.config.folderQueries;
		const tokenSource = new CancellationTokenSource();
		token.onCancellationRequested(() => tokenSource.cancel());

		return new TPromise<ISearchCompleteStats>((resolve, reject) => {
			this.collector = new TextSearchResultsCollector(onProgress);

			let isCanceled = false;
			const onResult = (match: vscode.TextSearchResult, folderIdx: number) => {
				if (isCanceled) {
					return;
				}

				if (this.resultCount >= this.config.maxResults) {
					this.isLimitHit = true;
					isCanceled = true;
					tokenSource.cancel();
				}

				if (!this.isLimitHit) {
					this.resultCount++;
					this.collector.add(match, folderIdx);
				}
			};

			// For each root folder
			TPromise.join(folderQueries.map((fq, i) => {
				return this.searchInFolder(fq, r => onResult(r, i), tokenSource.token);
			})).then(results => {
				tokenSource.dispose();
				this.collector.flush();

				const someFolderHitLImit = results.some(result => result && result.limitHit);
				resolve({
					limitHit: this.isLimitHit || someFolderHitLImit,
					stats: {
						type: 'textSearchProvider'
					}
				});
			}, (errs: Error[]) => {
				tokenSource.dispose();
				const errMsg = errs
					.map(err => toErrorMessage(err))
					.filter(msg => !!msg)[0];

				reject(new Error(errMsg));
			});
		});
	}

	private searchInFolder(folderQuery: IFolderQuery<URI>, onResult: (result: vscode.TextSearchResult) => void, token: CancellationToken): TPromise<vscode.TextSearchComplete> {
		const queryTester = new QueryGlobTester(this.config, folderQuery);
		const testingPs = [];
		const progress = {
			report: (result: vscode.TextSearchResult) => {
				const hasSibling = folderQuery.folder.scheme === 'file' && glob.hasSiblingPromiseFn(() => {
					return this.readdir(path.dirname(result.uri.fsPath));
				});

				const relativePath = path.relative(folderQuery.folder.fsPath, result.uri.fsPath);
				testingPs.push(
					queryTester.includedInQuery(relativePath, path.basename(relativePath), hasSibling)
						.then(included => {
							if (included) {
								onResult(result);
							}
						}));
			}
		};

		const searchOptions = this.getSearchOptionsForFolder(folderQuery);
		return new TPromise(resolve => process.nextTick(resolve))
			.then(() => this.provider.provideTextSearchResults(patternInfoToQuery(this.pattern), searchOptions, progress, token))
			.then(result => {
				return TPromise.join(testingPs)
					.then(() => result);
			});
	}

	private readdir(dirname: string): TPromise<string[]> {
		return new TPromise((resolve, reject) => {
			this._extfs.readdir(dirname, (err, files) => {
				if (err) {
					return reject(err);
				}

				resolve(files);
			});
		});
	}

	private getSearchOptionsForFolder(fq: IFolderQuery<URI>): vscode.TextSearchOptions {
		const includes = resolvePatternsForProvider(this.config.includePattern, fq.includePattern);
		const excludes = resolvePatternsForProvider(this.config.excludePattern, fq.excludePattern);

		return {
			folder: URI.from(fq.folder),
			excludes,
			includes,
			useIgnoreFiles: !this.config.disregardIgnoreFiles,
			followSymlinks: !this.config.ignoreSymlinks,
			encoding: this.config.fileEncoding,
			maxFileSize: this.config.maxFileSize,
			maxResults: this.config.maxResults,
			previewOptions: this.config.previewOptions
		};
	}
}

function patternInfoToQuery(patternInfo: IPatternInfo): vscode.TextSearchQuery {
	return <vscode.TextSearchQuery>{
		isCaseSensitive: patternInfo.isCaseSensitive || false,
		isRegExp: patternInfo.isRegExp || false,
		isWordMatch: patternInfo.isWordMatch || false,
		pattern: patternInfo.pattern
	};
}

class FileSearchEngine {
	private filePattern: string;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private exists: boolean;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private activeCancellationTokens: Set<CancellationTokenSource>;

	private globalExcludePattern: glob.ParsedExpression;

	constructor(private config: ISearchQuery, private provider: vscode.FileSearchProvider) {
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = config.exists;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.activeCancellationTokens = new Set<CancellationTokenSource>();

		this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern);
	}

	public cancel(): void {
		this.isCanceled = true;
		this.activeCancellationTokens.forEach(t => t.cancel());
		this.activeCancellationTokens = new Set();
	}

	public search(_onResult: (match: IInternalFileMatch) => void): TPromise<IInternalSearchComplete> {
		const folderQueries = this.config.folderQueries;

		return new TPromise((resolve, reject) => {
			const onResult = (match: IInternalFileMatch) => {
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

			// For each root folder
			TPromise.join(folderQueries.map(fq => {
				return this.searchInFolder(fq, onResult);
			})).then(stats => {
				resolve({
					limitHit: this.isLimitHit,
					stats: stats[0] // Only looking at single-folder workspace stats...
				});
			}, (errs: Error[]) => {
				const errMsg = errs
					.map(err => toErrorMessage(err))
					.filter(msg => !!msg)[0];

				reject(new Error(errMsg));
			});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>, onResult: (match: IInternalFileMatch) => void): TPromise<IFileSearchProviderStats> {
		let cancellation = new CancellationTokenSource();
		return new TPromise((resolve, reject) => {
			const options = this.getSearchOptionsForFolder(fq);
			const tree = this.initDirectoryTree();

			const queryTester = new QueryGlobTester(this.config, fq);
			const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();

			let providerSW: StopWatch;
			new TPromise(_resolve => process.nextTick(_resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);

					providerSW = StopWatch.create();
					return this.provider.provideFileSearchResults(
						{
							pattern: this.config.filePattern || ''
						},
						options,
						cancellation.token);
				})
				.then(results => {
					const providerTime = providerSW.elapsed();
					const postProcessSW = StopWatch.create();

					if (this.isCanceled) {
						return null;
					}

					if (results) {
						results.forEach(result => {
							const relativePath = path.relative(fq.folder.fsPath, result.fsPath);

							if (noSiblingsClauses) {
								const basename = path.basename(result.fsPath);
								this.matchFile(onResult, { base: fq.folder, relativePath, basename });

								return;
							}

							// TODO: Optimize siblings clauses with ripgrep here.
							this.addDirectoryEntries(tree, fq.folder, relativePath, onResult);
						});
					}

					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					this.matchDirectoryTree(tree, queryTester, onResult);
					return <IFileSearchProviderStats>{
						providerTime,
						postProcessTime: postProcessSW.elapsed()
					};
				}).then(
					stats => {
						cancellation.dispose();
						resolve(stats);
					},
					err => {
						cancellation.dispose();
						reject(err);
					});
		});
	}

	private getSearchOptionsForFolder(fq: IFolderQuery<URI>): vscode.FileSearchOptions {
		const includes = resolvePatternsForProvider(this.config.includePattern, fq.includePattern);
		const excludes = resolvePatternsForProvider(this.config.excludePattern, fq.excludePattern);

		return {
			folder: fq.folder,
			excludes,
			includes,
			useIgnoreFiles: !this.config.disregardIgnoreFiles,
			followSymlinks: !this.config.ignoreSymlinks,
			maxResults: this.config.maxResults
		};
	}

	private initDirectoryTree(): IDirectoryTree {
		const tree: IDirectoryTree = {
			rootEntries: [],
			pathToEntries: Object.create(null)
		};
		tree.pathToEntries['.'] = tree.rootEntries;
		return tree;
	}

	private addDirectoryEntries({ pathToEntries }: IDirectoryTree, base: URI, relativeFile: string, onResult: (result: IInternalFileMatch) => void) {
		// Support relative paths to files from a root resource (ignores excludes)
		if (relativeFile === this.filePattern) {
			const basename = path.basename(this.filePattern);
			this.matchFile(onResult, { base: base, relativePath: this.filePattern, basename });
		}

		function add(relativePath: string) {
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

	private matchDirectoryTree({ rootEntries, pathToEntries }: IDirectoryTree, queryTester: QueryGlobTester, onResult: (result: IInternalFileMatch) => void) {
		const self = this;
		const filePattern = this.filePattern;
		function matchDirectory(entries: IDirectoryEntry[]) {
			const hasSibling = glob.hasSiblingFn(() => entries.map(entry => entry.basename));
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (!queryTester.includedInQuerySync(relativePath, basename, filePattern !== basename ? hasSibling : undefined)) {
					continue;
				}

				const sub = pathToEntries[relativePath];
				if (sub) {
					matchDirectory(sub);
				} else {
					if (relativePath === filePattern) {
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

	private matchFile(onResult: (result: IInternalFileMatch) => void, candidate: IInternalFileMatch): void {
		if (!this.includePattern || this.includePattern(candidate.relativePath, candidate.basename)) {
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

interface IInternalSearchComplete {
	limitHit: boolean;
	stats?: IFileSearchProviderStats;
}

class FileSearchManager {

	private static readonly BATCH_SIZE = 512;

	fileSearch(config: ISearchQuery, provider: vscode.FileSearchProvider, onBatch: (matches: IFileMatch[]) => void, token: CancellationToken): TPromise<ISearchCompleteStats> {
		const engine = new FileSearchEngine(config, provider);

		let resultCount = 0;
		const onInternalResult = (batch: IInternalFileMatch[]) => {
			resultCount += batch.length;
			onBatch(batch.map(m => this.rawMatchToSearchItem(m)));
		};

		return this.doSearch(engine, FileSearchManager.BATCH_SIZE, onInternalResult, token).then(
			result => {
				return <ISearchCompleteStats>{
					limitHit: result.limitHit,
					stats: {
						fromCache: false,
						type: 'fileSearchProvider',
						resultCount,
						detailStats: result.stats
					}
				};
			});
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		if (match.relativePath) {
			return {
				resource: resources.joinPath(match.base, match.relativePath)
			};
		} else {
			// extraFileResources
			return {
				resource: match.base
			};
		}
	}

	private doSearch(engine: FileSearchEngine, batchSize: number, onResultBatch: (matches: IInternalFileMatch[]) => void, token: CancellationToken): TPromise<IInternalSearchComplete> {
		token.onCancellationRequested(() => {
			engine.cancel();
		});

		const _onResult = match => {
			if (match) {
				batch.push(match);
				if (batchSize > 0 && batch.length >= batchSize) {
					onResultBatch(batch);
					batch = [];
				}
			}
		};

		let batch: IInternalFileMatch[] = [];
		return engine.search(_onResult).then(result => {
			if (batch.length) {
				onResultBatch(batch);
			}

			return result;
		}, error => {
			if (batch.length) {
				onResultBatch(batch);
			}

			return TPromise.wrapError(error);
		});
	}
}
