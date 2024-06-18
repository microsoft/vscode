/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleCompletionItem } from 'vs/workbench/services/suggest/browser/simpleCompletionItem';
import { quickSelect } from 'vs/base/common/arrays';
import { CharCode } from 'vs/base/common/charCode';
import { FuzzyScore, fuzzyScore, fuzzyScoreGracefulAggressive, FuzzyScoreOptions, FuzzyScorer } from 'vs/base/common/filters';

export interface ISimpleCompletionStats {
	pLabelLen: number;
}

export class LineContext {
	constructor(
		readonly leadingLineContent: string,
		readonly characterCountDelta: number,
	) { }
}

const enum Refilter {
	Nothing = 0,
	All = 1,
	Incr = 2
}

export class SimpleCompletionModel {
	private _stats?: ISimpleCompletionStats;
	private _filteredItems?: SimpleCompletionItem[];
	private _refilterKind: Refilter = Refilter.All;
	private _fuzzyScoreOptions: FuzzyScoreOptions | undefined = FuzzyScoreOptions.default;

	// TODO: Pass in options
	private _options: {
		filterGraceful?: boolean;
	} = {};

	constructor(
		private readonly _items: SimpleCompletionItem[],
		private _lineContext: LineContext,
		readonly replacementIndex: number,
		readonly replacementLength: number,
	) {
	}

	get items(): SimpleCompletionItem[] {
		this._ensureCachedState();
		return this._filteredItems!;
	}

	get stats(): ISimpleCompletionStats {
		this._ensureCachedState();
		return this._stats!;
	}


	get lineContext(): LineContext {
		return this._lineContext;
	}

	set lineContext(value: LineContext) {
		if (this._lineContext.leadingLineContent !== value.leadingLineContent
			|| this._lineContext.characterCountDelta !== value.characterCountDelta
		) {
			this._refilterKind = this._lineContext.characterCountDelta < value.characterCountDelta && this._filteredItems ? Refilter.Incr : Refilter.All;
			this._lineContext = value;
		}
	}

	private _ensureCachedState(): void {
		if (this._refilterKind !== Refilter.Nothing) {
			this._createCachedState();
		}
	}
	private _createCachedState(): void {

		// this._providerInfo = new Map();

		const labelLengths: number[] = [];

		const { leadingLineContent, characterCountDelta } = this._lineContext;
		let word = '';
		let wordLow = '';

		// incrementally filter less
		const source = this._refilterKind === Refilter.All ? this._items : this._filteredItems!;
		const target: SimpleCompletionItem[] = [];

		// picks a score function based on the number of
		// items that we have to score/filter and based on the
		// user-configuration
		const scoreFn: FuzzyScorer = (!this._options.filterGraceful || source.length > 2000) ? fuzzyScore : fuzzyScoreGracefulAggressive;

		for (let i = 0; i < source.length; i++) {

			const item = source[i];

			// if (item.isInvalid) {
			// 	continue; // SKIP invalid items
			// }

			// collect all support, know if their result is incomplete
			// this._providerInfo.set(item.provider, Boolean(item.container.incomplete));

			// 'word' is that remainder of the current line that we
			// filter and score against. In theory each suggestion uses a
			// different word, but in practice not - that's why we cache
			// TODO: Fix
			const overwriteBefore = this.replacementLength; // item.position.column - item.editStart.column;
			const wordLen = overwriteBefore + characterCountDelta; // - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
				wordLow = word.toLowerCase();
			}

			// remember the word against which this item was
			// scored
			item.word = word;

			if (wordLen === 0) {
				// when there is nothing to score against, don't
				// event try to do. Use a const rank and rely on
				// the fallback-sort using the initial sort order.
				// use a score of `-100` because that is out of the
				// bound of values `fuzzyScore` will return
				item.score = FuzzyScore.Default;

			} else {
				// skip word characters that are whitespace until
				// we have hit the replace range (overwriteBefore)
				let wordPos = 0;
				while (wordPos < overwriteBefore) {
					const ch = word.charCodeAt(wordPos);
					if (ch === CharCode.Space || ch === CharCode.Tab) {
						wordPos += 1;
					} else {
						break;
					}
				}

				if (wordPos >= wordLen) {
					// the wordPos at which scoring starts is the whole word
					// and therefore the same rules as not having a word apply
					item.score = FuzzyScore.Default;

					// } else if (typeof item.completion.filterText === 'string') {
					// 	// when there is a `filterText` it must match the `word`.
					// 	// if it matches we check with the label to compute highlights
					// 	// and if that doesn't yield a result we have no highlights,
					// 	// despite having the match
					// 	const match = scoreFn(word, wordLow, wordPos, item.completion.filterText, item.filterTextLow!, 0, this._fuzzyScoreOptions);
					// 	if (!match) {
					// 		continue; // NO match
					// 	}
					// 	if (compareIgnoreCase(item.completion.filterText, item.textLabel) === 0) {
					// 		// filterText and label are actually the same -> use good highlights
					// 		item.score = match;
					// 	} else {
					// 		// re-run the scorer on the label in the hope of a result BUT use the rank
					// 		// of the filterText-match
					// 		item.score = anyScore(word, wordLow, wordPos, item.textLabel, item.labelLow, 0);
					// 		item.score[0] = match[0]; // use score from filterText
					// 	}

				} else {
					// by default match `word` against the `label`
					const match = scoreFn(word, wordLow, wordPos, item.completion.completionText ?? item.completion.label, item.labelLow, 0, this._fuzzyScoreOptions);
					if (!match) {
						continue; // NO match
					}
					item.score = match;
				}
			}

			item.idx = i;
			target.push(item);

			// update stats
			labelLengths.push((item.completion.completionText ?? item.completion.label).length);
		}

		this._filteredItems = target.sort((a, b) => b.score[0] - a.score[0]);
		this._refilterKind = Refilter.Nothing;

		this._stats = {
			pLabelLen: labelLengths.length ?
				quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b)
				: 0
		};
	}
}
