/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { ThrottledDelayer } from 'vs/base/common/async';
import types = require('vs/base/common/types');
import { isWindows } from 'vs/base/common/platform';
import strings = require('vs/base/common/strings');
import { IRange } from 'vs/editor/common/editorCommon';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { FileEntry, OpenFileHandler, FileQuickOpenModel } from 'vs/workbench/parts/search/browser/openFileHandler';
import * as openSymbolHandler from 'vs/workbench/parts/search/browser/openSymbolHandler';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISearchStats, ICachedSearchStats, IUncachedSearchStats } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchSearchConfiguration } from 'vs/workbench/parts/search/common/search';

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

	private static FILE_SEARCH_DELAY = 300;
	private static SYMBOL_SEARCH_DELAY = 500; // go easier on those symbols!

	private static MAX_DISPLAYED_RESULTS = 512;

	private openSymbolHandler: OpenSymbolHandler;
	private openFileHandler: OpenFileHandler;
	private searchDelayer: ThrottledDelayer<QuickOpenModel>;
	private pendingSearch: TPromise<QuickOpenModel>;
	private isClosed: boolean;
	private scorerCache: { [key: string]: number };
	private includeSymbols: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();

		this.scorerCache = Object.create(null);
		this.searchDelayer = new ThrottledDelayer<QuickOpenModel>(OpenAnythingHandler.FILE_SEARCH_DELAY);

		this.openSymbolHandler = instantiationService.createInstance(OpenSymbolHandler);
		this.openFileHandler = instantiationService.createInstance(OpenFileHandler);

		this.updateHandlers(this.configurationService.getConfiguration<IWorkbenchSearchConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.configurationService.onDidUpdateConfiguration(e => this.updateHandlers(e.config));
	}

	private updateHandlers(configuration: IWorkbenchSearchConfiguration): void {
		this.includeSymbols = configuration && configuration.search && configuration.search.quickOpen && configuration.search.quickOpen.includeSymbols;

		// Files
		this.openFileHandler.setOptions({
			forceUseIcons: this.includeSymbols // only need icons for file results if we mix with symbol results
		});

		// Symbols
		this.openSymbolHandler.setOptions({
			skipDelay: true,		// we have our own delay
			skipLocalSymbols: true,	// we only want global symbols
			skipSorting: true 		// we sort combined with file results
		});
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		const startTime = Date.now();

		this.cancelPendingSearch();
		this.isClosed = false; // Treat this call as the handler being in use

		// Massage search value
		searchValue = searchValue.replace(/ /g, ''); // get rid of all whitespace
		if (isWindows) {
			searchValue = searchValue.replace(/\//g, '\\'); // Help Windows users to search for paths when using slash
		}

		const searchWithRange = this.extractRange(searchValue); // Find a suitable range from the pattern looking for ":" and "#"
		if (searchWithRange) {
			searchValue = searchWithRange.search; // ignore range portion in query
		}

		if (!searchValue) {
			return TPromise.as(new QuickOpenModel()); // Respond directly to empty search
		}

		// The throttler needs a factory for its promises
		const promiseFactory = () => {
			const resultPromises: TPromise<QuickOpenModel | FileQuickOpenModel>[] = [];

			// File Results
			resultPromises.push(this.openFileHandler.getResults(searchValue, OpenAnythingHandler.MAX_DISPLAYED_RESULTS));

			// Symbol Results (unless disabled or a range or absolute path is specified)
			if (this.includeSymbols && !searchWithRange) {
				resultPromises.push(this.openSymbolHandler.getResults(searchValue));
			} else {
				resultPromises.push(TPromise.as(new QuickOpenModel())); // We need this empty promise because we are using the throttler below!
			}

			// Join and sort unified
			this.pendingSearch = TPromise.join(resultPromises).then(results => {
				this.pendingSearch = null;

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed) {
					return TPromise.as<QuickOpenModel>(new QuickOpenModel());
				}

				// Combine file results and symbol results (if any)
				const mergedResults = [...results[0].entries, ...results[1].entries];

				// Sort
				const unsortedResultTime = Date.now();
				const normalizedSearchValue = strings.stripWildcards(searchValue).toLowerCase();
				const compare = (elementA: QuickOpenEntry, elementB: QuickOpenEntry) => QuickOpenEntry.compareByScore(elementA, elementB, searchValue, normalizedSearchValue, this.scorerCache);
				const viewResults = arrays.top(mergedResults, compare, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);
				const sortedResultTime = Date.now();

				// Apply range and highlights to file entries
				viewResults.forEach(entry => {
					if (entry instanceof FileEntry) {
						entry.setRange(searchWithRange ? searchWithRange.range : null);

						const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(entry, searchValue, true /* fuzzy highlight */);
						entry.setHighlights(labelHighlights, descriptionHighlights);
					}
				});

				let fileSearchStats: ISearchStats;
				if (results[0] instanceof FileQuickOpenModel) {
					fileSearchStats = (<FileQuickOpenModel>results[0]).stats;
				} else if (results[1] instanceof FileQuickOpenModel) {
					fileSearchStats = (<FileQuickOpenModel>results[1]).stats;
				}

				const duration = new Date().getTime() - startTime;
				const data = this.createTimerEventData(startTime, {
					searchLength: searchValue.length,
					unsortedResultTime,
					sortedResultTime,
					resultCount: mergedResults.length,
					symbols: { fromCache: false },
					files: fileSearchStats
				});

				this.telemetryService.publicLog('openAnything', objects.assign(data, { duration }));

				return TPromise.as<QuickOpenModel>(new QuickOpenModel(viewResults));
			}, (error: Error) => {
				this.pendingSearch = null;
				this.messageService.show(Severity.Error, error);
			});

			return this.pendingSearch;
		};

		// Trigger through delayer to prevent accumulation while the user is typing (except when expecting results to come from cache)
		return this.hasShortResponseTime() ? promiseFactory() : this.searchDelayer.trigger(promiseFactory, this.includeSymbols ? OpenAnythingHandler.SYMBOL_SEARCH_DELAY : OpenAnythingHandler.FILE_SEARCH_DELAY);
	}

	public hasShortResponseTime(): boolean {
		if (!this.includeSymbols) {
			return this.openFileHandler.hasShortResponseTime();
		}

		return this.openFileHandler.hasShortResponseTime() && this.openSymbolHandler.hasShortResponseTime();
	}

	private extractRange(value: string): ISearchWithRange {
		if (!value) {
			return null;
		}

		let range: IRange = null;

		// Find Line/Column number from search value using RegExp
		const patternMatch = OpenAnythingHandler.LINE_COLON_PATTERN.exec(value);
		if (patternMatch && patternMatch.length > 1) {
			const startLineNumber = parseInt(patternMatch[1], 10);

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
					const startColumn = parseInt(patternMatch[3], 10);
					if (types.isNumber(startColumn)) {
						range = {
							startLineNumber: range.startLineNumber,
							startColumn: startColumn,
							endLineNumber: range.endLineNumber,
							endColumn: startColumn
						};
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

	public getGroupLabel(): string {
		return this.includeSymbols ? nls.localize('fileAndTypeResults', "file and symbol results") : nls.localize('fileResults', "file results");
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