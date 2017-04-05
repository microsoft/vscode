/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { BoundedLinkedMap } from 'vs/base/common/map';
import { CharCode } from 'vs/base/common/charCode';

/**
 * The empty string.
 */
export const empty = '';

export function isFalsyOrWhitespace(str: string): boolean {
	if (!str || typeof str !== 'string') {
		return true;
	}
	return str.trim().length === 0;
}

/**
 * @returns the provided number with the given number of preceding zeros.
 */
export function pad(n: number, l: number, char: string = '0'): string {
	let str = '' + n;
	let r = [str];

	for (let i = str.length; i < l; i++) {
		r.push(char);
	}

	return r.reverse().join('');
}

const _formatRegexp = /{(\d+)}/g;

/**
 * Helper to produce a string with a variable number of arguments. Insert variable segments
 * into the string using the {n} notation where N is the index of the argument following the string.
 * @param value string to which formatting is applied
 * @param args replacements for {n}-entries
 */
export function format(value: string, ...args: any[]): string {
	if (args.length === 0) {
		return value;
	}
	return value.replace(_formatRegexp, function (match, group) {
		let idx = parseInt(group, 10);
		return isNaN(idx) || idx < 0 || idx >= args.length ?
			match :
			args[idx];
	});
}

/**
 * Converts HTML characters inside the string to use entities instead. Makes the string safe from
 * being used e.g. in HTMLElement.innerHTML.
 */
export function escape(html: string): string {
	return html.replace(/[<|>|&]/g, function (match) {
		switch (match) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			default: return match;
		}
	});
}

/**
 * Escapes regular expression characters in a given string
 */
export function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
}

/**
 * Removes all occurrences of needle from the beginning and end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim (default is a blank)
 */
export function trim(haystack: string, needle: string = ' '): string {
	let trimmed = ltrim(haystack, needle);
	return rtrim(trimmed, needle);
}

/**
 * Removes all occurrences of needle from the beginning of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function ltrim(haystack?: string, needle?: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	let needleLen = needle.length;
	if (needleLen === 0 || haystack.length === 0) {
		return haystack;
	}

	let offset = 0,
		idx = -1;

	while ((idx = haystack.indexOf(needle, offset)) === offset) {
		offset = offset + needleLen;
	}
	return haystack.substring(offset);
}

/**
 * Removes all occurrences of needle from the end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function rtrim(haystack?: string, needle?: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	let needleLen = needle.length,
		haystackLen = haystack.length;

	if (needleLen === 0 || haystackLen === 0) {
		return haystack;
	}

	let offset = haystackLen,
		idx = -1;

	while (true) {
		idx = haystack.lastIndexOf(needle, offset - 1);
		if (idx === -1 || idx + needleLen !== offset) {
			break;
		}
		if (idx === 0) {
			return '';
		}
		offset = idx;
	}

	return haystack.substring(0, offset);
}

export function convertSimple2RegExpPattern(pattern: string): string {
	return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
}

export function stripWildcards(pattern: string): string {
	return pattern.replace(/\*/g, '');
}

/**
 * Determines if haystack starts with needle.
 */
export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (let i = 0; i < needle.length; i++) {
		if (haystack[i] !== needle[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
	let diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.indexOf(needle, diff) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

export function indexOfIgnoreCase(haystack: string, needle: string, position: number = 0): number {
	let index = haystack.indexOf(needle, position);
	if (index < 0) {
		if (position > 0) {
			haystack = haystack.substr(position);
		}
		needle = escapeRegExpCharacters(needle);
		index = haystack.search(new RegExp(needle, 'i'));
	}
	return index;
}

export interface RegExpOptions {
	matchCase?: boolean;
	wholeWord?: boolean;
	multiline?: boolean;
	global?: boolean;
}

export function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
	if (searchString === '') {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = searchString.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
	}
	if (options.wholeWord) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = '\\b' + searchString;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = searchString + '\\b';
		}
	}
	let modifiers = '';
	if (options.global) {
		modifiers += 'g';
	}
	if (!options.matchCase) {
		modifiers += 'i';
	}
	if (options.multiline) {
		modifiers += 'm';
	}

	return new RegExp(searchString, modifiers);
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
	// Exit early if it's one of these special cases which are meant to match
	// against an empty string
	if (regexp.source === '^' || regexp.source === '^$' || regexp.source === '$') {
		return false;
	}

	// We check against an empty string. If the regular expression doesn't advance
	// (e.g. ends in an endless loop) it will match an empty string.
	let match = regexp.exec('');
	return (match && <any>regexp.lastIndex === 0);
}

/**
 * The normalize() method returns the Unicode Normalization Form of a given string. The form will be
 * the Normalization Form Canonical Composition.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize}
 */
export let canNormalize = typeof ((<any>'').normalize) === 'function';
const nonAsciiCharactersPattern = /[^\u0000-\u0080]/;
const normalizedCache = new BoundedLinkedMap<string>(10000); // bounded to 10000 elements
export function normalizeNFC(str: string): string {
	if (!canNormalize || !str) {
		return str;
	}

	const cached = normalizedCache.get(str);
	if (cached) {
		return cached;
	}

	let res: string;
	if (nonAsciiCharactersPattern.test(str)) {
		res = (<any>str).normalize('NFC');
	} else {
		res = str;
	}

	// Use the cache for fast lookup
	normalizedCache.set(str, res);

	return res;
}

/**
 * Returns first index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function firstNonWhitespaceIndex(str: string): number {
	for (let i = 0, len = str.length; i < len; i++) {
		let chCode = str.charCodeAt(i);
		if (chCode !== CharCode.Space && chCode !== CharCode.Tab) {
			return i;
		}
	}
	return -1;
}

/**
 * Returns the leading whitespace of the string.
 * If the string contains only whitespaces, returns entire string
 */
export function getLeadingWhitespace(str: string): string {
	for (let i = 0, len = str.length; i < len; i++) {
		let chCode = str.charCodeAt(i);
		if (chCode !== CharCode.Space && chCode !== CharCode.Tab) {
			return str.substring(0, i);
		}
	}
	return str;
}

/**
 * Returns last index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function lastNonWhitespaceIndex(str: string, startIndex: number = str.length - 1): number {
	for (let i = startIndex; i >= 0; i--) {
		let chCode = str.charCodeAt(i);
		if (chCode !== CharCode.Space && chCode !== CharCode.Tab) {
			return i;
		}
	}
	return -1;
}

export function compare(a: string, b: string): number {
	if (a < b) {
		return -1;
	} else if (a > b) {
		return 1;
	} else {
		return 0;
	}
}

export function compareIgnoreCase(a: string, b: string): number {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const codeA = a.charCodeAt(i);
		const codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			// equal
			continue;
		}

		if (isAsciiLetter(codeA) && isAsciiLetter(codeB)) {
			const diff = codeA - codeB;
			if (diff === 32 || diff === -32) {
				// equal -> ignoreCase
				continue;
			} else {
				return diff;
			}
		} else {
			return compare(a.toLowerCase(), b.toLowerCase());
		}
	}

	if (a.length < b.length) {
		return -1;
	} else if (a.length > b.length) {
		return 1;
	} else {
		return 0;
	}
}

function isAsciiLetter(code: number): boolean {
	return (code >= CharCode.a && code <= CharCode.z) || (code >= CharCode.A && code <= CharCode.Z);
}

export function equalsIgnoreCase(a: string, b: string): boolean {

	let len1 = a.length,
		len2 = b.length;

	if (len1 !== len2) {
		return false;
	}

	return doEqualsIgnoreCase(a, b);
}

export function doEqualsIgnoreCase(a: string, b: string, stopAt = a.length): boolean {
	for (let i = 0; i < stopAt; i++) {
		const codeA = a.charCodeAt(i);
		const codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			continue;
		}

		// a-z A-Z
		if (isAsciiLetter(codeA) && isAsciiLetter(codeB)) {
			let diff = Math.abs(codeA - codeB);
			if (diff !== 0 && diff !== 32) {
				return false;
			}
		}

		// Any other charcode
		else {
			if (String.fromCharCode(codeA).toLowerCase() !== String.fromCharCode(codeB).toLowerCase()) {
				return false;
			}
		}
	}

	return true;
}

export function beginsWithIgnoreCase(str: string, candidate: string): boolean {
	const candidateLength = candidate.length;
	if (candidate.length > str.length) {
		return false;
	}

	return doEqualsIgnoreCase(str, candidate, candidateLength);
}

/**
 * @returns the length of the common prefix of the two strings.
 */
export function commonPrefixLength(a: string, b: string): number {

	let i: number,
		len = Math.min(a.length, b.length);

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(i) !== b.charCodeAt(i)) {
			return i;
		}
	}

	return len;
}

/**
 * @returns the length of the common suffix of the two strings.
 */
export function commonSuffixLength(a: string, b: string): number {

	let i: number,
		len = Math.min(a.length, b.length);

	let aLastIndex = a.length - 1;
	let bLastIndex = b.length - 1;

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(aLastIndex - i) !== b.charCodeAt(bLastIndex - i)) {
			return i;
		}
	}

	return len;
}

// --- unicode
// http://en.wikipedia.org/wiki/Surrogate_pair
// Returns the code point starting at a specified index in a string
// Code points U+0000 to U+D7FF and U+E000 to U+FFFF are represented on a single character
// Code points U+10000 to U+10FFFF are represented on two consecutive characters
//export function getUnicodePoint(str:string, index:number, len:number):number {
//	let chrCode = str.charCodeAt(index);
//	if (0xD800 <= chrCode && chrCode <= 0xDBFF && index + 1 < len) {
//		let nextChrCode = str.charCodeAt(index + 1);
//		if (0xDC00 <= nextChrCode && nextChrCode <= 0xDFFF) {
//			return (chrCode - 0xD800) << 10 + (nextChrCode - 0xDC00) + 0x10000;
//		}
//	}
//	return chrCode;
//}
export function isHighSurrogate(charCode: number): boolean {
	return (0xD800 <= charCode && charCode <= 0xDBFF);
}

export function isLowSurrogate(charCode: number): boolean {
	return (0xDC00 <= charCode && charCode <= 0xDFFF);
}

/**
 * Generated using https://github.com/alexandrudima/unicode-utils/blob/master/generate-rtl-test.js
 */
const CONTAINS_RTL = /(?:[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u0710\u0712-\u072F\u074D-\u07A5\u07B1-\u07EA\u07F4\u07F5\u07FA-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u08BD\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDFC\uFE70-\uFEFC]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE33\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDCFF]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD50-\uDFFF]|\uD83B[\uDC00-\uDEBB])/;

/**
 * Returns true if `str` contains any Unicode character that is classified as "R" or "AL".
 */
export function containsRTL(str: string): boolean {
	return CONTAINS_RTL.test(str);
}

const IS_BASIC_ASCII = /^[\t\n\r\x20-\x7E]*$/;
/**
 * Returns true if `str` contains only basic ASCII characters in the range 32 - 126 (including 32 and 126) or \n, \r, \t
 */
export function isBasicASCII(str: string): boolean {
	return IS_BASIC_ASCII.test(str);
}

export function isFullWidthCharacter(charCode: number): boolean {
	// Do a cheap trick to better support wrapping of wide characters, treat them as 2 columns
	// http://jrgraphix.net/research/unicode_blocks.php
	//          2E80 — 2EFF   CJK Radicals Supplement
	//          2F00 — 2FDF   Kangxi Radicals
	//          2FF0 — 2FFF   Ideographic Description Characters
	//          3000 — 303F   CJK Symbols and Punctuation
	//          3040 — 309F   Hiragana
	//          30A0 — 30FF   Katakana
	//          3100 — 312F   Bopomofo
	//          3130 — 318F   Hangul Compatibility Jamo
	//          3190 — 319F   Kanbun
	//          31A0 — 31BF   Bopomofo Extended
	//          31F0 — 31FF   Katakana Phonetic Extensions
	//          3200 — 32FF   Enclosed CJK Letters and Months
	//          3300 — 33FF   CJK Compatibility
	//          3400 — 4DBF   CJK Unified Ideographs Extension A
	//          4DC0 — 4DFF   Yijing Hexagram Symbols
	//          4E00 — 9FFF   CJK Unified Ideographs
	//          A000 — A48F   Yi Syllables
	//          A490 — A4CF   Yi Radicals
	//          AC00 — D7AF   Hangul Syllables
	// [IGNORE] D800 — DB7F   High Surrogates
	// [IGNORE] DB80 — DBFF   High Private Use Surrogates
	// [IGNORE] DC00 — DFFF   Low Surrogates
	// [IGNORE] E000 — F8FF   Private Use Area
	//          F900 — FAFF   CJK Compatibility Ideographs
	// [IGNORE] FB00 — FB4F   Alphabetic Presentation Forms
	// [IGNORE] FB50 — FDFF   Arabic Presentation Forms-A
	// [IGNORE] FE00 — FE0F   Variation Selectors
	// [IGNORE] FE20 — FE2F   Combining Half Marks
	// [IGNORE] FE30 — FE4F   CJK Compatibility Forms
	// [IGNORE] FE50 — FE6F   Small Form Variants
	// [IGNORE] FE70 — FEFF   Arabic Presentation Forms-B
	//          FF00 — FFEF   Halfwidth and Fullwidth Forms
	//               [https://en.wikipedia.org/wiki/Halfwidth_and_fullwidth_forms]
	//               of which FF01 - FF5E fullwidth ASCII of 21 to 7E
	// [IGNORE]    and FF65 - FFDC halfwidth of Katakana and Hangul
	// [IGNORE] FFF0 — FFFF   Specials
	charCode = +charCode; // @perf
	return (
		(charCode >= 0x2E80 && charCode <= 0xD7AF)
		|| (charCode >= 0xF900 && charCode <= 0xFAFF)
		|| (charCode >= 0xFF01 && charCode <= 0xFF5E)
	);
}

/**
 * Computes the difference score for two strings. More similar strings have a higher score.
 * We use largest common subsequence dynamic programming approach but penalize in the end for length differences.
 * Strings that have a large length difference will get a bad default score 0.
 * Complexity - both time and space O(first.length * second.length)
 * Dynamic programming LCS computation http://en.wikipedia.org/wiki/Longest_common_subsequence_problem
 *
 * @param first a string
 * @param second a string
 */
export function difference(first: string, second: string, maxLenDelta: number = 4): number {
	let lengthDifference = Math.abs(first.length - second.length);
	// We only compute score if length of the currentWord and length of entry.name are similar.
	if (lengthDifference > maxLenDelta) {
		return 0;
	}
	// Initialize LCS (largest common subsequence) matrix.
	let LCS: number[][] = [];
	let zeroArray: number[] = [];
	let i: number, j: number;
	for (i = 0; i < second.length + 1; ++i) {
		zeroArray.push(0);
	}
	for (i = 0; i < first.length + 1; ++i) {
		LCS.push(zeroArray);
	}
	for (i = 1; i < first.length + 1; ++i) {
		for (j = 1; j < second.length + 1; ++j) {
			if (first[i - 1] === second[j - 1]) {
				LCS[i][j] = LCS[i - 1][j - 1] + 1;
			} else {
				LCS[i][j] = Math.max(LCS[i - 1][j], LCS[i][j - 1]);
			}
		}
	}
	return LCS[first.length][second.length] - Math.sqrt(lengthDifference);
}

/**
 * Returns an array in which every entry is the offset of a
 * line. There is always one entry which is zero.
 */
export function computeLineStarts(text: string): number[] {
	let regexp = /\r\n|\r|\n/g,
		ret: number[] = [0],
		match: RegExpExecArray;
	while ((match = regexp.exec(text))) {
		ret.push(regexp.lastIndex);
	}
	return ret;
}

/**
 * Given a string and a max length returns a shorted version. Shorting
 * happens at favorable positions - such as whitespace or punctuation characters.
 */
export function lcut(text: string, n: number): string {

	if (text.length < n) {
		return text;
	}

	let segments = text.split(/\b/),
		count = 0;

	for (let i = segments.length - 1; i >= 0; i--) {
		count += segments[i].length;

		if (count > n) {
			segments.splice(0, i);
			break;
		}
	}

	return segments.join(empty).replace(/^\s/, empty);
}

// Escape codes
// http://en.wikipedia.org/wiki/ANSI_escape_code
const EL = /\x1B\x5B[12]?K/g; // Erase in line
const COLOR_START = /\x1b\[\d+m/g; // Color
const COLOR_END = /\x1b\[0?m/g; // Color

export function removeAnsiEscapeCodes(str: string): string {
	if (str) {
		str = str.replace(EL, '');
		str = str.replace(COLOR_START, '');
		str = str.replace(COLOR_END, '');
	}

	return str;
}

// -- UTF-8 BOM

export const UTF8_BOM_CHARACTER = String.fromCharCode(CharCode.UTF8_BOM);

export function startsWithUTF8BOM(str: string): boolean {
	return (str && str.length > 0 && str.charCodeAt(0) === CharCode.UTF8_BOM);
}

/**
 * Appends two strings. If the appended result is longer than maxLength,
 * trims the start of the result and replaces it with '...'.
 */
export function appendWithLimit(first: string, second: string, maxLength: number): string {
	const newLength = first.length + second.length;
	if (newLength > maxLength) {
		first = '...' + first.substr(newLength - maxLength);
	}
	if (second.length > maxLength) {
		first += second.substr(second.length - maxLength);
	} else {
		first += second;
	}

	return first;
}


export function safeBtoa(str: string): string {
	return btoa(encodeURIComponent(str)); // we use encodeURIComponent because btoa fails for non Latin 1 values
}

export function repeat(s: string, count: number): string {
	let result = '';
	for (let i = 0; i < count; i++) {
		result += s;
	}
	return result;
}
