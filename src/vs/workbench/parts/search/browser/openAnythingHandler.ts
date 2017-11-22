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
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenItemAccessor } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { FileEntry, OpenFileHandler, FileQuickOpenModel } from 'vs/workbench/parts/search/browser/openFileHandler';
import * as openSymbolHandler from 'vs/workbench/parts/search/browser/openSymbolHandler';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISearchStats, ICachedSearchStats, IUncachedSearchStats } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchSearchConfiguration } from 'vs/workbench/parts/search/common/search';
import { IRange } from 'vs/editor/common/core/range';
import { compareItemsByScore, scoreItem, ScorerCache, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';

export import OpenSymbolHandler = openSymbolHandler.OpenSymbolHandler; // OpenSymbolHandler is used from an extension and must be in the main bundle file so it can load

const objects_assign: <T, U>(destination: T, source: U) => T & U = objects.assign;

interface ISearchWithRange {
	search: string;
	range: IRange;
}

/* __GDPR__FRAGMENT__
	"ITimerEventData" : {
		"searchLength" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"unsortedResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"sortedResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"resultCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"symbols.fromCache": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.fromCache": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.unsortedResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.sortedResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.resultCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.traversal": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.errors": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.fileWalkStartDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.fileWalkResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.directoriesWalked": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.filesWalked": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cmdForkStartTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cmdForkResultTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cmdResultCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cacheLookupStartDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cacheFilterStartDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cacheLookupResultDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"files.cacheEntryCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"${wildcard}": [
			{
				"${prefix}": "files.joined",
			"${classification}": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		]
	}
*/
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

export class OpenAnythingHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.anything';

	private static readonly LINE_COLON_PATTERN = /[#|:|\(](\d*)([#|:|,](\d*))?\)?$/;

	private static readonly FILE_SEARCH_DELAY = 300;
	private static readonly SYMBOL_SEARCH_DELAY = 500; // go easier on those symbols!

	private static readonly MAX_DISPLAYED_RESULTS = 512;

	private openSymbolHandler: OpenSymbolHandler;
	private openFileHandler: OpenFileHandler;
	private searchDelayer: ThrottledDelayer<QuickOpenModel>;
	private pendingSearch: TPromise<QuickOpenModel>;
	private isClosed: boolean;
	private scorerCache: ScorerCache;
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

		this.updateHandlers(this.configurationService.getValue<IWorkbenchSearchConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.configurationService.onDidChangeConfiguration(e => this.updateHandlers(this.configurationService.getValue<IWorkbenchSearchConfiguration>()));
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

		// Prepare search for scoring
		const query = prepareQuery(searchValue);

		const searchWithRange = this.extractRange(query.value); // Find a suitable range from the pattern looking for ":" and "#"
		if (searchWithRange) {
			query.value = searchWithRange.search; // ignore range portion in query
			query.lowercase = query.value.toLowerCase();
		}

		if (!query.value) {
			return TPromise.as(new QuickOpenModel()); // Respond directly to empty search
		}

		// The throttler needs a factory for its promises
		const promiseFactory = () => {
			const resultPromises: TPromise<QuickOpenModel | FileQuickOpenModel>[] = [];

			// File Results
			const filePromise = this.openFileHandler.getResults(query.value, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);
			resultPromises.push(filePromise);

			// Symbol Results (unless disabled or a range or absolute path is specified)
			if (this.includeSymbols && !searchWithRange) {
				resultPromises.push(this.openSymbolHandler.getResults(query.value));
			}

			// Join and sort unified
			this.pendingSearch = TPromise.join(resultPromises).then(results => {
				this.pendingSearch = null;

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed) {
					return TPromise.as<QuickOpenModel>(new QuickOpenModel());
				}

				// Combine results.
				const mergedResults = [].concat(...results.map(r => r.entries));

				// Sort
				const unsortedResultTime = Date.now();
				const compare = (elementA: QuickOpenEntry, elementB: QuickOpenEntry) => compareItemsByScore(elementA, elementB, query, true, QuickOpenItemAccessor, this.scorerCache);
				const viewResults = arrays.top(mergedResults, compare, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);
				const sortedResultTime = Date.now();

				// Apply range and highlights to file entries
				viewResults.forEach(entry => {
					if (entry instanceof FileEntry) {
						entry.setRange(searchWithRange ? searchWithRange.range : null);

						const itemScore = scoreItem(entry, query, true, QuickOpenItemAccessor, this.scorerCache);
						entry.setHighlights(itemScore.labelMatch, itemScore.descriptionMatch);
					}
				});

				const duration = new Date().getTime() - startTime;
				filePromise.then(fileModel => {
					const data = this.createTimerEventData(startTime, {
						searchLength: query.value.length,
						unsortedResultTime,
						sortedResultTime,
						resultCount: mergedResults.length,
						symbols: { fromCache: false },
						files: fileModel.stats,
					});

					/* __GDPR__
						"openAnything" : {
							"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
							"${include}": [
								"${ITimerEventData}"
							]
						}
					*/
					this.telemetryService.publicLog('openAnything', objects.assign(data, { duration }));
				});

				return TPromise.as<QuickOpenModel>(new QuickOpenModel(viewResults));
			}, (error: Error[]) => {
				this.pendingSearch = null;
				if (error && error[0] && error[0].message) {
					this.messageService.show(Severity.Error, error[0].message.replace(/[\*_\[\]]/g, '\\$&'));
				} else {
					this.messageService.show(Severity.Error, error);
				}
				return null;
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
			files: telemetry.files && this.createFileEventData(startTime, telemetry.files)
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