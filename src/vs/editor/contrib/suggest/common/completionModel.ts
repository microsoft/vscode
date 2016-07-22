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


function computeScore(suggestion: string, currentWord: string, currentWordLowerCase: string): number {
	const suggestionLowerCase = suggestion.toLowerCase();
	let score = 0;

	for (let i = 0; i < currentWord.length && i < suggestion.length; i++) {
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


export class CompletionItem {

	suggestion: ISuggestion;
	filter: IFilter;
	highlights: IMatch[];
	score: number;

	constructor(private _item: ISuggestionItem) {
		this.suggestion = _item.suggestion;
		if (typeof this.suggestion.overwriteBefore !== 'number') {
			this.suggestion.overwriteBefore = _item.container.currentWord.length;
		}
		if (typeof this.suggestion.overwriteAfter !== 'number') {
			this.suggestion.overwriteAfter = 0;
		}
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
	private _indexOfBestScoredItem: number;

	constructor(raw: ISuggestionItem[], leadingLineContent: string, characterCountDelta: number) {
		this._lineContext = { leadingLineContent, characterCountDelta };
		for (const item of raw) {
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
			this._filter();
		}
		return this._filteredItems;
	}

	get indexOfHighestScoredItem(): number {
		if (!this._filteredItems) {
			this._filter();
		}
		return this._indexOfBestScoredItem;
	}

	private _filter(): void {
		this._filteredItems = [];

		this._indexOfBestScoredItem = 0;
		let bestScore = 0;

		const {leadingLineContent, characterCountDelta} = this._lineContext;
		for (let item of this._items) {

			const start = leadingLineContent.length - (item.suggestion.overwriteBefore + characterCountDelta);
			const word = leadingLineContent.substr(start);

			const {filter, suggestion} = item;
			let match = false;

			// compute highlights based on 'label'
			item.highlights = filter(word, suggestion.label);
			match = item.highlights !== null;

			// no match on label -> check on codeSnippet
			if (!match && suggestion.codeSnippet !== suggestion.label) {
				match = !isFalsyOrEmpty((filter(word, suggestion.codeSnippet.replace(/{{.+?}}/g, '')))); // filters {{text}}-snippet syntax
			}

			// no match on label nor codeSnippet -> check on filterText
			if(!match && typeof suggestion.filterText === 'string') {
				match = !isFalsyOrEmpty(filter(word, suggestion.filterText));
			}

			if (match) {
				this._filteredItems.push(item);
				const score = item.score = computeScore(suggestion.label, word, word.toLowerCase());
				if (score > bestScore) {
					bestScore = score;
					this._indexOfBestScoredItem = this._filteredItems.length - 1;
				}
			}
		}
	}
}
