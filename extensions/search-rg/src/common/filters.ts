/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from './strings';
import { CharCode } from './charCode';

export interface IFilter {
	// Returns null if word doesn't match.
	(word: string, wordToMatchAgainst: string): IMatch[];
}

export interface IMatch {
	start: number;
	end: number;
}

// Prefix

export const matchesPrefix: IFilter = _matchesPrefix.bind(undefined, true);

function _matchesPrefix(ignoreCase: boolean, word: string, wordToMatchAgainst: string): IMatch[] {
	if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
		return null;
	}

	let matches: boolean;
	if (ignoreCase) {
		matches = strings.startsWithIgnoreCase(wordToMatchAgainst, word);
	} else {
		matches = wordToMatchAgainst.indexOf(word) === 0;
	}

	if (!matches) {
		return null;
	}

	return word.length > 0 ? [{ start: 0, end: word.length }] : [];
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

	word = word.toLowerCase();
	while (i < camelCaseWord.length && (result = _matchesCamelCase(word, camelCaseWord, 0, i)) === null) {
		i = nextAnchor(camelCaseWord, i + 1);
	}

	return result;
}

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
