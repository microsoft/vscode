/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { compareAnything } from 'vs/base/common/comparers';
import { matchesPrefix, IMatch, createMatches, matchesCamelCase, isSeparatorAtPos, isUpper } from 'vs/base/common/filters';
import { isEqual, nativeSep } from 'vs/base/common/paths';

export type Score = [number /* score */, number[] /* match positions */];
export type ScorerCache = { [key: string]: IItemScore };

const NO_SCORE: Score = [0, []];

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
export function _doScore(target: string, query: string, fuzzy: boolean, inverse?: boolean): Score {
	if (!target || !query) {
		return NO_SCORE; // return early if target or query are undefined
	}

	if (target.length < query.length) {
		return NO_SCORE; // impossible for query to be contained in target
	}

	// console.group(`Target: ${target}, Query: ${query}`);

	const queryLen = query.length;
	const targetLower = target.toLowerCase();
	const queryLower = query.toLowerCase();

	const matchingPositions: number[] = [];

	let index: number;
	let startAt: number;
	if (!inverse) {
		index = 0;
		startAt = 0;
	} else {
		index = queryLen - 1; // inverse: from end of query to beginning
		startAt = target.length - 1; // inverse: from end of target to beginning
	}

	// When not searching fuzzy, we require the query to be contained fully
	// in the target string.
	if (!fuzzy) {
		let indexOfQueryInTarget: number;
		if (!inverse) {
			indexOfQueryInTarget = targetLower.indexOf(queryLower);
		} else {
			indexOfQueryInTarget = targetLower.lastIndexOf(queryLower);
		}

		if (indexOfQueryInTarget === -1) {
			// console.log(`Characters not matching consecutively ${queryLower} within ${targetLower}`);

			return NO_SCORE;
		}

		// Adjust the start position with the offset of the query
		if (!inverse) {
			startAt = indexOfQueryInTarget;
		} else {
			startAt = indexOfQueryInTarget + query.length;
		}
	}

	let score = 0;
	while (inverse ? index >= 0 : index < queryLen) {

		// Check for query character being contained in target
		let indexOf: number;
		if (!inverse) {
			indexOf = targetLower.indexOf(queryLower[index], startAt);
		} else {
			indexOf = targetLower.lastIndexOf(queryLower[index], startAt); // inverse: look from the end
		}

		if (indexOf < 0) {
			// console.log(`Character not part of target ${query[index]}`);

			score = 0;
			break;
		}

		// Fill into positions array
		matchingPositions.push(indexOf);

		// Character match bonus
		score += 1;

		// console.groupCollapsed(`%cCharacter match bonus: +1 (char: ${query[index]} at index ${indexOf}, total score: ${score})`, 'font-weight: normal');

		// Consecutive match bonus
		if (startAt === indexOf && index > 0) {
			score += 5;

			// console.log('Consecutive match bonus: +5');
		}

		// Same case bonus
		if (target[indexOf] === query[index]) {
			score += 1;

			// console.log('Same case bonus: +1');
		}

		// Start of word bonus
		if (indexOf === 0) {
			score += 8;

			// console.log('Start of word bonus: +8');
		}

		// After separator bonus
		else if (isSeparatorAtPos(target, indexOf - 1)) {
			score += 7;

			// console.log('After separtor bonus: +7');
		}

		// Inside word upper case bonus
		else if (isUpper(target.charCodeAt(indexOf))) {
			score += 1;

			// console.log('Inside word upper case bonus: +1');
		}

		// console.groupEnd();

		if (!inverse) {
			startAt = indexOf + 1;
			index++;
		} else {
			startAt = indexOf - 1; // inverse: go to begining from end
			index--; // inverse: also for query index
		}
	}

	// inverse: flip the matching positions so that they appear in order
	if (inverse) {
		matchingPositions.reverse();
	}

	const res: Score = (score > 0) ? [score, matchingPositions] : NO_SCORE;

	// console.log(`%cFinal Score: ${score}`, 'font-weight: bold');
	// console.groupEnd();

	return res;
}

/*!
END THIRD PARTY
*/

/**
 * Scoring on structural items that have a label and optional description.
 */
export interface IItemScore {

	/**
	 * Overall score.
	 */
	score: number;

	/**
	 * Matches within the label.
	 */
	labelMatch?: IMatch[];

	/**
	 * Matches within the description.
	 */
	descriptionMatch?: IMatch[];
}

const NO_ITEM_SCORE: IItemScore = Object.freeze({ score: 0 });

export interface IItemAccessor<T> {

	/**
	 * Just the label of the item to score on.
	 */
	getItemLabel(item: T): string;

	/**
	 * The optional description of the item to score on. Can be null.
	 */
	getItemDescription(item: T): string;

	/**
	 * If the item is a file, the path of the file to score on. Can be null.
	 */
	getItemPath(file: T): string;
}

const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE = 1 << 17;
const LABEL_CAMELCASE_SCORE = 1 << 16;
const LABEL_SCORE_THRESHOLD = 1 << 15;

export function scoreItem<T>(item: T, query: string, fuzzy: boolean, accessor: IItemAccessor<T>, cache: ScorerCache): IItemScore {
	if (!item || !query) {
		return NO_ITEM_SCORE; // we need an item and query to score on at least
	}

	const label = accessor.getItemLabel(item);
	if (!label) {
		return NO_ITEM_SCORE; // we need a label at least
	}

	const description = accessor.getItemDescription(item);

	let cacheHash: string;
	if (description) {
		cacheHash = `${label}${description}${query}${fuzzy}`;
	} else {
		cacheHash = `${label}${query}${fuzzy}`;
	}

	const cached = cache[cacheHash];
	if (cached) {
		return cached;
	}

	const itemScore = doScoreItem(label, description, accessor.getItemPath(item), query, fuzzy);
	cache[cacheHash] = itemScore;

	return itemScore;
}

function doScoreItem<T>(label: string, description: string, path: string, query: string, fuzzy: boolean): IItemScore {

	// 1.) treat identity matches on full path highest
	if (path && isEqual(query, path, true)) {
		return { score: PATH_IDENTITY_SCORE, labelMatch: [{ start: 0, end: label.length }], descriptionMatch: description ? [{ start: 0, end: description.length }] : void 0 };
	}

	// 2.) treat prefix matches on the label second highest
	const prefixLabelMatch = matchesPrefix(query, label);
	if (prefixLabelMatch) {
		return { score: LABEL_PREFIX_SCORE, labelMatch: prefixLabelMatch };
	}

	// 3.) treat camelcase matches on the label third highest
	const camelcaseLabelMatch = matchesCamelCase(query, label);
	if (camelcaseLabelMatch) {
		return { score: LABEL_CAMELCASE_SCORE, labelMatch: camelcaseLabelMatch };
	}

	// 4.) prefer scores on the label if any
	const [labelScore, labelPositions] = _doScore(label, query, fuzzy);
	if (labelScore) {
		return { score: labelScore + LABEL_SCORE_THRESHOLD, labelMatch: createMatches(labelPositions) };
	}

	// 5.) finally compute description + label scores if we have a description
	if (description) {
		let descriptionPrefix = description;
		if (!!path) {
			descriptionPrefix = `${description}${nativeSep}`; // assume this is a file path
		}

		const descriptionPrefixLength = descriptionPrefix.length;
		const descriptionAndLabel = `${descriptionPrefix}${label}`;

		let [labelDescriptionScore, labelDescriptionPositions] = _doScore(descriptionAndLabel, query, fuzzy);

		// Optimize for file paths: score from the back to the beginning to catch more specific folder
		// names that match on the end of the file. This yields better results in most cases.
		if (!!path) {
			const [labelDescriptionScoreInverse, labelDescriptionPositionsInverse] = _doScore(descriptionAndLabel, query, fuzzy, true /* inverse */);
			if (labelDescriptionScoreInverse && labelDescriptionScoreInverse > labelDescriptionScore) {
				labelDescriptionScore = labelDescriptionScoreInverse;
				labelDescriptionPositions = labelDescriptionPositionsInverse;
			}
		}

		if (labelDescriptionScore) {
			const labelDescriptionMatches = createMatches(labelDescriptionPositions);
			const labelMatch: IMatch[] = [];
			const descriptionMatch: IMatch[] = [];

			// We have to split the matches back onto the label and description portions
			labelDescriptionMatches.forEach(h => {

				// Match overlaps label and description part, we need to split it up
				if (h.start < descriptionPrefixLength && h.end > descriptionPrefixLength) {
					labelMatch.push({ start: 0, end: h.end - descriptionPrefixLength });
					descriptionMatch.push({ start: h.start, end: descriptionPrefixLength });
				}

				// Match on label part
				else if (h.start >= descriptionPrefixLength) {
					labelMatch.push({ start: h.start - descriptionPrefixLength, end: h.end - descriptionPrefixLength });
				}

				// Match on description part
				else {
					descriptionMatch.push(h);
				}
			});

			return { score: labelDescriptionScore, labelMatch, descriptionMatch };
		}
	}

	return NO_ITEM_SCORE;
}

export function compareItemsByScore<T>(itemA: T, itemB: T, query: string, fuzzy: boolean, accessor: IItemAccessor<T>, cache: ScorerCache, fallbackComparer = fallbackCompare): number {
	const scoreA = scoreItem(itemA, query, fuzzy, accessor, cache).score;
	const scoreB = scoreItem(itemB, query, fuzzy, accessor, cache).score;

	// 1.) check for identity matches
	if (scoreA === PATH_IDENTITY_SCORE || scoreB === PATH_IDENTITY_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === PATH_IDENTITY_SCORE ? -1 : 1;
		}
	}

	// 2.) check for label prefix matches
	if (scoreA === LABEL_PREFIX_SCORE || scoreB === LABEL_PREFIX_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === LABEL_PREFIX_SCORE ? -1 : 1;
		}

		const labelA = accessor.getItemLabel(itemA);
		const labelB = accessor.getItemLabel(itemB);

		// prefer shorter names when both match on label prefix
		if (labelA.length !== labelB.length) {
			return labelA.length - labelB.length;
		}
	}

	// 3.) check for camelcase matches
	if (scoreA === LABEL_CAMELCASE_SCORE || scoreB === LABEL_CAMELCASE_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === LABEL_CAMELCASE_SCORE ? -1 : 1;
		}

		const labelA = accessor.getItemLabel(itemA);
		const labelB = accessor.getItemLabel(itemB);

		// prefer shorter names when both match on label camelcase
		if (labelA.length !== labelB.length) {
			return labelA.length - labelB.length;
		}
	}

	// 4.) check for label scores
	if (scoreA > LABEL_SCORE_THRESHOLD || scoreB > LABEL_SCORE_THRESHOLD) {
		if (scoreB < LABEL_SCORE_THRESHOLD) {
			return -1;
		}

		if (scoreA < LABEL_SCORE_THRESHOLD) {
			return 1;
		}
	}

	// 5.) check for path scores
	if (scoreA !== scoreB) {
		return scoreA > scoreB ? -1 : 1;
	}

	// 6.) at this point, scores are identical for both items so we start to use the fallback compare
	return fallbackComparer(itemA, itemB, query, accessor);
}

export function fallbackCompare<T>(itemA: T, itemB: T, query: string, accessor: IItemAccessor<T>): number {

	// check for label + description length and prefer shorter
	const labelA = accessor.getItemLabel(itemA);
	const labelB = accessor.getItemLabel(itemB);

	const descriptionA = accessor.getItemDescription(itemA);
	const descriptionB = accessor.getItemDescription(itemB);

	const labelDescriptionALength = labelA.length + (descriptionA ? descriptionA.length : 0);
	const labelDescriptionBLength = labelB.length + (descriptionB ? descriptionB.length : 0);

	if (labelDescriptionALength !== labelDescriptionBLength) {
		return labelDescriptionALength - labelDescriptionBLength;
	}

	// check for path length and prefer shorter
	const pathA = accessor.getItemPath(itemA);
	const pathB = accessor.getItemPath(itemB);

	if (pathA && pathB && pathA.length !== pathB.length) {
		return pathA.length - pathB.length;
	}

	// 7.) finally we have equal scores and equal length, we fallback to comparer

	// compare by label
	if (labelA !== labelB) {
		return compareAnything(labelA, labelB, query);
	}

	// compare by description
	if (descriptionA && descriptionB && descriptionA !== descriptionB) {
		return compareAnything(descriptionA, descriptionB, query);
	}

	// compare by path
	if (pathA && pathB && pathA !== pathB) {
		return compareAnything(pathA, pathB, query);
	}

	// equal
	return 0;
}