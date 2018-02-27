/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { ThrottledDelayer } from 'vs/base/common/async';
import types = require('vs/base/common/types');
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenItemAccessor } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { FileEntry, OpenFileHandler, FileQuickOpenModel } from 'vs/workbench/parts/search/browser/openFileHandler';
import * as openSymbolHandler from 'vs/workbench/parts/search/browser/openSymbolHandler';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchSearchConfiguration } from 'vs/workbench/parts/search/common/search';
import { IRange } from 'vs/editor/common/core/range';
import { compareItemsByScore, scoreItem, ScorerCache, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';

export import OpenSymbolHandler = openSymbolHandler.OpenSymbolHandler; // OpenSymbolHandler is used from an extension and must be in the main bundle file so it can load
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isPromiseCanceledError } from 'vs/base/common/errors';

interface ISearchWithRange {
	search: string;
	range: IRange;
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
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
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
		this.cancelPendingSearch();
		this.isClosed = false; // Treat this call as the handler being in use

		// Find a suitable range from the pattern looking for ":" and "#"
		const searchWithRange = this.extractRange(searchValue);
		if (searchWithRange) {
			searchValue = searchWithRange.search; // ignore range portion in query
		}

		// Prepare search for scoring
		const query = prepareQuery(searchValue);
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
				const compare = (elementA: QuickOpenEntry, elementB: QuickOpenEntry) => compareItemsByScore(elementA, elementB, query, true, QuickOpenItemAccessor, this.scorerCache);
				const viewResults = arrays.top(mergedResults, compare, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);

				// Apply range and highlights to file entries
				viewResults.forEach(entry => {
					if (entry instanceof FileEntry) {
						entry.setRange(searchWithRange ? searchWithRange.range : null);

						const itemScore = scoreItem(entry, query, true, QuickOpenItemAccessor, this.scorerCache);
						entry.setHighlights(itemScore.labelMatch, itemScore.descriptionMatch);
					}
				});

				return TPromise.as<QuickOpenModel>(new QuickOpenModel(viewResults));
			}, error => {
				this.pendingSearch = null;

				if (!isPromiseCanceledError(error)) {
					if (error && error[0] && error[0].message) {
						this.notificationService.error(error[0].message.replace(/[\*_\[\]]/g, '\\$&'));
					} else {
						this.notificationService.error(error);
					}
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
}