/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { quickSelect } from '../../../../base/common/arrays.js';
import { CharCode } from '../../../../base/common/charCode.js';
import { anyScore, fuzzyScore, FuzzyScore, fuzzyScoreGracefulAggressive, FuzzyScoreOptions, FuzzyScorer } from '../../../../base/common/filters.js';
import { compareIgnoreCase } from '../../../../base/common/strings.js';
import { InternalSuggestOptions } from '../../../common/config/editorOptions.js';
import { CompletionItemKind, CompletionItemProvider } from '../../../common/languages.js';
import { WordDistance } from './wordDistance.js';
import { CompletionItem } from './suggest.js';

type StrictCompletionItem = Required<CompletionItem>;

export interface ICompletionStats {
	pLabelLen: number;
}

export class LineContext {
	constructor(
		readonly leadingLineContent: string,
		readonly characterCountDelta: number,
	) { }
}

const enum Refilter {
	Nothing = 0,
	All = 1,
	Incr = 2
}

/**
 * Sorted, filtered completion view model
 * */
export class CompletionModel {

	private readonly _items: CompletionItem[];
	private readonly _column: number;
	private readonly _wordDistance: WordDistance;
	private readonly _options: InternalSuggestOptions;
	private readonly _snippetCompareFn = CompletionModel._compareCompletionItems;
	private readonly _fuzzyScoreOptions: FuzzyScoreOptions;

	private _lineContext: LineContext;
	private _refilterKind: Refilter;
	private _filteredItems?: StrictCompletionItem[];

	private _itemsByProvider?: Map<CompletionItemProvider, CompletionItem[]>;
	private _stats?: ICompletionStats;

	constructor(
		items: CompletionItem[],
		column: number,
		lineContext: LineContext,
		wordDistance: WordDistance,
		options: InternalSuggestOptions,
		snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none',
		fuzzyScoreOptions: FuzzyScoreOptions | undefined = FuzzyScoreOptions.default,
		readonly clipboardText: string | undefined = undefined
	) {
		this._items = items;
		this._column = column;
		this._wordDistance = wordDistance;
		this._options = options;
		this._refilterKind = Refilter.All;
		this._lineContext = lineContext;
		this._fuzzyScoreOptions = fuzzyScoreOptions;

		if (snippetSuggestions === 'top') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsUp;
		} else if (snippetSuggestions === 'bottom') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsDown;
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

	get items(): CompletionItem[] {
		this._ensureCachedState();
		return this._filteredItems!;
	}

	getItemsByProvider(): ReadonlyMap<CompletionItemProvider, CompletionItem[]> {
		this._ensureCachedState();
		return this._itemsByProvider!;
	}

	getIncompleteProvider(): Set<CompletionItemProvider> {
		this._ensureCachedState();
		const result = new Set<CompletionItemProvider>();
		for (const [provider, items] of this.getItemsByProvider()) {
			if (items.length > 0 && items[0].container.incomplete) {
				result.add(provider);
			}
		}
		return result;
	}

	get stats(): ICompletionStats {
		this._ensureCachedState();
		return this._stats!;
	}

	private _ensureCachedState(): void {
		if (this._refilterKind !== Refilter.Nothing) {
			this._createCachedState();
		}
	}

	private _createCachedState(): void {

		this._itemsByProvider = new Map();

		const labelLengths: number[] = [];

		const { leadingLineContent, characterCountDelta } = this._lineContext;
		let word = '';
		let wordLow = '';

		// incrementally filter less
		const source = this._refilterKind === Refilter.All ? this._items : this._filteredItems!;
		const target: StrictCompletionItem[] = [];

		// picks a score function based on the number of
		// items that we have to score/filter and based on the
		// user-configuration
		const scoreFn: FuzzyScorer = (!this._options.filterGraceful || source.length > 2000) ? fuzzyScore : fuzzyScoreGracefulAggressive;

		for (let i = 0; i < source.length; i++) {

			const item = source[i];

			if (item.isInvalid) {
				continue; // SKIP invalid items
			}

			// keep all items by their provider
			const arr = this._itemsByProvider.get(item.provider);
			if (arr) {
				arr.push(item);
			} else {
				this._itemsByProvider.set(item.provider, [item]);
			}

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// different word, but in practice not - that's why we cache
			const overwriteBefore = item.position.column - item.editStart.column;
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
				item.score = FuzzyScore.Default;

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
					item.score = FuzzyScore.Default;

				} else if (typeof item.completion.filterText === 'string') {
					// when there is a `filterText` it must match the `word`.
					// if it matches we check with the label to compute highlights
					// and if that doesn't yield a result we have no highlights,
					// despite having the match
					const match = scoreFn(word, wordLow, wordPos, item.completion.filterText, item.filterTextLow!, 0, this._fuzzyScoreOptions);
					if (!match) {
						continue; // NO match
					}
					if (compareIgnoreCase(item.completion.filterText, item.textLabel) === 0) {
						// filterText and label are actually the same -> use good highlights
						item.score = match;
					} else {
						// re-run the scorer on the label in the hope of a result BUT use the rank
						// of the filterText-match
						item.score = anyScore(word, wordLow, wordPos, item.textLabel, item.labelLow, 0);
						item.score[0] = match[0]; // use score from filterText
					}

				} else {
					// by default match `word` against the `label`
					const match = scoreFn(word, wordLow, wordPos, item.textLabel, item.labelLow, 0, this._fuzzyScoreOptions);
					if (!match) {
						continue; // NO match
					}
					item.score = match;
				}
			}

			item.idx = i;
			item.distance = this._wordDistance.distance(item.position, item.completion);
			target.push(item as StrictCompletionItem);

			// update stats
			labelLengths.push(item.textLabel.length);
		}

		this._filteredItems = target.sort(this._snippetCompareFn);
		this._refilterKind = Refilter.Nothing;
		this._stats = {
			pLabelLen: labelLengths.length ?
				quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b)
				: 0
		};
	}

	private static _compareCompletionItems(a: StrictCompletionItem, b: StrictCompletionItem): number {
		if (a.score[0] > b.score[0]) {
			return -1;
		} else if (a.score[0] < b.score[0]) {
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

	private static _compareCompletionItemsSnippetsDown(a: StrictCompletionItem, b: StrictCompletionItem): number {
		if (a.completion.kind !== b.completion.kind) {
			if (a.completion.kind === CompletionItemKind.Snippet) {
				return 1;
			} else if (b.completion.kind === CompletionItemKind.Snippet) {
				return -1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}

	private static _compareCompletionItemsSnippetsUp(a: StrictCompletionItem, b: StrictCompletionItem): number {
		if (a.completion.kind !== b.completion.kind) {
			if (a.completion.kind === CompletionItemKind.Snippet) {
				return -1;
			} else if (b.completion.kind === CompletionItemKind.Snippet) {
				return 1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}
}
