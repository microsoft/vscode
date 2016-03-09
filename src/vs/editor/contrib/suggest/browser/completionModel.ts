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

function completionItemCompare(item: CompletionItem, otherItem: CompletionItem): number {
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

export class CompletionItem {

	suggestion: ISuggestion;
	highlights: IMatch[];
	support: ISuggestSupport;
	container: ISuggestResult;

	constructor(public group: CompletionGroup, suggestion: ISuggestion, container: ISuggestResult2) {
		this.support = container.support;
		this.suggestion = suggestion;
		this.container = container;
	}

	resolveDetails(resource: URI, position: IPosition): TPromise<ISuggestion> {
		if (!this.support || typeof this.support.getSuggestionDetails !== 'function') {
			return TPromise.as(this.suggestion);
		}

		return this.support.getSuggestionDetails(resource, position, this.suggestion);
	}

	updateDetails(value: ISuggestion): void {
		this.suggestion = assign(this.suggestion, value);
	}
}

export class CompletionGroup {

	private _items: CompletionItem[];
	private cache: CompletionItem[];
	private cacheCurrentWord: string;
	filter: ISuggestionFilter;

	constructor(public model: CompletionModel, raw: ISuggestResult2[]) {

		this._items = raw.reduce<CompletionItem[]>((items, result) => {
			return items.concat(
				result.suggestions
					.map(suggestion => new CompletionItem(this, suggestion, result))
			);
		}, []).sort(completionItemCompare);

		this.filter = DefaultFilter;

		if (this._items.length > 0) {
			const [first] = this._items;

			if (first.support) {
				this.filter = first.support.getFilter && first.support.getFilter() || this.filter;
			}
		}
	}

	getItems(currentWord: string): CompletionItem[] {
		if (currentWord === this.cacheCurrentWord) {
			return this.cache;
		}

		let set: CompletionItem[];

		// try to narrow down when possible, instead of always filtering everything
		if (this.cacheCurrentWord && currentWord.substr(0, this.cacheCurrentWord.length) === this.cacheCurrentWord) {
			set = this.cache;
		} else {
			set = this._items;
		}

		const highlights = set.map(item => this.filter(currentWord, item.suggestion));
		const count = highlights.filter(h => !isFalsyOrEmpty(h)).length;

		if (count === 0) {
			return [];
		}

		this.cacheCurrentWord = currentWord;
		this.cache = set
			.map((item, index) => assign(item, { highlights: highlights[index] }))
			.filter(item => !isFalsyOrEmpty(item.highlights));

		return this.cache;
	}

	invalidateCache(): void {
		this.cacheCurrentWord = null;
	}
}

export class CompletionModel {

	private groups: CompletionGroup[];
	private cache: CompletionItem[];
	private cacheCurrentWord: string;

	constructor(public raw: ISuggestResult2[][], public currentWord: string) {

		this.groups = raw
			.filter(s => !!s)
			.map(suggestResults => new CompletionGroup(this, suggestResults));
	}

	get items(): CompletionItem[] {
		if (this.cacheCurrentWord === this.currentWord) {
			return this.cache;
		}

		const result = this.groups.reduce((r, groups) => r.concat(groups.getItems(this.currentWord)), []);

		// let's only cache stuff that actually has results
		if (result.length > 0) {
			this.cache = result;
			this.cacheCurrentWord = this.currentWord;
		}

		return result;
	}
}