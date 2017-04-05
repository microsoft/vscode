/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { fuzzyScore } from 'vs/base/common/filters';
import { ISuggestSupport } from 'vs/editor/common/modes';
import { ISuggestionItem } from './suggest';

export interface ICompletionItem extends ISuggestionItem {
	matches?: number[];
	score?: number;
	idx?: number;
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
	private _items: ISuggestionItem[];

	private _filteredItems: ICompletionItem[];
	private _topScoreIdx: number;
	private _isIncomplete: boolean;
	private _stats: ICompletionStats;

	constructor(items: ISuggestionItem[], column: number, lineContext: LineContext) {
		this._items = items;
		this._column = column;
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
		if (!this._filteredItems) {
			this._createCachedState();
		}
	}

	private _createCachedState(): void {
		this._filteredItems = [];
		this._topScoreIdx = 0;
		this._isIncomplete = false;
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };

		const { leadingLineContent, characterCountDelta } = this._lineContext;
		let word = '';

		for (let i = 0; i < this._items.length; i++) {

			const item = <ICompletionItem>this._items[i];
			const { suggestion, container } = item;

			// collect those supports that signaled having
			// an incomplete result
			this._isIncomplete = this._isIncomplete || container.incomplete;

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// differnet word, but in practice not - that's why we cache
			const wordLen = suggestion.overwriteBefore + characterCountDelta - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
			}

			let match = fuzzyScore(word, suggestion.label);
			if (match) {
				item.score = match[0];
				item.matches = match[1];
			} else {
				if (typeof suggestion.filterText === 'string') {
					match = fuzzyScore(word, suggestion.filterText);
				}
				if (!match) {
					continue;
				}
				item.score = match[0];
				item.matches = []; // don't use the filterText-matches
			}
			item.idx = i;

			this._filteredItems.push(item);

			// update stats
			this._stats.suggestionCount++;
			switch (suggestion.type) {
				case 'snippet': this._stats.snippetCount++; break;
				case 'text': this._stats.textCount++; break;
			}
		}

		this._filteredItems.sort(CompletionModel._compareCompletionItems);
	}

	private static _compareCompletionItems(a: ICompletionItem, b: ICompletionItem) {
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
}
