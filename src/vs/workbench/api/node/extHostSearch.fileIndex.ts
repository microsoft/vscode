/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import * as resources from 'vs/base/common/resources';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { compareItemsByScore, IItemAccessor, prepareQuery, ScorerCache } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { ICachedSearchStats, IFileMatch, IFolderQuery, IRawSearchQuery, ISearchCompleteStats, ISearchQuery } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';

export interface IInternalFileMatch {
	base: URI;
	relativePath?: string; // Not present for extraFiles or absolute path matches
	basename: string;
	size?: number;
}

/**
 *  Computes the patterns that the provider handles. Discards sibling clauses and 'false' patterns
 */
export function resolvePatternsForProvider(globalPattern: glob.IExpression, folderPattern: glob.IExpression): string[] {
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

export class QueryGlobTester {

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

export interface IDirectoryEntry {
	base: URI;
	relativePath: string;
	basename: string;
}

export interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}

export class FileIndexSearchEngine {
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

	constructor(private config: ISearchQuery, private provider: vscode.FileIndexProvider) {
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

			if (this.isCanceled) {
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
	}

	private searchInFolder(fq: IFolderQuery<URI>): PPromise<void, IInternalFileMatch> {
		let cancellation = new CancellationTokenSource();
		return new PPromise((resolve, reject, onResult) => {
			const options = this.getSearchOptionsForFolder(fq);
			const tree = this.initDirectoryTree();

			const queryTester = new QueryGlobTester(this.config, fq);
			const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();

			const onProviderResult = (uri: URI) => {
				if (this.isCanceled) {
					return;
				}

				// TODO@rob - ???
				const relativePath = path.relative(fq.folder.path, uri.path);
				if (noSiblingsClauses) {
					const basename = path.basename(uri.path);
					this.matchFile(onResult, { base: fq.folder, relativePath, basename });

					return;
				}

				// TODO: Optimize siblings clauses with ripgrep here.
				this.addDirectoryEntries(tree, fq.folder, relativePath, onResult);
			};

			new TPromise(resolve => process.nextTick(resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);
					return this.provider.provideFileIndex(options, cancellation.token);
				})
				.then(results => {
					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					results.forEach(onProviderResult);

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
			followSymlinks: !this.config.ignoreSymlinks
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
				const hasSibling = glob.hasSiblingFn(() => entries.map(entry => entry.basename));
				if (!queryTester.includedInQuerySync(relativePath, basename, filePattern !== basename ? hasSibling : undefined)) {
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

export class FileIndexSearchManager {

	private static readonly BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	public fileSearch(config: ISearchQuery, provider: vscode.FileIndexProvider, onResult: (matches: IFileMatch[]) => void): TPromise<ISearchCompleteStats> {
		if (config.sortByScore) {
			let sortedSearch = this.trySortedSearchFromCache(config);
			if (!sortedSearch) {
				const engineConfig = config.maxResults ?
					{
						...config,
						...{ maxResults: null }
					} :
					config;

				const engine = new FileIndexSearchEngine(engineConfig, provider);
				sortedSearch = this.doSortedSearch(engine, provider, config);
			}

			return new TPromise<ISearchCompleteStats>((c, e) => {
				process.nextTick(() => { // allow caller to register progress callback first
					sortedSearch.then(([result, rawMatches]) => {
						const serializedMatches = rawMatches.map(rawMatch => this.rawMatchToSearchItem(rawMatch));
						this.sendProgress(serializedMatches, onResult, FileIndexSearchManager.BATCH_SIZE);
						c(result);
					}, e, onResult);
				});
			}, () => {
				sortedSearch.cancel();
			});
		}

		let searchPromise: TPromise<void, IInternalFileMatch[]>;
		return new TPromise<ISearchCompleteStats>((c, e) => {
			const engine = new FileIndexSearchEngine(config, provider);
			searchPromise = this.doSearch(engine, provider, FileIndexSearchManager.BATCH_SIZE)
				.then(c, e, progress => {
					if (Array.isArray(progress)) {
						onResult(progress.map(m => this.rawMatchToSearchItem(m)));
					} else if ((<IInternalFileMatch>progress).relativePath) {
						onResult([this.rawMatchToSearchItem(<IInternalFileMatch>progress)]);
					}
				});
		}, () => {
			searchPromise.cancel();
		});
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		return {
			resource: resources.joinPath(match.base, match.relativePath)
		};
	}

	private doSortedSearch(engine: FileIndexSearchEngine, provider: vscode.FileIndexProvider, config: IRawSearchQuery): PPromise<[ISearchCompleteStats, IInternalFileMatch[]]> {
		let searchPromise: PPromise<void, IInternalFileMatch[]>;
		let allResultsPromise = new PPromise<[ISearchCompleteStats, IInternalFileMatch[]], IInternalFileMatch[]>((c, e, p) => {
			let results: IInternalFileMatch[] = [];
			searchPromise = this.doSearch(engine, provider, -1)
				.then(result => {
					c([result, results]);
				}, e, progress => {
					if (Array.isArray(progress)) {
						results = progress;
					} else {
						p(progress);
					}
				});
		}, () => {
			searchPromise.cancel();
		});

		let cache: Cache;
		if (config.cacheKey) {
			cache = this.getOrCreateCache(config.cacheKey);
			cache.resultsToSearchCache[config.filePattern] = allResultsPromise;
			allResultsPromise.then(null, err => {
				delete cache.resultsToSearchCache[config.filePattern];
			});
			allResultsPromise = this.preventCancellation(allResultsPromise);
		}

		let chained: TPromise<void>;
		return new PPromise<[ISearchCompleteStats, IInternalFileMatch[]]>((c, e, p) => {
			chained = allResultsPromise.then(([result, results]) => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				const unsortedResultTime = Date.now();
				return this.sortResults(config, results, scorerCache)
					.then(sortedResults => {
						const sortedResultTime = Date.now();

						c([{
							stats: {
								...result.stats,
								...{ unsortedResultTime, sortedResultTime }
							},
							limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults
						}, sortedResults]);
					});
			}, e, p);
		}, () => {
			chained.cancel();
		});
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySortedSearchFromCache(config: IRawSearchQuery): TPromise<[ISearchCompleteStats, IInternalFileMatch[]]> {
		const cache = config.cacheKey && this.caches[config.cacheKey];
		if (!cache) {
			return undefined;
		}

		const cacheLookupStartTime = Date.now();
		const cached = this.getResultsFromCache(cache, config.filePattern);
		if (cached) {
			let chained: TPromise<void>;
			return new TPromise<[ISearchCompleteStats, IInternalFileMatch[]]>((c, e) => {
				chained = cached.then(([result, results, cacheStats]) => {
					const cacheLookupResultTime = Date.now();
					return this.sortResults(config, results, cache.scorerCache)
						.then(sortedResults => {
							const sortedResultTime = Date.now();

							const stats: ICachedSearchStats = {
								fromCache: true,
								cacheLookupStartTime: cacheLookupStartTime,
								cacheFilterStartTime: cacheStats.cacheFilterStartTime,
								cacheLookupResultTime: cacheLookupResultTime,
								cacheEntryCount: cacheStats.cacheFilterResultCount,
								resultCount: results.length
							};
							if (config.sortByScore) {
								stats.unsortedResultTime = cacheLookupResultTime;
								stats.sortedResultTime = sortedResultTime;
							}
							if (!cacheStats.cacheWasResolved) {
								stats.joined = result.stats;
							}
							c([
								{
									limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults,
									stats: stats
								},
								sortedResults
							]);
						});
				}, e);
			}, () => {
				chained.cancel();
			});
		}
		return undefined;
	}

	private sortResults(config: IRawSearchQuery, results: IInternalFileMatch[], scorerCache: ScorerCache): TPromise<IInternalFileMatch[]> {
		// we use the same compare function that is used later when showing the results using fuzzy scoring
		// this is very important because we are also limiting the number of results by config.maxResults
		// and as such we want the top items to be included in this result set if the number of items
		// exceeds config.maxResults.
		const query = prepareQuery(config.filePattern);
		const compare = (matchA: IInternalFileMatch, matchB: IInternalFileMatch) => compareItemsByScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);

		return arrays.topAsync(results, compare, config.maxResults, 10000);
	}

	private sendProgress(results: IFileMatch[], progressCb: (batch: IFileMatch[]) => void, batchSize: number) {
		if (batchSize && batchSize > 0) {
			for (let i = 0; i < results.length; i += batchSize) {
				progressCb(results.slice(i, i + batchSize));
			}
		} else {
			progressCb(results);
		}
	}

	private getResultsFromCache(cache: Cache, searchValue: string): PPromise<[ISearchCompleteStats, IInternalFileMatch[], CacheStats]> {
		if (path.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(path.sep) >= 0;
		let cached: PPromise<[ISearchCompleteStats, IInternalFileMatch[]], IInternalFileMatch[]>;
		let wasResolved: boolean;
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(path.sep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				const c = cache.resultsToSearchCache[previousSearch];
				c.then(() => { wasResolved = false; });
				wasResolved = true;
				cached = this.preventCancellation(c);
				break;
			}
		}

		if (!cached) {
			return null;
		}

		return new PPromise<[ISearchCompleteStats, IInternalFileMatch[], CacheStats]>((c, e, p) => {
			cached.then(([complete, cachedEntries]) => {
				const cacheFilterStartTime = Date.now();

				// Pattern match on results
				let results: IInternalFileMatch[] = [];
				const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
				for (let i = 0; i < cachedEntries.length; i++) {
					let entry = cachedEntries[i];

					// Check if this entry is a match for the search value
					if (!strings.fuzzyContains(entry.relativePath, normalizedSearchValueLowercase)) {
						continue;
					}

					results.push(entry);
				}

				c([complete, results, {
					cacheWasResolved: wasResolved,
					cacheFilterStartTime: cacheFilterStartTime,
					cacheFilterResultCount: cachedEntries.length
				}]);
			}, e, p);
		}, () => {
			cached.cancel();
		});
	}

	private doSearch(engine: FileIndexSearchEngine, provider: vscode.FileIndexProvider, batchSize?: number): PPromise<ISearchCompleteStats, IInternalFileMatch[]> {
		return new PPromise<ISearchCompleteStats, IInternalFileMatch[]>((c, e, p) => {
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
						p([match]);
					}
				}
			});
		}, () => {
			engine.cancel();
		});
	}

	public clearCache(cacheKey: string): TPromise<void> {
		delete this.caches[cacheKey];
		return TPromise.as(undefined);
	}

	private preventCancellation<C, P>(promise: PPromise<C, P>): PPromise<C, P> {
		return new PPromise<C, P>((c, e, p) => {
			// Allow for piled up cancellations to come through first.
			process.nextTick(() => {
				promise.then(c, e, p);
			});
		}, () => {
			// Do not propagate.
		});
	}
}

class Cache {

	public resultsToSearchCache: { [searchValue: string]: PPromise<[ISearchCompleteStats, IInternalFileMatch[]], IInternalFileMatch[]>; } = Object.create(null);

	public scorerCache: ScorerCache = Object.create(null);
}

const FileMatchItemAccessor = new class implements IItemAccessor<IInternalFileMatch> {

	public getItemLabel(match: IInternalFileMatch): string {
		return match.basename; // e.g. myFile.txt
	}

	public getItemDescription(match: IInternalFileMatch): string {
		return match.relativePath.substr(0, match.relativePath.length - match.basename.length - 1); // e.g. some/path/to/file
	}

	public getItemPath(match: IInternalFileMatch): string {
		return match.relativePath; // e.g. some/path/to/file/myFile.txt
	}
};

interface CacheStats {
	cacheWasResolved: boolean;
	cacheFilterStartTime: number;
	cacheFilterResultCount: number;
}
