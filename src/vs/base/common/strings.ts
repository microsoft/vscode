/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

/**
 * The empty string.
 */
export var empty = '';

/**
 * @returns the provided number with the given number of preceding zeros.
 */
export function pad(n: number, l: number, char: string = '0'): string {
	var str = '' + n;
	var r = [str];

	for (var i = str.length; i < l; i++) {
		r.push(char);
	}

	return r.reverse().join('');
}

var _formatRegexp = /{(\d+)}/g;

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
		var idx = parseInt(group, 10);
		return isNaN(idx) || idx < 0 || idx >= args.length ?
			match :
			args[idx];
	});
}

/**
 * Simple, non-language-aware date formatter.
 */
export function formatDate(date: Date = new Date()): string {
	return nls.localize(
		{
			key: 'format.date',
			comment: [
				'{0} represents the month as a 2 digit number',
				'{1} represents the day as a 2 digit number',
				'{2} represents the year as a 4 digit number',
				'{3} represents the hours as a 2 digit number',
				'{4} represents the minutes as a 2 digit number',
				'{5} represents the seconds as a 2 digit number'
			]
		},
		"{0}-{1}-{2} {3}:{4}:{5}",
		pad(date.getMonth() + 1, 2),
		pad(date.getDate(), 2),
		pad(date.getFullYear(), 4),
		pad(date.getHours(), 2),
		pad(date.getMinutes(), 2),
		pad(date.getSeconds(), 2)
	);
}

/**
 * Simple, non-language-aware time formatter.
 */
export function formatTime(date: Date = new Date()): string {
	return nls.localize(
		{
			key: 'format.time',
			comment: [
				'{0} represents the hours as a 2 digit number',
				'{1} represents the minutes as a 2 digit number',
				'{2} represents the seconds as a 2 digit number'
			]
		},
		"{0}:{1}:{2}",
		pad(date.getHours(), 2),
		pad(date.getMinutes(), 2),
		pad(date.getSeconds(), 2)
	);
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
 * Searches for all occurrences of needle in haystack and replaces them with replacement.
 */
export function replaceAll(haystack: string, needle: string, replacement: string): string {
	return haystack.replace(new RegExp(escapeRegExpCharacters(needle.toString()), 'g'), replacement);
}

/**
 * Removes all occurrences of needle from the beginning and end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim (default is a blank)
 */
export function trim(haystack: string, needle: string = ' '): string {
	var trimmed = ltrim(haystack, needle);
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

	var needleLen = needle.length;
	if (needleLen === 0 || haystack.length === 0) {
		return haystack;
	}

	var offset = 0,
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

	var needleLen = needle.length,
		haystackLen = haystack.length;

	if (needleLen === 0 || haystackLen === 0) {
		return haystack;
	}

	var offset = haystackLen,
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

/**
 * Removes all occurrences of whitespaces from the beginning and end of haystack.
 */
export function trimWhitespace(haystack: string): string {
	return haystack.replace(/(^\s+|\s+$)/g, '');
}

export function convertSimple2RegExpPattern(pattern: string): string {
	return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
}

export function stripWildcards(pattern: string): string {
	return replaceAll(pattern, '*', '');
}

/**
 * Determines if haystack starts with needle.
 */
export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (var i = 0; i < needle.length; i++) {
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
	var diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.lastIndexOf(needle) === haystack.length - needle.length;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

export function splice(haystack: string, offset: number, length: number, value: string = ''): string {
	return haystack.substring(0, offset) + value + haystack.substring(offset + length);
}

export function createRegExp(searchString: string, isRegex: boolean, matchCase: boolean, wholeWord: boolean): RegExp {
	if (searchString === '') {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = searchString.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
	}
	if (wholeWord) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = '\\b' + searchString;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = searchString + '\\b';
		}
	}
	var modifiers = 'g';
	if (!matchCase) {
		modifiers += 'i';
	}

	return new RegExp(searchString, modifiers);
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
	// We check against an empty string. If the regular expression doesn't advance
	// (e.g. ends in an endless loop) it will match an empty string.

	var match = regexp.exec('');
	return (match && <any>regexp.lastIndex === 0);
}

/**
 * The normalize() method returns the Unicode Normalization Form of a given string. The form will be
 * the Normalization Form Canonical Composition.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize}
 */
export var canNormalize = typeof ((<any>'').normalize) === 'function';
export function normalizeNFC(str: string, cache?:{[str: string]: string}): string {
	if (!canNormalize || !str) {
		return str;
	}

	if (cache && cache[str]) {
		return cache[str];
	}

	var res = (<any>str).normalize('NFC');

	if (cache) {
		cache[str] = res;
	}

	return res;
}

export function encodeURIPart(haystack: string, keepSlashes?: boolean): string {
	if (!haystack) {
		return haystack;
	}

	if (!keepSlashes) {
		return encodeURIComponent(haystack);
	} else {
		var parts = haystack.split('/');
		for (var i = 0, len = parts.length; i < len; i++) {
			parts[i] = encodeURIComponent(parts[i]);
		}
		return parts.join('/');
	}
}

export function isCamelCasePattern(pattern: string): boolean {
	return (/^\w[\w.]*$/).test(pattern);
}

export function isFalsyOrWhitespace(s: string): boolean {
	return !s || !s.trim();
}

export function anchorPattern(value: string, start: boolean, end: boolean): string {
	if (start) {
		value = '^' + value;
	}

	if (end) {
		value = value + '$';
	}

	return value;
}

export function assertRegExp(pattern: string, modifiers: string): void {
	if (regExpLeadsToEndlessLoop(new RegExp(pattern, modifiers))) {
		throw new Error('Regular expression /' + pattern + '/g results in infinitive matches');
	}
}

export function normalizePath(path?: string): string {

	// No path provided, assume root
	if (!path) {
		return '';
	}

	// Paths must not start with a slash because they are always relative to the workspace root
	if (path.indexOf('/') === 0) {
		path = path.substring(1);
	}

	return encodeURIPart(path, true);
}

export function colorize(code: number, value: string): string {
	return '\x1b[' + code + 'm' + value + '\x1b[0m';
};

/**
 * Returns first index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function firstNonWhitespaceIndex(str: string): number {
	for (var i = 0, len = str.length; i < len; i++) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
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
	for (var i = 0, len = str.length; i < len; i++) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
			return str.substring(0, i);
		}
	}
	return str;
}

/**
 * Returns last index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function lastNonWhitespaceIndex(str: string): number {
	for (var i = str.length - 1; i >= 0; i--) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
			return i;
		}
	}
	return -1;
}

export function localeCompare(strA: string, strB: string): number {
	return strA.localeCompare(strB);
}

function isAsciiChar(code: number): boolean {
	return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

export function equalsIgnoreCase(a: string, b: string): boolean {

	var len1 = a.length,
		len2 = b.length;

	if (len1 !== len2) {
		return false;
	}

	for (var i = 0; i < len1; i++) {

		var codeA = a.charCodeAt(i),
			codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			continue;

		} else if (isAsciiChar(codeA) && isAsciiChar(codeB)) {
			var diff = Math.abs(codeA - codeB);
			if (diff !== 0 && diff !== 32) {
				return false;
			}
		} else {
			if (String.fromCharCode(codeA).toLocaleLowerCase() !== String.fromCharCode(codeB).toLocaleLowerCase()) {
				return false;
			}
		}
	}

	return true;
}

/**
 * @returns the length of the common prefix of the two strings.
 */
export function commonPrefixLength(a: string, b: string): number {

	var i: number,
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

	var i: number,
		len = Math.min(a.length, b.length);

	var aLastIndex = a.length - 1;
	var bLastIndex = b.length - 1;

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
//	var chrCode = str.charCodeAt(index);
//	if (0xD800 <= chrCode && chrCode <= 0xDBFF && index + 1 < len) {
//		var nextChrCode = str.charCodeAt(index + 1);
//		if (0xDC00 <= nextChrCode && nextChrCode <= 0xDFFF) {
//			return (chrCode - 0xD800) << 10 + (nextChrCode - 0xDC00) + 0x10000;
//		}
//	}
//	return chrCode;
//}
//export function isLeadSurrogate(chr:string) {
//	var chrCode = chr.charCodeAt(0);
//	return ;
//}
//
//export function isTrailSurrogate(chr:string) {
//	var chrCode = chr.charCodeAt(0);
//	return 0xDC00 <= chrCode && chrCode <= 0xDFFF;
//}

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
	var lengthDifference = Math.abs(first.length - second.length);
	// We only compute score if length of the currentWord and length of entry.name are similar.
	if (lengthDifference > maxLenDelta) {
		return 0;
	}
	// Initialize LCS (largest common subsequence) matrix.
	var LCS: number[][] = [];
	var zeroArray: number[] = [];
	var i: number, j: number;
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
	var regexp = /\r\n|\r|\n/g,
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

	var segments = text.split(/\b/),
		count = 0;

	for (var i = segments.length - 1; i >= 0; i--) {
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
var EL = /\x1B\x5B[12]?K/g; // Erase in line
var LF = /\xA/g; // line feed
var COLOR_START = /\x1b\[\d+m/g; // Color
var COLOR_END = /\x1b\[0?m/g; // Color

export function removeAnsiEscapeCodes(str: string): string {
	if (str) {
		str = str.replace(EL, '');
		str = str.replace(LF, '\n');
		str = str.replace(COLOR_START, '');
		str = str.replace(COLOR_END, '');
	}

	return str;
}

// -- UTF-8 BOM

var __utf8_bom = 65279;

export var UTF8_BOM_CHARACTER = String.fromCharCode(__utf8_bom);

export function startsWithUTF8BOM(str: string): boolean {
	return (str && str.length > 0 && str.charCodeAt(0) === __utf8_bom);
}