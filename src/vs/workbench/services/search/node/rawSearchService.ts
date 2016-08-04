/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import arrays = require('vs/base/common/arrays');
import {compareByScore} from 'vs/base/common/comparers';
import objects = require('vs/base/common/objects');
import paths = require('vs/base/common/paths');
import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');
import {PPromise, TPromise} from 'vs/base/common/winjs.base';
import {MAX_FILE_SIZE} from 'vs/platform/files/common/files';
import {FileWalker, Engine as FileSearchEngine} from 'vs/workbench/services/search/node/fileSearch';
import {Engine as TextSearchEngine} from 'vs/workbench/services/search/node/textSearch';
import {IRawSearchService, IRawSearch, IRawFileMatch, ISerializedFileMatch, ISerializedSearchProgressItem, ISerializedSearchComplete, ISearchEngine} from './search';
import {ICachedSearchStats, IProgress} from 'vs/platform/search/common/search';

export type IRawProgressItem<T> = T | T[] | IProgress;

export class SearchService implements IRawSearchService {

	private static BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	public fileSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return this.doFileSearch(FileSearchEngine, config, SearchService.BATCH_SIZE);
	}

	public textSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		let engine = new TextSearchEngine(config, new FileWalker({
			rootFolders: config.rootFolders,
			extraFiles: config.extraFiles,
			includePattern: config.includePattern,
			excludePattern: config.excludePattern,
			filePattern: config.filePattern,
			maxFilesize: MAX_FILE_SIZE
		}));

		return this.doSearch(engine, SearchService.BATCH_SIZE);
	}

	public doFileSearch(EngineClass: { new (config: IRawSearch): ISearchEngine<IRawFileMatch>; }, config: IRawSearch, batchSize?: number): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {

		if (config.sortByScore) {
			const cached = this.trySearchFromCache(config, batchSize);
			if (cached) {
				return cached;
			}

			const walkerConfig = config.maxResults ? objects.assign({}, config, { maxResults: null }) : config;
			const engine = new EngineClass(walkerConfig);
			return this.doSortedSearch(engine, config, batchSize);
		}

		let searchPromise;
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			const engine = new EngineClass(config);
			searchPromise = this.doSearch(engine, batchSize)
				.then(c, e, progress => {
					if (Array.isArray(progress)) {
						p(progress.map(m => ({ path: m.absolutePath })));
					} else if ((<IRawFileMatch>progress).absolutePath) {
						p({ path: (<IRawFileMatch>progress).absolutePath });
					} else {
						p(progress);
					}
				});
		}, () => searchPromise.cancel());
	}

	private doSortedSearch(engine: ISearchEngine<IRawFileMatch>, config: IRawSearch, batchSize?: number): PPromise<ISerializedSearchComplete, IRawProgressItem<IRawFileMatch>> {
		let searchPromise;
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			let results: IRawFileMatch[] = [];
			let unsortedResultTime: number;
			let sortedResultTime: number;
			searchPromise = this.doSearch(engine, -1).then(result => {
				const maxResults = config.maxResults;
				result.limitHit = !!maxResults && results.length > maxResults;
				result.stats.unsortedResultTime = unsortedResultTime || Date.now();
				result.stats.sortedResultTime = sortedResultTime || Date.now();
				c(result);
			}, null, progress => {
				try {
					if (Array.isArray(progress)) {
						results = progress;
						let scorerCache;
						if (config.cacheKey) {
							const cache = this.getOrCreateCache(config.cacheKey);
							cache.resultsToSearchCache[config.filePattern] = results;
							scorerCache = cache.scorerCache;
						} else {
							scorerCache = Object.create(null);
						}
						unsortedResultTime = Date.now();
						const sortedResults = this.sortResults(config, results, scorerCache);
						sortedResultTime = Date.now();
						this.sendProgress(sortedResults, p, batchSize);
					} else {
						p(progress);
					}
				} catch (err) {
					e(err);
				}
			}).then(null, e);
		}, () => searchPromise.cancel());
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySearchFromCache(config: IRawSearch, batchSize?: number): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		const cache = config.cacheKey && this.caches[config.cacheKey];
		if (!cache) {
			return;
		}

		const cacheLookupStartTime = Date.now();
		const cached = this.getResultsFromCache(cache, config.filePattern);
		if (cached) {
			const cacheLookupResultTime = Date.now();
			const [results, cacheEntryCount] = cached;
			let clippedResults;
			if (config.sortByScore) {
				clippedResults = this.sortResults(config, results, cache);
			} else if (config.maxResults) {
				clippedResults = results.slice(0, config.maxResults);
			} else {
				clippedResults = results;
			}
			const sortedResultTime = Date.now();
			let canceled = false;
			return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
				process.nextTick(() => { // allow caller to register progress callback first
					if (canceled) {
						return;
					}
					this.sendProgress(clippedResults, p, batchSize);
					const maxResults = config.maxResults;
					const stats: ICachedSearchStats = {
						fromCache: true,
						cacheLookupStartTime: cacheLookupStartTime,
						cacheLookupResultTime: cacheLookupResultTime,
						cacheEntryCount: cacheEntryCount,
						resultCount: results.length
					};
					if (config.sortByScore) {
						stats.unsortedResultTime = cacheLookupResultTime;
						stats.sortedResultTime = sortedResultTime;
					}
					c({
						limitHit: !!maxResults && results.length > maxResults,
						stats: stats
					});
				});
			}, () => {
				canceled = true;
			});
		}
	}

	private sortResults(config: IRawSearch, results: IRawFileMatch[], cache: Cache): ISerializedFileMatch[] {
		const filePattern = config.filePattern;
		const normalizedSearchValue = strings.stripWildcards(filePattern).toLowerCase();
		const compare = (elementA: IRawFileMatch, elementB: IRawFileMatch) => compareByScore(elementA, elementB, FileMatchAccessor, filePattern, normalizedSearchValue, cache.scorerCache);
		const filteredWrappers = arrays.top(results, compare, config.maxResults);
		return filteredWrappers.map(result => ({ path: result.absolutePath }));
	}

	private sendProgress(results: ISerializedFileMatch[], progressCb: (batch: ISerializedFileMatch[]) => void, batchSize?: number) {
		if (batchSize && batchSize > 0) {
			for (let i = 0; i < results.length; i += batchSize) {
				progressCb(results.slice(i, i + batchSize));
			}
		} else {
			progressCb(results);
		}
	}

	private getResultsFromCache(cache: Cache, searchValue: string): [IRawFileMatch[], number] {
		if (paths.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(paths.nativeSep) >= 0;
		let cachedEntries: IRawFileMatch[];
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(paths.nativeSep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				cachedEntries = cache.resultsToSearchCache[previousSearch];
				break;
			}
		}

		if (!cachedEntries) {
			return null;
		}

		// Pattern match on results and adjust highlights
		let results: IRawFileMatch[] = [];
		const normalizedSearchValue = searchValue.replace(/\\/g, '/'); // Normalize file patterns to forward slashes
		const normalizedSearchValueLowercase = strings.stripWildcards(normalizedSearchValue).toLowerCase();
		for (let i = 0; i < cachedEntries.length; i++) {
			let entry = cachedEntries[i];

			// Check if this entry is a match for the search value
			if (!scorer.matches(entry.pathLabel, normalizedSearchValueLowercase)) {
				continue;
			}

			results.push(entry);
		}

		return [results, cachedEntries.length];
	}

	private doSearch<T>(engine: ISearchEngine<T>, batchSize?: number): PPromise<ISerializedSearchComplete, IRawProgressItem<T>> {
		return new PPromise<ISerializedSearchComplete, IRawProgressItem<T>>((c, e, p) => {
			let batch = [];
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
		}, () => engine.cancel());
	}

	public clearCache(cacheKey: string): TPromise<void> {
		delete this.caches[cacheKey];
		return TPromise.as(undefined);
	}
}

class Cache {

	public resultsToSearchCache: { [searchValue: string]: IRawFileMatch[]; } = Object.create(null);

	public scorerCache: { [key: string]: number } = Object.create(null);
}

interface IFileMatch extends IRawFileMatch {
	label?: string;
}

class FileMatchAccessor {

	public static getLabel(match: IFileMatch): string {
		if (!match.label) {
			match.label = paths.basename(match.absolutePath);
		}
		return match.label;
	}

	public static getResourcePath(match: IFileMatch): string {
		return match.absolutePath;
	}
}
