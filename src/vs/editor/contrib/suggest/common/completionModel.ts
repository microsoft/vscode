/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {IMatch, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {ISuggestSupport} from 'vs/editor/common/modes';
import {ISuggestionItem} from './suggest';

export interface ICompletionItem extends ISuggestionItem {
	highlights?: IMatch[];
}

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

export class CompletionModel {

	private _lineContext: LineContext;
	private _column: number;
	private _items: ICompletionItem[];

	private _filteredItems: ICompletionItem[];
	private _topScoreIdx: number;
	private _incomplete: ISuggestSupport[];
	private _stats: ICompletionStats;

	constructor(items: ISuggestionItem[], column: number, lineContext: LineContext) {
		this._items = items;
		this._column = column;
		this._lineContext = lineContext;
	}

	replaceIncomplete(newItems: ISuggestionItem[], compareFn:(a:ISuggestionItem, b:ISuggestionItem) => number): void {
		let newItemsIdx = 0;
		for (let i = 0; i < this._items.length; i++) {
			if (this._incomplete.indexOf(this._items[i].support) >= 0) {
				// we found an item which support signaled 'incomplete'
				// which means we remove the item. For perf reasons we
				// frist replace and only then splice.
				if (newItemsIdx < newItems.length) {
					this._items[i] = newItems[newItemsIdx++];
				} else {
					this._items.splice(i, 1);
					i--;
				}
			}
		}
		// add remaining new items
		if (newItemsIdx < newItems.length) {
			this._items.push(...newItems.slice(newItemsIdx));
		}

		// sort and reset cached state
		this._items.sort(compareFn);
		this._filteredItems = undefined;
	}

	get lineContext(): LineContext {
		return this._lineContext;
	}

	set lineContext(value: LineContext) {
		if (this._lineContext.leadingLineContent !== value.leadingLineContent
			|| this._lineContext.characterCountDelta !== value.characterCountDelta) {

			this._lineContext = value;
			this._filteredItems = undefined;
		}
	}

	get items(): ICompletionItem[] {
		this._ensureCachedState();
		return this._filteredItems;
	}

	get topScoreIdx(): number {
		this._ensureCachedState();
		return this._topScoreIdx;
	}

	get incomplete(): ISuggestSupport[] {
		this._ensureCachedState();
		return this._incomplete;
	}

	get stats(): ICompletionStats {
		this._ensureCachedState();
		return this._stats;
	}

	private _ensureCachedState(): void {
		if (!this._filteredItems) {
			this._createCachedState();
		}
	}

	private _createCachedState(): void {
		this._filteredItems = [];
		this._incomplete = [];
		this._topScoreIdx = -1;
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };

		const {leadingLineContent, characterCountDelta} = this._lineContext;
		let word = '';
		let topScore = -1;

		for (const item of this._items) {

			const {suggestion, support, container} = item;
			const filter = support && support.filter || fuzzyContiguousFilter;

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// differnet word, but in practice not - that's why we cache
			const wordLen = suggestion.overwriteBefore + characterCountDelta - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = leadingLineContent.slice(-wordLen);
			}

			let match = false;

			// compute highlights based on 'label'
			item.highlights = filter(word, suggestion.label);
			match = item.highlights !== null;

			// no match on label nor codeSnippet -> check on filterText
			if(!match && typeof suggestion.filterText === 'string') {
				if (!isFalsyOrEmpty(filter(word, suggestion.filterText))) {
					match = true;

					// try to compute highlights by stripping none-word
					// characters from the end of the string
					item.highlights = filter(word.replace(/^\W+|\W+$/, ''), suggestion.label);
				}
			}

			if (!match) {
				continue;
			}

			this._filteredItems.push(item);

			// compute score against word
			const wordLowerCase = word.toLowerCase();
			const score = CompletionModel._score(suggestion.insertText, word, wordLowerCase);
			if (score > topScore) {
				topScore = score;
				this._topScoreIdx = this._filteredItems.length - 1;
			}

			// collect those supports that signaled having
			// an incomplete result
			if (container.incomplete && this._incomplete.indexOf(support) < 0) {
				this._incomplete.push(support);
			}

			// update stats
			this._stats.suggestionCount++;
			switch (suggestion.type) {
				case 'snippet': this._stats.snippetCount++; break;
				case 'text': this._stats.textCount++; break;
			}
		}
	}

	private static _score(suggestion: string, currentWord: string, currentWordLowerCase: string): number {
		const suggestionLowerCase = suggestion.toLowerCase();
		let score = 0;

		for (let i = 0, len = Math.min(currentWord.length, suggestion.length); i < len; i++) {
			if (currentWord[i] === suggestion[i]) {
				score += 2;
			} else if (currentWordLowerCase[i] === suggestionLowerCase[i]) {
				score += 1;
			} else {
				break;
			}
		}

		return score;
	}
}
