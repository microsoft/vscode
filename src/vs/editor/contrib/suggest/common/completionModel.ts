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
	private _items: ICompletionItem[];

	private _filteredItems: ICompletionItem[];
	private _topScoreIdx: number;
	private _incomplete: ISuggestSupport[];
	private _stats: ICompletionStats;

	constructor(items: ISuggestionItem[], lineContext: LineContext) {
		this._items = items;
		this._lineContext = lineContext;
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
			const wordLen = suggestion.overwriteBefore + characterCountDelta;
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
