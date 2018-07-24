/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import * as resources from 'vs/base/common/resources';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import { IFileMatch, IFolderQuery, IPatternInfo, IRawSearchQuery, ISearchCompleteStats, ISearchQuery } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';
import { toDisposable } from 'vs/base/common/lifecycle';

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private _handlePool: number = 0;

	private _fileSearchManager: FileSearchManager;

	constructor(mainContext: IMainContext, private _schemeTransformer: ISchemeTransformer, private _extfs = extfs) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager();
	}

	private _transformScheme(scheme: string): string {
		if (this._schemeTransformer) {
			return this._schemeTransformer.transformOutgoing(scheme);
		}
		return scheme;
	}

	registerSearchProvider(scheme: string, provider: vscode.SearchProvider) {
		const handle = this._handlePool++;
		this._searchProvider.set(handle, provider);
		this._proxy.$registerSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._searchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawSearchQuery): TPromise<ISearchCompleteStats> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		return this._fileSearchManager.fileSearch(query, provider, progress => {
			this._proxy.$handleFileMatch(handle, session, progress.map(p => p.resource));
		});
	}

	$clearCache(handle: number, cacheKey: string): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.clearCache) {
			return TPromise.as(undefined);
		}

		return TPromise.as(
			this._fileSearchManager.clearCache(cacheKey, provider));
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, rawQuery: IRawSearchQuery): TPromise<ISearchCompleteStats> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchEngine(pattern, query, provider, this._extfs);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress));
	}
}

/**
 *  Computes the patterns that the provider handles. Discards sibling clauses and 'false' patterns
 */
function resolvePatternsForProvider(globalPattern: glob.IExpression, folderPattern: glob.IExpression): string[] {
	const merged = {
		...(globalPattern || {}),
		...(folderPattern || {})
	};

	return Object.keys(merged)
		.filter(key => {
			const value = merged[key];
			return typeof value === 'boolean' && value;
		});
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
				lineMatches: []
			};
		}

		// TODO@roblou - line text is sent for every match
		const matchRange = data.preview.match;
		this._currentFileMatch.lineMatches.push({
			lineNumber: data.range.start.line,
			preview: data.preview.text,
			offsetAndLengths: [[matchRange.start.character, matchRange.end.character - matchRange.start.character]]
		});
	}

	private pushToCollector(): void {
		const size = this._currentFileMatch ?
			this._currentFileMatch.lineMatches.reduce((acc, match) => acc + match.offsetAndLengths.length, 0) :
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

interface IDirectoryEntry {
	base: URI;
	relativePath: string;
	basename: string;
}

interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}

interface IInternalFileMatch {
	base: URI;
	relativePath?: string; // Not present for extraFiles or absolute path matches
	basename: string;
	size?: number;
}

class QueryGlobTester {

	private _excludeExpression: glob.IExpression;
	private _parsedExcludeExpression: glob.ParsedExpression;

	private _parsedIncludeExpression: glob.ParsedExpression;

	constructor(config: ISearchQuery, folderQuery: IFolderQuery) {
		this._excludeExpression = {
			...(config.excludePattern || {}),
			...(folderQuery.excludePattern || {})
		};
		this._parsedExcludeExpression = glob.parse(this._excludeExpression);

		// Empty includeExpression means include nothing, so no {} shortcuts
		let includeExpression: glob.IExpression = config.includePattern;
		if (folderQuery.includePattern) {
			if (includeExpression) {
				includeExpression = {
					...includeExpression,
					...folderQuery.includePattern
				};
			} else {
				includeExpression = folderQuery.includePattern;
			}
		}

		if (includeExpression) {
			this._parsedIncludeExpression = glob.parse(includeExpression);
		}
	}

	/**
	 * Guaranteed sync - siblingsFn should not return a promise.
	 */
	public includedInQuerySync(testPath: string, basename?: string, hasSibling?: (name: string) => boolean): boolean {
		if (this._parsedExcludeExpression && this._parsedExcludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		return true;
	}

	/**
	 * Guaranteed async.
	 */
	public includedInQuery(testPath: string, basename?: string, hasSibling?: (name: string) => boolean | TPromise<boolean>): TPromise<boolean> {
		const excludeP = this._parsedExcludeExpression ?
			TPromise.as(this._parsedExcludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
			TPromise.wrap(false);

		return excludeP.then(excluded => {
			if (excluded) {
				return false;
			}

			return this._parsedIncludeExpression ?
				TPromise.as(this._parsedIncludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
				TPromise.wrap(true);
		}).then(included => {
			return included;
		});
	}

	public hasSiblingExcludeClauses(): boolean {
		return hasSiblingClauses(this._excludeExpression);
	}
}

function hasSiblingClauses(pattern: glob.IExpression): boolean {
	for (let key in pattern) {
		if (typeof pattern[key] !== 'boolean') {
			return true;
		}
	}

	return false;
}

class TextSearchEngine {

	private activeCancellationTokens = new Set<CancellationTokenSource>();
	private collector: TextSearchResultsCollector;

	private isLimitHit: boolean;
	private resultCount = 0;
	private isCanceled: boolean;

	constructor(private pattern: IPatternInfo, private config: ISearchQuery, private provider: vscode.SearchProvider, private _extfs: typeof extfs) {
	}

	public cancel(): void {
		this.isCanceled = true;
		this.activeCancellationTokens.forEach(t => t.cancel());
		this.activeCancellationTokens = new Set();
	}

	public search(onProgress: (matches: IFileMatch[]) => void): TPromise<{ limitHit: boolean }> {
		const folderQueries = this.config.folderQueries;

		return new TPromise<{ limitHit: boolean }>((resolve, reject) => {
			this.collector = new TextSearchResultsCollector(onProgress);

			const onResult = (match: vscode.TextSearchResult, folderIdx: number) => {
				if (this.isCanceled) {
					return;
				}

				if (this.resultCount >= this.config.maxResults) {
					this.isLimitHit = true;
					this.cancel();
				}

				if (!this.isLimitHit) {
					this.resultCount++;
					this.collector.add(match, folderIdx);
				}
			};

			// For each root folder
			TPromise.join(folderQueries.map((fq, i) => {
				return this.searchInFolder(fq, r => onResult(r, i));
			})).then(() => {
				this.collector.flush();
				resolve({ limitHit: this.isLimitHit });
			}, (errs: Error[]) => {
				const errMsg = errs
					.map(err => toErrorMessage(err))
					.filter(msg => !!msg)[0];

				reject(new Error(errMsg));
			});
		});
	}

	private searchInFolder(folderQuery: IFolderQuery<URI>, onResult: (result: vscode.TextSearchResult) => void): TPromise<void> {
		let cancellation = new CancellationTokenSource();
		return new TPromise((resolve, reject) => {

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
			new TPromise(resolve => process.nextTick(resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);
					return this.provider.provideTextSearchResults(patternInfoToQuery(this.pattern), searchOptions, progress, cancellation.token);
				})
				.then(() => {
					this.activeCancellationTokens.delete(cancellation);
					return TPromise.join(testingPs);
				})
				.then(
					() => {
						cancellation.dispose();
						resolve(null);
					},
					err => {
						cancellation.dispose();
						reject(err);
					});
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
			maxResults: this.config.maxResults
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

	constructor(private config: ISearchQuery, private provider: vscode.SearchProvider) {
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
				return resolve({ limitHit: this.isLimitHit, cacheKeys: [] });
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
			})).then(cacheKeys => {
				resolve({ limitHit: this.isLimitHit, cacheKeys });
			}, (errs: Error[]) => {
				const errMsg = errs
					.map(err => toErrorMessage(err))
					.filter(msg => !!msg)[0];

				reject(new Error(errMsg));
			});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>, onResult: (match: IInternalFileMatch) => void): TPromise<string> {
		let cancellation = new CancellationTokenSource();
		return new TPromise((resolve, reject) => {
			const options = this.getSearchOptionsForFolder(fq);
			const tree = this.initDirectoryTree();

			const queryTester = new QueryGlobTester(this.config, fq);
			const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();

			const onProviderResult = (result: URI) => {
				if (this.isCanceled) {
					return;
				}

				const relativePath = path.relative(fq.folder.fsPath, result.fsPath);

				if (noSiblingsClauses) {
					const basename = path.basename(result.fsPath);
					this.matchFile(onResult, { base: fq.folder, relativePath, basename });

					return;
				}

				// TODO: Optimize siblings clauses with ripgrep here.
				this.addDirectoryEntries(tree, fq.folder, relativePath, onResult);
			};

			let folderCacheKey: string;
			new TPromise(_resolve => process.nextTick(_resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);

					folderCacheKey = this.config.cacheKey && (this.config.cacheKey + '_' + fq.folder.fsPath);

					return this.provider.provideFileSearchResults(
						{
							pattern: this.config.filePattern || '',
							cacheKey: folderCacheKey
						},
						options,
						{ report: onProviderResult },
						cancellation.token);
				})
				.then(() => {
					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					this.matchDirectoryTree(tree, queryTester, onResult);
					return null;
				}).then(
					() => {
						cancellation.dispose();
						resolve(folderCacheKey);
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
	cacheKeys: string[];
}

class FileSearchManager {

	private static readonly BATCH_SIZE = 512;

	private readonly expandedCacheKeys = new Map<string, string[]>();

	fileSearch(config: ISearchQuery, provider: vscode.SearchProvider, onResult: (matches: IFileMatch[]) => void): TPromise<ISearchCompleteStats> {
		let searchP: TPromise;
		return new TPromise<ISearchCompleteStats>((c, e) => {
			const engine = new FileSearchEngine(config, provider);

			const onInternalResult = (progress: IInternalFileMatch[]) => {
				onResult(progress.map(m => this.rawMatchToSearchItem(m)));
			};

			searchP = this.doSearch(engine, FileSearchManager.BATCH_SIZE, onInternalResult).then(
				result => {
					if (config.cacheKey) {
						this.expandedCacheKeys.set(config.cacheKey, result.cacheKeys);
					}

					c({
						limitHit: result.limitHit
					});
				},
				e);
		}, () => {
			if (searchP) {
				searchP.cancel();
			}
		});
	}

	clearCache(cacheKey: string, provider: vscode.SearchProvider): void {
		if (!this.expandedCacheKeys.has(cacheKey)) {
			return;
		}

		this.expandedCacheKeys.get(cacheKey).forEach(key => provider.clearCache(key));
		this.expandedCacheKeys.delete(cacheKey);
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		return {
			resource: resources.joinPath(match.base, match.relativePath)
		};
	}

	private doSearch(engine: FileSearchEngine, batchSize: number, onResultBatch: (matches: IInternalFileMatch[]) => void): TPromise<IInternalSearchComplete> {
		return new TPromise((c, e) => {
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
			engine.search(_onResult).then(result => {
				if (batch.length) {
					onResultBatch(batch);
				}

				c(result);
			}, error => {
				if (batch.length) {
					onResultBatch(batch);
				}

				e(error);
			});
		}, () => {
			engine.cancel();
		});
	}
}
