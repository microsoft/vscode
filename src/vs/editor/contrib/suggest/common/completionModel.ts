/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { indexOfIgnoreCase } from 'vs/base/common/strings';
import { IMatch, fuzzyContiguousFilter } from 'vs/base/common/filters';
import { ISuggestSupport } from 'vs/editor/common/modes';
import { ISuggestionItem } from './suggest';

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
		this._topScoreIdx = -1;
		this._isIncomplete = false;
		this._stats = { suggestionCount: 0, snippetCount: 0, textCount: 0 };

		const {leadingLineContent, characterCountDelta} = this._lineContext;
		let word = '';
		let topScore = -1;

		for (const item of this._items) {

			const {suggestion, container} = item;

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

			let match = false;

			// compute highlights based on 'label'
			item.highlights = fuzzyContiguousFilter(word, suggestion.label);
			match = item.highlights !== null;

			// no match on label nor codeSnippet -> check on filterText
			if (!match && typeof suggestion.filterText === 'string') {
				if (!isFalsyOrEmpty(fuzzyContiguousFilter(word, suggestion.filterText))) {
					match = true;

					// try to compute highlights by stripping none-word
					// characters from the end of the string
					item.highlights = fuzzyContiguousFilter(word.replace(/^\W+|\W+$/, ''), suggestion.label);
				}
			}

			if (!match) {
				continue;
			}

			this._filteredItems.push(item);

			// compute score against word
			const score = CompletionModel._scoreByHighlight(item, word);
			if (score > topScore) {
				topScore = score;
				this._topScoreIdx = this._filteredItems.length - 1;
			}

			// update stats
			this._stats.suggestionCount++;
			switch (suggestion.type) {
				case 'snippet': this._stats.snippetCount++; break;
				case 'text': this._stats.textCount++; break;
			}
		}
	}

	private static _base = 100;

	private static _scoreByHighlight(item: ICompletionItem, currentWord: string): number {
		const {highlights, suggestion} = item;

		if (isFalsyOrEmpty(highlights)) {
			return 0;
		}

		let caseSensitiveMatches = 0;
		let caseInsensitiveMatches = 0;
		let firstMatchStart = 0;

		const len = Math.min(CompletionModel._base, suggestion.label.length);
		let currentWordOffset = 0;

		for (let pos = 0, idx = 0; pos < len; pos++) {

			const highlight = highlights[idx];

			if (pos === highlight.start) {
				// reached a highlight: find highlighted part
				// and count case-sensitive /case-insensitive matches
				const part = suggestion.label.substring(highlight.start, highlight.end);
				currentWordOffset = indexOfIgnoreCase(currentWord, part, currentWordOffset);
				if (currentWordOffset >= 0) {
					do {
						if (suggestion.label[pos] === currentWord[currentWordOffset]) {
							caseSensitiveMatches += 1;
						} else {
							caseInsensitiveMatches += 1;
						}
						pos += 1;
						currentWordOffset += 1;
					} while (pos < highlight.end);
				}

				// proceed with next highlight, store first start,
				// exit loop when no highlight is available
				if (idx === 0) {
					firstMatchStart = highlight.start;
				}
				idx += 1;

				if (idx >= highlights.length) {
					break;
				}
			}
		}

		// combine the 4 scoring values into one
		// value using base_100. Values further left
		// are more important
		return (CompletionModel._base ** 3) * caseSensitiveMatches
			+ (CompletionModel._base ** 2) * caseInsensitiveMatches
			+ (CompletionModel._base ** 1) * (CompletionModel._base - firstMatchStart)
			+ (CompletionModel._base ** 0) * (CompletionModel._base - highlights.length);
	}
}
