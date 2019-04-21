/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import * as nls from 'vs/nls';
import { ThrottledDelayer } from 'vs/base/common/async';
import * as types from 'vs/base/common/types';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenItemAccessor } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { FileEntry, OpenFileHandler, FileQuickOpenModel } from 'vs/workbench/contrib/search/browser/openFileHandler';
import * as openSymbolHandler from 'vs/workbench/contrib/search/browser/openSymbolHandler';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchSearchConfiguration } from 'vs/workbench/contrib/search/common/search';
import { IRange } from 'vs/editor/common/core/range';
import { compareItemsByScore, scoreItem, ScorerCache, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { CancellationToken } from 'vs/base/common/cancellation';

export import OpenSymbolHandler = openSymbolHandler.OpenSymbolHandler; // OpenSymbolHandler is used from an extension and must be in the main bundle file so it can load

interface ISearchWithRange {
	search: string;
	range: IRange;
}

export class OpenAnythingHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.anything';

	private static readonly LINE_COLON_PATTERN = /[#:\(](\d*)([#:,](\d*))?\)?\s*$/;

	private static readonly TYPING_SEARCH_DELAY = 200; // This delay accommodates for the user typing a word and then stops typing to start searching

	private static readonly MAX_DISPLAYED_RESULTS = 512;

	private openSymbolHandler: OpenSymbolHandler;
	private openFileHandler: OpenFileHandler;
	private searchDelayer: ThrottledDelayer<QuickOpenModel>;
	private isClosed: boolean;
	private scorerCache: ScorerCache;
	private includeSymbols: boolean;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.scorerCache = Object.create(null);
		this.searchDelayer = new ThrottledDelayer<QuickOpenModel>(OpenAnythingHandler.TYPING_SEARCH_DELAY);

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

	getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		this.isClosed = false; // Treat this call as the handler being in use

		// Find a suitable range from the pattern looking for ":" and "#"
		const searchWithRange = this.extractRange(searchValue);
		if (searchWithRange) {
			searchValue = searchWithRange.search; // ignore range portion in query
		}

		// Prepare search for scoring
		const query = prepareQuery(searchValue);
		if (!query.value) {
			return Promise.resolve(new QuickOpenModel()); // Respond directly to empty search
		}

		// The throttler needs a factory for its promises
		const resultsPromise = () => {
			const resultPromises: Promise<QuickOpenModel | FileQuickOpenModel>[] = [];

			// File Results
			const filePromise = this.openFileHandler.getResults(query.original, token, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);
			resultPromises.push(filePromise);

			// Symbol Results (unless disabled or a range or absolute path is specified)
			if (this.includeSymbols && !searchWithRange) {
				resultPromises.push(this.openSymbolHandler.getResults(query.original, token));
			}

			// Join and sort unified
			return Promise.all(resultPromises).then(results => {

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed || token.isCancellationRequested) {
					return Promise.resolve<QuickOpenModel>(new QuickOpenModel());
				}

				// Combine results.
				const mergedResults: QuickOpenEntry[] = ([] as QuickOpenEntry[]).concat(...results.map(r => r.entries));

				// Sort
				const compare = (elementA: QuickOpenEntry, elementB: QuickOpenEntry) => compareItemsByScore(elementA, elementB, query, true, QuickOpenItemAccessor, this.scorerCache);
				const viewResults = arrays.top(mergedResults, compare, OpenAnythingHandler.MAX_DISPLAYED_RESULTS);

				// Apply range and highlights to file entries
				viewResults.forEach(entry => {
					if (entry instanceof FileEntry) {
						entry.setRange(searchWithRange ? searchWithRange.range : null);

						const itemScore = scoreItem(entry, query, true, QuickOpenItemAccessor, this.scorerCache);
						entry.setHighlights(itemScore.labelMatch || [], itemScore.descriptionMatch);
					}
				});

				return Promise.resolve<QuickOpenModel>(new QuickOpenModel(viewResults));
			}, error => {
				if (!isPromiseCanceledError(error)) {
					let message: Error | string;
					if (error.message) {
						message = error.message.replace(/[\*_\[\]]/g, '\\$&');
					} else {
						message = error;
					}

					this.notificationService.error(message);
				}

				return null;
			});
		};

		// Trigger through delayer to prevent accumulation while the user is typing (except when expecting results to come from cache)
		return this.hasShortResponseTime() ? resultsPromise() : this.searchDelayer.trigger(resultsPromise, OpenAnythingHandler.TYPING_SEARCH_DELAY);
	}

	hasShortResponseTime(): boolean {
		if (!this.includeSymbols) {
			return this.openFileHandler.hasShortResponseTime();
		}

		return this.openFileHandler.hasShortResponseTime() && this.openSymbolHandler.hasShortResponseTime();
	}

	private extractRange(value: string): ISearchWithRange | null {
		if (!value) {
			return null;
		}

		let range: IRange | null = null;

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

		if (patternMatch && range) {
			return {
				search: value.substr(0, patternMatch.index), // clear range suffix from search value
				range: range
			};
		}

		return null;
	}

	getGroupLabel(): string {
		return this.includeSymbols ? nls.localize('fileAndTypeResults', "file and symbol results") : nls.localize('fileResults', "file results");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true
		};
	}

	onOpen(): void {
		this.openSymbolHandler.onOpen();
		this.openFileHandler.onOpen();
	}

	onClose(canceled: boolean): void {
		this.isClosed = true;

		// Clear Cache
		this.scorerCache = Object.create(null);

		// Propagate
		this.openSymbolHandler.onClose(canceled);
		this.openFileHandler.onClose(canceled);
	}
}
