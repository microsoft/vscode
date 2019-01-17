/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';
import * as glob from 'vs/base/common/glob';
import * as resources from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { compareItemsByScore, IItemAccessor, prepareQuery, ScorerCache } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { ICachedSearchStats, IFileIndexProviderStats, IFileMatch, IFileQuery, IFileSearchStats, IFolderQuery, ISearchCompleteStats } from 'vs/platform/search/common/search';
import { IDirectoryEntry, IDirectoryTree, IInternalFileMatch } from 'vs/workbench/services/search/node/fileSearchManager';
import { QueryGlobTester, resolvePatternsForProvider } from 'vs/workbench/services/search/node/search';
import * as vscode from 'vscode';

interface IInternalSearchComplete<T = IFileSearchStats> {
	limitHit: boolean;
	results: IInternalFileMatch[];
	stats: T;
}

export class FileIndexSearchEngine {
	private filePattern?: string;
	private normalizedFilePatternLowercase: string;
	private includePattern?: glob.ParsedExpression;
	private maxResults: number | null;
	private exists: boolean;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private filesWalked = 0;
	private dirsWalked = 0;

	private activeCancellationTokens: Set<CancellationTokenSource>;

	private globalExcludePattern?: glob.ParsedExpression;

	constructor(private config: IFileQuery, private provider: vscode.FileIndexProvider) {
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = !!config.exists;
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

	public search(_onResult: (match: IInternalFileMatch) => void): Promise<{ isLimitHit: boolean, stats: IFileIndexProviderStats }> {
		// Searches a single folder
		const folderQuery = this.config.folderQueries[0];

		return new Promise<{ isLimitHit: boolean, stats: IFileIndexProviderStats }>((resolve, reject) => {
			const onResult = (match: IInternalFileMatch) => {
				this.resultCount++;
				_onResult(match);
			};

			if (this.isCanceled) {
				throw canceled();
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

			return Promise.all(this.config.folderQueries.map(fq => this.searchInFolder(folderQuery, onResult))).then(stats => {
				resolve({
					isLimitHit: this.isLimitHit,
					stats: {
						directoriesWalked: this.dirsWalked,
						filesWalked: this.filesWalked,
						fileWalkTime: stats.map(s => s.fileWalkTime).reduce((s, c) => s + c, 0),
						providerTime: stats.map(s => s.providerTime).reduce((s, c) => s + c, 0),
						providerResultCount: stats.map(s => s.providerResultCount).reduce((s, c) => s + c, 0)
					}
				});
			}, (errs: Error[]) => {
				if (!Array.isArray(errs)) {
					errs = [errs];
				}

				errs = arrays.coalesce(errs);
				return Promise.reject(errs[0]);
			});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>, onResult: (match: IInternalFileMatch) => void): Promise<IFileIndexProviderStats> {
		let cancellation = new CancellationTokenSource();
		return new Promise((resolve, reject) => {
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

			let providerSW: StopWatch;
			let providerTime: number;
			let fileWalkTime: number;
			new Promise(resolve => process.nextTick(resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);
					providerSW = StopWatch.create();
					return this.provider.provideFileIndex(options, cancellation.token);
				})
				.then(results => {
					providerTime = providerSW.elapsed();
					const postProcessSW = StopWatch.create();
					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					results!.forEach(onProviderResult);

					this.matchDirectoryTree(tree, queryTester, onResult);
					fileWalkTime = postProcessSW.elapsed();
					return null;
				}).then(
					() => {
						cancellation.dispose();
						resolve(<IFileIndexProviderStats>{
							providerTime,
							fileWalkTime,
							directoriesWalked: this.dirsWalked,
							filesWalked: this.filesWalked
						});
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
			useIgnoreFiles: !fq.disregardIgnoreFiles,
			useGlobalIgnoreFiles: !fq.disregardGlobalIgnoreFiles,
			followSymlinks: !fq.ignoreSymlinks
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
			self.dirsWalked++;
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
					self.filesWalked++;
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
		if (this.isFilePatternMatch(candidate.relativePath!) && (!this.includePattern || this.includePattern(candidate.relativePath!, candidate.basename))) {
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

	public fileSearch(config: IFileQuery, provider: vscode.FileIndexProvider, onBatch: (matches: IFileMatch[]) => void, token: CancellationToken): Promise<ISearchCompleteStats> {
		if (config.sortByScore) {
			let sortedSearch = this.trySortedSearchFromCache(config, token);
			if (!sortedSearch) {
				const engineConfig = config.maxResults ?
					{
						...config,
						...{ maxResults: null }
					} :
					config;

				const engine = new FileIndexSearchEngine(<any>engineConfig, provider);
				sortedSearch = this.doSortedSearch(engine, config, token);
			}

			return sortedSearch.then(complete => {
				this.sendAsBatches(complete.results, onBatch, FileIndexSearchManager.BATCH_SIZE);
				return complete;
			});
		}

		const engine = new FileIndexSearchEngine(config, provider);
		return this.doSearch(engine, token)
			.then(complete => {
				this.sendAsBatches(complete.results, onBatch, FileIndexSearchManager.BATCH_SIZE);
				return <ISearchCompleteStats>{
					limitHit: complete.limitHit,
					stats: {
						type: 'fileIndexProvider',
						detailStats: complete.stats,
						fromCache: false,
						resultCount: complete.results.length
					}
				};
			});
	}

	private getFolderCacheKey(config: IFileQuery): string {
		const uri = config.folderQueries[0].folder.toString();
		const folderCacheKey = config.cacheKey && `${uri}_${config.cacheKey}`;
		if (!this.folderCacheKeys.get(config.cacheKey!)) {
			this.folderCacheKeys.set(config.cacheKey!, new Set());
		}

		this.folderCacheKeys.get(config.cacheKey!)!.add(folderCacheKey!);

		return folderCacheKey!;
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		return {
			resource: match.original || resources.joinPath(match.base, match.relativePath!)
		};
	}

	private doSortedSearch(engine: FileIndexSearchEngine, config: IFileQuery, token: CancellationToken): Promise<IInternalSearchComplete> {
		let allResultsPromise = createCancelablePromise<IInternalSearchComplete<IFileIndexProviderStats>>(token => {
			return this.doSearch(engine, token);
		});

		const folderCacheKey = this.getFolderCacheKey(config);
		let cache: Cache;
		if (folderCacheKey) {
			cache = this.getOrCreateCache(folderCacheKey);
			const cacheRow: ICacheRow = {
				promise: allResultsPromise,
				resolved: false
			};
			cache.resultsToSearchCache[config.filePattern!] = cacheRow;
			allResultsPromise.then(() => {
				cacheRow.resolved = true;
			}, err => {
				delete cache.resultsToSearchCache[config.filePattern!];
			});
			allResultsPromise = this.preventCancellation(allResultsPromise);
		}

		return Promise.resolve<IInternalSearchComplete>(
			allResultsPromise.then(complete => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				const sortSW = (typeof config.maxResults !== 'number' || config.maxResults > 0) && StopWatch.create();
				return this.sortResults(config, complete.results, scorerCache, token)
					.then(sortedResults => {
						// sortingTime: -1 indicates a "sorted" search that was not sorted, i.e. populating the cache when quickopen is opened.
						// Contrasting with findFiles which is not sorted and will have sortingTime: undefined
						const sortingTime = sortSW ? sortSW.elapsed() : -1;
						return <IInternalSearchComplete>{
							limitHit: complete.limitHit || typeof config.maxResults === 'number' && complete.results.length > config.maxResults, // ??
							results: sortedResults,
							stats: {
								detailStats: complete.stats,
								fromCache: false,
								resultCount: sortedResults.length,
								sortingTime,
								type: 'fileIndexProvider'
							}
						};
					});
			}));
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySortedSearchFromCache(config: IFileQuery, token: CancellationToken): Promise<IInternalSearchComplete> | undefined {
		const folderCacheKey = this.getFolderCacheKey(config);
		const cache = folderCacheKey && this.caches[folderCacheKey];
		if (!cache) {
			return undefined;
		}

		const cached = this.getResultsFromCache(cache, config.filePattern!, token);
		if (cached) {
			return cached.then(complete => {
				const sortSW = StopWatch.create();
				return this.sortResults(config, complete.results, cache.scorerCache, token)
					.then(sortedResults => {
						if (token && token.isCancellationRequested) {
							throw canceled();
						}

						return <IInternalSearchComplete<IFileSearchStats>>{
							limitHit: complete.limitHit || typeof config.maxResults === 'number' && complete.results.length > config.maxResults,
							results: sortedResults,
							stats: {
								fromCache: true,
								detailStats: complete.stats,
								type: 'fileIndexProvider',
								resultCount: sortedResults.length,
								sortingTime: sortSW.elapsed()
							}
						};
					});
			});
		}
		return undefined;
	}

	private sortResults(config: IFileQuery, results: IInternalFileMatch[], scorerCache: ScorerCache, token: CancellationToken): Promise<IInternalFileMatch[]> {
		// we use the same compare function that is used later when showing the results using fuzzy scoring
		// this is very important because we are also limiting the number of results by config.maxResults
		// and as such we want the top items to be included in this result set if the number of items
		// exceeds config.maxResults.
		const query = prepareQuery(config.filePattern!);
		const compare = (matchA: IInternalFileMatch, matchB: IInternalFileMatch) => compareItemsByScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);

		return arrays.topAsync(results, compare, config.maxResults!, 10000, token);
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

	private getResultsFromCache(cache: Cache, searchValue: string, token: CancellationToken): Promise<IInternalSearchComplete<ICachedSearchStats>> | null {
		const cacheLookupSW = StopWatch.create();

		if (path.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(path.sep) >= 0;
		let cacheRow: ICacheRow | undefined;
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(path.sep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				const row = cache.resultsToSearchCache[previousSearch];
				cacheRow = {
					promise: this.preventCancellation(row.promise),
					resolved: row.resolved
				};
				break;
			}
		}

		if (!cacheRow) {
			return null;
		}

		const cacheLookupTime = cacheLookupSW.elapsed();
		const cacheFilterSW = StopWatch.create();

		return new Promise<IInternalSearchComplete<ICachedSearchStats>>((c, e) => {
			token.onCancellationRequested(() => e(canceled()));

			cacheRow!.promise.then(complete => {
				if (token && token.isCancellationRequested) {
					e(canceled());
				}

				// Pattern match on results
				let results: IInternalFileMatch[] = [];
				const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
				for (let i = 0; i < complete.results.length; i++) {
					let entry = complete.results[i];

					// Check if this entry is a match for the search value
					if (!strings.fuzzyContains(entry.relativePath!, normalizedSearchValueLowercase)) {
						continue;
					}

					results.push(entry);
				}

				c(<IInternalSearchComplete<ICachedSearchStats>>{
					limitHit: complete.limitHit,
					results,
					stats: {
						cacheWasResolved: cacheRow!.resolved,
						cacheLookupTime,
						cacheFilterTime: cacheFilterSW.elapsed(),
						cacheEntryCount: complete.results.length
					}
				});
			}, e);
		});
	}

	private doSearch(engine: FileIndexSearchEngine, token: CancellationToken): Promise<IInternalSearchComplete<IFileIndexProviderStats>> {
		token.onCancellationRequested(() => engine.cancel());
		const results: IInternalFileMatch[] = [];
		const onResult = match => results.push(match);

		return engine.search(onResult).then(result => {
			return <IInternalSearchComplete<IFileIndexProviderStats>>{
				limitHit: result.isLimitHit,
				results,
				stats: result.stats
			};
		});
	}

	public clearCache(cacheKey: string): void {
		const expandedKeys = this.folderCacheKeys.get(cacheKey);
		if (!expandedKeys) {
			return undefined;
		}

		expandedKeys.forEach(key => delete this.caches[key]);

		this.folderCacheKeys.delete(cacheKey);

		return undefined;
	}

	private preventCancellation<C>(promise: CancelablePromise<C>): CancelablePromise<C> {
		return new class implements CancelablePromise<C> {
			cancel() {
				// Do nothing
			}
			then(resolve, reject) {
				return promise.then(resolve, reject);
			}
			catch(reject?) {
				return this.then(undefined, reject);
			}
		};
	}
}

interface ICacheRow {
	promise: CancelablePromise<IInternalSearchComplete<IFileIndexProviderStats>>;
	resolved: boolean;
}

class Cache {

	public resultsToSearchCache: { [searchValue: string]: ICacheRow; } = Object.create(null);

	public scorerCache: ScorerCache = Object.create(null);
}

const FileMatchItemAccessor = new class implements IItemAccessor<IInternalFileMatch> {

	public getItemLabel(match: IInternalFileMatch): string {
		return match.basename; // e.g. myFile.txt
	}

	public getItemDescription(match: IInternalFileMatch): string {
		return match.relativePath!.substr(0, match.relativePath!.length - match.basename.length - 1); // e.g. some/path/to/file
	}

	public getItemPath(match: IInternalFileMatch): string {
		return match.relativePath!; // e.g. some/path/to/file/myFile.txt
	}
};
