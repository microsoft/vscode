/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import { BoundedLinkedMap } from 'vs/base/common/map';
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

/**
 * @returns A filter which combines the provided set
 * of filters with an and. The combines matches are
 * returned if *all* filters match.
 */
export function and(...filter: IFilter[]): IFilter {
	return function (word: string, wordToMatchAgainst: string): IMatch[] {
		let result: IMatch[] = [];
		for (let i = 0, len = filter.length; i < len; i++) {
			let match = filter[i](word, wordToMatchAgainst);
			if (!match) {
				return null;
			}
			result = result.concat(match);
		}
		return result;
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
		}

		return _matchesSubString(word, wordToMatchAgainst, i, j + 1);
	}
}

// CamelCase

function isLower(code: number): boolean {
	return CharCode.a <= code && code <= CharCode.z;
}

function isUpper(code: number): boolean {
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
	if (!camelCaseWord || camelCaseWord.length === 0) {
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

export enum SubstringMatching {
	Contiguous,
	Separate
}

export const fuzzyContiguousFilter = or(matchesPrefix, matchesCamelCase, matchesContiguousSubString);
const fuzzySeparateFilter = or(matchesPrefix, matchesCamelCase, matchesSubString);
const fuzzyRegExpCache = new BoundedLinkedMap<RegExp>(10000); // bounded to 10000 elements

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

export function matchesFuzzy2(pattern: string, word: string): IMatch[] | undefined {

	pattern = pattern.toLowerCase();
	word = word.toLowerCase();

	let result: IMatch[] = [];
	let lastMatch: IMatch;

	let patternPos = 0;
	let wordPos = 0;
	while (patternPos < pattern.length && wordPos < word.length) {
		if (pattern.charAt(patternPos) === word.charAt(wordPos)) {
			patternPos += 1;
			if (lastMatch && lastMatch.end === wordPos) {
				lastMatch.end += 1;
			} else {
				lastMatch = { start: wordPos, end: wordPos + 1 };
				result.push(lastMatch);
			}
		}
		wordPos += 1;
	}

	if (patternPos !== pattern.length) {
		return undefined;
	}

	return result;
}

export function matchesFuzzy3(pattern: string, word: string) {
	return _doMatchesFuzzy3(
		pattern, pattern.toLowerCase(), 0,
		word, word.toLowerCase(), 0,
		[], 0
	);
}
function _doMatchesFuzzy3(
	pattern: string, lowPattern: string, patternPos: number,
	word: string, lowWord: string, wordPos: number,
	positions: number[], score: number
): [IMatch[], number] {

	let retryPoints: number[] = [];
	let lastDidMatch = false;

	while (patternPos < lowPattern.length && wordPos < lowWord.length) {
		const charLowPattern = lowPattern.charAt(patternPos);
		const charLowWord = lowWord.charAt(wordPos);

		if (charLowPattern === charLowWord) {

			if (positions.length === 0) {
				score = -Math.min(wordPos, 3) * 3; // penalty -> gaps at start
			} else if (lastDidMatch) {
				score += 1; // bonus -> subsequent match
			}

			if (charLowWord !== word.charAt(wordPos)) {
				score += 10; // bonus -> upper-case

			} else if (wordPos > 0 && word.charAt(wordPos).match(_separator)) {
				score += 10; // bonus -> after a separator

			} else {
				// keep this as a retry point
				retryPoints.push(patternPos, wordPos + 1, positions.length, score);
			}

			patternPos += 1;
			positions.push(wordPos);
			lastDidMatch = true;

		} else {
			lastDidMatch = false;
			score -= 1; // penalty -> gaps in match
		}

		wordPos += 1;
	}

	if (patternPos !== lowPattern.length) {
		return undefined;
	}

	const matches: IMatch[] = [];
	let lastMatch: IMatch;
	for (const pos of positions) {
		if (lastMatch && lastMatch.end === pos) {
			lastMatch.end += 1;
		} else {
			lastMatch = { start: pos, end: pos + 1 };
			matches.push(lastMatch);
		}
	}

	let result: [IMatch[], number] = [matches, score];

	// try alternative matches
	for (let i = 0; i < retryPoints.length; i += 4) {
		const alt = _doMatchesFuzzy3(
			pattern, lowPattern, retryPoints[i],
			word, lowWord, retryPoints[i + 1],
			positions.slice(0, retryPoints[i + 2]), retryPoints[i + 3]
		);
		if (alt && alt[1] > result[1]) {
			result = alt;
		}
	}

	return result;
}

const _separator = /[-_. ]/;


export function matchesFuzzy4(pattern: string, word: string): [IMatch[], number] {

	const lowPattern = pattern.toLowerCase();
	const lowWord = word.toLowerCase();
	const [landmarkWord, landmarkPositions] = computeLandmarks(word, lowWord);

	let landmarkPos = 0;
	let wordPos = 0;
	let patternPos = 1;
	let charLowPattern = lowPattern.charAt(0);
	let result: IMatch[] = [];
	let lastMatch: IMatch;
	let score = 0;

	if (charLowPattern === lowWord.charAt(0)) {
		lastMatch = { start: wordPos, end: wordPos + 1 };
		result.push(lastMatch);
		wordPos = 1;
		landmarkPos = 1;
		if (pattern.charAt(0) === word.charAt(0)) {
			score += 10;
		}

	} else if ((landmarkPos = landmarkWord.indexOf(charLowPattern)) >= 0) {
		wordPos = landmarkPositions[landmarkPos];

		score += 10 - Math.min(9, wordPos * 3);
		lastMatch = { start: wordPos, end: wordPos + 1 };
		result.push(lastMatch);

		wordPos += 1;
		landmarkPos += 1;

	} else {
		return undefined;
	}

	while (patternPos < lowPattern.length && wordPos < lowWord.length) {
		charLowPattern = lowPattern.charAt(patternPos);
		let match = false;
		if (landmarkPos < landmarkWord.length && charLowPattern === landmarkWord.charAt(landmarkPos)) {
			let newWordPos = landmarkPositions[landmarkPos];
			match = true;
			score += 10 - (newWordPos - wordPos);
			wordPos = newWordPos;
			landmarkPos += 1;
			patternPos += 1;

		} else if (charLowPattern === lowWord.charAt(wordPos)) {
			match = true;
			patternPos += 1;
		}

		if (match) {
			if (lastMatch && lastMatch.end === wordPos) {
				lastMatch.end += 1;
				score += 1;
			} else {
				lastMatch = { start: wordPos, end: wordPos + 1 };
				result.push(lastMatch);
			}
		}

		wordPos += 1;
		if (wordPos >= landmarkPositions[landmarkPos]) {
			landmarkPos += 1;
		}
	}

	if (patternPos !== lowPattern.length) {
		return undefined;
	}

	// substract uncovered remainder
	score -= lowWord.length - wordPos;

	return [result, score];
}

function computeLandmarks(word: string, lowWord: string): [string, number[]] {
	let result: string = '';
	let positions: number[] = [];
	let lastCh: string;

	for (let pos = 0; pos < word.length; pos++) {
		const ch = word.charAt(pos);
		if (!result // first character is a landmark
			|| (lastCh === '_' || lastCh === '-' || lastCh === ' ') // last was separator
			|| ch !== lowWord.charAt(pos) // upper-case
		) {
			result += ch;
			positions.push(pos);
		}
		lastCh = ch;
	}

	result = result.toLowerCase();

	return [result, positions];
}

// function print(m: number[][]) {
// 	for (const n of m) {
// 		console.log(n.join('|'));
// 	}
// }
export function matchesFuzzy5(pattern: string, word: string) {

	// create matrix
	const matrix: number[][] = [[0]];
	for (let i = 1; i <= pattern.length; i++) {
		matrix.push([-i]);
	}
	for (let i = 1; i <= word.length; i++) {
		matrix[0].push(-i);
	}

	for (let i = 0; i < pattern.length; i++) {

		let match = false;

		for (let j = 0; j < word.length; j++) {

			let diagScore = 0;
			if (pattern[i] === word[j]) {
				diagScore = 1 + matrix[i][j];
				match = true;
			} else {
				diagScore = -1 + matrix[i][j];
			}

			let upScore = -1 + matrix[i][j + 1];
			let leftScore = -1 + matrix[i + 1][j];

			matrix[i + 1][j + 1] = Math.max(diagScore, upScore, leftScore);
		}

		if (!match) {
			return undefined;
		}
	}
	// print(matrix);

	return [];
}
