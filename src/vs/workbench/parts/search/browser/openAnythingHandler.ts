/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {ThrottledDelayer} from 'vs/base/common/async';
import types = require('vs/base/common/types');
import {isWindows} from 'vs/base/common/platform';
import scorer = require('vs/base/common/scorer');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import strings = require('vs/base/common/strings');
import {IRange} from 'vs/editor/common/editorCommon';
import {IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntry, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {FileEntry, OpenFileHandler} from 'vs/workbench/parts/search/browser/openFileHandler';
/* tslint:disable:no-unused-variable */
import * as openSymbolHandler from 'vs/workbench/parts/search/browser/openSymbolHandler';
/* tslint:enable:no-unused-variable */
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ISearchStats, ICachedSearchStats, IUncachedSearchStats} from 'vs/platform/search/common/search';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

const objects_assign: <T, U>(destination: T, source: U) => T & U = objects.assign;

interface ISearchWithRange {
	search: string;
	range: IRange;
}

interface ITimerEventData {
	searchLength: number;
	unsortedResultDuration: number;
	sortedResultDuration: number;
	resultCount: number;
	symbols: {
		fromCache: boolean;
	};
	files: {
		fromCache: boolean;
		unsortedResultDuration: number;
		sortedResultDuration: number;
		resultCount: number;
	} & ({
		traversal: string;
		errors: string[];
		fileWalkStartDuration: number;
		fileWalkResultDuration: number;
		directoriesWalked: number;
		filesWalked: number;
		cmdForkStartTime?: number;
		cmdForkResultTime?: number;
		cmdResultCount?: number;
	} | {
		cacheLookupStartDuration: number;
		cacheFilterStartDuration: number;
		cacheLookupResultDuration: number;
		cacheEntryCount: number;
		joined?: any;
	});
}

interface ITelemetryData {
	searchLength: number;
	unsortedResultTime: number;
	sortedResultTime: number;
	resultCount: number;
	symbols: {
		fromCache: boolean;
	};
	files: ISearchStats;
}

// OpenSymbolHandler is used from an extension and must be in the main bundle file so it can load
export import OpenSymbolHandler = openSymbolHandler.OpenSymbolHandler;

export class OpenAnythingHandler extends QuickOpenHandler {
	private static LINE_COLON_PATTERN = /[#|:|\(](\d*)([#|:|,](\d*))?\)?$/;

	private static SYMBOL_SEARCH_INITIAL_TIMEOUT = 500; // Ignore symbol search after a timeout to not block search results
	private static SYMBOL_SEARCH_INITIAL_TIMEOUT_WHEN_FILE_SEARCH_CACHED = 300;
	private static SYMBOL_SEARCH_SUBSEQUENT_TIMEOUT = 100;
	private static SEARCH_DELAY = 300; // This delay accommodates for the user typing a word and then stops typing to start searching

	private static MAX_DISPLAYED_RESULTS = 512;

	private openSymbolHandler: OpenSymbolHandler;
	private openFileHandler: OpenFileHandler;
	private symbolResultsToSearchCache: { [searchValue: string]: QuickOpenEntry[]; };
	private delayer: ThrottledDelayer<QuickOpenModel>;
	private pendingSearch: TPromise<QuickOpenModel>;
	private isClosed: boolean;
	private scorerCache: { [key: string]: number };

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();

		// Instantiate delegate handlers
		this.openSymbolHandler = instantiationService.createInstance(OpenSymbolHandler);
		this.openFileHandler = instantiationService.createInstance(OpenFileHandler);

		this.openSymbolHandler.setOptions({
			skipDelay: true,		// we have our own delay
			skipLocalSymbols: true,	// we only want global symbols
			skipSorting: true 		// we sort combined with file results
		});

		this.symbolResultsToSearchCache = Object.create(null);
		this.scorerCache = Object.create(null);
		this.delayer = new ThrottledDelayer<QuickOpenModel>(OpenAnythingHandler.SEARCH_DELAY);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		const timerEvent = this.telemetryService.timedPublicLog('openAnything');
		const startTime = timerEvent.startTime ? timerEvent.startTime.getTime() : Date.now(); // startTime is undefined when telemetry is disabled
		searchValue = searchValue.replace(/ /g, ''); // get rid of all whitespace

		// Help Windows users to search for paths when using slash
		if (isWindows) {
			searchValue = searchValue.replace(/\//g, '\\');
		}

		// Cancel any pending search
		this.cancelPendingSearch();

		// Treat this call as the handler being in use
		this.isClosed = false;

		// Respond directly to empty search
		if (!searchValue) {
			return TPromise.as(new QuickOpenModel());
		}

		// Find a suitable range from the pattern looking for ":" and "#"
		let searchWithRange = this.extractRange(searchValue);
		if (searchWithRange) {
			searchValue = searchWithRange.search; // ignore range portion in query
		}

		// Check Cache first
		let cachedSymbolResults = this.getSymbolResultsFromCache(searchValue, !!searchWithRange);

		// The throttler needs a factory for its promises
		let promiseFactory = () => {
			let receivedFileResults = false;
			let searchStats: ISearchStats;

			// Symbol Results (unless a range is specified)
			let resultPromises: TPromise<QuickOpenModel>[] = [];
			if (cachedSymbolResults) {
				resultPromises.push(TPromise.as(new QuickOpenModel(cachedSymbolResults)));
			} else if (!searchWithRange) {
				let symbolSearchTimeoutPromiseFn: (timeout: number) => TPromise<QuickOpenModel> = (timeout) => {
					return TPromise.timeout(timeout).then(() => {

						// As long as the file search query did not return, push out the symbol timeout
						// so that the symbol search has a chance to return results at least as long as
						// the file search did not return.
						if (!receivedFileResults) {
							return symbolSearchTimeoutPromiseFn(OpenAnythingHandler.SYMBOL_SEARCH_SUBSEQUENT_TIMEOUT);
						}

						// Empty result since timeout was reached and file results are in
						return TPromise.as(new QuickOpenModel());
					});
				};

				let lookupPromise = this.openSymbolHandler.getResults(searchValue);
				let timeoutPromise = symbolSearchTimeoutPromiseFn(this.openFileHandler.isCacheLoaded ? OpenAnythingHandler.SYMBOL_SEARCH_INITIAL_TIMEOUT_WHEN_FILE_SEARCH_CACHED : OpenAnythingHandler.SYMBOL_SEARCH_INITIAL_TIMEOUT);

				// Timeout lookup after N seconds to not block file search results
				resultPromises.push(TPromise.any([lookupPromise, timeoutPromise]).then((result) => {
					return result.value;
				}));
			} else {
				resultPromises.push(TPromise.as(new QuickOpenModel())); // We need this empty promise because we are using the throttler below!
			}

			// File Results
			resultPromises.push(this.openFileHandler.getResultsWithStats(searchValue, OpenAnythingHandler.MAX_DISPLAYED_RESULTS).then(([results, stats]) => {
				receivedFileResults = true;
				searchStats = stats;

				return results;
			}));

			// Join and sort unified
			this.pendingSearch = TPromise.join(resultPromises).then((results: QuickOpenModel[]) => {
				const unsortedResultTime = Date.now();
				this.pendingSearch = null;

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed) {
					return TPromise.as<QuickOpenModel>(new QuickOpenModel());
				}

				// Combine symbol results and file results
				const symbolResults = results[0].entries;
				let result = [...symbolResults, ...results[1].entries];

				// // Cache for fast lookup
				this.symbolResultsToSearchCache[searchValue] = symbolResults;

				// Sort
				const normalizedSearchValue = strings.stripWildcards(searchValue).toLowerCase();
				const compare = (elementA: QuickOpenEntry, elementB: QuickOpenEntry) => QuickOpenEntry.compareByScore(elementA, elementB, searchValue, normalizedSearchValue, this.scorerCache);
				const viewResults = arrays.top(result, compare, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);
				const sortedResultTime = Date.now();

				// Apply range and highlights to file entries
				viewResults.forEach(entry => {
					if (entry instanceof FileEntry) {
						entry.setRange(searchWithRange ? searchWithRange.range : null);
						const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(entry, searchValue, true /* fuzzy highlight */);
						entry.setHighlights(labelHighlights, descriptionHighlights);
					}
				});

				timerEvent.data = this.createTimerEventData(startTime, {
					searchLength: searchValue.length,
					unsortedResultTime,
					sortedResultTime,
					resultCount: result.length,
					symbols: {
						fromCache: !!cachedSymbolResults
					},
					files: searchStats
				});
				timerEvent.stop();
				return TPromise.as<QuickOpenModel>(new QuickOpenModel(viewResults));
			}, (error: Error) => {
				this.pendingSearch = null;
				this.messageService.show(Severity.Error, error);
			});

			return this.pendingSearch;
		};

		// Trigger through delayer to prevent accumulation while the user is typing (except when expecting results to come from cache)
		return this.openFileHandler.isCacheLoaded ? promiseFactory() : this.delayer.trigger(promiseFactory);
	}

	private extractRange(value: string): ISearchWithRange {
		let range: IRange = null;

		// Find Line/Column number from search value using RegExp
		let patternMatch = OpenAnythingHandler.LINE_COLON_PATTERN.exec(value);
		if (patternMatch && patternMatch.length > 1) {
			let startLineNumber = parseInt(patternMatch[1], 10);

			// Line Number
			if (types.isNumber(startLineNumber)) {
				range = {
					startLineNumber: startLineNumber,
					startColumn: 1,
					endLineNumber: startLineNumber,
					endColumn: 1
				};

				// Column Number
				if (patternMatch.length > 3) {
					let startColumn = parseInt(patternMatch[3], 10);
					if (types.isNumber(startColumn)) {
						range.startColumn = startColumn;
						range.endColumn = startColumn;
					}
				}
			}

			// User has typed "something:" or "something#" without a line number, in this case treat as start of file
			else if (patternMatch[1] === '') {
				range = {
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 1
				};
			}
		}

		if (range) {
			return {
				search: value.substr(0, patternMatch.index), // clear range suffix from search value
				range: range
			};
		}

		return null;
	}

	private getSymbolResultsFromCache(searchValue: string, hasRange: boolean): QuickOpenEntry[] {
		if (paths.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		let cachedEntries: QuickOpenEntry[];
		for (let previousSearch in this.symbolResultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (searchValue.indexOf(previousSearch) === 0) {
				if (searchValue.indexOf(paths.nativeSep) >= 0 && previousSearch.indexOf(paths.nativeSep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				cachedEntries = this.symbolResultsToSearchCache[previousSearch];
				break;
			}
		}

		if (!cachedEntries) {
			return null;
		}

		if (hasRange) {
			return [];
		}

		// Pattern match on results and adjust highlights
		let results: QuickOpenEntry[] = [];
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
		for (let i = 0; i < cachedEntries.length; i++) {
			let entry = cachedEntries[i];

			// Check if this entry is a match for the search value
			const resource = entry.getResource(); // can be null for symbol results!
			let targetToMatch = resource ? labels.getPathLabel(resource, this.contextService) : entry.getLabel();
			if (!scorer.matches(targetToMatch, normalizedSearchValueLowercase)) {
				continue;
			}

			results.push(entry);
		}

		return results;
	}

	public getGroupLabel(): string {
		return nls.localize('fileAndTypeResults', "file and symbol results");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true
		};
	}

	public onOpen(): void {
		this.openSymbolHandler.onOpen();
		this.openFileHandler.onOpen();
	}

	public onClose(canceled: boolean): void {
		this.isClosed = true;

		// Cancel any pending search
		this.cancelPendingSearch();

		// Clear Cache
		this.symbolResultsToSearchCache = Object.create(null);
		this.scorerCache = Object.create(null);

		// Propagate
		this.openSymbolHandler.onClose(canceled);
		this.openFileHandler.onClose(canceled);
	}

	private cancelPendingSearch(): void {
		if (this.pendingSearch) {
			this.pendingSearch.cancel();
			this.pendingSearch = null;
		}
	}

	private createTimerEventData(startTime: number, telemetry: ITelemetryData): ITimerEventData {
		return {
			searchLength: telemetry.searchLength,
			unsortedResultDuration: telemetry.unsortedResultTime - startTime,
			sortedResultDuration: telemetry.sortedResultTime - startTime,
			resultCount: telemetry.resultCount,
			symbols: telemetry.symbols,
			files: this.createFileEventData(startTime, telemetry.files)
		};
	}

	private createFileEventData(startTime: number, stats: ISearchStats) {
		const cached = stats as ICachedSearchStats;
		const uncached = stats as IUncachedSearchStats;
		return objects_assign({
			fromCache: stats.fromCache,
			unsortedResultDuration: stats.unsortedResultTime && stats.unsortedResultTime - startTime,
			sortedResultDuration: stats.sortedResultTime && stats.sortedResultTime - startTime,
			resultCount: stats.resultCount
		}, stats.fromCache ? {
			cacheLookupStartDuration: cached.cacheLookupStartTime - startTime,
			cacheFilterStartDuration: cached.cacheFilterStartTime - startTime,
			cacheLookupResultDuration: cached.cacheLookupResultTime - startTime,
			cacheEntryCount: cached.cacheEntryCount,
			joined: cached.joined && this.createFileEventData(startTime, cached.joined)
		} : {
			traversal: uncached.traversal,
			errors: uncached.errors,
			fileWalkStartDuration: uncached.fileWalkStartTime - startTime,
			fileWalkResultDuration: uncached.fileWalkResultTime - startTime,
			directoriesWalked: uncached.directoriesWalked,
			filesWalked: uncached.filesWalked,
			cmdForkStartDuration: uncached.cmdForkStartTime && uncached.cmdForkStartTime - startTime,
			cmdForkResultDuration: uncached.cmdForkResultTime && uncached.cmdForkResultTime - startTime,
			cmdResultCount: uncached.cmdResultCount
		});
	}
}