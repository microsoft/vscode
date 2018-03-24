/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { fuzzyScore, fuzzyScoreGracefulAggressive, skipScore } from 'vs/base/common/filters';
import { ISuggestSupport, ISuggestResult } from 'vs/editor/common/modes';
import { ISuggestionItem, SnippetConfig } from './suggest';
import { isDisposable } from 'vs/base/common/lifecycle';

export interface ICompletionItem extends ISuggestionItem {
	matches?: number[];
	score?: number;
	idx?: number;
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

	private readonly _column: number;
	private readonly _items: ICompletionItem[];
	private readonly _snippetCompareFn = CompletionModel._compareCompletionItems;

	private _lineContext: LineContext;
	private _refilterKind: Refilter;
	private _filteredItems: ICompletionItem[];
	private _isIncomplete: boolean;
	private _stats: ICompletionStats;

	constructor(items: ISuggestionItem[], column: number, lineContext: LineContext, snippetConfig?: SnippetConfig) {
		this._items = items;
		this._column = column;
		this._refilterKind = Refilter.All;
		this._lineContext = lineContext;

		if (snippetConfig === 'top') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsUp;
		} else if (snippetConfig === 'bottom') {
			this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsDown;
		}
	}

	dispose(): void {
		const seen = new Set<ISuggestResult>();
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

	get incomplete(): boolean {
		this._ensureCachedState();
		return this._isIncomplete;
	}

	resolveIncompleteInfo(): { incomplete: ISuggestSupport[], complete: ISuggestionItem[] } {
		const incomplete: ISuggestSupport[] = [];
		const complete: ISuggestionItem[] = [];

		for (const item of this._items) {
			if (!item.container.incomplete) {
				complete.push(item);
			} else if (incomplete.indexOf(item.support) < 0) {
				incomplete.push(item.support);
			}
		}

		return { incomplete, complete };
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

		this._isIncomplete = false;
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };

		const { leadingLineContent, characterCountDelta } = this._lineContext;
		let word = '';

		// incrementally filter less
		const source = this._refilterKind === Refilter.All ? this._items : this._filteredItems;
		const target: typeof source = [];

		// picks a score function based on the number of
		// items that we have to score/filter
		const scoreFn = source.length > 2000 ? fuzzyScore : fuzzyScoreGracefulAggressive;

		for (let i = 0; i < source.length; i++) {

			const item = source[i];
			const { suggestion, container } = item;

			// collect those supports that signaled having
			// an incomplete result
			this._isIncomplete = this._isIncomplete || container.incomplete;

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// different word, but in practice not - that's why we cache
			const wordLen = suggestion.overwriteBefore + characterCountDelta - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
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

			} else if (typeof suggestion.filterText === 'string') {
				// when there is a `filterText` it must match the `word`.
				// if it matches we check with the label to compute highlights
				// and if that doesn't yield a result we have no highlights,
				// despite having the match
				let match = scoreFn(word, suggestion.filterText, suggestion.overwriteBefore);
				if (!match) {
					continue;
				}
				item.score = match[0];
				item.matches = skipScore(word, suggestion.label)[1];

			} else {
				// by default match `word` against the `label`
				let match = scoreFn(word, suggestion.label, suggestion.overwriteBefore);
				if (match) {
					item.score = match[0];
					item.matches = match[1];
				} else {
					continue;
				}
			}

			item.idx = i;

			target.push(item);

			// update stats
			this._stats.suggestionCount++;
			switch (suggestion.type) {
				case 'snippet': this._stats.snippetCount++; break;
				case 'text': this._stats.textCount++; break;
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
		} else if (a.idx < b.idx) {
			return -1;
		} else if (a.idx > b.idx) {
			return 1;
		} else {
			return 0;
		}
	}

	private static _compareCompletionItemsSnippetsDown(a: ICompletionItem, b: ICompletionItem): number {
		if (a.suggestion.type !== b.suggestion.type) {
			if (a.suggestion.type === 'snippet') {
				return 1;
			} else if (b.suggestion.type === 'snippet') {
				return -1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}

	private static _compareCompletionItemsSnippetsUp(a: ICompletionItem, b: ICompletionItem): number {
		if (a.suggestion.type !== b.suggestion.type) {
			if (a.suggestion.type === 'snippet') {
				return -1;
			} else if (b.suggestion.type === 'snippet') {
				return 1;
			}
		}
		return CompletionModel._compareCompletionItems(a, b);
	}
}
