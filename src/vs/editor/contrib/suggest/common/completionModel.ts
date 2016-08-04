/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {assign} from 'vs/base/common/objects';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {IFilter, IMatch, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {ISuggestSupport, ISuggestion} from 'vs/editor/common/modes';
import {ISuggestionItem} from './suggest';
import {asWinJsPromise} from 'vs/base/common/async';
import {Position} from 'vs/editor/common/core/position';

export class CompletionItem {

	suggestion: ISuggestion;
	highlights: IMatch[];
	filter: IFilter;

	private _support: ISuggestSupport;

	constructor(item: ISuggestionItem) {
		this.suggestion = item.suggestion;
		this.filter = item.support && item.support.filter || fuzzyContiguousFilter;
		this._support = item.support;
	}

	resolveDetails(model:IReadOnlyModel, position:Position): TPromise<ISuggestion> {
		if (!this._support || typeof this._support.resolveCompletionItem !== 'function') {
			return TPromise.as(this.suggestion);
		}

		return asWinJsPromise((token) => {
			return this._support.resolveCompletionItem(model, position, this.suggestion, token);
		});
	}

	updateDetails(value: ISuggestion): void {
		this.suggestion = assign(this.suggestion, value);
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
