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
import { TPromise } from 'vs/base/common/winjs.base';
import { compareItemsByScore, IItemAccessor, prepareQuery, ScorerCache } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { IFileMatch, IFolderQuery, IRawSearchQuery, ISearchCompleteStats, ISearchQuery } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';

export interface IInternalFileMatch {
	base: URI;
	original?: URI;
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

// ???
interface IInternalSearchComplete {
	limitHit: boolean;
	results: IInternalFileMatch[];
}

export class FileIndexSearchEngine {
	private filePattern: string;
	private normalizedFilePatternLowercase: string;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private exists: boolean;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private activeCancellationTokens: Set<CancellationTokenSource>;

	private globalExcludePattern: glob.ParsedExpression;

	constructor(private config: ISearchQuery, private provider: vscode.FileIndexProvider) {
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = config.exists;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.activeCancellationTokens = new Set<CancellationTokenSource>();

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

	public search(_onResult: (match: IInternalFileMatch) => void): TPromise<{ isLimitHit: boolean }> {
		if (this.config.folderQueries.length !== 1) {
			throw new Error('Searches just one folder');
		}

		const folderQuery = this.config.folderQueries[0];

		return new TPromise<{ isLimitHit: boolean }>((resolve, reject) => {
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

			return this.searchInFolder(folderQuery, _onResult)
				.then(() => {
					resolve({ isLimitHit: this.isLimitHit });
				}, (errs: Error[]) => {
					const errMsg = errs
						.map(err => toErrorMessage(err))
						.filter(msg => !!msg)[0];

					reject(new Error(errMsg));
				});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>, onResult: (match: IInternalFileMatch) => void): TPromise<void> {
		let cancellation = new CancellationTokenSource();
		return new TPromise((resolve, reject) => {
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
					this.matchFile(onResult, { base: fq.folder, relativePath, basename, original: uri });

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

	private getSearchOptionsForFolder(fq: IFolderQuery<URI>): vscode.FileIndexOptions {
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

	private readonly folderCacheKeys = new Map<string, Set<string>>();

	public fileSearch(config: ISearchQuery, provider: vscode.FileIndexProvider, onBatch: (matches: IFileMatch[]) => void): TPromise<ISearchCompleteStats> {
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
				sortedSearch = this.doSortedSearch(engine, config);
			}

			return new TPromise<ISearchCompleteStats>((c, e) => {
				sortedSearch.then(complete => {
					this.sendAsBatches(complete.results, onBatch, FileIndexSearchManager.BATCH_SIZE);
					c(complete);
				}, e);
			}, () => {
				sortedSearch.cancel();
			});
		}

		const engine = new FileIndexSearchEngine(config, provider);
		return this.doSearch(engine)
			.then(complete => {
				this.sendAsBatches(complete.results, onBatch, FileIndexSearchManager.BATCH_SIZE);
				return <ISearchCompleteStats>{
					limitHit: complete.limitHit
				};
			});
	}

	private getFolderCacheKey(config: ISearchQuery): string {
		const uri = config.folderQueries[0].folder.toString();
		const folderCacheKey = config.cacheKey && `${uri}_${config.cacheKey}`;
		if (!this.folderCacheKeys.get(config.cacheKey)) {
			this.folderCacheKeys.set(config.cacheKey, new Set());
		}

		this.folderCacheKeys.get(config.cacheKey).add(folderCacheKey);

		return folderCacheKey;
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		return {
			resource: match.original || resources.joinPath(match.base, match.relativePath)
		};
	}

	private doSortedSearch(engine: FileIndexSearchEngine, config: ISearchQuery): TPromise<IInternalSearchComplete> {
		let searchPromise: TPromise<void>;
		let allResultsPromise = new TPromise<IInternalSearchComplete>((c, e) => {
			searchPromise = this.doSearch(engine).then(c, e);
		}, () => {
			searchPromise.cancel();
		});

		const folderCacheKey = this.getFolderCacheKey(config);
		let cache: Cache;
		if (folderCacheKey) {
			cache = this.getOrCreateCache(folderCacheKey);
			cache.resultsToSearchCache[config.filePattern] = allResultsPromise;
			allResultsPromise.then(null, err => {
				delete cache.resultsToSearchCache[config.filePattern];
			});
			allResultsPromise = this.preventCancellation(allResultsPromise);
		}

		let chained: TPromise<void>;
		return new TPromise<IInternalSearchComplete>((c, e) => {
			chained = allResultsPromise.then(complete => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				return this.sortResults(config, complete.results, scorerCache)
					.then(sortedResults => {

						c({
							limitHit: complete.limitHit || typeof config.maxResults === 'number' && complete.results.length > config.maxResults, // ??
							results: sortedResults
						});
					});
			}, e);
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

	private trySortedSearchFromCache(config: ISearchQuery): TPromise<IInternalSearchComplete> {
		const folderCacheKey = this.getFolderCacheKey(config);
		const cache = folderCacheKey && this.caches[folderCacheKey];
		if (!cache) {
			return undefined;
		}

		const cached = this.getResultsFromCache(cache, config.filePattern);
		if (cached) {
			let chained: TPromise<void>;
			return new TPromise<IInternalSearchComplete>((c, e) => {
				chained = cached.then(complete => {
					return this.sortResults(config, complete.results, cache.scorerCache)
						.then(sortedResults => {
							c({
								limitHit: complete.limitHit || typeof config.maxResults === 'number' && complete.results.length > config.maxResults,
								results: sortedResults
							});
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

	private sendAsBatches(rawMatches: IInternalFileMatch[], onBatch: (batch: IFileMatch[]) => void, batchSize: number) {
		const serializedMatches = rawMatches.map(rawMatch => this.rawMatchToSearchItem(rawMatch));
		if (batchSize && batchSize > 0) {
			for (let i = 0; i < serializedMatches.length; i += batchSize) {
				onBatch(serializedMatches.slice(i, i + batchSize));
			}
		} else {
			onBatch(serializedMatches);
		}
	}

	private getResultsFromCache(cache: Cache, searchValue: string): TPromise<IInternalSearchComplete> {
		if (path.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(path.sep) >= 0;
		let cached: TPromise<IInternalSearchComplete>;
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(path.sep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				const c = cache.resultsToSearchCache[previousSearch];
				cached = this.preventCancellation(c);
				break;
			}
		}

		if (!cached) {
			return null;
		}

		return new TPromise<IInternalSearchComplete>((c, e) => {
			cached.then(complete => {
				// Pattern match on results
				let results: IInternalFileMatch[] = [];
				const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
				for (let i = 0; i < complete.results.length; i++) {
					let entry = complete.results[i];

					// Check if this entry is a match for the search value
					if (!strings.fuzzyContains(entry.relativePath, normalizedSearchValueLowercase)) {
						continue;
					}

					results.push(entry);
				}

				c({
					limitHit: complete.limitHit,
					results
				});
			}, e);
		}, () => {
			cached.cancel();
		});
	}

	private doSearch(engine: FileIndexSearchEngine): TPromise<IInternalSearchComplete> {
		const results: IInternalFileMatch[] = [];
		const onResult = match => results.push(match);
		return new TPromise<IInternalSearchComplete>((c, e) => {
			engine.search(onResult).then(result => {
				c({
					limitHit: result.isLimitHit,
					results
				});
			}, e);
		}, () => {
			engine.cancel();
		});
	}

	public clearCache(cacheKey: string): TPromise<void> {
		if (!this.folderCacheKeys.has(cacheKey)) {
			return TPromise.wrap(undefined);
		}

		const expandedKeys = this.folderCacheKeys.get(cacheKey);
		expandedKeys.forEach(key => delete this.caches[key]);

		this.folderCacheKeys.delete(cacheKey);

		return TPromise.as(undefined);
	}

	private preventCancellation<C>(promise: TPromise<C>): TPromise<C> {
		return new TPromise<C>((c, e) => {
			// Allow for piled up cancellations to come through first.
			process.nextTick(() => {
				promise.then(c, e);
			});
		}, () => {
			// Do not propagate.
		});
	}
}

class Cache {

	public resultsToSearchCache: { [searchValue: string]: TPromise<IInternalSearchComplete>; } = Object.create(null);

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
