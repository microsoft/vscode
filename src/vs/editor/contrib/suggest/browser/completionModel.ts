/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {assign} from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestResult, ISuggestSupport, ISuggestion, ISuggestionFilter} from 'vs/editor/common/modes';
import {DefaultFilter, IMatch} from 'vs/editor/common/modes/modesFilters';
import {ISuggestResult2} from '../common/suggest';

export class CompletionItem {

	suggestion: ISuggestion;
	highlights: IMatch[];
	container: ISuggestResult;

	private _filter: ISuggestionFilter;
	private _support: ISuggestSupport;

	constructor(suggestion: ISuggestion, container: ISuggestResult2) {
		this._support = container.support;
		this.suggestion = suggestion;
		this.container = container;
		this._filter = container.support && container.support.getFilter() || DefaultFilter;
	}

	resolveDetails(resource: URI, position: IPosition): TPromise<ISuggestion> {
		if (!this._support || typeof this._support.getSuggestionDetails !== 'function') {
			return TPromise.as(this.suggestion);
		}

		return this._support.getSuggestionDetails(resource, position, this.suggestion);
	}

	updateDetails(value: ISuggestion): void {
		this.suggestion = assign(this.suggestion, value);
	}

	updateHighlights(word: string): void {
		this.highlights = this._filter(word, this.suggestion);
	}

	static compare(item: CompletionItem, otherItem: CompletionItem): number {
		const suggestion = item.suggestion;
		const otherSuggestion = otherItem.suggestion;

		if (typeof suggestion.sortText === 'string' && typeof otherSuggestion.sortText === 'string') {
			const one = suggestion.sortText.toLowerCase();
			const other = otherSuggestion.sortText.toLowerCase();

			if (one < other) {
				return -1;
			} else if (one > other) {
				return 1;
			}
		}

		return suggestion.label.toLowerCase() < otherSuggestion.label.toLowerCase() ? -1 : 1;
	}
}

export class LineContext {
	leadingLineContent: string;
	characterCountDelta: number;
}

export class CompletionModel {

	private _lineContext: LineContext;
	private _items: CompletionItem[] = [];
	private _filteredItems: CompletionItem[] = undefined;

	constructor(public raw: ISuggestResult2[], leadingLineContent:string) {
		this._lineContext = { leadingLineContent, characterCountDelta: 0 };
		for (let container of raw) {
			for (let suggestion of container.suggestions) {
				this._items.push(new CompletionItem(suggestion, container));
			}
		}
		this._items.sort(CompletionItem.compare);
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


	private _filter(): void {
		this._filteredItems = [];
		const {leadingLineContent, characterCountDelta} = this._lineContext;
		for (let item of this._items) {

			let {overwriteBefore} = item.suggestion;
			if (typeof overwriteBefore !== 'number') {
				overwriteBefore = item.container.currentWord.length;
			}

			let start = leadingLineContent.length - (overwriteBefore + characterCountDelta);
			let word = leadingLineContent.substr(start);

			// filter word
			item.updateHighlights(word);
			if (!isFalsyOrEmpty(item.highlights)) {
				this._filteredItems.push(item);
			}
		}
	}
}
