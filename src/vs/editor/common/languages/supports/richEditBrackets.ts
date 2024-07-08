/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import * as stringBuilder from 'vs/editor/common/core/stringBuilder';
import { Range } from 'vs/editor/common/core/range';
import { CharacterPair } from 'vs/editor/common/languages/languageConfiguration';

interface InternalBracket {
	open: string[];
	close: string[];
}

/**
 * Represents a grouping of colliding bracket pairs.
 *
 * Most of the times this contains a single bracket pair,
 * but sometimes this contains multiple bracket pairs in cases
 * where the same string appears as a closing bracket for multiple
 * bracket pairs, or the same string appears an opening bracket for
 * multiple bracket pairs.
 *
 * e.g. of a group containing a single pair:
 *   open: ['{'], close: ['}']
 *
 * e.g. of a group containing multiple pairs:
 *   open: ['if', 'for'], close: ['end', 'end']
 */
export class RichEditBracket {
	_richEditBracketBrand: void = undefined;

	readonly languageId: string;
	/**
	 * A 0-based consecutive unique identifier for this bracket pair.
	 * If a language has 5 bracket pairs, out of which 2 are grouped together,
	 * it is expected that the `index` goes from 0 to 4.
	 */
	readonly index: number;
	/**
	 * The open sequence for each bracket pair contained in this group.
	 *
	 * The open sequence at a specific index corresponds to the
	 * closing sequence at the same index.
	 *
	 * [ open[i], closed[i] ] represent a bracket pair.
	 */
	readonly open: string[];
	/**
	 * The close sequence for each bracket pair contained in this group.
	 *
	 * The close sequence at a specific index corresponds to the
	 * opening sequence at the same index.
	 *
	 * [ open[i], closed[i] ] represent a bracket pair.
	 */
	readonly close: string[];
	/**
	 * A regular expression that is useful to search for this bracket pair group in a string.
	 *
	 * This regular expression is built in a way that it is aware of the other bracket
	 * pairs defined for the language, so it might match brackets from other groups.
	 *
	 * See the fine details in `getRegexForBracketPair`.
	 */
	readonly forwardRegex: RegExp;
	/**
	 * A regular expression that is useful to search for this bracket pair group in a string backwards.
	 *
	 * This regular expression is built in a way that it is aware of the other bracket
	 * pairs defined for the language, so it might match brackets from other groups.
	 *
	 * See the fine defails in `getReversedRegexForBracketPair`.
	 */
	readonly reversedRegex: RegExp;
	private readonly _openSet: Set<string>;
	private readonly _closeSet: Set<string>;

	constructor(languageId: string, index: number, open: string[], close: string[], forwardRegex: RegExp, reversedRegex: RegExp) {
		this.languageId = languageId;
		this.index = index;
		this.open = open;
		this.close = close;
		this.forwardRegex = forwardRegex;
		this.reversedRegex = reversedRegex;
		this._openSet = RichEditBracket._toSet(this.open);
		this._closeSet = RichEditBracket._toSet(this.close);
	}

	/**
	 * Check if the provided `text` is an open bracket in this group.
	 */
	public isOpen(text: string) {
		return this._openSet.has(text);
	}

	/**
	 * Check if the provided `text` is a close bracket in this group.
	 */
	public isClose(text: string) {
		return this._closeSet.has(text);
	}

	private static _toSet(arr: string[]): Set<string> {
		const result = new Set<string>();
		for (const element of arr) {
			result.add(element);
		}
		return result;
	}
}

/**
 * Groups together brackets that have equal open or close sequences.
 *
 * For example, if the following brackets are defined:
 *   ['IF','END']
 *   ['for','end']
 *   ['{','}']
 *
 * Then the grouped brackets would be:
 *   { open: ['if', 'for'], close: ['end', 'end'] }
 *   { open: ['{'], close: ['}'] }
 *
 */
function groupFuzzyBrackets(brackets: readonly CharacterPair[]): InternalBracket[] {
	const N = brackets.length;

	brackets = brackets.map(b => [b[0].toLowerCase(), b[1].toLowerCase()]);

	const group: number[] = [];
	for (let i = 0; i < N; i++) {
		group[i] = i;
	}

	const areOverlapping = (a: CharacterPair, b: CharacterPair) => {
		const [aOpen, aClose] = a;
		const [bOpen, bClose] = b;
		return (aOpen === bOpen || aOpen === bClose || aClose === bOpen || aClose === bClose);
	};

	const mergeGroups = (g1: number, g2: number) => {
		const newG = Math.min(g1, g2);
		const oldG = Math.max(g1, g2);
		for (let i = 0; i < N; i++) {
			if (group[i] === oldG) {
				group[i] = newG;
			}
		}
	};

	// group together brackets that have the same open or the same close sequence
	for (let i = 0; i < N; i++) {
		const a = brackets[i];
		for (let j = i + 1; j < N; j++) {
			const b = brackets[j];
			if (areOverlapping(a, b)) {
				mergeGroups(group[i], group[j]);
			}
		}
	}

	const result: InternalBracket[] = [];
	for (let g = 0; g < N; g++) {
		const currentOpen: string[] = [];
		const currentClose: string[] = [];
		for (let i = 0; i < N; i++) {
			if (group[i] === g) {
				const [open, close] = brackets[i];
				currentOpen.push(open);
				currentClose.push(close);
			}
		}
		if (currentOpen.length > 0) {
			result.push({
				open: currentOpen,
				close: currentClose
			});
		}
	}
	return result;
}

export class RichEditBrackets {
	_richEditBracketsBrand: void = undefined;

	/**
	 * All groups of brackets defined for this language.
	 */
	public readonly brackets: RichEditBracket[];
	/**
	 * A regular expression that is useful to search for all bracket pairs in a string.
	 *
	 * See the fine details in `getRegexForBrackets`.
	 */
	public readonly forwardRegex: RegExp;
	/**
	 * A regular expression that is useful to search for all bracket pairs in a string backwards.
	 *
	 * See the fine details in `getReversedRegexForBrackets`.
	 */
	public readonly reversedRegex: RegExp;
	/**
	 * The length (i.e. str.length) for the longest bracket pair.
	 */
	public readonly maxBracketLength: number;
	/**
	 * A map useful for decoding a regex match and finding which bracket group was matched.
	 */
	public readonly textIsBracket: { [text: string]: RichEditBracket };
	/**
	 * A set useful for decoding if a regex match is the open bracket of a bracket pair.
	 */
	public readonly textIsOpenBracket: { [text: string]: boolean };

	constructor(languageId: string, _brackets: readonly CharacterPair[]) {
		const brackets = groupFuzzyBrackets(_brackets);

		this.brackets = brackets.map((b, index) => {
			return new RichEditBracket(
				languageId,
				index,
				b.open,
				b.close,
				getRegexForBracketPair(b.open, b.close, brackets, index),
				getReversedRegexForBracketPair(b.open, b.close, brackets, index)
			);
		});

		this.forwardRegex = getRegexForBrackets(this.brackets);
		this.reversedRegex = getReversedRegexForBrackets(this.brackets);

		this.textIsBracket = {};
		this.textIsOpenBracket = {};

		this.maxBracketLength = 0;
		for (const bracket of this.brackets) {
			for (const open of bracket.open) {
				this.textIsBracket[open] = bracket;
				this.textIsOpenBracket[open] = true;
				this.maxBracketLength = Math.max(this.maxBracketLength, open.length);
			}
			for (const close of bracket.close) {
				this.textIsBracket[close] = bracket;
				this.textIsOpenBracket[close] = false;
				this.maxBracketLength = Math.max(this.maxBracketLength, close.length);
			}
		}
	}
}

function collectSuperstrings(str: string, brackets: InternalBracket[], currentIndex: number, dest: string[]): void {
	for (let i = 0, len = brackets.length; i < len; i++) {
		if (i === currentIndex) {
			continue;
		}
		const bracket = brackets[i];
		for (const open of bracket.open) {
			if (open.indexOf(str) >= 0) {
				dest.push(open);
			}
		}
		for (const close of bracket.close) {
			if (close.indexOf(str) >= 0) {
				dest.push(close);
			}
		}
	}
}

function lengthcmp(a: string, b: string) {
	return a.length - b.length;
}

function unique(arr: string[]): string[] {
	if (arr.length <= 1) {
		return arr;
	}
	const result: string[] = [];
	const seen = new Set<string>();
	for (const element of arr) {
		if (seen.has(element)) {
			continue;
		}
		result.push(element);
		seen.add(element);
	}
	return result;
}

/**
 * Create a regular expression that can be used to search forward in a piece of text
 * for a group of bracket pairs. But this regex must be built in a way in which
 * it is aware of the other bracket pairs defined for the language.
 *
 * For example, if a language contains the following bracket pairs:
 *   ['begin', 'end']
 *   ['if', 'end if']
 * The two bracket pairs do not collide because no open or close brackets are equal.
 * So the function getRegexForBracketPair is called twice, once with
 * the ['begin'], ['end'] group consisting of one bracket pair, and once with
 * the ['if'], ['end if'] group consiting of the other bracket pair.
 *
 * But there could be a situation where an occurrence of 'end if' is mistaken
 * for an occurrence of 'end'.
 *
 * Therefore, for the bracket pair ['begin', 'end'], the regex will also
 * target 'end if'. The regex will be something like:
 *   /(\bend if\b)|(\bend\b)|(\bif\b)/
 *
 * The regex also searches for "superstrings" (other brackets that might be mistaken with the current bracket).
 *
 */
function getRegexForBracketPair(open: string[], close: string[], brackets: InternalBracket[], currentIndex: number): RegExp {
	// search in all brackets for other brackets that are a superstring of these brackets
	let pieces: string[] = [];
	pieces = pieces.concat(open);
	pieces = pieces.concat(close);
	for (let i = 0, len = pieces.length; i < len; i++) {
		collectSuperstrings(pieces[i], brackets, currentIndex, pieces);
	}
	pieces = unique(pieces);
	pieces.sort(lengthcmp);
	pieces.reverse();
	return createBracketOrRegExp(pieces);
}

/**
 * Matching a regular expression in JS can only be done "forwards". So JS offers natively only
 * methods to find the first match of a regex in a string. But sometimes, it is useful to
 * find the last match of a regex in a string. For such a situation, a nice solution is to
 * simply reverse the string and then search for a reversed regex.
 *
 * This function also has the fine details of `getRegexForBracketPair`. For the same example
 * given above, the regex produced here would look like:
 *   /(\bfi dne\b)|(\bdne\b)|(\bfi\b)/
 */
function getReversedRegexForBracketPair(open: string[], close: string[], brackets: InternalBracket[], currentIndex: number): RegExp {
	// search in all brackets for other brackets that are a superstring of these brackets
	let pieces: string[] = [];
	pieces = pieces.concat(open);
	pieces = pieces.concat(close);
	for (let i = 0, len = pieces.length; i < len; i++) {
		collectSuperstrings(pieces[i], brackets, currentIndex, pieces);
	}
	pieces = unique(pieces);
	pieces.sort(lengthcmp);
	pieces.reverse();
	return createBracketOrRegExp(pieces.map(toReversedString));
}

/**
 * Creates a regular expression that targets all bracket pairs.
 *
 * e.g. for the bracket pairs:
 *  ['{','}']
 *  ['begin,'end']
 *  ['for','end']
 * the regex would look like:
 *  /(\{)|(\})|(\bbegin\b)|(\bend\b)|(\bfor\b)/
 */
function getRegexForBrackets(brackets: RichEditBracket[]): RegExp {
	let pieces: string[] = [];
	for (const bracket of brackets) {
		for (const open of bracket.open) {
			pieces.push(open);
		}
		for (const close of bracket.close) {
			pieces.push(close);
		}
	}
	pieces = unique(pieces);
	return createBracketOrRegExp(pieces);
}

/**
 * Matching a regular expression in JS can only be done "forwards". So JS offers natively only
 * methods to find the first match of a regex in a string. But sometimes, it is useful to
 * find the last match of a regex in a string. For such a situation, a nice solution is to
 * simply reverse the string and then search for a reversed regex.
 *
 * e.g. for the bracket pairs:
 *  ['{','}']
 *  ['begin,'end']
 *  ['for','end']
 * the regex would look like:
 *  /(\{)|(\})|(\bnigeb\b)|(\bdne\b)|(\brof\b)/
 */
function getReversedRegexForBrackets(brackets: RichEditBracket[]): RegExp {
	let pieces: string[] = [];
	for (const bracket of brackets) {
		for (const open of bracket.open) {
			pieces.push(open);
		}
		for (const close of bracket.close) {
			pieces.push(close);
		}
	}
	pieces = unique(pieces);
	return createBracketOrRegExp(pieces.map(toReversedString));
}

function prepareBracketForRegExp(str: string): string {
	// This bracket pair uses letters like e.g. "begin" - "end"
	const insertWordBoundaries = (/^[\w ]+$/.test(str));
	str = strings.escapeRegExpCharacters(str);
	return (insertWordBoundaries ? `\\b${str}\\b` : str);
}

export function createBracketOrRegExp(pieces: string[], options?: strings.RegExpOptions): RegExp {
	const regexStr = `(${pieces.map(prepareBracketForRegExp).join(')|(')})`;
	return strings.createRegExp(regexStr, true, options);
}

const toReversedString = (function () {

	function reverse(str: string): string {
		// create a Uint16Array and then use a TextDecoder to create a string
		const arr = new Uint16Array(str.length);
		let offset = 0;
		for (let i = str.length - 1; i >= 0; i--) {
			arr[offset++] = str.charCodeAt(i);
		}
		return stringBuilder.getPlatformTextDecoder().decode(arr);
	}

	let lastInput: string | null = null;
	let lastOutput: string | null = null;
	return function toReversedString(str: string): string {
		if (lastInput !== str) {
			lastInput = str;
			lastOutput = reverse(lastInput);
		}
		return lastOutput!;
	};
})();

export class BracketsUtils {

	private static _findPrevBracketInText(reversedBracketRegex: RegExp, lineNumber: number, reversedText: string, offset: number): Range | null {
		const m = reversedText.match(reversedBracketRegex);

		if (!m) {
			return null;
		}

		const matchOffset = reversedText.length - (m.index || 0);
		const matchLength = m[0].length;
		const absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset - matchLength + 1, lineNumber, absoluteMatchOffset + 1);
	}

	public static findPrevBracketInRange(reversedBracketRegex: RegExp, lineNumber: number, lineText: string, startOffset: number, endOffset: number): Range | null {
		// Because JS does not support backwards regex search, we search forwards in a reversed string with a reversed regex ;)
		const reversedLineText = toReversedString(lineText);
		const reversedSubstr = reversedLineText.substring(lineText.length - endOffset, lineText.length - startOffset);
		return this._findPrevBracketInText(reversedBracketRegex, lineNumber, reversedSubstr, startOffset);
	}

	public static findNextBracketInText(bracketRegex: RegExp, lineNumber: number, text: string, offset: number): Range | null {
		const m = text.match(bracketRegex);

		if (!m) {
			return null;
		}

		const matchOffset = m.index || 0;
		const matchLength = m[0].length;
		if (matchLength === 0) {
			return null;
		}
		const absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset + 1, lineNumber, absoluteMatchOffset + 1 + matchLength);
	}

	public static findNextBracketInRange(bracketRegex: RegExp, lineNumber: number, lineText: string, startOffset: number, endOffset: number): Range | null {
		const substr = lineText.substring(startOffset, endOffset);
		return this.findNextBracketInText(bracketRegex, lineNumber, substr, startOffset);
	}
}
