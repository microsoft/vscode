/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as arrays from './common/arrays';
import { compareItemsByScore, IItemAccessor, prepareQuery, ScorerCache } from './common/fileSearchScorer';
import * as strings from './common/strings';
import { joinPath } from './utils';

interface IProviderArgs {
	query: vscode.FileSearchQuery;
	options: vscode.FileSearchOptions;
	progress: vscode.Progress<vscode.Uri>;
	token: vscode.CancellationToken;
}

export interface IInternalFileSearchProvider {
	provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<string>, token: vscode.CancellationToken): Thenable<void>;
}

export class CachedSearchProvider {

	private static readonly BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	provideFileSearchResults(provider: IInternalFileSearchProvider, query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
		const onResult = (result: IInternalFileMatch) => {
			progress.report(joinPath(options.folder, result.relativePath));
		};

		const providerArgs: IProviderArgs = {
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

	private doSortedSearch(args: IProviderArgs, provider: IInternalFileSearchProvider): Promise<IInternalFileMatch[]> {
		const allResultsPromise = new Promise<IInternalFileMatch[]>((c, e) => {
			const results: IInternalFileMatch[] = [];
			const onResult = (progress: IInternalFileMatch[]) => results.push(...progress);

			// TODO@roblou set maxResult = null
			this.doSearch(args, provider, onResult, CachedSearchProvider.BATCH_SIZE)
				.then(() => c(results), e);
		});

		let cache: Cache;
		if (args.query.cacheKey) {
			cache = this.getOrCreateCache(args.query.cacheKey); // TODO include folder in cache key
			cache.resultsToSearchCache[args.query.pattern] = { finished: allResultsPromise };
			allResultsPromise.then(null, err => {
				delete cache.resultsToSearchCache[args.query.pattern];
			});
		}

		return allResultsPromise.then(results => {
			// TODO@roblou quickopen results are not scored until the first keypress
			if (args.query.pattern) {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				return this.sortResults(args, results, scorerCache);
			} else {
				return results;
			}
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
			return cached.then((results) => this.sortResults(args, results, cache.scorerCache));
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

		return arrays.topAsync(results, compare, args.options.maxResults || 0, 10000);
	}

	private getResultsFromCache(cache: Cache, searchValue: string, onResult: (results: IInternalFileMatch) => void): Promise<IInternalFileMatch[]> {
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

				c(results);
			}, e);
		});
	}

	private doSearch(args: IProviderArgs, provider: IInternalFileSearchProvider, onResult: (result: IInternalFileMatch[]) => void, batchSize: number): Promise<void> {
		return new Promise<void>((c, e) => {
			let batch: IInternalFileMatch[] = [];
			const onProviderResult = (match: string) => {
				if (match) {
					const internalMatch: IInternalFileMatch = {
						relativePath: match,
						basename: path.basename(match)
					};

					batch.push(internalMatch);
					if (batchSize > 0 && batch.length >= batchSize) {
						onResult(batch);
						batch = [];
					}
				}
			};

			provider.provideFileSearchResults(args.options, { report: onProviderResult }, args.token).then(() => {
				if (batch.length) {
					onResult(batch);
				}

				c();
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

interface IInternalFileMatch {
	relativePath?: string; // Not present for extraFiles or absolute path matches
	basename: string;
}

interface CacheEntry<T> {
	finished: Promise<T[]>;
}

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
