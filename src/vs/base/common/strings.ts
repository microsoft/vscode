/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { Constants } from 'vs/base/common/uint';

export function isFalsyOrWhitespace(str: string | undefined): boolean {
	if (!str || typeof str !== 'string') {
		return true;
	}
	return str.trim().length === 0;
}

/**
 * @returns the provided number with the given number of preceding zeros.
 */
export function pad(n: number, l: number, char: string = '0'): string {
	const str = '' + n;
	const r = [str];

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
		const idx = parseInt(group, 10);
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
	return html.replace(/[<>&]/g, function (match) {
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
	return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}

/**
 * Removes all occurrences of needle from the beginning and end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim (default is a blank)
 */
export function trim(haystack: string, needle: string = ' '): string {
	const trimmed = ltrim(haystack, needle);
	return rtrim(trimmed, needle);
}

/**
 * Removes all occurrences of needle from the beginning of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function ltrim(haystack: string, needle: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	const needleLen = needle.length;
	if (needleLen === 0 || haystack.length === 0) {
		return haystack;
	}

	let offset = 0;

	while (haystack.indexOf(needle, offset) === offset) {
		offset = offset + needleLen;
	}
	return haystack.substring(offset);
}

/**
 * Removes all occurrences of needle from the end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function rtrim(haystack: string, needle: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	const needleLen = needle.length,
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

	if (haystack === needle) {
		return true;
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
	const diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.indexOf(needle, diff) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

export interface RegExpOptions {
	matchCase?: boolean;
	wholeWord?: boolean;
	multiline?: boolean;
	global?: boolean;
	unicode?: boolean;
}

export function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
	if (!searchString) {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = escapeRegExpCharacters(searchString);
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
	if (options.unicode) {
		modifiers += 'u';
	}

	return new RegExp(searchString, modifiers);
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
	// Exit early if it's one of these special cases which are meant to match
	// against an empty string
	if (regexp.source === '^' || regexp.source === '^$' || regexp.source === '$' || regexp.source === '^\\s*$') {
		return false;
	}

	// We check against an empty string. If the regular expression doesn't advance
	// (e.g. ends in an endless loop) it will match an empty string.
	const match = regexp.exec('');
	return !!(match && regexp.lastIndex === 0);
}

export function regExpContainsBackreference(regexpValue: string): boolean {
	return !!regexpValue.match(/([^\\]|^)(\\\\)*\\\d+/);
}

export function regExpFlags(regexp: RegExp): string {
	return (regexp.global ? 'g' : '')
		+ (regexp.ignoreCase ? 'i' : '')
		+ (regexp.multiline ? 'm' : '')
		+ ((regexp as any).unicode ? 'u' : '');
}

/**
 * Returns first index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function firstNonWhitespaceIndex(str: string): number {
	for (let i = 0, len = str.length; i < len; i++) {
		const chCode = str.charCodeAt(i);
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
export function getLeadingWhitespace(str: string, start: number = 0, end: number = str.length): string {
	for (let i = start; i < end; i++) {
		const chCode = str.charCodeAt(i);
		if (chCode !== CharCode.Space && chCode !== CharCode.Tab) {
			return str.substring(start, i);
		}
	}
	return str.substring(start, end);
}

/**
 * Returns last index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function lastNonWhitespaceIndex(str: string, startIndex: number = str.length - 1): number {
	for (let i = startIndex; i >= 0; i--) {
		const chCode = str.charCodeAt(i);
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
		let codeA = a.charCodeAt(i);
		let codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			// equal
			continue;
		}

		if (isUpperAsciiLetter(codeA)) {
			codeA += 32;
		}

		if (isUpperAsciiLetter(codeB)) {
			codeB += 32;
		}

		const diff = codeA - codeB;

		if (diff === 0) {
			// equal -> ignoreCase
			continue;

		} else if (isLowerAsciiLetter(codeA) && isLowerAsciiLetter(codeB)) {
			//
			return diff;

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

export function isLowerAsciiLetter(code: number): boolean {
	return code >= CharCode.a && code <= CharCode.z;
}

export function isUpperAsciiLetter(code: number): boolean {
	return code >= CharCode.A && code <= CharCode.Z;
}

function isAsciiLetter(code: number): boolean {
	return isLowerAsciiLetter(code) || isUpperAsciiLetter(code);
}

export function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && doEqualsIgnoreCase(a, b);
}

function doEqualsIgnoreCase(a: string, b: string, stopAt = a.length): boolean {
	for (let i = 0; i < stopAt; i++) {
		const codeA = a.charCodeAt(i);
		const codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			continue;
		}

		// a-z A-Z
		if (isAsciiLetter(codeA) && isAsciiLetter(codeB)) {
			const diff = Math.abs(codeA - codeB);
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

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
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

	const aLastIndex = a.length - 1;
	const bLastIndex = b.length - 1;

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(aLastIndex - i) !== b.charCodeAt(bLastIndex - i)) {
			return i;
		}
	}

	return len;
}

function substrEquals(a: string, aStart: number, aEnd: number, b: string, bStart: number, bEnd: number): boolean {
	while (aStart < aEnd && bStart < bEnd) {
		if (a[aStart] !== b[bStart]) {
			return false;
		}
		aStart += 1;
		bStart += 1;
	}
	return true;
}

/**
 * Return the overlap between the suffix of `a` and the prefix of `b`.
 * For instance `overlap("foobar", "arr, I'm a pirate") === 2`.
 */
export function overlap(a: string, b: string): number {
	const aEnd = a.length;
	let bEnd = b.length;
	let aStart = aEnd - bEnd;

	if (aStart === 0) {
		return a === b ? aEnd : 0;
	} else if (aStart < 0) {
		bEnd += aStart;
		aStart = 0;
	}

	while (aStart < aEnd && bEnd > 0) {
		if (substrEquals(a, aStart, aEnd, b, 0, bEnd)) {
			return bEnd;
		}
		bEnd -= 1;
		aStart += 1;
	}
	return 0;
}

// --- unicode
// http://en.wikipedia.org/wiki/Surrogate_pair
// Returns the code point starting at a specified index in a string
// Code points U+0000 to U+D7FF and U+E000 to U+FFFF are represented on a single character
// Code points U+10000 to U+10FFFF are represented on two consecutive characters
//export function getUnicodePoint(str:string, index:number, len:number):number {
//	const chrCode = str.charCodeAt(index);
//	if (0xD800 <= chrCode && chrCode <= 0xDBFF && index + 1 < len) {
//		const nextChrCode = str.charCodeAt(index + 1);
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
 * get the code point that begins at offset `offset`
 */
export function getNextCodePoint(str: string, len: number, offset: number): number {
	const charCode = str.charCodeAt(offset);
	if (isHighSurrogate(charCode) && offset + 1 < len) {
		const nextCharCode = str.charCodeAt(offset + 1);
		if (isLowSurrogate(nextCharCode)) {
			return ((charCode - 0xD800) << 10) + (nextCharCode - 0xDC00) + 0x10000;
		}
	}
	return charCode;
}

/**
 * get the code point that ends right before offset `offset`
 */
function getPrevCodePoint(str: string, offset: number): number {
	const charCode = str.charCodeAt(offset - 1);
	if (isLowSurrogate(charCode) && offset > 1) {
		const prevCharCode = str.charCodeAt(offset - 2);
		if (isHighSurrogate(prevCharCode)) {
			return ((prevCharCode - 0xD800) << 10) + (charCode - 0xDC00) + 0x10000;
		}
	}
	return charCode;
}

export function nextCharLength(str: string, offset: number): number {
	const initialOffset = offset;
	const len = str.length;

	let codePoint = getNextCodePoint(str, len, offset);
	offset += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

	while (offset < len) {
		codePoint = getNextCodePoint(str, len, offset);
		if (!isUnicodeMark(codePoint)) {
			break;
		}
		offset += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
	}

	return (offset - initialOffset);
}

export function prevCharLength(str: string, offset: number): number {
	const initialOffset = offset;

	let codePoint = getPrevCodePoint(str, offset);
	offset -= (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

	while (offset > 0 && isUnicodeMark(codePoint)) {
		codePoint = getPrevCodePoint(str, offset);
		offset -= (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
	}

	return (initialOffset - offset);
}

function _getCharContainingOffset(str: string, offset: number): [number, number] {
	const len = str.length;
	const initialOffset = offset;
	const initialCodePoint = getNextCodePoint(str, len, offset);
	offset += (initialCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

	// extend to the right
	while (offset < len) {
		const nextCodePoint = getNextCodePoint(str, len, offset);
		if (!isUnicodeMark(nextCodePoint)) {
			break;
		}
		offset += (nextCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
	}
	const endOffset = offset;

	// extend to the left
	offset = initialOffset;
	let codePoint = initialCodePoint;

	while (offset > 0 && isUnicodeMark(codePoint)) {
		codePoint = getPrevCodePoint(str, offset);
		offset -= (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
	}

	return [offset, endOffset];
}

export function getCharContainingOffset(str: string, offset: number): [number, number] {
	if (offset > 0 && isLowSurrogate(str.charCodeAt(offset))) {
		return _getCharContainingOffset(str, offset - 1);
	}
	return _getCharContainingOffset(str, offset);
}

export function isUnicodeMark(codePoint: number): boolean {
	return MarkClassifier.getInstance().isUnicodeMark(codePoint);
}

class MarkClassifier {

	private static _INSTANCE: MarkClassifier | null = null;

	public static getInstance(): MarkClassifier {
		if (!MarkClassifier._INSTANCE) {
			MarkClassifier._INSTANCE = new MarkClassifier();
		}
		return MarkClassifier._INSTANCE;
	}

	private arr: Uint8Array;

	constructor() {
		// generated using https://github.com/alexandrudima/unicode-utils/blob/master/generate-mark-test.js
		const ranges = [
			0x0300, 0x036F, 0x0483, 0x0489, 0x0591, 0x05BD, 0x05BF, 0x05BF, 0x05C1, 0x05C2, 0x05C4, 0x05C5,
			0x05C7, 0x05C7, 0x0610, 0x061A, 0x064B, 0x065F, 0x0670, 0x0670, 0x06D6, 0x06DC, 0x06DF, 0x06E4,
			0x06E7, 0x06E8, 0x06EA, 0x06ED, 0x0711, 0x0711, 0x0730, 0x074A, 0x07A6, 0x07B0, 0x07EB, 0x07F3,
			0x07FD, 0x07FD, 0x0816, 0x0819, 0x081B, 0x0823, 0x0825, 0x0827, 0x0829, 0x082D, 0x0859, 0x085B,
			0x08D3, 0x08E1, 0x08E3, 0x0903, 0x093A, 0x093C, 0x093E, 0x094F, 0x0951, 0x0957, 0x0962, 0x0963,
			0x0981, 0x0983, 0x09BC, 0x09BC, 0x09BE, 0x09CD, 0x09D7, 0x09D7, 0x09E2, 0x09E3, 0x09FE, 0x0A03,
			0x0A3C, 0x0A51, 0x0A70, 0x0A71, 0x0A75, 0x0A75, 0x0A81, 0x0A83, 0x0ABC, 0x0ABC, 0x0ABE, 0x0ACD,
			0x0AE2, 0x0AE3, 0x0AFA, 0x0B03, 0x0B3C, 0x0B3C, 0x0B3E, 0x0B57, 0x0B62, 0x0B63, 0x0B82, 0x0B82,
			0x0BBE, 0x0BCD, 0x0BD7, 0x0BD7, 0x0C00, 0x0C04, 0x0C3E, 0x0C56, 0x0C62, 0x0C63, 0x0C81, 0x0C83,
			0x0CBC, 0x0CBC, 0x0CBE, 0x0CD6, 0x0CE2, 0x0CE3, 0x0D00, 0x0D03, 0x0D3B, 0x0D3C, 0x0D3E, 0x0D4D,
			0x0D57, 0x0D57, 0x0D62, 0x0D63, 0x0D81, 0x0D83, 0x0DCA, 0x0DDF, 0x0DF2, 0x0DF3, 0x0E31, 0x0E31,
			0x0E34, 0x0E3A, 0x0E47, 0x0E4E, 0x0EB1, 0x0EB1, 0x0EB4, 0x0EBC, 0x0EC8, 0x0ECD, 0x0F18, 0x0F19,
			0x0F35, 0x0F35, 0x0F37, 0x0F37, 0x0F39, 0x0F39, 0x0F3E, 0x0F3F, 0x0F71, 0x0F84, 0x0F86, 0x0F87,
			0x0F8D, 0x0FBC, 0x0FC6, 0x0FC6, 0x102B, 0x103E, 0x1056, 0x1059, 0x105E, 0x1060, 0x1062, 0x1064,
			0x1067, 0x106D, 0x1071, 0x1074, 0x1082, 0x108D, 0x108F, 0x108F, 0x109A, 0x109D, 0x135D, 0x135F,
			0x1712, 0x1714, 0x1732, 0x1734, 0x1752, 0x1753, 0x1772, 0x1773, 0x17B4, 0x17D3, 0x17DD, 0x17DD,
			0x180B, 0x180D, 0x1885, 0x1886, 0x18A9, 0x18A9, 0x1920, 0x193B, 0x1A17, 0x1A1B, 0x1A55, 0x1A7F,
			0x1AB0, 0x1B04, 0x1B34, 0x1B44, 0x1B6B, 0x1B73, 0x1B80, 0x1B82, 0x1BA1, 0x1BAD, 0x1BE6, 0x1BF3,
			0x1C24, 0x1C37, 0x1CD0, 0x1CD2, 0x1CD4, 0x1CE8, 0x1CED, 0x1CED, 0x1CF4, 0x1CF4, 0x1CF7, 0x1CF9,
			0x1DC0, 0x1DFF, 0x20D0, 0x20F0, 0x2CEF, 0x2CF1, 0x2D7F, 0x2D7F, 0x2DE0, 0x2DFF, 0x302A, 0x302F,
			0x3099, 0x309A, 0xA66F, 0xA672, 0xA674, 0xA67D, 0xA69E, 0xA69F, 0xA6F0, 0xA6F1, 0xA802, 0xA802,
			0xA806, 0xA806, 0xA80B, 0xA80B, 0xA823, 0xA827, 0xA82C, 0xA82C, 0xA880, 0xA881, 0xA8B4, 0xA8C5,
			0xA8E0, 0xA8F1, 0xA8FF, 0xA8FF, 0xA926, 0xA92D, 0xA947, 0xA953, 0xA980, 0xA983, 0xA9B3, 0xA9C0,
			0xA9E5, 0xA9E5, 0xAA29, 0xAA36, 0xAA43, 0xAA43, 0xAA4C, 0xAA4D, 0xAA7B, 0xAA7D, 0xAAB0, 0xAAB0,
			0xAAB2, 0xAAB4, 0xAAB7, 0xAAB8, 0xAABE, 0xAABF, 0xAAC1, 0xAAC1, 0xAAEB, 0xAAEF, 0xAAF5, 0xAAF6,
			0xABE3, 0xABEA, 0xABEC, 0xABED, 0xFB1E, 0xFB1E, 0xFE00, 0xFE0F, 0xFE20, 0xFE2F, 0x101FD, 0x101FD,
			0x102E0, 0x102E0, 0x10376, 0x1037A, 0x10A01, 0x10A0F, 0x10A38, 0x10A3F, 0x10AE5, 0x10AE6, 0x10D24, 0x10D27,
			0x10EAB, 0x10EAC, 0x10F46, 0x10F50, 0x11000, 0x11002, 0x11038, 0x11046, 0x1107F, 0x11082, 0x110B0, 0x110BA,
			0x11100, 0x11102, 0x11127, 0x11134, 0x11145, 0x11146, 0x11173, 0x11173, 0x11180, 0x11182, 0x111B3, 0x111C0,
			0x111C9, 0x111CC, 0x111CE, 0x111CF, 0x1122C, 0x11237, 0x1123E, 0x1123E, 0x112DF, 0x112EA, 0x11300, 0x11303,
			0x1133B, 0x1133C, 0x1133E, 0x1134D, 0x11357, 0x11357, 0x11362, 0x11374, 0x11435, 0x11446, 0x1145E, 0x1145E,
			0x114B0, 0x114C3, 0x115AF, 0x115C0, 0x115DC, 0x115DD, 0x11630, 0x11640, 0x116AB, 0x116B7, 0x1171D, 0x1172B,
			0x1182C, 0x1183A, 0x11930, 0x1193E, 0x11940, 0x11940, 0x11942, 0x11943, 0x119D1, 0x119E0, 0x119E4, 0x119E4,
			0x11A01, 0x11A0A, 0x11A33, 0x11A39, 0x11A3B, 0x11A3E, 0x11A47, 0x11A47, 0x11A51, 0x11A5B, 0x11A8A, 0x11A99,
			0x11C2F, 0x11C3F, 0x11C92, 0x11CB6, 0x11D31, 0x11D45, 0x11D47, 0x11D47, 0x11D8A, 0x11D97, 0x11EF3, 0x11EF6,
			0x16AF0, 0x16AF4, 0x16B30, 0x16B36, 0x16F4F, 0x16F4F, 0x16F51, 0x16F92, 0x16FE4, 0x16FF1, 0x1BC9D, 0x1BC9E,
			0x1D165, 0x1D169, 0x1D16D, 0x1D172, 0x1D17B, 0x1D182, 0x1D185, 0x1D18B, 0x1D1AA, 0x1D1AD, 0x1D242, 0x1D244,
			0x1DA00, 0x1DA36, 0x1DA3B, 0x1DA6C, 0x1DA75, 0x1DA75, 0x1DA84, 0x1DA84, 0x1DA9B, 0x1E02A, 0x1E130, 0x1E136,
			0x1E2EC, 0x1E2EF, 0x1E8D0, 0x1E8D6, 0x1E944, 0x1E94A, 0xE0100, 0xE01EF
		];

		const maxCodePoint = ranges[ranges.length - 1];
		const arrLen = Math.ceil(maxCodePoint / 8);
		const arr = new Uint8Array(arrLen);

		for (let i = 0, len = ranges.length / 2; i < len; i++) {
			const from = ranges[2 * i];
			const to = ranges[2 * i + 1];

			for (let j = from; j <= to; j++) {
				const div8 = j >>> 3;
				const mod8 = j & 7;
				arr[div8] = arr[div8] | (1 << mod8);
			}
		}

		this.arr = arr;
	}

	public isUnicodeMark(codePoint: number): boolean {
		const div8 = codePoint >>> 3;
		const mod8 = codePoint & 7;
		if (div8 >= this.arr.length) {
			return false;
		}
		return (this.arr[div8] & (1 << mod8)) ? true : false;
	}
}

/**
 * A manual encoding of `str` to UTF8.
 * Use only in environments which do not offer native conversion methods!
 */
export function encodeUTF8(str: string): Uint8Array {
	const strLen = str.length;

	// See https://en.wikipedia.org/wiki/UTF-8

	// first loop to establish needed buffer size
	let neededSize = 0;
	let strOffset = 0;
	while (strOffset < strLen) {
		const codePoint = getNextCodePoint(str, strLen, strOffset);
		strOffset += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

		if (codePoint < 0x0080) {
			neededSize += 1;
		} else if (codePoint < 0x0800) {
			neededSize += 2;
		} else if (codePoint < 0x10000) {
			neededSize += 3;
		} else {
			neededSize += 4;
		}
	}

	// second loop to actually encode
	const arr = new Uint8Array(neededSize);
	strOffset = 0;
	let arrOffset = 0;
	while (strOffset < strLen) {
		const codePoint = getNextCodePoint(str, strLen, strOffset);
		strOffset += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

		if (codePoint < 0x0080) {
			arr[arrOffset++] = codePoint;
		} else if (codePoint < 0x0800) {
			arr[arrOffset++] = 0b11000000 | ((codePoint & 0b00000000000000000000011111000000) >>> 6);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} else if (codePoint < 0x10000) {
			arr[arrOffset++] = 0b11100000 | ((codePoint & 0b00000000000000001111000000000000) >>> 12);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} else {
			arr[arrOffset++] = 0b11110000 | ((codePoint & 0b00000000000111000000000000000000) >>> 18);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000111111000000000000) >>> 12);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			arr[arrOffset++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		}
	}

	return arr;
}

/**
 * A manual decoding of a UTF8 string.
 * Use only in environments which do not offer native conversion methods!
 */
export function decodeUTF8(buffer: Uint8Array): string {
	// https://en.wikipedia.org/wiki/UTF-8

	const len = buffer.byteLength;
	const result: string[] = [];
	let offset = 0;
	while (offset < len) {
		const v0 = buffer[offset];
		let codePoint: number;
		if (v0 >= 0b11110000 && offset + 3 < len) {
			// 4 bytes
			codePoint = (
				(((buffer[offset++] & 0b00000111) << 18) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 12) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 6) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 0) >>> 0)
			);
		} else if (v0 >= 0b11100000 && offset + 2 < len) {
			// 3 bytes
			codePoint = (
				(((buffer[offset++] & 0b00001111) << 12) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 6) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 0) >>> 0)
			);
		} else if (v0 >= 0b11000000 && offset + 1 < len) {
			// 2 bytes
			codePoint = (
				(((buffer[offset++] & 0b00011111) << 6) >>> 0)
				| (((buffer[offset++] & 0b00111111) << 0) >>> 0)
			);
		} else {
			// 1 byte
			codePoint = buffer[offset++];
		}

		if ((codePoint >= 0 && codePoint <= 0xD7FF) || (codePoint >= 0xE000 && codePoint <= 0xFFFF)) {
			// Basic Multilingual Plane
			result.push(String.fromCharCode(codePoint));
		} else if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
			// Supplementary Planes
			const uPrime = codePoint - 0x10000;
			const w1 = 0xD800 + ((uPrime & 0b11111111110000000000) >>> 10);
			const w2 = 0xDC00 + ((uPrime & 0b00000000001111111111) >>> 0);
			result.push(String.fromCharCode(w1));
			result.push(String.fromCharCode(w2));
		} else {
			// illegal code point
			result.push(String.fromCharCode(0xFFFD));
		}
	}

	return result.join('');
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

/**
 * Generated using https://github.com/alexandrudima/unicode-utils/blob/master/generate-emoji-test.js
 */
const CONTAINS_EMOJI = /(?:[\u231A\u231B\u23F0\u23F3\u2600-\u27BF\u2B50\u2B55]|\uD83C[\uDDE6-\uDDFF\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFC\uDFE0-\uDFEB]|\uD83E[\uDD00-\uDDFF\uDE70-\uDE73\uDE78-\uDE82\uDE90-\uDE95])/;

export function containsEmoji(str: string): boolean {
	return CONTAINS_EMOJI.test(str);
}

const IS_BASIC_ASCII = /^[\t\n\r\x20-\x7E]*$/;
/**
 * Returns true if `str` contains only basic ASCII characters in the range 32 - 126 (including 32 and 126) or \n, \r, \t
 */
export function isBasicASCII(str: string): boolean {
	return IS_BASIC_ASCII.test(str);
}

export function containsFullWidthCharacter(str: string): boolean {
	for (let i = 0, len = str.length; i < len; i++) {
		if (isFullWidthCharacter(str.charCodeAt(i))) {
			return true;
		}
	}
	return false;
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
 * A fast function (therefore imprecise) to check if code points are emojis.
 * Generated using https://github.com/alexandrudima/unicode-utils/blob/master/generate-emoji-test.js
 */
export function isEmojiImprecise(x: number): boolean {
	return (
		(x >= 0x1F1E6 && x <= 0x1F1FF) || (x >= 9728 && x <= 10175) || (x >= 127744 && x <= 128591)
		|| (x >= 128640 && x <= 128764) || (x >= 128992 && x <= 129003) || (x >= 129280 && x <= 129535)
		|| (x >= 129648 && x <= 129651) || (x >= 129656 && x <= 129666) || (x >= 129680 && x <= 129685)
	);
}

/**
 * Given a string and a max length returns a shorted version. Shorting
 * happens at favorable positions - such as whitespace or punctuation characters.
 */
export function lcut(text: string, n: number) {
	if (text.length < n) {
		return text;
	}

	const re = /\b/g;
	let i = 0;
	while (re.test(text)) {
		if (text.length - re.lastIndex < n) {
			break;
		}

		i = re.lastIndex;
		re.lastIndex += 1;
	}

	return text.substring(i).replace(/^\s/, '');
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

export const removeAccents: (str: string) => string = (function () {
	if (typeof (String.prototype as any).normalize !== 'function') {
		// ☹️ no ES6 features...
		return function (str: string) { return str; };
	} else {
		// transform into NFD form and remove accents
		// see: https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript/37511463#37511463
		const regex = /[\u0300-\u036f]/g;
		return function (str: string) {
			return (str as any).normalize('NFD').replace(regex, '');
		};
	}
})();


// -- UTF-8 BOM

export const UTF8_BOM_CHARACTER = String.fromCharCode(CharCode.UTF8_BOM);

export function startsWithUTF8BOM(str: string): boolean {
	return !!(str && str.length > 0 && str.charCodeAt(0) === CharCode.UTF8_BOM);
}

export function stripUTF8BOM(str: string): string {
	return startsWithUTF8BOM(str) ? str.substr(1) : str;
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

/**
 * Checks if the characters of the provided query string are included in the
 * target string. The characters do not have to be contiguous within the string.
 */
export function fuzzyContains(target: string, query: string): boolean {
	if (!target || !query) {
		return false; // return early if target or query are undefined
	}

	if (target.length < query.length) {
		return false; // impossible for query to be contained in target
	}

	const queryLen = query.length;
	const targetLower = target.toLowerCase();

	let index = 0;
	let lastIndexOf = -1;
	while (index < queryLen) {
		const indexOf = targetLower.indexOf(query[index], lastIndexOf + 1);
		if (indexOf < 0) {
			return false;
		}

		lastIndexOf = indexOf;

		index++;
	}

	return true;
}

export function containsUppercaseCharacter(target: string, ignoreEscapedChars = false): boolean {
	if (!target) {
		return false;
	}

	if (ignoreEscapedChars) {
		target = target.replace(/\\./g, '');
	}

	return target.toLowerCase() !== target;
}

export function uppercaseFirstLetter(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getNLines(str: string, n = 1): string {
	if (n === 0) {
		return '';
	}

	let idx = -1;
	do {
		idx = str.indexOf('\n', idx + 1);
		n--;
	} while (n > 0 && idx >= 0);

	return idx >= 0 ?
		str.substr(0, idx) :
		str;
}

/**
 * Produces 'a'-'z', followed by 'A'-'Z'... followed by 'a'-'z', etc.
 */
export function singleLetterHash(n: number): string {
	const LETTERS_CNT = (CharCode.Z - CharCode.A + 1);

	n = n % (2 * LETTERS_CNT);

	if (n < LETTERS_CNT) {
		return String.fromCharCode(CharCode.a + n);
	}

	return String.fromCharCode(CharCode.A + n - LETTERS_CNT);
}
