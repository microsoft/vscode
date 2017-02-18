/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import { isAbsolute, sep } from 'path';

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import arrays = require('vs/base/common/arrays');
import { compareByScore } from 'vs/base/common/comparers';
import objects = require('vs/base/common/objects');
import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { MAX_FILE_SIZE } from 'vs/platform/files/common/files';
import { FileWalker, Engine as FileSearchEngine } from 'vs/workbench/services/search/node/fileSearch';
import { Engine as TextSearchEngine } from 'vs/workbench/services/search/node/textSearch';
import { TextSearchWorkerProvider } from 'vs/workbench/services/search/node/textSearchWorkerProvider';
import { IRawSearchService, IRawSearch, IRawFileMatch, ISerializedFileMatch, ISerializedSearchProgressItem, ISerializedSearchComplete, ISearchEngine } from './search';
import { ICachedSearchStats, IProgress } from 'vs/platform/search/common/search';

export type IRawProgressItem<T> = T | T[] | IProgress;

export class SearchService implements IRawSearchService {

	private static BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	private textSearchWorkerProvider: TextSearchWorkerProvider;

	public fileSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return this.doFileSearch(FileSearchEngine, config, SearchService.BATCH_SIZE);
	}

	public textSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		if (!this.textSearchWorkerProvider) {
			this.textSearchWorkerProvider = new TextSearchWorkerProvider();
		}

		let engine = new TextSearchEngine(
			config,
			new FileWalker({
				rootFolders: config.rootFolders,
				extraFiles: config.extraFiles,
				includePattern: config.includePattern,
				excludePattern: config.excludePattern,
				filePattern: config.filePattern,
				maxFilesize: MAX_FILE_SIZE
			}),
			this.textSearchWorkerProvider);

		return this.doTextSearch(engine, SearchService.BATCH_SIZE);
	}

	public doFileSearch(EngineClass: { new (config: IRawSearch): ISearchEngine<IRawFileMatch>; }, config: IRawSearch, batchSize?: number): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {

		if (config.sortByScore) {
			let sortedSearch = this.trySortedSearchFromCache(config);
			if (!sortedSearch) {
				const walkerConfig = config.maxResults ? objects.assign({}, config, { maxResults: null }) : config;
				const engine = new EngineClass(walkerConfig);
				sortedSearch = this.doSortedSearch(engine, config);
			}

			return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
				process.nextTick(() => { // allow caller to register progress callback first
					sortedSearch.then(([result, rawMatches]) => {
						const serializedMatches = rawMatches.map(rawMatch => this.rawMatchToSearchItem(rawMatch));
						this.sendProgress(serializedMatches, p, batchSize);
						c(result);
					}, e, p);
				});
			}, () => {
				sortedSearch.cancel();
			});
		}

		let searchPromise: PPromise<void, IRawProgressItem<IRawFileMatch>>;
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			const engine = new EngineClass(config);
			searchPromise = this.doSearch(engine, batchSize)
				.then(c, e, progress => {
					if (Array.isArray(progress)) {
						p(progress.map(m => this.rawMatchToSearchItem(m)));
					} else if ((<IRawFileMatch>progress).relativePath) {
						p(this.rawMatchToSearchItem(<IRawFileMatch>progress));
					} else {
						p(progress);
					}
				});
		}, () => {
			searchPromise.cancel();
		});
	}

	private rawMatchToSearchItem(match: IRawFileMatch): ISerializedFileMatch {
		return { path: match.base ? [match.base, match.relativePath].join(sep) : match.relativePath };
	}

	private doSortedSearch(engine: ISearchEngine<IRawFileMatch>, config: IRawSearch): PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress> {
		let searchPromise: PPromise<void, IRawProgressItem<IRawFileMatch>>;
		let allResultsPromise = new PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>((c, e, p) => {
			let results: IRawFileMatch[] = [];
			searchPromise = this.doSearch(engine, -1)
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

		return new PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>((c, e, p) => {
			allResultsPromise.then(([result, results]) => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				const unsortedResultTime = Date.now();
				const sortedResults = this.sortResults(config, results, scorerCache);
				const sortedResultTime = Date.now();

				c([{
					stats: objects.assign({}, result.stats, {
						unsortedResultTime,
						sortedResultTime
					}),
					limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults
				}, sortedResults]);
			}, e, p);
		}, () => {
			allResultsPromise.cancel();
		});
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySortedSearchFromCache(config: IRawSearch): PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress> {
		const cache = config.cacheKey && this.caches[config.cacheKey];
		if (!cache) {
			return undefined;
		}

		const cacheLookupStartTime = Date.now();
		const cached = this.getResultsFromCache(cache, config.filePattern);
		if (cached) {
			return new PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>((c, e, p) => {
				cached.then(([result, results, cacheStats]) => {
					const cacheLookupResultTime = Date.now();
					const sortedResults = this.sortResults(config, results, cache.scorerCache);
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
				}, e, p);
			}, () => {
				cached.cancel();
			});
		}
		return undefined;
	}

	private sortResults(config: IRawSearch, results: IRawFileMatch[], scorerCache: ScorerCache): IRawFileMatch[] {
		const filePattern = config.filePattern;
		const normalizedSearchValue = strings.stripWildcards(filePattern).toLowerCase();
		const compare = (elementA: IRawFileMatch, elementB: IRawFileMatch) => compareByScore(elementA, elementB, FileMatchAccessor, filePattern, normalizedSearchValue, scorerCache);
		return arrays.top(results, compare, config.maxResults);
	}

	private sendProgress(results: ISerializedFileMatch[], progressCb: (batch: ISerializedFileMatch[]) => void, batchSize: number) {
		if (batchSize && batchSize > 0) {
			for (let i = 0; i < results.length; i += batchSize) {
				progressCb(results.slice(i, i + batchSize));
			}
		} else {
			progressCb(results);
		}
	}

	private getResultsFromCache(cache: Cache, searchValue: string): PPromise<[ISerializedSearchComplete, IRawFileMatch[], CacheStats], IProgress> {
		if (isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(sep) >= 0;
		let cached: PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>;
		let wasResolved: boolean;
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(sep) < 0) {
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

		return new PPromise<[ISerializedSearchComplete, IRawFileMatch[], CacheStats], IProgress>((c, e, p) => {
			cached.then(([complete, cachedEntries]) => {
				const cacheFilterStartTime = Date.now();

				// Pattern match on results
				let results: IRawFileMatch[] = [];
				const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
				for (let i = 0; i < cachedEntries.length; i++) {
					let entry = cachedEntries[i];

					// Check if this entry is a match for the search value
					if (!scorer.matches(entry.relativePath, normalizedSearchValueLowercase)) {
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

	private doTextSearch(engine: TextSearchEngine, batchSize: number): PPromise<ISerializedSearchComplete, IRawProgressItem<ISerializedFileMatch>> {
		return new PPromise<ISerializedSearchComplete, IRawProgressItem<ISerializedFileMatch>>((c, e, p) => {
			// Use BatchedCollector to get new results to the frontend every 2s at least, until 50 results have been returned
			const collector = new BatchedCollector<ISerializedFileMatch>(batchSize, p);
			engine.search((matches) => {
				const totalMatches = matches.reduce((acc, m) => acc + m.numMatches, 0);
				collector.addItems(matches, totalMatches);
			}, (progress) => {
				p(progress);
			}, (error, stats) => {
				collector.flush();

				if (error) {
					e(error);
				} else {
					c(stats);
				}
			});
		}, () => {
			engine.cancel();
		});
	}

	private doSearch<T>(engine: ISearchEngine<T>, batchSize?: number): PPromise<ISerializedSearchComplete, IRawProgressItem<T>> {
		return new PPromise<ISerializedSearchComplete, IRawProgressItem<T>>((c, e, p) => {
			let batch: T[] = [];
			engine.search((match) => {
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
			}, (progress) => {
				p(progress);
			}, (error, stats) => {
				if (batch.length) {
					p(batch);
				}
				if (error) {
					e(error);
				} else {
					c(stats);
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

	public resultsToSearchCache: { [searchValue: string]: PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>; } = Object.create(null);

	public scorerCache: ScorerCache = Object.create(null);
}

interface ScorerCache {
	[key: string]: number;
}

class FileMatchAccessor {

	public static getLabel(match: IRawFileMatch): string {
		return match.basename;
	}

	public static getResourcePath(match: IRawFileMatch): string {
		return match.relativePath;
	}
}

interface CacheStats {
	cacheWasResolved: boolean;
	cacheFilterStartTime: number;
	cacheFilterResultCount: number;
}

/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
class BatchedCollector<T> {
	private static TIMEOUT = 4000;

	// After RUN_TIMEOUT_UNTIL_COUNT items have been collected, stop flushing on timeout
	private static START_BATCH_AFTER_COUNT = 50;

	private totalNumberCompleted = 0;
	private batch: T[] = [];
	private batchSize = 0;
	private timeoutHandle: number;

	constructor(private maxBatchSize: number, private cb: (items: T | T[]) => void) {
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

	private addItemsToBatch(items: T[], size: number): void {
		this.batch = this.batch.concat(items);
		this.batchSize += size;
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
