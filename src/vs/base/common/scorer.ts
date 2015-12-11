/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Based on material from:

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
 * Start of word/path bonus: 7
 * Start of string bonus: 8
 */
export function score(target: string, query: string, cache?: {[id: string]: number}): number {
	let score = 0;

	if (!target || !query) {
		return score; // return early if target or query are undefined
	}

	const cached = cache && cache[target + query];
	if (typeof cached === 'number') {
		return cached;
	}

	const queryLen = query.length;
	const targetLower = target.toLowerCase();
	const queryLower = query.toLowerCase();
	const wordPathBoundary = ['-', '_', ' ', '/', '\\'];

	let index = 0;
	while (index < queryLen) {
		var indexOf = targetLower.indexOf(queryLower[index]);
		if (indexOf < 0) {
			index++;
			continue; // no match
		}

		// Character Match Bonus
		score += 1;

		// Same Case Bonous
		if (target[indexOf] === query[indexOf]) {
			score += 1;
		}

		// Upper Case Bonus
		if (isUpper(target.charCodeAt(indexOf))) {
			score += 1;
		}

		// Prefix Bonus
		if (indexOf === 0) {
			score += 8;
		}

		// Start of Word/Path Bonous
		if (wordPathBoundary.some(w => w === target[indexOf - 1])) {
			score += 7;
		}

		index++;
	}

	if (cache) {
		cache[target + query] = score;
	}

	return score;
}

function isUpper(code: number): boolean {
	return 65 <= code && code <= 90;
}