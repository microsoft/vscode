/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleCompletionItem } from './simpleCompletionItem.js';
import { quickSelect } from '../../../../base/common/arrays.js';
import { CharCode } from '../../../../base/common/charCode.js';
import { FuzzyScore, fuzzyScore, fuzzyScoreGracefulAggressive, FuzzyScoreOptions, FuzzyScorer } from '../../../../base/common/filters.js';
import { isWindows } from '../../../../base/common/platform.js';

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
			const overwriteBefore = item.completion.replacementLength; // item.position.column - item.editStart.column;
			const wordLen = overwriteBefore + characterCountDelta; // - (item.position.column - this._column);
			if (word.length !== wordLen) {
				word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
				wordLow = word.toLowerCase();
			}

			// remember the word against which this item was
			// scored. If word is undefined, then match against the empty string.
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
					const match = scoreFn(word, wordLow, wordPos, item.completion.label, item.labelLow, 0, this._fuzzyScoreOptions);
					if (!match && word !== '') {
						continue; // NO match
					}
					// Use default sorting when word is empty
					item.score = match || FuzzyScore.Default;
				}
			}
			item.idx = i;
			target.push(item);

			// update stats
			labelLengths.push(item.completion.label.length);
		}

		this._filteredItems = target.sort((a, b) => {
			// Keywords should always appear at the bottom when they are not an exact match
			let score = 0;
			if (a.completion.isKeyword && a.labelLow !== wordLow || b.completion.isKeyword && b.labelLow !== wordLow) {
				score = (a.completion.isKeyword ? 1 : 0) - (b.completion.isKeyword ? 1 : 0);
				if (score !== 0) {
					return score;
				}
			}
			// Sort by the score
			score = b.score[0] - a.score[0];
			if (score !== 0) {
				return score;
			}
			// Sort files with the same score against each other specially
			const isArg = leadingLineContent.includes(' ');
			if (!isArg && a.fileExtLow.length > 0 && b.fileExtLow.length > 0) {
				// Then by label length ascending (excluding file extension if it's a file)
				score = a.labelLowExcludeFileExt.length - b.labelLowExcludeFileExt.length;
				if (score !== 0) {
					return score;
				}
				// If they're files at the start of the command line, boost extensions depending on the operating system
				score = fileExtScore(b.fileExtLow) - fileExtScore(a.fileExtLow);
				if (score !== 0) {
					return score;
				}
				// Then by file extension length ascending
				score = a.fileExtLow.length - b.fileExtLow.length;
			}
			return score;
		});
		this._refilterKind = Refilter.Nothing;

		this._stats = {
			pLabelLen: labelLengths.length ?
				quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b)
				: 0
		};
	}
}

// TODO: This should be based on the process OS, not the local OS
// File score boosts for specific file extensions on Windows. This only applies when the file is the
// _first_ part of the command line.
const fileExtScores = new Map<string, number>(isWindows ? [
	// Windows - .ps1 > .exe > .bat > .cmd. This is the command precedence when running the files
	//           without an extension, tested manually in pwsh v7.4.4
	['ps1', 0.09],
	['exe', 0.08],
	['bat', 0.07],
	['cmd', 0.07],
	// Non-Windows
	['sh', -0.05],
	['bash', -0.05],
	['zsh', -0.05],
	['fish', -0.05],
	['csh', -0.06], // C shell
	['ksh', -0.06], // Korn shell
	// Scripting language files are excluded here as the standard behavior on Windows will just open
	// the file in a text editor, not run the file
] : [
	// Pwsh
	['ps1', 0.05],
	// Windows
	['bat', -0.05],
	['cmd', -0.05],
	['exe', -0.05],
	// Non-Windows
	['sh', 0.05],
	['bash', 0.05],
	['zsh', 0.05],
	['fish', 0.05],
	['csh', 0.04], // C shell
	['ksh', 0.04], // Korn shell
	// Scripting languages
	['py', 0.05], // Python
	['pl', 0.05], // Perl
]);

function fileExtScore(ext: string): number {
	return fileExtScores.get(ext) || 0;
}
