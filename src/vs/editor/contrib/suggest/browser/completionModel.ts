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
import {ISuggestResult, ISuggestSupport, ISuggestion} from 'vs/editor/common/modes';
import {ISuggestResult2} from '../common/suggest';
import {asWinJsPromise} from 'vs/base/common/async';
import {Position} from 'vs/editor/common/core/position';

export class CompletionItem {

	suggestion: ISuggestion;
	highlights: IMatch[];
	container: ISuggestResult;
	filter: IFilter;

	private _support: ISuggestSupport;

	constructor(suggestion: ISuggestion, container: ISuggestResult2) {
		this._support = container.support;
		this.suggestion = suggestion;
		this.container = container;
		this.filter = container.support && container.support.filter || fuzzyContiguousFilter;
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

			const start = leadingLineContent.length - (overwriteBefore + characterCountDelta);
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
