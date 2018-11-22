/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fuzzyScore, fuzzyScoreGracefulAggressive, anyScore, FuzzyScorer } from 'vs/base/common/filters';
import { isDisposable } from 'vs/base/common/lifecycle';
import { CompletionList, CompletionItemProvider, CompletionItemKind } from 'vs/editor/common/modes';
import { ISuggestionItem, ensureLowerCaseVariants } from './suggest';
import { InternalSuggestOptions, EDITOR_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { WordDistance } from 'vs/editor/contrib/suggest/wordDistance';
import { CharCode } from 'vs/base/common/charCode';

export interface ICompletionItem extends ISuggestionItem {
	matches?: number[];
	score?: number;
	idx?: number;
	distance?: number;
	word?: string;
}

/* __GDPR__FRAGMENT__
	"ICompletionStats" : {
		"suggestionCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"snippetCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"textCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
	}
*/
// __GDPR__TODO__: This is a dynamically extensible structure which can not be declared statically.
export interface ICompletionStats {
	suggestionCount: number;
	snippetCount: number;
	textCount: number;
	[name: string]: any;
}

export class LineContext {
	leadingLineContent: string;
	characterCountDelta: number;
}

const enum Refilter {
	Nothing = 0,
	All = 1,
	Incr = 2
}

export class CompletionModel {

	private readonly _items: ICompletionItem[];
	private readonly _column: number;
	private readonly _wordDistance: WordDistance;
	private readonly _options: InternalSuggestOptions;
	private readonly _snippetCompareFn = CompletionModel._compareCompletionItems;

	private _lineContext: LineContext;
	private _refilterKind: Refilter;
	private _filteredItems: ICompletionItem[];
	private _isIncomplete: Set<CompletionItemProvider>;
	private _stats: ICompletionStats;

	constructor(
		items: ISuggestionItem[],
		column: number,
		lineContext: LineContext,
		wordDistance: WordDistance,
		options: InternalSuggestOptions = EDITOR_DEFAULTS.contribInfo.suggest
	) {
		this._items = items;
		this._column = column;
		this._wordDistance = wordDistance;
		this._options = options;
		this._refilterKind = Refilter.All;
		this._lineContext = lineContext;

		if (options.snippets === 'top') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsUp;
		} else if (options.snippets === 'bottom') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsDown;
		}
	}

	dispose(): void {
		const seen = new Set<CompletionList>();
		for (const { container } of this._items) {
			if (!seen.has(container)) {
				seen.add(container);
				if (isDisposable(container)) {
					container.dispose();
				}
			}
		}
	}

	get lineContext(): LineContext {
		return this._lineContext;
	}

	set lineContext(value: LineContext) {
		if (this._lineContext.leadingLineContent !== value.leadingLineContent
			|| this._lineContext.characterCountDelta !== value.characterCountDelta
		) {
			this._refilterKind = this._lineContext.characterCountDelta < value.characterCountDelta && this._filteredItems ? Refilter.Incr : Refilter.All;
			this._lineContext = value;
		}
	}

	get items(): ICompletionItem[] {
		this._ensureCachedState();
		return this._filteredItems;
	}

	get incomplete(): Set<CompletionItemProvider> {
		this._ensureCachedState();
		return this._isIncomplete;
	}

	adopt(except: Set<CompletionItemProvider>): ISuggestionItem[] {
		let res = new Array<ISuggestionItem>();
		for (let i = 0; i < this._items.length;) {
			if (!except.has(this._items[i].support)) {
				res.push(this._items[i]);

				// unordered removed
				this._items[i] = this._items[this._items.length - 1];
				this._items.pop();
			} else {
				// continue with next item
				i++;
			}
		}
		this._refilterKind = Refilter.All;
		return res;
	}

	get stats(): ICompletionStats {
		this._ensureCachedState();
		return this._stats;
	}

	private _ensureCachedState(): void {
		if (this._refilterKind !== Refilter.Nothing) {
			this._createCachedState();
		}
	}

	private _createCachedState(): void {

		this._isIncomplete = new Set();
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };

		const { leadingLineContent, characterCountDelta } = this._lineContext;
		let word = '';
		let wordLow = '';

		// incrementally filter less
		const source = this._refilterKind === Refilter.All ? this._items : this._filteredItems;
		const target: typeof source = [];

		// picks a score function based on the number of
		// items that we have to score/filter and based on the
		// user-configuration
		const scoreFn: FuzzyScorer = (!this._options.filterGraceful || source.length > 2000) ? fuzzyScore : fuzzyScoreGracefulAggressive;

		for (let i = 0; i < source.length; i++) {

			const item = source[i];
			const { suggestion, container } = item;

			// make sure _labelLow, _filterTextLow, _sortTextLow exist
			ensureLowerCaseVariants(suggestion);

			// collect those supports that signaled having
			// an incomplete result
			if (container.incomplete) {
				this._isIncomplete.add(item.support);
			}

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// different word, but in practice not - that's why we cache
			const overwriteBefore = item.position.column - suggestion.range.startColumn;
			const wordLen = overwriteBefore + characterCountDelta - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
				wordLow = word.toLowerCase();
			}

			// remember the word against which this item was
			// scored
			item.word = word;

			if (wordLen === 0) {
				// when there is nothing to score against, don't
				// event try to do. Use a const rank and rely on
				// the fallback-sort using the initial sort order.
				// use a score of `-100` because that is out of the
				// bound of values `fuzzyScore` will return
				item.score = -100;
				item.matches = undefined;

			} else {
				// skip word characters that are whitespace until
				// we have hit the replace range (overwriteBefore)
				let wordPos = 0;
				while (wordPos < overwriteBefore) {
					const ch = word.charCodeAt(wordPos);
					if (ch === CharCode.Space || ch === CharCode.Tab) {
						wordPos += 1;
					} else {
						break;
					}
				}

				if (wordPos >= wordLen) {
					// the wordPos at which scoring starts is the whole word
					// and therefore the same rules as not having a word apply
					item.score = -100;
					item.matches = [];

				} else if (typeof suggestion.filterText === 'string') {
					// when there is a `filterText` it must match the `word`.
					// if it matches we check with the label to compute highlights
					// and if that doesn't yield a result we have no highlights,
					// despite having the match
					let match = scoreFn(word, wordLow, wordPos, suggestion.filterText, suggestion._filterTextLow, 0, false);
					if (!match) {
						continue;
					}
					item.score = match[0];
					item.matches = (fuzzyScore(word, wordLow, 0, suggestion.label, suggestion._labelLow, 0, true) || anyScore(word, suggestion.label))[1];

				} else {
					// by default match `word` against the `label`
					let match = scoreFn(word, wordLow, wordPos, suggestion.label, suggestion._labelLow, 0, false);
					if (match) {
						item.score = match[0];
						item.matches = match[1];
					} else {
						continue;
					}
				}
			}

			item.idx = i;
			item.distance = this._wordDistance.distance(item.position, suggestion);
			target.push(item);

			// update stats
			this._stats.suggestionCount++;
			switch (suggestion.kind) {
				case CompletionItemKind.Snippet: this._stats.snippetCount++; break;
				case CompletionItemKind.Text: this._stats.textCount++; break;
			}
		}

		this._filteredItems = target.sort(this._snippetCompareFn);
		this._refilterKind = Refilter.Nothing;
	}

	private static _compareCompletionItems(a: ICompletionItem, b: ICompletionItem): number {
		if (a.score > b.score) {
			return -1;
		} else if (a.score < b.score) {
			return 1;
		} else if (a.distance < b.distance) {
			return -1;
		} else if (a.distance > b.distance) {
			return 1;
		} else if (a.idx < b.idx) {
			return -1;
		} else if (a.idx > b.idx) {
			return 1;
		} else {
			return 0;
		}
	}

	private static _compareCompletionItemsSnippetsDown(a: ICompletionItem, b: ICompletionItem): number {
		if (a.suggestion.kind !== b.suggestion.kind) {
			if (a.suggestion.kind === CompletionItemKind.Snippet) {
				return 1;
			} else if (b.suggestion.kind === CompletionItemKind.Snippet) {
				return -1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}

	private static _compareCompletionItemsSnippetsUp(a: ICompletionItem, b: ICompletionItem): number {
		if (a.suggestion.kind !== b.suggestion.kind) {
			if (a.suggestion.kind === CompletionItemKind.Snippet) {
				return -1;
			} else if (b.suggestion.kind === CompletionItemKind.Snippet) {
				return 1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}
}
