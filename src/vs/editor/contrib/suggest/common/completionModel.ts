/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {TPromise} from 'vs/base/common/winjs.base';
import {IFilter, IMatch, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {ISuggestion} from 'vs/editor/common/modes';
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

export class LineContext {
	leadingLineContent: string;
	characterCountDelta: number;
}

export class CompletionModel {

	public raw: ISuggestionItem[];

	private _lineContext: LineContext;
	private _items: CompletionItem[] = [];

	private _filteredItems: CompletionItem[] = undefined;
	private _topScoreIdx: number;

	constructor(raw: ISuggestionItem[], lineContext: LineContext) {
		this.raw = raw;
		this._lineContext = lineContext;
		for (let item of raw) {
			this._items.push(new CompletionItem(item));
		}
	}

	get lineContext(): LineContext {
		return this._lineContext;
	}

	set lineContext(value: LineContext) {
		if (this._lineContext !== value) {
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

	private _filterAndScore(): void {
		this._filteredItems = [];
		this._topScoreIdx = -1;
		let topScore = -1;
		const {leadingLineContent, characterCountDelta} = this._lineContext;

		//TODO@joh - sort by 'overwriteBefore' such that we can 'reuse' the word (wordLowerCase)
		for (const item of this._items) {

			const start = leadingLineContent.length - (item.suggestion.overwriteBefore + characterCountDelta);
			const word = leadingLineContent.substr(start);
			const {filter, suggestion} = item;

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
