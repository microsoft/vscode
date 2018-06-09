/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import { joinPath } from 'vs/base/common/resources';
import * as strings from 'vs/base/common/strings';
import URI, { UriComponents } from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import * as pfs from 'vs/base/node/pfs';
import { IFileMatch, IFolderQuery, IPatternInfo, IRawFileMatch2, IRawSearchQuery, ISearchCompleteStats, ISearchQuery } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';

type OneOrMore<T> = T | T[];

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private _handlePool: number = 0;

	private _fileSearchManager: FileSearchManager;

	constructor(mainContext: IMainContext, private _schemeTransformer: ISchemeTransformer, private _extfs = extfs, private _pfs = pfs) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager(this._pfs);
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
		return {
			dispose: () => {
				this._searchProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawSearchQuery): TPromise<ISearchCompleteStats> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		return this._fileSearchManager.fileSearch(query, provider).then(
			null,
			null,
			progress => {
				if (Array.isArray(progress)) {
					progress.forEach(p => {
						this._proxy.$handleFindMatch(handle, session, p.resource);
					});
				} else {
					this._proxy.$handleFindMatch(handle, session, progress.resource);
				}
			});
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, rawQuery: IRawSearchQuery): TPromise<ISearchCompleteStats> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchEngine(pattern, query, provider, this._extfs);
		return engine.search().then(
			null,
			null,
			progress => {
				this._proxy.$handleFindMatch(handle, session, progress);
			});
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
	private _batchedCollector: BatchedCollector<IRawFileMatch2>;

	private _currentFolderIdx: number;
	private _currentRelativePath: string;
	private _currentFileMatch: IRawFileMatch2;

	constructor(private folderQueries: IFolderQuery[], private _onResult: (result: IRawFileMatch2[]) => void) {
		this._batchedCollector = new BatchedCollector<IRawFileMatch2>(512, items => this.sendItems(items));
	}

	add(data: vscode.TextSearchResult, folderIdx: number): void {
		// Collects TextSearchResults into IInternalFileMatches and collates using BatchedCollector.
		// This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
		// providers that send results in random order. We could do this step afterwards instead.
		if (this._currentFileMatch && (this._currentFolderIdx !== folderIdx || this._currentRelativePath !== data.path)) {
			this.pushToCollector();
			this._currentFileMatch = null;
		}

		if (!this._currentFileMatch) {
			const resource = joinPath(this.folderQueries[folderIdx].folder, data.path);
			this._currentFileMatch = {
				resource,
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

	private sendItems(items: IRawFileMatch2 | IRawFileMatch2[]): void {
		this._onResult(Array.isArray(items) ? items : [items]);
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

	constructor(private maxBatchSize: number, private cb: (items: T | T[]) => void) {
	}

	addItem(item: T, size: number): void {
		if (!item) {
			return;
		}

		if (this.maxBatchSize > 0) {
			this.addItemToBatch(item, size);
		} else {
			this.cb(item);
		}
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
	public includedInQuerySync(testPath: string, basename?: string, siblingsFn?: () => string[]): boolean {
		if (this._parsedExcludeExpression && this._parsedExcludeExpression(testPath, basename, siblingsFn)) {
			return false;
		}

		if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, siblingsFn)) {
			return false;
		}

		return true;
	}

	/**
	 * Guaranteed async.
	 */
	public includedInQuery(testPath: string, basename?: string, siblingsFn?: () => string[] | TPromise<string[]>): TPromise<boolean> {
		const excludeP = this._parsedExcludeExpression ?
			TPromise.as(this._parsedExcludeExpression(testPath, basename, siblingsFn)).then(result => !!result) :
			TPromise.wrap(false);

		return excludeP.then(excluded => {
			if (excluded) {
				return false;
			}

			return this._parsedIncludeExpression ?
				TPromise.as(this._parsedIncludeExpression(testPath, basename, siblingsFn)).then(result => !!result) :
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

	public search(): PPromise<{ limitHit: boolean }, IRawFileMatch2[]> {
		const folderQueries = this.config.folderQueries;

		return new PPromise<{ limitHit: boolean }, IRawFileMatch2[]>((resolve, reject, _onResult) => {
			this.collector = new TextSearchResultsCollector(this.config.folderQueries, _onResult);

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
			PPromise.join(folderQueries.map((fq, i) => {
				return this.searchInFolder(fq).then(null, null, r => onResult(r, i));
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

	private searchInFolder(folderQuery: IFolderQuery<URI>): PPromise<void, vscode.TextSearchResult> {
		let cancellation = new CancellationTokenSource();
		return new PPromise((resolve, reject, onResult) => {

			const queryTester = new QueryGlobTester(this.config, folderQuery);
			const testingPs = [];
			const progress = {
				report: (result: vscode.TextSearchResult) => {
					const siblingFn = folderQuery.folder.scheme === 'file' && (() => {
						return this.readdir(path.dirname(path.join(folderQuery.folder.fsPath, result.path)));
					});

					testingPs.push(
						queryTester.includedInQuery(result.path, path.basename(result.path), siblingFn)
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
	private normalizedFilePatternLowercase: string;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private exists: boolean;
	// private maxFilesize: number;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private activeCancellationTokens: Set<CancellationTokenSource>;

	// private filesWalked: number;
	// private directoriesWalked: number;

	private globalExcludePattern: glob.ParsedExpression;

	constructor(private config: ISearchQuery, private provider: vscode.SearchProvider, private _pfs: typeof pfs) {
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = config.exists;
		// this.maxFilesize = config.maxFileSize || null;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.activeCancellationTokens = new Set<CancellationTokenSource>();

		// this.filesWalked = 0;
		// this.directoriesWalked = 0;

		if (this.filePattern) {
			this.normalizedFilePatternLowercase = strings.stripWildcards(this.filePattern).toLowerCase();
		}

		this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern);
	}

	public cancel(): void {
		this.isCanceled = true;
		this.activeCancellationTokens.forEach(t => t.cancel());
		this.activeCancellationTokens = new Set();
	}

	public search(): PPromise<{ isLimitHit: boolean }, IInternalFileMatch> {
		const folderQueries = this.config.folderQueries;

		return new PPromise<{ isLimitHit: boolean }, IInternalFileMatch>((resolve, reject, _onResult) => {
			const onResult = (match: IInternalFileMatch) => {
				this.resultCount++;
				_onResult(match);
			};

			// Support that the file pattern is a full path to a file that exists
			this.checkFilePatternAbsoluteMatch().then(({ exists, size }) => {
				if (this.isCanceled) {
					return resolve({ isLimitHit: this.isLimitHit });
				}

				// Report result from file pattern if matching
				if (exists) {
					onResult({
						base: URI.file(this.filePattern),
						basename: path.basename(this.filePattern),
						size
					});

					// Optimization: a match on an absolute path is a good result and we do not
					// continue walking the entire root paths array for other matches because
					// it is very unlikely that another file would match on the full absolute path
					return resolve({ isLimitHit: this.isLimitHit });
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
				PPromise.join(folderQueries.map(fq => {
					return this.searchInFolder(fq).then(null, null, onResult);
				})).then(() => {
					resolve({ isLimitHit: this.isLimitHit });
				}, (errs: Error[]) => {
					const errMsg = errs
						.map(err => toErrorMessage(err))
						.filter(msg => !!msg)[0];

					reject(new Error(errMsg));
				});
			});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>): PPromise<void, IInternalFileMatch> {
		let cancellation = new CancellationTokenSource();
		return new PPromise((resolve, reject, onResult) => {
			const options = this.getSearchOptionsForFolder(fq);
			let filePatternSeen = false;
			const tree = this.initDirectoryTree();

			const queryTester = new QueryGlobTester(this.config, fq);
			const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();

			const onProviderResult = (relativePath: string) => {
				if (this.isCanceled) {
					return;
				}

				if (noSiblingsClauses) {
					if (relativePath === this.filePattern) {
						filePatternSeen = true;
					}

					const basename = path.basename(relativePath);
					this.matchFile(onResult, { base: fq.folder, relativePath, basename });

					return;
				}

				// TODO: Optimize siblings clauses with ripgrep here.
				this.addDirectoryEntries(tree, fq.folder, relativePath, onResult);
			};

			new TPromise(resolve => process.nextTick(resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);
					return this.provider.provideFileSearchResults(
						{ cacheKey: this.config.cacheKey, pattern: this.config.filePattern },
						options,
						{ report: onProviderResult },
						cancellation.token);
				})
				.then(() => {
					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					if (noSiblingsClauses && this.isLimitHit) {
						if (!filePatternSeen) {
							// If the limit was hit, check whether filePattern is an exact relative match because it must be included
							return this.checkFilePatternRelativeMatch(fq.folder).then(({ exists, size }) => {
								if (exists) {
									onResult({
										base: fq.folder,
										relativePath: this.filePattern,
										basename: path.basename(this.filePattern),
									});
								}
							});
						}
					}

					this.matchDirectoryTree(tree, queryTester, onResult);
					return null;
				}).then(
					() => {
						cancellation.dispose();
						resolve(undefined);
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
			// self.directoriesWalked++;
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (!queryTester.includedInQuerySync(relativePath, basename, () => filePattern !== basename ? entries.map(entry => entry.basename) : [])) {
					continue;
				}

				const sub = pathToEntries[relativePath];
				if (sub) {
					matchDirectory(sub);
				} else {
					// self.filesWalked++;
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

	public getStats(): any {
		return null;
		// return {
		// 	fromCache: false,
		// 	traversal: Traversal[this.traversal],
		// 	errors: this.errors,
		// 	fileWalkStartTime: this.fileWalkStartTime,
		// 	fileWalkResultTime: Date.now(),
		// 	directoriesWalked: this.directoriesWalked,
		// 	filesWalked: this.filesWalked,
		// 	resultCount: this.resultCount,
		// 	cmdForkResultTime: this.cmdForkResultTime,
		// 	cmdResultCount: this.cmdResultCount
		// };
	}

	/**
	 * Return whether the file pattern is an absolute path to a file that exists.
	 * TODO@roblou should use FS provider?
	 */
	private checkFilePatternAbsoluteMatch(): TPromise<{ exists: boolean, size?: number }> {
		if (!this.filePattern || !path.isAbsolute(this.filePattern)) {
			return TPromise.wrap({ exists: false });
		}

		return this._pfs.stat(this.filePattern)
			.then(stat => {
				return {
					exists: !stat.isDirectory(),
					size: stat.size
				};
			}, err => {
				return {
					exists: false
				};
			});
	}

	private checkFilePatternRelativeMatch(base: URI): TPromise<{ exists: boolean, size?: number }> {
		if (!this.filePattern || path.isAbsolute(this.filePattern) || base.scheme !== 'file') {
			return TPromise.wrap({ exists: false });
		}

		const absolutePath = path.join(base.fsPath, this.filePattern);
		return this._pfs.stat(absolutePath).then(stat => {
			return {
				exists: !stat.isDirectory(),
				size: stat.size
			};
		}, err => {
			return {
				exists: false
			};
		});
	}

	private matchFile(onResult: (result: IInternalFileMatch) => void, candidate: IInternalFileMatch): void {
		if (this.isFilePatternMatch(candidate.relativePath) && (!this.includePattern || this.includePattern(candidate.relativePath, candidate.basename))) {
			if (this.exists || (this.maxResults && this.resultCount >= this.maxResults)) {
				this.isLimitHit = true;
				this.cancel();
			}

			if (!this.isLimitHit) {
				onResult(candidate);
			}
		}
	}

	private isFilePatternMatch(path: string): boolean {
		// Check for search pattern
		if (this.filePattern) {
			if (this.filePattern === '*') {
				return true; // support the all-matching wildcard
			}

			return strings.fuzzyContains(path, this.normalizedFilePatternLowercase);
		}

		// No patterns means we match all
		return true;
	}
}

class FileSearchManager {

	private static readonly BATCH_SIZE = 512;

	constructor(private _pfs: typeof pfs) { }

	public fileSearch(config: ISearchQuery, provider: vscode.SearchProvider): PPromise<ISearchCompleteStats, OneOrMore<IFileMatch>> {
		let searchP: PPromise;
		return new PPromise<ISearchCompleteStats, OneOrMore<IFileMatch>>((c, e, p) => {
			const engine = new FileSearchEngine(config, provider, this._pfs);
			searchP = this.doSearch(engine, provider, FileSearchManager.BATCH_SIZE).then(c, e, progress => {
				if (Array.isArray(progress)) {
					p(progress.map(m => this.rawMatchToSearchItem(m)));
				} else if ((<IInternalFileMatch>progress).relativePath) {
					p(this.rawMatchToSearchItem(<IInternalFileMatch>progress));
				}
			});
		}, () => {
			if (searchP) {
				searchP.cancel();
			}
		});
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		return {
			resource: joinPath(match.base, match.relativePath)
		};
	}

	private doSearch(engine: FileSearchEngine, provider: vscode.SearchProvider, batchSize?: number): PPromise<ISearchCompleteStats, OneOrMore<IInternalFileMatch>> {
		return new PPromise<ISearchCompleteStats, OneOrMore<IInternalFileMatch>>((c, e, p) => {
			let batch: IInternalFileMatch[] = [];
			engine.search().then(result => {
				if (batch.length) {
					p(batch);
				}

				c({
					limitHit: result.isLimitHit,
					stats: engine.getStats() // TODO@roblou
				});
			}, error => {
				if (batch.length) {
					p(batch);
				}

				e(error);
			}, match => {
				if (match) {
					if (batchSize) {
						batch.push(match);
						if (batchSize > 0 && batch.length >= batchSize) {
							p(batch);
							batch = [];
						}
					} else {
						p(match);
					}
				}
			});
		}, () => {
			engine.cancel();
		});
	}
}
