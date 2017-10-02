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
// const verbose = true;
const wordPathBoundary = ['-', '_', ' ', '/', '\\', '.'];
export function score(target: string, query: string, cache?: { [id: string]: number }): number {
	if (!target || !query) {
		return 0; // return early if target or query are undefined
	}

	if (target.length < query.length) {
		return 0; // impossible for query to be contained in target
	}

	const hash = target + query;
	const cached = cache && cache[hash];
	if (typeof cached === 'number') {
		return cached;
	}

	// if (verbose) {
	// 	console.group(`Target: ${target}, Query: ${query}`);
	// }

	const queryLen = query.length;
	const targetLower = target.toLowerCase();
	const queryLower = query.toLowerCase();

	let index = 0;
	let startAt = 0;
	let score = 0;
	while (index < queryLen) {
		let indexOf = targetLower.indexOf(queryLower[index], startAt);
		if (indexOf < 0) {

			// if (verbose) {
			// 	console.log(`Character not part of target ${query[index]}`);
			// }

			score = 0; // This makes sure that the query is contained in the target
			break;
		}

		// Character match bonus
		score += 1;

		// if (verbose) {
		// 	console.groupCollapsed(`%cCharacter match bonus: +1 (char: ${query[index]} at index ${indexOf}, total score: ${score})`, 'font-weight: normal');
		// }

		// Consecutive match bonus
		if (startAt === indexOf && index > 0) {
			score += 5;

			// if (verbose) {
			// 	console.log('Consecutive match bonus: +5');
			// }
		}

		// Same case bonus
		if (target[indexOf] === query[index]) {
			score += 1;

			// if (verbose) {
			// 	console.log('Same case bonus: +1');
			// }
		}

		// Start of word bonus
		if (indexOf === 0) {
			score += 8;

			// if (verbose) {
			// 	console.log('Start of word bonus: +8');
			// }
		}

		// After separator bonus
		else if (wordPathBoundary.some(w => w === target[indexOf - 1])) {
			score += 7;

			// if (verbose) {
			// 	console.log('After separtor bonus: +7');
			// }
		}

		// Inside word upper case bonus
		else if (isUpper(target.charCodeAt(indexOf))) {
			score += 1;

			// if (verbose) {
			// 	console.log('Inside word upper case bonus: +1');
			// }
		}

		// if (verbose) {
		// 	console.groupEnd();
		// }

		startAt = indexOf + 1;
		index++;
	}

	// if (verbose) {
	// 	console.log(`%cFinal Score: ${score}`, 'font-weight: bold');
	// 	console.groupEnd();
	// }

	if (cache) {
		cache[hash] = score;
	}

	return score;
}

function isUpper(code: number): boolean {
	return 65 <= code && code <= 90;
}
/*!
END THIRD PARTY
*/