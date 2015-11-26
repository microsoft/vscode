/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {ThrottledDelayer} from 'vs/base/common/async';
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import filters = require('vs/base/common/filters');
import {IRange} from 'vs/editor/common/editorCommon';
import {compareAnything} from 'vs/base/common/comparers';
import {IAutoFocus} from 'vs/base/parts/quickopen/browser/quickOpen';
import {QuickOpenEntry, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {FileEntry, OpenFileHandler} from 'vs/workbench/parts/search/browser/openFileHandler';
import {OpenSymbolHandler as _OpenSymbolHandler} from 'vs/workbench/parts/search/browser/openSymbolHandler';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

// OpenSymbolHandler is used from an extension and must be in the main bundle file so it can load
export const OpenSymbolHandler = _OpenSymbolHandler

export class OpenAnythingHandler extends QuickOpenHandler {
	private static LINE_COLON_PATTERN = /[#|:](\d*)([#|:](\d*))?$/;

	private static SYMBOL_SEARCH_INITIAL_TIMEOUT = 500; // Ignore symbol search after a timeout to not block search results
	private static SYMBOL_SEARCH_SUBSEQUENT_TIMEOUT = 100;
	private static SEARCH_DELAY = 100; // This delay accommodates for the user typing a word and then stops typing to start searching

	private openSymbolHandler: _OpenSymbolHandler;
	private openFileHandler: OpenFileHandler;
	private resultsToSearchCache: { [searchValue: string]: QuickOpenEntry[]; };
	private delayer: ThrottledDelayer;
	private isClosed: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		// Instantiate delegate handlers
		this.openSymbolHandler = instantiationService.createInstance(_OpenSymbolHandler);
		this.openFileHandler = instantiationService.createInstance(OpenFileHandler);

		this.openSymbolHandler.setStandalone(false);
		this.openFileHandler.setStandalone(false);

		this.resultsToSearchCache = {};
		this.delayer = new ThrottledDelayer(OpenAnythingHandler.SEARCH_DELAY);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Treat this call as the handler being in use
		this.isClosed = false;

		// Respond directly to empty search
		if (!searchValue) {
			return TPromise.as(new QuickOpenModel());
		}

		// Find a suitable range from the pattern looking for ":" and "#"
		let range = this.findRange(searchValue);
		if (range) {
			let rangePrefix = searchValue.indexOf('#') >= 0 ? searchValue.indexOf('#') : searchValue.indexOf(':');
			if (rangePrefix >= 0) {
				searchValue = searchValue.substring(0, rangePrefix);
			}
		}

		// Check Cache first
		let cachedResults = this.getResultsFromCache(searchValue, range);
		if (cachedResults) {
			return TPromise.as(new QuickOpenModel(cachedResults));
		}

		// The throttler needs a factory for its promises
		let promiseFactory = () => {
			let receivedFileResults = false;

			// Symbol Results (unless a range is specified)
			let resultPromises: TPromise<QuickOpenModel>[] = [];
			if (!range) {
				let symbolSearchTimeoutPromiseFn: (timeout: number) => Promise = (timeout) => {
					return TPromise.timeout(timeout).then(() => {

						// As long as the file search query did not return, push out the symbol timeout
						// so that the symbol search has a chance to return results at least as long as
						// the file search did not return.
						if (!receivedFileResults) {
							return symbolSearchTimeoutPromiseFn(OpenAnythingHandler.SYMBOL_SEARCH_SUBSEQUENT_TIMEOUT);
						}

						// Empty result since timeout was reached and file results are in
						return Promise.as(new QuickOpenModel());
					});
				};

				let lookupPromise = this.openSymbolHandler.getResults(searchValue);
				let timeoutPromise = symbolSearchTimeoutPromiseFn(OpenAnythingHandler.SYMBOL_SEARCH_INITIAL_TIMEOUT);

				// Timeout lookup after N seconds to not block file search results
				resultPromises.push(Promise.any([lookupPromise, timeoutPromise]).then((result) => {
					return result.value;
				}));
			} else {
				resultPromises.push(Promise.as(new QuickOpenModel())); // We need this empty promise because we are using the throttler below!
			}

			// File Results
			resultPromises.push(this.openFileHandler.getResults(searchValue).then((results: QuickOpenModel) => {
				receivedFileResults = true;

				return results;
			}));

			// Join and sort unified
			return TPromise.join(resultPromises).then((results: QuickOpenModel[]) => {

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed) {
					return TPromise.as<QuickOpenModel>(new QuickOpenModel());
				}

				// Combine symbol results and file results
				let result = [...results[0].entries, ...results[1].entries];

				// Sort
				let normalizedSearchValue = strings.stripWildcards(searchValue.toLowerCase());
				result.sort((elementA, elementB) => compareAnything(elementA.getLabel(), elementB.getLabel(), normalizedSearchValue));

				// Apply Range
				result.forEach((element) => {
					if (element instanceof FileEntry) {
						(<FileEntry>element).setRange(range);
					}
				});

				// Cache for fast lookup
				this.resultsToSearchCache[searchValue] = result;

				return TPromise.as<QuickOpenModel>(new QuickOpenModel(result));
			}, (error: Error) => {
				this.messageService.show(Severity.Error, error);
			});
		};

		// Trigger through delayer to prevent accumulation while the user is typing
		return this.delayer.trigger(promiseFactory);
	}

	private findRange(value: string): IRange {
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

		return range;
	}

	public getResultsFromCache(searchValue: string, range: IRange = null): QuickOpenEntry[] {

		// Find cache entries by prefix of search value
		let cachedEntries: QuickOpenEntry[];
		for (let previousSearch in this.resultsToSearchCache) {
			if (this.resultsToSearchCache.hasOwnProperty(previousSearch) && searchValue.indexOf(previousSearch) === 0) {
				cachedEntries = this.resultsToSearchCache[previousSearch];
				break;
			}
		}

		if (!cachedEntries) {
			return null;
		}

		// Pattern match on results and adjust highlights
		let results: QuickOpenEntry[] = [];
		for (let i = 0; i < cachedEntries.length; i++) {
			let entry = cachedEntries[i];

			// Check for file entries if range is used
			if (range && !(entry instanceof FileEntry)) {
				continue;
			}

			// Check for pattern match
			let highlights = filters.matchesFuzzy(searchValue, entry.getLabel());
			if (highlights) {
				entry.setHighlights(highlights);
				results.push(entry);
			}
		}

		// Sort
		let normalizedSearchValue = strings.stripWildcards(searchValue.toLowerCase());
		results.sort((elementA, elementB) => compareAnything(elementA.getLabel(), elementB.getLabel(), normalizedSearchValue));

		// Apply Range
		results.forEach((element) => {
			if (element instanceof FileEntry) {
				(<FileEntry>element).setRange(range);
			}
		});

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

	public onClose(canceled: boolean): void {
		this.isClosed = true;

		// Clear Cache
		this.resultsToSearchCache = {};

		// Propagate
		this.openSymbolHandler.onClose(canceled);
		this.openFileHandler.onClose(canceled);
	}
}