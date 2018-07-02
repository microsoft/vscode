/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CharCode } from './charCode';

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

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
	const candidateLength = candidate.length;
	if (candidate.length > str.length) {
		return false;
	}

	return doEqualsIgnoreCase(str, candidate, candidateLength);
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

function isLowerAsciiLetter(code: number): boolean {
	return code >= CharCode.a && code <= CharCode.z;
}

function isUpperAsciiLetter(code: number): boolean {
	return code >= CharCode.A && code <= CharCode.Z;
}

function isAsciiLetter(code: number): boolean {
	return isLowerAsciiLetter(code) || isUpperAsciiLetter(code);
}

export function equalsIgnoreCase(a: string, b: string): boolean {
	const len1 = a ? a.length : 0;
	const len2 = b ? b.length : 0;

	if (len1 !== len2) {
		return false;
	}

	return doEqualsIgnoreCase(a, b);
}

function doEqualsIgnoreCase(a: string, b: string, stopAt = a.length): boolean {
	if (typeof a !== 'string' || typeof b !== 'string') {
		return false;
	}

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
		let indexOf = targetLower.indexOf(query[index], lastIndexOf + 1);
		if (indexOf < 0) {
			return false;
		}

		lastIndexOf = indexOf;

		index++;
	}

	return true;
}