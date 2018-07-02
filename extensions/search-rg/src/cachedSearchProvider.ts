/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as arrays from './common/arrays';
import { compareItemsByScore, IItemAccessor, prepareQuery, ScorerCache } from './common/fileSearchScorer';
import * as strings from './common/strings';

interface IProviderArgs {
	query: vscode.FileSearchQuery;
	options: vscode.FileSearchOptions;
	progress: vscode.Progress<string>;
	token: vscode.CancellationToken;
}

export class CachedSearchProvider {

	private static readonly BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	constructor(private outputChannel: vscode.OutputChannel) {
	}

	provideFileSearchResults(provider: vscode.SearchProvider, query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, progress: vscode.Progress<string>, token: vscode.CancellationToken): Thenable<void> {
		const onResult = (result: IInternalFileMatch) => {
			progress.report(result.relativePath);
		};

		const providerArgs = {
			query, options, progress, token
		};

		let sortedSearch = this.trySortedSearchFromCache(providerArgs, onResult);
		if (!sortedSearch) {
			const engineOpts = options.maxResults ?
				{
					...options,
					...{ maxResults: 1e9 }
				} :
				options;
			providerArgs.options = engineOpts;

			sortedSearch = this.doSortedSearch(providerArgs, provider);
		}

		return sortedSearch.then(rawMatches => {
			rawMatches.forEach(onResult);
		});
	}

	private doSortedSearch(args: IProviderArgs, provider: vscode.SearchProvider): Promise<IInternalFileMatch[]> {
		let searchPromise: Promise<void>;
		let allResultsPromise = new Promise<IInternalFileMatch[]>((c, e) => {
			let results: IInternalFileMatch[] = [];

			const onResult = (progress: OneOrMore<IInternalFileMatch>) => {
				if (Array.isArray(progress)) {
					results.push(...progress);
				} else {
					results.push(progress);
				}
			};

			searchPromise = this.doSearch(args, provider, onResult, CachedSearchProvider.BATCH_SIZE)
				.then(() => {
					c(results);
				}, e);
		});

		let cache: Cache;
		if (args.query.cacheKey) {
			cache = this.getOrCreateCache(args.query.cacheKey); // TODO include folder in cache key
			cache.resultsToSearchCache[args.query.pattern] = { finished: allResultsPromise };
			allResultsPromise.then(null, err => {
				delete cache.resultsToSearchCache[args.query.pattern];
			});
		}

		return new Promise<IInternalFileMatch[]>((c, e) => {
			allResultsPromise.then(results => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				return this.sortResults(args, results, scorerCache)
					.then(c);
			}, e);
		});
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySortedSearchFromCache(args: IProviderArgs, onResult: (result: IInternalFileMatch) => void): Promise<IInternalFileMatch[]> {
		const cache = args.query.cacheKey && this.caches[args.query.cacheKey];
		if (!cache) {
			return undefined;
		}

		const cached = this.getResultsFromCache(cache, args.query.pattern, onResult);
		if (cached) {
			return cached.then(([results, cacheStats]) => this.sortResults(args, results, cache.scorerCache));
		}

		return undefined;
	}

	private sortResults(args: IProviderArgs, results: IInternalFileMatch[], scorerCache: ScorerCache): Promise<IInternalFileMatch[]> {
		// we use the same compare function that is used later when showing the results using fuzzy scoring
		// this is very important because we are also limiting the number of results by config.maxResults
		// and as such we want the top items to be included in this result set if the number of items
		// exceeds config.maxResults.
		const preparedQuery = prepareQuery(args.query.pattern);
		const compare = (matchA: IInternalFileMatch, matchB: IInternalFileMatch) => compareItemsByScore(matchA, matchB, preparedQuery, true, FileMatchItemAccessor, scorerCache);

		return arrays.topAsync(results, compare, args.options.maxResults || 10000, 10000);
	}

	private getResultsFromCache(cache: Cache, searchValue: string, onResult: (results: IInternalFileMatch) => void): Promise<[IInternalFileMatch[], CacheStats]> {
		if (path.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(path.sep) >= 0;
		let cached: CacheEntry<IInternalFileMatch>;
		let wasResolved: boolean;
		for (let previousSearch in cache.resultsToSearchCache) {
			// If we narrow down, we might be able to reuse the cached results
			if (searchValue.startsWith(previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(path.sep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				const c = cache.resultsToSearchCache[previousSearch];
				c.finished.then(() => { wasResolved = false; });
				cached = c;
				wasResolved = true;
				break;
			}
		}

		if (!cached) {
			return null;
		}

		return new Promise((c, e) => {
			cached.finished.then(cachedEntries => {
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

				c([results, {
					cacheWasResolved: wasResolved,
					cacheFilterStartTime: cacheFilterStartTime,
					cacheFilterResultCount: cachedEntries.length
				}]);
			}, e);
		});
	}

	private doSearch(args: IProviderArgs, provider: vscode.SearchProvider, onResult: (result: OneOrMore<IInternalFileMatch>) => void, batchSize?: number): Promise<void> {
		return new Promise<void>((c, e) => {
			let batch: IInternalFileMatch[] = [];
			const onProviderResult = (match: string) => {
				if (match) {
					const internalMatch: IInternalFileMatch = {
						relativePath: match,
						basename: path.basename(match)
					};

					if (batchSize) {
						batch.push(internalMatch);
						if (batchSize > 0 && batch.length >= batchSize) {
							onResult(batch);
							batch = [];
						}
					} else {
						onResult(internalMatch);
					}
				}
			};

			provider.provideFileSearchResults(args.query, args.options, { report: onProviderResult }, args.token).then(() => {
				if (batch.length) {
					onResult(batch);
				}

				c(); // TODO limitHit
			}, error => {
				if (batch.length) {
					onResult(batch);
				}

				e(error);
			});
		});
	}

	public clearCache(cacheKey: string): Promise<void> {
		delete this.caches[cacheKey];
		return Promise.resolve(undefined);
	}
}

function joinPath(resource: vscode.Uri, pathFragment: string): vscode.Uri {
	const joinedPath = path.join(resource.path || '/', pathFragment);
	return resource.with({
		path: joinedPath
	});
}

interface IInternalFileMatch {
	relativePath?: string; // Not present for extraFiles or absolute path matches
	basename: string;
}

export interface IDisposable {
	dispose(): void;
}

export interface Event<T> {
	(listener: (e: T) => any): IDisposable;
}

interface CacheEntry<T> {
	finished: Promise<T[]>;
	onResult?: Event<T>;
}

type OneOrMore<T> = T | T[];

class Cache {
	public resultsToSearchCache: { [searchValue: string]: CacheEntry<IInternalFileMatch> } = Object.create(null);
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
