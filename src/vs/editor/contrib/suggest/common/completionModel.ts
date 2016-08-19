/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {TPromise} from 'vs/base/common/winjs.base';
import {IFilter, IMatch, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {ISuggestion, ISuggestSupport} from 'vs/editor/common/modes';
import {ISuggestionItem} from './suggest';

export class CompletionItem {

	suggestion: ISuggestion;
	highlights: IMatch[];
	filter: IFilter;

	constructor(private _item: ISuggestionItem) {
		this.suggestion = _item.suggestion;
		this.filter = _item.support && _item.support.filter || fuzzyContiguousFilter;
	}

	resolve(): TPromise<this> {
		return this._item.resolve().then(() => this);
	}
}

export interface CompletionStats {
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
	private _items: CompletionItem[] = [];
	private _incomplete: ISuggestSupport[] = [];

	private _filteredItems: CompletionItem[] = undefined;
	private _topScoreIdx: number;
	private _stats: CompletionStats;

	constructor(items: ISuggestionItem[], lineContext: LineContext) {
		this._lineContext = lineContext;
		for (const item of items) {
			this._items.push(new CompletionItem(item));

			if (item.container.incomplete
				&& this._incomplete.indexOf(item.support) < 0) {

				this._incomplete.push(item.support);
			}
		}
	}

	get incomplete(): ISuggestSupport[] {
		return this._incomplete;
	}

	get lineContext(): LineContext {
		return this._lineContext;
	}

	set lineContext(value: LineContext) {
		if (this._lineContext.leadingLineContent !== value.leadingLineContent
			|| this._lineContext.characterCountDelta !== value.characterCountDelta) {

			this._filteredItems = undefined;
			this._lineContext = value;
		}
	}

	get items(): CompletionItem[] {
		if (!this._filteredItems) {
			this._filterAndScore();
		}
		return this._filteredItems;
	}

	get topScoreIdx(): number {
		if (!this._filteredItems) {
			this._filterAndScore();
		}
		return this._topScoreIdx;
	}

	get stats(): CompletionStats {
		if (!this._filteredItems) {
			this._filterAndScore();
		}
		return this._stats;
	}

	private _filterAndScore(): void {
		this._filteredItems = [];
		this._topScoreIdx = -1;
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };
		const {leadingLineContent, characterCountDelta} = this._lineContext;

		let word = '';
		let topScore = -1;

		for (const item of this._items) {

			const {filter, suggestion} = item;

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// differnet word, but in practice not - that's why we cache
			const wordLen = item.suggestion.overwriteBefore + characterCountDelta;
			if (word.length !== wordLen) {
				word = leadingLineContent.slice(-wordLen);
			}

			let match = false;

			// compute highlights based on 'label'
			item.highlights = filter(word, suggestion.label);
			match = item.highlights !== null;

			// no match on label nor codeSnippet -> check on filterText
			if(!match && typeof suggestion.filterText === 'string') {
				match = !isFalsyOrEmpty(filter(word, suggestion.filterText));
			}

			if (!match) {
				continue;
			}

			this._filteredItems.push(item);

			// compute score against word
			const wordLowerCase = word.toLowerCase();
			const score = CompletionModel._score(suggestion.label, word, wordLowerCase);
			if (score > topScore) {
				topScore = score;
				this._topScoreIdx = this._filteredItems.length - 1;
			}

			// update stats
			this._stats.suggestionCount++;
			switch (item.suggestion.type) {
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
