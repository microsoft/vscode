/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import { LRUCache } from 'vs/base/common/map';
import { CharCode } from 'vs/base/common/charCode';

export interface IFilter {
	// Returns null if word doesn't match.
	(word: string, wordToMatchAgainst: string): IMatch[];
}

export interface IMatch {
	start: number;
	end: number;
}

// Combined filters

/**
 * @returns A filter which combines the provided set
 * of filters with an or. The *first* filters that
 * matches defined the return value of the returned
 * filter.
 */
export function or(...filter: IFilter[]): IFilter {
	return function (word: string, wordToMatchAgainst: string): IMatch[] {
		for (let i = 0, len = filter.length; i < len; i++) {
			let match = filter[i](word, wordToMatchAgainst);
			if (match) {
				return match;
			}
		}
		return null;
	};
}

// Prefix

export const matchesStrictPrefix: IFilter = _matchesPrefix.bind(undefined, false);
export const matchesPrefix: IFilter = _matchesPrefix.bind(undefined, true);

function _matchesPrefix(ignoreCase: boolean, word: string, wordToMatchAgainst: string): IMatch[] {
	if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
		return null;
	}

	let matches: boolean;
	if (ignoreCase) {
		matches = strings.beginsWithIgnoreCase(wordToMatchAgainst, word);
	} else {
		matches = wordToMatchAgainst.indexOf(word) === 0;
	}

	if (!matches) {
		return null;
	}

	return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}

// Contiguous Substring

export function matchesContiguousSubString(word: string, wordToMatchAgainst: string): IMatch[] {
	let index = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
	if (index === -1) {
		return null;
	}

	return [{ start: index, end: index + word.length }];
}

// Substring

export function matchesSubString(word: string, wordToMatchAgainst: string): IMatch[] {
	return _matchesSubString(word.toLowerCase(), wordToMatchAgainst.toLowerCase(), 0, 0);
}

function _matchesSubString(word: string, wordToMatchAgainst: string, i: number, j: number): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === wordToMatchAgainst.length) {
		return null;
	} else {
		if (word[i] === wordToMatchAgainst[j]) {
			let result: IMatch[] = null;
			if (result = _matchesSubString(word, wordToMatchAgainst, i + 1, j + 1)) {
				return join({ start: j, end: j + 1 }, result);
			}
			return null;
		}

		return _matchesSubString(word, wordToMatchAgainst, i, j + 1);
	}
}

// CamelCase

function isLower(code: number): boolean {
	return CharCode.a <= code && code <= CharCode.z;
}

export function isUpper(code: number): boolean {
	return CharCode.A <= code && code <= CharCode.Z;
}

function isNumber(code: number): boolean {
	return CharCode.Digit0 <= code && code <= CharCode.Digit9;
}

function isWhitespace(code: number): boolean {
	return (
		code === CharCode.Space
		|| code === CharCode.Tab
		|| code === CharCode.LineFeed
		|| code === CharCode.CarriageReturn
	);
}

function isAlphanumeric(code: number): boolean {
	return isLower(code) || isUpper(code) || isNumber(code);
}

function join(head: IMatch, tail: IMatch[]): IMatch[] {
	if (tail.length === 0) {
		tail = [head];
	} else if (head.end === tail[0].start) {
		tail[0].start = head.start;
	} else {
		tail.unshift(head);
	}
	return tail;
}

function nextAnchor(camelCaseWord: string, start: number): number {
	for (let i = start; i < camelCaseWord.length; i++) {
		let c = camelCaseWord.charCodeAt(i);
		if (isUpper(c) || isNumber(c) || (i > 0 && !isAlphanumeric(camelCaseWord.charCodeAt(i - 1)))) {
			return i;
		}
	}
	return camelCaseWord.length;
}

function _matchesCamelCase(word: string, camelCaseWord: string, i: number, j: number): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === camelCaseWord.length) {
		return null;
	} else if (word[i] !== camelCaseWord[j].toLowerCase()) {
		return null;
	} else {
		let result: IMatch[] = null;
		let nextUpperIndex = j + 1;
		result = _matchesCamelCase(word, camelCaseWord, i + 1, j + 1);
		while (!result && (nextUpperIndex = nextAnchor(camelCaseWord, nextUpperIndex)) < camelCaseWord.length) {
			result = _matchesCamelCase(word, camelCaseWord, i + 1, nextUpperIndex);
			nextUpperIndex++;
		}
		return result === null ? null : join({ start: j, end: j + 1 }, result);
	}
}

interface ICamelCaseAnalysis {
	upperPercent: number;
	lowerPercent: number;
	alphaPercent: number;
	numericPercent: number;
}

// Heuristic to avoid computing camel case matcher for words that don't
// look like camelCaseWords.
function analyzeCamelCaseWord(word: string): ICamelCaseAnalysis {
	let upper = 0, lower = 0, alpha = 0, numeric = 0, code = 0;

	for (let i = 0; i < word.length; i++) {
		code = word.charCodeAt(i);

		if (isUpper(code)) { upper++; }
		if (isLower(code)) { lower++; }
		if (isAlphanumeric(code)) { alpha++; }
		if (isNumber(code)) { numeric++; }
	}

	let upperPercent = upper / word.length;
	let lowerPercent = lower / word.length;
	let alphaPercent = alpha / word.length;
	let numericPercent = numeric / word.length;

	return { upperPercent, lowerPercent, alphaPercent, numericPercent };
}

function isUpperCaseWord(analysis: ICamelCaseAnalysis): boolean {
	const { upperPercent, lowerPercent } = analysis;
	return lowerPercent === 0 && upperPercent > 0.6;
}

function isCamelCaseWord(analysis: ICamelCaseAnalysis): boolean {
	const { upperPercent, lowerPercent, alphaPercent, numericPercent } = analysis;
	return lowerPercent > 0.2 && upperPercent < 0.8 && alphaPercent > 0.6 && numericPercent < 0.2;
}

// Heuristic to avoid computing camel case matcher for words that don't
// look like camel case patterns.
function isCamelCasePattern(word: string): boolean {
	let upper = 0, lower = 0, code = 0, whitespace = 0;

	for (let i = 0; i < word.length; i++) {
		code = word.charCodeAt(i);

		if (isUpper(code)) { upper++; }
		if (isLower(code)) { lower++; }
		if (isWhitespace(code)) { whitespace++; }
	}

	if ((upper === 0 || lower === 0) && whitespace === 0) {
		return word.length <= 30;
	} else {
		return upper <= 5;
	}
}

export function matchesCamelCase(word: string, camelCaseWord: string): IMatch[] {
	if (!camelCaseWord) {
		return null;
	}

	camelCaseWord = camelCaseWord.trim();

	if (camelCaseWord.length === 0) {
		return null;
	}

	if (!isCamelCasePattern(word)) {
		return null;
	}

	if (camelCaseWord.length > 60) {
		return null;
	}

	const analysis = analyzeCamelCaseWord(camelCaseWord);

	if (!isCamelCaseWord(analysis)) {
		if (!isUpperCaseWord(analysis)) {
			return null;
		}

		camelCaseWord = camelCaseWord.toLowerCase();
	}

	let result: IMatch[] = null;
	let i = 0;

	while (i < camelCaseWord.length && (result = _matchesCamelCase(word.toLowerCase(), camelCaseWord, 0, i)) === null) {
		i = nextAnchor(camelCaseWord, i + 1);
	}

	return result;
}

// Matches beginning of words supporting non-ASCII languages
// If `contiguous` is true then matches word with beginnings of the words in the target. E.g. "pul" will match "Git: Pull"
// Otherwise also matches sub string of the word with beginnings of the words in the target. E.g. "gp" or "g p" will match "Git: Pull"
// Useful in cases where the target is words (e.g. command labels)

export function matchesWords(word: string, target: string, contiguous: boolean = false): IMatch[] {
	if (!target || target.length === 0) {
		return null;
	}

	let result: IMatch[] = null;
	let i = 0;

	while (i < target.length && (result = _matchesWords(word.toLowerCase(), target, 0, i, contiguous)) === null) {
		i = nextWord(target, i + 1);
	}

	return result;
}

function _matchesWords(word: string, target: string, i: number, j: number, contiguous: boolean): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === target.length) {
		return null;
	} else if (word[i] !== target[j].toLowerCase()) {
		return null;
	} else {
		let result: IMatch[] = null;
		let nextWordIndex = j + 1;
		result = _matchesWords(word, target, i + 1, j + 1, contiguous);
		if (!contiguous) {
			while (!result && (nextWordIndex = nextWord(target, nextWordIndex)) < target.length) {
				result = _matchesWords(word, target, i + 1, nextWordIndex, contiguous);
				nextWordIndex++;
			}
		}
		return result === null ? null : join({ start: j, end: j + 1 }, result);
	}
}

function nextWord(word: string, start: number): number {
	for (let i = start; i < word.length; i++) {
		let c = word.charCodeAt(i);
		if (isWhitespace(c) || (i > 0 && isWhitespace(word.charCodeAt(i - 1)))) {
			return i;
		}
	}
	return word.length;
}

// Fuzzy

export const fuzzyContiguousFilter = or(matchesPrefix, matchesCamelCase, matchesContiguousSubString);
const fuzzySeparateFilter = or(matchesPrefix, matchesCamelCase, matchesSubString);
const fuzzyRegExpCache = new LRUCache<string, RegExp>(10000); // bounded to 10000 elements

export function matchesFuzzy(word: string, wordToMatchAgainst: string, enableSeparateSubstringMatching = false): IMatch[] {
	if (typeof word !== 'string' || typeof wordToMatchAgainst !== 'string') {
		return null; // return early for invalid input
	}

	// Form RegExp for wildcard matches
	let regexp = fuzzyRegExpCache.get(word);
	if (!regexp) {
		regexp = new RegExp(strings.convertSimple2RegExpPattern(word), 'i');
		fuzzyRegExpCache.set(word, regexp);
	}

	// RegExp Filter
	let match: RegExpExecArray = regexp.exec(wordToMatchAgainst);
	if (match) {
		return [{ start: match.index, end: match.index + match[0].length }];
	}

	// Default Filter
	return enableSeparateSubstringMatching ? fuzzySeparateFilter(word, wordToMatchAgainst) : fuzzyContiguousFilter(word, wordToMatchAgainst);
}

export function skipScore(pattern: string, word: string, patternMaxWhitespaceIgnore?: number): [number, number[]] {
	pattern = pattern.toLowerCase();
	word = word.toLowerCase();

	const matches: number[] = [];
	let idx = 0;
	for (let pos = 0; pos < pattern.length; ++pos) {
		const thisIdx = word.indexOf(pattern.charAt(pos), idx);
		if (thisIdx >= 0) {
			matches.push(thisIdx);
			idx = thisIdx + 1;
		}
	}
	return [matches.length, matches];
}

//#region --- fuzzyScore ---

export function createMatches(position: number[]): IMatch[] {
	let ret: IMatch[] = [];
	if (!position) {
		return ret;
	}
	let last: IMatch;
	for (const pos of position) {
		if (last && last.end === pos) {
			last.end += 1;
		} else {
			last = { start: pos, end: pos + 1 };
			ret.push(last);
		}
	}
	return ret;
}

function initTable() {
	const table: number[][] = [];
	const row: number[] = [0];
	for (let i = 1; i <= 100; i++) {
		row.push(-i);
	}
	for (let i = 0; i <= 100; i++) {
		let thisRow = row.slice(0);
		thisRow[0] = -i;
		table.push(thisRow);
	}
	return table;
}

const _table = initTable();
const _scores = initTable();
const _arrows = <Arrow[][]>initTable();
const _debug = false;

function printTable(table: number[][], pattern: string, patternLen: number, word: string, wordLen: number): string {
	function pad(s: string, n: number, pad = ' ') {
		while (s.length < n) {
			s = pad + s;
		}
		return s;
	}
	let ret = ` |   |${word.split('').map(c => pad(c, 3)).join('|')}\n`;

	for (let i = 0; i <= patternLen; i++) {
		if (i === 0) {
			ret += ' |';
		} else {
			ret += `${pattern[i - 1]}|`;
		}
		ret += table[i].slice(0, wordLen + 1).map(n => pad(n.toString(), 3)).join('|') + '\n';
	}
	return ret;
}

function isSeparatorAtPos(value: string, index: number): boolean {
	if (index < 0 || index >= value.length) {
		return false;
	}
	const code = value.charCodeAt(index);
	switch (code) {
		case CharCode.Underline:
		case CharCode.Dash:
		case CharCode.Period:
		case CharCode.Space:
		case CharCode.Slash:
		case CharCode.Backslash:
		case CharCode.SingleQuote:
		case CharCode.DoubleQuote:
		case CharCode.Colon:
			return true;
		default:
			return false;
	}
}

function isWhitespaceAtPos(value: string, index: number): boolean {
	if (index < 0 || index >= value.length) {
		return false;
	}
	const code = value.charCodeAt(index);
	switch (code) {
		case CharCode.Space:
		case CharCode.Tab:
			return true;
		default:
			return false;
	}
}

const enum Arrow { Top = 0b1, Diag = 0b10, Left = 0b100 }

export function fuzzyScore(pattern: string, word: string, patternMaxWhitespaceIgnore?: number): [number, number[]] {

	const patternLen = pattern.length > 100 ? 100 : pattern.length;
	const wordLen = word.length > 100 ? 100 : word.length;

	// Check for leading whitespace in the pattern and
	// start matching just after that position. This is
	// like `pattern = pattern.rtrim()` but doesn't create
	// a new string
	let patternStartPos = 0;
	if (patternMaxWhitespaceIgnore === undefined) {
		patternMaxWhitespaceIgnore = patternLen;
	}
	while (patternStartPos < patternMaxWhitespaceIgnore) {
		if (isWhitespaceAtPos(pattern, patternStartPos)) {
			patternStartPos += 1;
		} else {
			break;
		}
	}
	if (patternStartPos === patternLen) {
		return [-100, []];
	}

	if (patternLen > wordLen) {
		return undefined;
	}

	const lowPattern = pattern.toLowerCase();
	const lowWord = word.toLowerCase();

	let patternPos = patternStartPos;
	let wordPos = 0;

	// Run a simple check if the characters of pattern occur
	// (in order) at all in word. If that isn't the case we
	// stop because no match will be possible
	while (patternPos < patternLen && wordPos < wordLen) {
		if (lowPattern[patternPos] === lowWord[wordPos]) {
			patternPos += 1;
		}
		wordPos += 1;
	}
	if (patternPos !== patternLen) {
		return undefined;
	}

	// There will be a mach, fill in tables
	for (patternPos = patternStartPos + 1; patternPos <= patternLen; patternPos++) {

		for (wordPos = 1; wordPos <= wordLen; wordPos++) {

			let score = -1;
			let lowWordChar = lowWord[wordPos - 1];
			if (lowPattern[patternPos - 1] === lowWordChar) {
				if (wordPos === (patternPos - patternStartPos)) {
					// common prefix: `foobar <-> foobaz`
					if (pattern[patternPos - 1] === word[wordPos - 1]) {
						score = 7;
					} else {
						score = 5;
					}
				} else if (lowWordChar !== word[wordPos - 1]) {
					// hitting upper-case: `foo <-> forOthers`
					if (pattern[patternPos - 1] === word[wordPos - 1]) {
						score = 7;
					} else {
						score = 5;
					}
				} else if (isSeparatorAtPos(lowWord, wordPos - 2) || isWhitespaceAtPos(lowWord, wordPos - 2)) {
					// post separator: `foo <-> bar_foo`
					score = 5;

				} else {
					score = 1;
				}
			}

			_scores[patternPos][wordPos] = score;

			let diag = _table[patternPos - 1][wordPos - 1] + (score > 1 ? 1 : score);
			let top = _table[patternPos - 1][wordPos] + -1;
			let left = _table[patternPos][wordPos - 1] + -1;

			if (left >= top) {
				// left or diag
				if (left > diag) {
					_table[patternPos][wordPos] = left;
					_arrows[patternPos][wordPos] = Arrow.Left;
				} else if (left === diag) {
					_table[patternPos][wordPos] = left;
					_arrows[patternPos][wordPos] = Arrow.Left | Arrow.Diag;
				} else {
					_table[patternPos][wordPos] = diag;
					_arrows[patternPos][wordPos] = Arrow.Diag;
				}
			} else {
				// top or diag
				if (top > diag) {
					_table[patternPos][wordPos] = top;
					_arrows[patternPos][wordPos] = Arrow.Top;
				} else if (top === diag) {
					_table[patternPos][wordPos] = top;
					_arrows[patternPos][wordPos] = Arrow.Top | Arrow.Diag;
				} else {
					_table[patternPos][wordPos] = diag;
					_arrows[patternPos][wordPos] = Arrow.Diag;
				}
			}
		}
	}

	if (_debug) {
		console.log(printTable(_table, pattern, patternLen, word, wordLen));
		console.log(printTable(_arrows, pattern, patternLen, word, wordLen));
		console.log(printTable(_scores, pattern, patternLen, word, wordLen));
	}

	// _bucket is an array of [PrefixArray] we use to keep
	// track of scores and matches. After calling `_findAllMatches`
	// the best match (if available) is the first item in the array
	_matchesCount = 0;
	_topScore = -100;
	_patternStartPos = patternStartPos;
	_findAllMatches(patternLen, wordLen, patternLen === wordLen ? 1 : 0, new LazyArray(), false);

	if (_matchesCount === 0) {
		return undefined;
	}

	return [_topScore, _topMatch.toArray()];
}

let _matchesCount: number = 0;
let _topMatch: LazyArray;
let _topScore: number = 0;
let _patternStartPos: number = 0;

function _findAllMatches(patternPos: number, wordPos: number, total: number, matches: LazyArray, lastMatched: boolean): void {

	if (_matchesCount >= 10 || total < -25) {
		// stop when having already 10 results, or
		// when a potential alignment as already 5 gaps
		return;
	}

	let simpleMatchCount = 0;

	while (patternPos > _patternStartPos && wordPos > 0) {

		let score = _scores[patternPos][wordPos];
		let arrow = _arrows[patternPos][wordPos];

		if (arrow === Arrow.Left) {
			// left
			wordPos -= 1;
			if (lastMatched) {
				total -= 5; // new gap penalty
			} else if (!matches.isEmpty()) {
				total -= 1; // gap penalty after first match
			}
			lastMatched = false;
			simpleMatchCount = 0;

		} else if (arrow & Arrow.Diag) {

			if (arrow & Arrow.Left) {
				// left
				_findAllMatches(
					patternPos,
					wordPos - 1,
					!matches.isEmpty() ? total - 1 : total, // gap penalty after first match
					matches.slice(),
					lastMatched
				);
			}

			// diag
			total += score;
			patternPos -= 1;
			wordPos -= 1;
			matches.unshift(wordPos);
			lastMatched = true;

			// count simple matches and boost a row of
			// simple matches when they yield in a
			// strong match.
			if (score === 1) {
				simpleMatchCount += 1;

				if (patternPos === _patternStartPos) {
					// when the first match is a weak
					// match we discard it
					return undefined;
				}

			} else {
				// boost
				total += 1 + (simpleMatchCount * (score - 1));
				simpleMatchCount = 0;
			}

		} else {
			return undefined;
		}
	}

	total -= wordPos >= 3 ? 9 : wordPos * 3; // late start penalty

	// dynamically keep track of the current top score
	// and insert the current best score at head, the rest at tail
	_matchesCount += 1;
	if (total > _topScore) {
		_topScore = total;
		_topMatch = matches;
	}
}

class LazyArray {

	private _parent: LazyArray;
	private _parentLen: number;
	private _data: number[];

	isEmpty(): boolean {
		return !this._data && (!this._parent || this._parent.isEmpty());
	}

	unshift(n: number) {
		if (!this._data) {
			this._data = [n];
		} else {
			this._data.unshift(n);
		}
	}

	slice(): LazyArray {
		const ret = new LazyArray();
		ret._parent = this;
		ret._parentLen = this._data ? this._data.length : 0; return ret;
	}

	toArray(): number[] {
		if (!this._data) {
			return this._parent.toArray();
		}
		const bucket: number[][] = [];
		let element = <LazyArray>this;
		while (element) {
			if (element._parent && element._parent._data) {
				bucket.push(element._parent._data.slice(element._parent._data.length - element._parentLen));
			}
			element = element._parent;
		}
		return Array.prototype.concat.apply(this._data, bucket);
	}
}

//#endregion


//#region --- graceful ---

export function fuzzyScoreGracefulAggressive(pattern: string, word: string, patternMaxWhitespaceIgnore?: number): [number, number[]] {
	return fuzzyScoreWithPermutations(pattern, word, true, patternMaxWhitespaceIgnore);
}

export function fuzzyScoreGraceful(pattern: string, word: string, patternMaxWhitespaceIgnore?: number): [number, number[]] {
	return fuzzyScoreWithPermutations(pattern, word, false, patternMaxWhitespaceIgnore);
}

function fuzzyScoreWithPermutations(pattern: string, word: string, aggressive?: boolean, patternMaxWhitespaceIgnore?: number): [number, number[]] {
	let top: [number, number[]] = fuzzyScore(pattern, word, patternMaxWhitespaceIgnore);

	if (top && !aggressive) {
		// when using the original pattern yield a result we`
		// return it unless we are aggressive and try to find
		// a better alignment, e.g. `cno` -> `^co^ns^ole` or `^c^o^nsole`.
		return top;
	}

	if (pattern.length >= 3) {
		// When the pattern is long enough then try a few (max 7)
		// permutations of the pattern to find a better match. The
		// permutations only swap neighbouring characters, e.g
		// `cnoso` becomes `conso`, `cnsoo`, `cnoos`.
		let tries = Math.min(7, pattern.length - 1);
		for (let patternPos = 1; patternPos < tries; patternPos++) {
			let newPattern = nextTypoPermutation(pattern, patternPos);
			if (newPattern) {
				let candidate = fuzzyScore(newPattern, word, patternMaxWhitespaceIgnore);
				if (candidate) {
					candidate[0] -= 3; // permutation penalty
					if (!top || candidate[0] > top[0]) {
						top = candidate;
					}
				}
			}
		}
	}

	return top;
}

function nextTypoPermutation(pattern: string, patternPos: number): string {

	if (patternPos + 1 >= pattern.length) {
		return undefined;
	}

	let swap1 = pattern[patternPos];
	let swap2 = pattern[patternPos + 1];

	if (swap1 === swap2) {
		return undefined;
	}

	return pattern.slice(0, patternPos)
		+ swap2
		+ swap1
		+ pattern.slice(patternPos + 2);
}

//#endregion
