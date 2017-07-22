/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Based on material from:
/*!
BEGIN THIRD PARTY
*/
/*!
* string_score.js: String Scoring Algorithm 0.1.22
*
* http://joshaven.com/string_score
* https://github.com/joshaven/string_score
*
* Copyright (C) 2009-2014 Joshaven Potter <yourtech@gmail.com>
* Special thanks to all of the contributors listed here https://github.com/joshaven/string_score
* MIT License: http://opensource.org/licenses/MIT
*
* Date: Tue Mar 1 2011
* Updated: Tue Mar 10 2015
*/

/**
 * Compute a score for the given string and the given query.
 *
 * Rules:
 * Character score: 1
 * Same case bonus: 1
 * Upper case bonus: 1
 * Consecutive match bonus: 5
 * Start of word/path bonus: 7
 * Start of string bonus: 8
 */
const wordPathBoundary = ['-', '_', ' ', '/', '\\', '.'];
export function score(target: string, query: string, cache?: { [id: string]: number }): number {
	if (!target || !query) {
		return 0; // return early if target or query are undefined
	}

	const hash = target + query;
	const cached = cache && cache[hash];
	if (typeof cached === 'number') {
		return cached;
	}

	const queryLen = query.length;
	const targetLower = target.toLowerCase();
	const queryLower = query.toLowerCase();

	let index = 0;
	let startAt = 0;
	let score = 0;
	while (index < queryLen) {
		let indexOf = targetLower.indexOf(queryLower[index], startAt);
		if (indexOf < 0) {
			score = 0; // This makes sure that the query is contained in the target
			break;
		}

		// Character match bonus
		score += 1;

		// Consecutive match bonus
		if (startAt === indexOf) {
			score += 5;
		}

		// Same case bonus
		if (target[indexOf] === query[indexOf]) {
			score += 1;
		}

		// Start of word bonus
		if (indexOf === 0) {
			score += 8;
		}

		// After separator bonus
		else if (wordPathBoundary.some(w => w === target[indexOf - 1])) {
			score += 7;
		}

		// Inside word upper case bonus
		else if (isUpper(target.charCodeAt(indexOf))) {
			score += 1;
		}

		startAt = indexOf + 1;
		index++;
	}

	if (cache) {
		cache[hash] = score;
	}

	return score;
}

function isUpper(code: number): boolean {
	return 65 <= code && code <= 90;
}

/**
 * A fast method to check if a given string would produce a score > 0 for the given query.
 */
export function matches(target: string, queryLower: string): boolean {
	if (!target || !queryLower) {
		return false; // return early if target or query are undefined
	}

	const queryLen = queryLower.length;
	const targetLower = target.toLowerCase();

	let index = 0;
	let lastIndexOf = -1;
	while (index < queryLen) {
		let indexOf = targetLower.indexOf(queryLower[index], lastIndexOf + 1);
		if (indexOf < 0) {
			return false;
		}

		lastIndexOf = indexOf;

		index++;
	}

	return true;
}
/*!
END THIRD PARTY
*/