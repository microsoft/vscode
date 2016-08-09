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

	constructor(raw: ISuggestionItem[], leadingLineContent: string) {
		this.raw = raw;
		this._lineContext = { leadingLineContent, characterCountDelta: 0 };
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
			this._filter();
		}
		return this._filteredItems;
	}


	private _filter(): void {
		this._filteredItems = [];
		const {leadingLineContent, characterCountDelta} = this._lineContext;
		for (let item of this._items) {

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

			if (match) {
				this._filteredItems.push(item);
			}
		}
	}
}
