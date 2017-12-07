/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { compareAnything } from 'vs/base/common/comparers';
import { matchesPrefix, IMatch, createMatches, matchesCamelCase, isUpper } from 'vs/base/common/filters';
import { isEqual, nativeSep } from 'vs/base/common/paths';
import { isWindows } from 'vs/base/common/platform';
import { stripWildcards } from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';

export type Score = [number /* score */, number[] /* match positions */];
export type ScorerCache = { [key: string]: IItemScore };

const NO_MATCH = 0;
const NO_SCORE: Score = [NO_MATCH, []];

// const DEBUG = false;
// const DEBUG_MATRIX = false;

export function score(target: string, query: string, queryLower: string, fuzzy: boolean): Score {
	if (!target || !query) {
		return NO_SCORE; // return early if target or query are undefined
	}

	const targetLength = target.length;
	const queryLength = query.length;

	if (targetLength < queryLength) {
		return NO_SCORE; // impossible for query to be contained in target
	}

	// if (DEBUG) {
	// 	console.group(`Target: ${target}, Query: ${query}`);
	// }

	const targetLower = target.toLowerCase();

	// When not searching fuzzy, we require the query to be contained fully
	// in the target string contiguously.
	if (!fuzzy) {
		const indexOfQueryInTarget = targetLower.indexOf(queryLower);
		if (indexOfQueryInTarget === -1) {
			// if (DEBUG) {
			// 	console.log(`Characters not matching consecutively ${queryLower} within ${targetLower}`);
			// }

			return NO_SCORE;
		}
	}

	const res = doScore(query, queryLower, queryLength, target, targetLower, targetLength);

	// if (DEBUG) {
	// 	console.log(`%cFinal Score: ${res[0]}`, 'font-weight: bold');
	// 	console.groupEnd();
	// }

	return res;
}

function doScore(query: string, queryLower: string, queryLength: number, target: string, targetLower: string, targetLength: number): [number, number[]] {
	const scores = [];
	const matches = [];

	//
	// Build Scorer Matrix:
	//
	// The matrix is composed of query q and target t. For each index we score
	// q[i] with t[i] and compare that with the previous score. If the score is
	// equal or larger, we keep the match. In addition to the score, we also keep
	// the length of the consecutive matches to use as boost for the score.
	//
	//      t   a   r   g   e   t
	//  q
	//  u
	//  e
	//  r
	//  y
	//
	for (let queryIndex = 0; queryIndex < queryLength; queryIndex++) {
		for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
			const currentIndex = queryIndex * targetLength + targetIndex;
			const leftIndex = currentIndex - 1;
			const diagIndex = (queryIndex - 1) * targetLength + targetIndex - 1;

			const leftScore = targetIndex > 0 ? scores[leftIndex] : 0;
			const diagScore = queryIndex > 0 && targetIndex > 0 ? scores[diagIndex] : 0;

			const matchesSequenceLength = queryIndex > 0 && targetIndex > 0 ? matches[diagIndex] : 0;

			// If we are not matching on the first query character any more, we only produce a
			// score if we had a score previously for the last query index (by looking at the diagScore).
			// This makes sure that the query always matches in sequence on the target. For example
			// given a target of "ede" and a query of "de", we would otherwise produce a wrong high score
			// for query[1] ("e") matching on target[0] ("e") because of the "beginning of word" boost.
			let score: number;
			if (!diagScore && queryIndex > 0) {
				score = 0;
			} else {
				score = computeCharScore(query, queryLower, queryIndex, target, targetLower, targetIndex, matchesSequenceLength);
			}

			// We have a score and its equal or larger than the left score
			// Match: sequence continues growing from previous diag value
			// Score: increases by diag score value
			if (score && diagScore + score >= leftScore) {
				matches[currentIndex] = matchesSequenceLength + 1;
				scores[currentIndex] = diagScore + score;
			}

			// We either have no score or the score is lower than the left score
			// Match: reset to 0
			// Score: pick up from left hand side
			else {
				matches[currentIndex] = NO_MATCH;
				scores[currentIndex] = leftScore;
			}
		}
	}

	// Restore Positions (starting from bottom right of matrix)
	const positions = [];
	let queryIndex = queryLength - 1;
	let targetIndex = targetLength - 1;
	while (queryIndex >= 0 && targetIndex >= 0) {
		const currentIndex = queryIndex * targetLength + targetIndex;
		const match = matches[currentIndex];
		if (match === NO_MATCH) {
			targetIndex--; // go left
		} else {
			positions.push(targetIndex);

			// go up and left
			queryIndex--;
			targetIndex--;
		}
	}

	// Print matrix
	// if (DEBUG_MATRIX) {
	// printMatrix(query, target, matches, scores);
	// }

	return [scores[queryLength * targetLength - 1], positions.reverse()];
}

function computeCharScore(query: string, queryLower: string, queryIndex: number, target: string, targetLower: string, targetIndex: number, matchesSequenceLength: number): number {
	let score = 0;

	if (queryLower[queryIndex] !== targetLower[targetIndex]) {
		return score; // no match of characters
	}

	// Character match bonus
	score += 1;

	// if (DEBUG) {
	// 	console.groupCollapsed(`%cCharacter match bonus: +1 (char: ${queryLower[queryIndex]} at index ${targetIndex}, total score: ${score})`, 'font-weight: normal');
	// }

	// Consecutive match bonus
	if (matchesSequenceLength > 0) {
		score += (matchesSequenceLength * 5);

		// if (DEBUG) {
		// 	console.log('Consecutive match bonus: ' + (matchesSequenceLength * 5));
		// }
	}

	// Same case bonus
	if (query[queryIndex] === target[targetIndex]) {
		score += 1;

		// if (DEBUG) {
		// 	console.log('Same case bonus: +1');
		// }
	}

	// Start of word bonus
	if (targetIndex === 0) {
		score += 8;

		// if (DEBUG) {
		// 	console.log('Start of word bonus: +8');
		// }
	}

	else {

		// After separator bonus
		const separatorBonus = scoreSeparatorAtPos(target.charCodeAt(targetIndex - 1));
		if (separatorBonus) {
			score += separatorBonus;

			// if (DEBUG) {
			// 	console.log('After separtor bonus: +4');
			// }
		}

		// Inside word upper case bonus (camel case)
		else if (isUpper(target.charCodeAt(targetIndex))) {
			score += 1;

			// if (DEBUG) {
			// 	console.log('Inside word upper case bonus: +1');
			// }
		}
	}

	// if (DEBUG) {
	// 	console.groupEnd();
	// }

	return score;
}

function scoreSeparatorAtPos(charCode: number): number {
	switch (charCode) {
		case CharCode.Slash:
		case CharCode.Backslash:
			return 5; // prefer path separators...
		case CharCode.Underline:
		case CharCode.Dash:
		case CharCode.Period:
		case CharCode.Space:
		case CharCode.SingleQuote:
		case CharCode.DoubleQuote:
		case CharCode.Colon:
			return 4; // ...over other separators
		default:
			return 0;
	}
}

// function printMatrix(query: string, target: string, matches: number[], scores: number[]): void {
// 	console.log('\t' + target.split('').join('\t'));
// 	for (let queryIndex = 0; queryIndex < query.length; queryIndex++) {
// 		let line = query[queryIndex] + '\t';
// 		for (let targetIndex = 0; targetIndex < target.length; targetIndex++) {
// 			const currentIndex = queryIndex * target.length + targetIndex;
// 			line = line + 'M' + matches[currentIndex] + '/' + 'S' + scores[currentIndex] + '\t';
// 		}

// 		console.log(line);
// 	}
// }

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

export interface IPreparedQuery {
	value: string;
	lowercase: string;
	containsPathSeparator: boolean;
}

/**
 * Helper function to prepare a search value for scoring in quick open by removing unwanted characters.
 */
export function prepareQuery(value: string): IPreparedQuery {
	let lowercase: string;
	let containsPathSeparator: boolean;

	if (value) {
		value = stripWildcards(value).replace(/\s/g, ''); // get rid of all wildcards and whitespace
		if (isWindows) {
			value = value.replace(/\//g, '\\'); // Help Windows users to search for paths when using slash
		}

		lowercase = value.toLowerCase();
		containsPathSeparator = value.indexOf(nativeSep) >= 0;
	}

	return { value, lowercase, containsPathSeparator };
}

export function scoreItem<T>(item: T, query: IPreparedQuery, fuzzy: boolean, accessor: IItemAccessor<T>, cache: ScorerCache): IItemScore {
	if (!item || !query.value) {
		return NO_ITEM_SCORE; // we need an item and query to score on at least
	}

	const label = accessor.getItemLabel(item);
	if (!label) {
		return NO_ITEM_SCORE; // we need a label at least
	}

	const description = accessor.getItemDescription(item);

	let cacheHash: string;
	if (description) {
		cacheHash = `${label}${description}${query.value}${fuzzy}`;
	} else {
		cacheHash = `${label}${query.value}${fuzzy}`;
	}

	const cached = cache[cacheHash];
	if (cached) {
		return cached;
	}

	const itemScore = doScoreItem(label, description, accessor.getItemPath(item), query, fuzzy);
	cache[cacheHash] = itemScore;

	return itemScore;
}

function doScoreItem(label: string, description: string, path: string, query: IPreparedQuery, fuzzy: boolean): IItemScore {

	// 1.) treat identity matches on full path highest
	if (path && isEqual(query.value, path, true)) {
		return { score: PATH_IDENTITY_SCORE, labelMatch: [{ start: 0, end: label.length }], descriptionMatch: description ? [{ start: 0, end: description.length }] : void 0 };
	}

	// We only consider label matches if the query is not including file path separators
	const preferLabelMatches = !path || !query.containsPathSeparator;
	if (preferLabelMatches) {

		// 2.) treat prefix matches on the label second highest
		const prefixLabelMatch = matchesPrefix(query.value, label);
		if (prefixLabelMatch) {
			return { score: LABEL_PREFIX_SCORE, labelMatch: prefixLabelMatch };
		}

		// 3.) treat camelcase matches on the label third highest
		const camelcaseLabelMatch = matchesCamelCase(query.value, label);
		if (camelcaseLabelMatch) {
			return { score: LABEL_CAMELCASE_SCORE, labelMatch: camelcaseLabelMatch };
		}

		// 4.) prefer scores on the label if any
		const [labelScore, labelPositions] = score(label, query.value, query.lowercase, fuzzy);
		if (labelScore) {
			return { score: labelScore + LABEL_SCORE_THRESHOLD, labelMatch: createMatches(labelPositions) };
		}
	}

	// 5.) finally compute description + label scores if we have a description
	if (description) {
		let descriptionPrefix = description;
		if (!!path) {
			descriptionPrefix = `${description}${nativeSep}`; // assume this is a file path
		}

		const descriptionPrefixLength = descriptionPrefix.length;
		const descriptionAndLabel = `${descriptionPrefix}${label}`;

		const [labelDescriptionScore, labelDescriptionPositions] = score(descriptionAndLabel, query.value, query.lowercase, fuzzy);
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

export function compareItemsByScore<T>(itemA: T, itemB: T, query: IPreparedQuery, fuzzy: boolean, accessor: IItemAccessor<T>, cache: ScorerCache, fallbackComparer = fallbackCompare): number {
	const itemScoreA = scoreItem(itemA, query, fuzzy, accessor, cache);
	const itemScoreB = scoreItem(itemB, query, fuzzy, accessor, cache);

	const scoreA = itemScoreA.score;
	const scoreB = itemScoreB.score;

	// 1.) prefer identity matches
	if (scoreA === PATH_IDENTITY_SCORE || scoreB === PATH_IDENTITY_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === PATH_IDENTITY_SCORE ? -1 : 1;
		}
	}

	// 2.) prefer label prefix matches
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

	// 3.) prefer camelcase matches
	if (scoreA === LABEL_CAMELCASE_SCORE || scoreB === LABEL_CAMELCASE_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === LABEL_CAMELCASE_SCORE ? -1 : 1;
		}

		const labelA = accessor.getItemLabel(itemA);
		const labelB = accessor.getItemLabel(itemB);

		// prefer more compact camel case matches over longer
		const comparedByMatchLength = compareByMatchLength(itemScoreA.labelMatch, itemScoreB.labelMatch);
		if (comparedByMatchLength !== 0) {
			return comparedByMatchLength;
		}

		// prefer shorter names when both match on label camelcase
		if (labelA.length !== labelB.length) {
			return labelA.length - labelB.length;
		}
	}

	// 4.) prefer label scores
	if (scoreA > LABEL_SCORE_THRESHOLD || scoreB > LABEL_SCORE_THRESHOLD) {
		if (scoreB < LABEL_SCORE_THRESHOLD) {
			return -1;
		}

		if (scoreA < LABEL_SCORE_THRESHOLD) {
			return 1;
		}
	}

	// 5.) compare by score
	if (scoreA !== scoreB) {
		return scoreA > scoreB ? -1 : 1;
	}

	// 6.) scores are identical, prefer more compact matches (label and description)
	const itemAMatchDistance = computeLabelAndDescriptionMatchDistance(itemA, itemScoreA, accessor);
	const itemBMatchDistance = computeLabelAndDescriptionMatchDistance(itemB, itemScoreB, accessor);
	if (itemAMatchDistance && itemBMatchDistance && itemAMatchDistance !== itemBMatchDistance) {
		return itemBMatchDistance > itemAMatchDistance ? -1 : 1;
	}

	// 7.) at this point, scores are identical and match compactness as well
	// for both items so we start to use the fallback compare
	return fallbackComparer(itemA, itemB, query, accessor);
}

function computeLabelAndDescriptionMatchDistance<T>(item: T, score: IItemScore, accessor: IItemAccessor<T>): number {
	const hasLabelMatches = (score.labelMatch && score.labelMatch.length);
	const hasDescriptionMatches = (score.descriptionMatch && score.descriptionMatch.length);

	let matchStart: number = -1;
	let matchEnd: number = -1;

	// If we have description matches, the start is first of description match
	if (hasDescriptionMatches) {
		matchStart = score.descriptionMatch[0].start;
	}

	// Otherwise, the start is the first label match
	else if (hasLabelMatches) {
		matchStart = score.labelMatch[0].start;
	}

	// If we have label match, the end is the last label match
	// If we had a description match, we add the length of the description
	// as offset to the end to indicate this.
	if (hasLabelMatches) {
		matchEnd = score.labelMatch[score.labelMatch.length - 1].end;
		if (hasDescriptionMatches) {
			const itemDescription = accessor.getItemDescription(item);
			if (itemDescription) {
				matchEnd += itemDescription.length;
			}
		}
	}

	// If we have just a description match, the end is the last description match
	else if (hasDescriptionMatches) {
		matchEnd = score.descriptionMatch[score.descriptionMatch.length - 1].end;
	}

	return matchEnd - matchStart;
}

function compareByMatchLength(matchesA?: IMatch[], matchesB?: IMatch[]): number {
	if ((!matchesA && !matchesB) || (!matchesA.length && !matchesB.length)) {
		return 0; // make sure to not cause bad comparing when matches are not provided
	}

	if (!matchesB || !matchesB.length) {
		return -1;
	}

	if (!matchesA || !matchesA.length) {
		return 1;
	}

	// Compute match length of A (first to last match)
	const matchStartA = matchesA[0].start;
	const matchEndA = matchesA[matchesA.length - 1].end;
	const matchLengthA = matchEndA - matchStartA;

	// Compute match length of B (first to last match)
	const matchStartB = matchesB[0].start;
	const matchEndB = matchesB[matchesB.length - 1].end;
	const matchLengthB = matchEndB - matchStartB;

	// Prefer shorter match length
	return matchLengthA === matchLengthB ? 0 : matchLengthB < matchLengthA ? 1 : -1;
}

export function fallbackCompare<T>(itemA: T, itemB: T, query: IPreparedQuery, accessor: IItemAccessor<T>): number {

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
		return compareAnything(labelA, labelB, query.value);
	}

	// compare by description
	if (descriptionA && descriptionB && descriptionA !== descriptionB) {
		return compareAnything(descriptionA, descriptionB, query.value);
	}

	// compare by path
	if (pathA && pathB && pathA !== pathB) {
		return compareAnything(pathA, pathB, query.value);
	}

	// equal
	return 0;
}