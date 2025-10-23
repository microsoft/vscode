/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from './charCode.js';
import { compareAnything } from './comparers.js';
import { createMatches as createFuzzyMatches, fuzzyScore, IMatch, isUpper, matchesPrefix } from './filters.js';
import { hash } from './hash.js';
import { sep } from './path.js';
import { isLinux, isWindows } from './platform.js';
import { equalsIgnoreCase } from './strings.js';

//#region Fuzzy scorer

export type FuzzyScore = [number /* score */, number[] /* match positions */];
export type FuzzyScorerCache = { [key: string]: IItemScore };

const NO_MATCH = 0;
const NO_SCORE: FuzzyScore = [NO_MATCH, []];

// const DEBUG = true;
// const DEBUG_MATRIX = false;

export function scoreFuzzy(target: string, query: string, queryLower: string, allowNonContiguousMatches: boolean): FuzzyScore {
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
	const res = doScoreFuzzy(query, queryLower, queryLength, target, targetLower, targetLength, allowNonContiguousMatches);

	// if (DEBUG) {
	// 	console.log(`%cFinal Score: ${res[0]}`, 'font-weight: bold');
	// 	console.groupEnd();
	// }

	return res;
}

function doScoreFuzzy(query: string, queryLower: string, queryLength: number, target: string, targetLower: string, targetLength: number, allowNonContiguousMatches: boolean): FuzzyScore {
	const scores: number[] = [];
	const matches: number[] = [];

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
		const queryIndexOffset = queryIndex * targetLength;
		const queryIndexPreviousOffset = queryIndexOffset - targetLength;

		const queryIndexGtNull = queryIndex > 0;

		const queryCharAtIndex = query[queryIndex];
		const queryLowerCharAtIndex = queryLower[queryIndex];

		for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
			const targetIndexGtNull = targetIndex > 0;

			const currentIndex = queryIndexOffset + targetIndex;
			const leftIndex = currentIndex - 1;
			const diagIndex = queryIndexPreviousOffset + targetIndex - 1;

			const leftScore = targetIndexGtNull ? scores[leftIndex] : 0;
			const diagScore = queryIndexGtNull && targetIndexGtNull ? scores[diagIndex] : 0;

			const matchesSequenceLength = queryIndexGtNull && targetIndexGtNull ? matches[diagIndex] : 0;

			// If we are not matching on the first query character any more, we only produce a
			// score if we had a score previously for the last query index (by looking at the diagScore).
			// This makes sure that the query always matches in sequence on the target. For example
			// given a target of "ede" and a query of "de", we would otherwise produce a wrong high score
			// for query[1] ("e") matching on target[0] ("e") because of the "beginning of word" boost.
			let score: number;
			if (!diagScore && queryIndexGtNull) {
				score = 0;
			} else {
				score = computeCharScore(queryCharAtIndex, queryLowerCharAtIndex, target, targetLower, targetIndex, matchesSequenceLength);
			}

			// We have a score and its equal or larger than the left score
			// Match: sequence continues growing from previous diag value
			// Score: increases by diag score value
			const isValidScore = score && diagScore + score >= leftScore;
			if (isValidScore && (
				// We don't need to check if it's contiguous if we allow non-contiguous matches
				allowNonContiguousMatches ||
				// We must be looking for a contiguous match.
				// Looking at an index higher than 0 in the query means we must have already
				// found out this is contiguous otherwise there wouldn't have been a score
				queryIndexGtNull ||
				// lastly check if the query is completely contiguous at this index in the target
				targetLower.startsWith(queryLower, targetIndex)
			)) {
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
	const positions: number[] = [];
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
	// 	printMatrix(query, target, matches, scores);
	// }

	return [scores[queryLength * targetLength - 1], positions.reverse()];
}

function computeCharScore(queryCharAtIndex: string, queryLowerCharAtIndex: string, target: string, targetLower: string, targetIndex: number, matchesSequenceLength: number): number {
	let score = 0;

	if (!considerAsEqual(queryLowerCharAtIndex, targetLower[targetIndex])) {
		return score; // no match of characters
	}

	// if (DEBUG) {
	// 	console.groupCollapsed(`%cFound a match of char: ${queryLowerCharAtIndex} at index ${targetIndex}`, 'font-weight: normal');
	// }

	// Character match bonus
	score += 1;

	// if (DEBUG) {
	// 	console.log(`%cCharacter match bonus: +1`, 'font-weight: normal');
	// }

	// Consecutive match bonus: sequences up to 3 get the full bonus (6)
	// and the remainder gets half the bonus (3). This helps reduce the
	// overall boost for long sequence matches.
	if (matchesSequenceLength > 0) {
		score += (Math.min(matchesSequenceLength, 3) * 6) + (Math.max(0, matchesSequenceLength - 3) * 3);

		// if (DEBUG) {
		// 	console.log(`Consecutive match bonus: +${matchesSequenceLength * 5}`);
		// }
	}

	// Same case bonus
	if (queryCharAtIndex === target[targetIndex]) {
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
			// 	console.log(`After separator bonus: +${separatorBonus}`);
			// }
		}

		// Inside word upper case bonus (camel case). We only give this bonus if we're not in a contiguous sequence.
		// For example:
		// NPE => NullPointerException = boost
		// HTTP => HTTP = not boost
		else if (isUpper(target.charCodeAt(targetIndex)) && matchesSequenceLength === 0) {
			score += 2;

			// if (DEBUG) {
			// 	console.log('Inside word upper case bonus: +2');
			// }
		}
	}

	// if (DEBUG) {
	// 	console.log(`Total score: ${score}`);
	// 	console.groupEnd();
	// }

	return score;
}

function considerAsEqual(a: string, b: string): boolean {
	if (a === b) {
		return true;
	}

	// Special case path separators: ignore platform differences
	if (a === '/' || a === '\\') {
		return b === '/' || b === '\\';
	}

	return false;
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

//#endregion


//#region Alternate fuzzy scorer implementation that is e.g. used for symbols

export type FuzzyScore2 = [number | undefined /* score */, IMatch[]];

const NO_SCORE2: FuzzyScore2 = [undefined, []];

export function scoreFuzzy2(target: string, query: IPreparedQuery | IPreparedQueryPiece, patternStart = 0, wordStart = 0): FuzzyScore2 {

	// Score: multiple inputs
	const preparedQuery = query as IPreparedQuery;
	if (preparedQuery.values && preparedQuery.values.length > 1) {
		return doScoreFuzzy2Multiple(target, preparedQuery.values, patternStart, wordStart);
	}

	// Score: single input
	return doScoreFuzzy2Single(target, query, patternStart, wordStart);
}

function doScoreFuzzy2Multiple(target: string, query: IPreparedQueryPiece[], patternStart: number, wordStart: number): FuzzyScore2 {
	let totalScore = 0;
	const totalMatches: IMatch[] = [];

	for (const queryPiece of query) {
		const [score, matches] = doScoreFuzzy2Single(target, queryPiece, patternStart, wordStart);
		if (typeof score !== 'number') {
			// if a single query value does not match, return with
			// no score entirely, we require all queries to match
			return NO_SCORE2;
		}

		totalScore += score;
		totalMatches.push(...matches);
	}

	// if we have a score, ensure that the positions are
	// sorted in ascending order and distinct
	return [totalScore, normalizeMatches(totalMatches)];
}

function doScoreFuzzy2Single(target: string, query: IPreparedQueryPiece, patternStart: number, wordStart: number): FuzzyScore2 {
	const score = fuzzyScore(query.original, query.originalLowercase, patternStart, target, target.toLowerCase(), wordStart, { firstMatchCanBeWeak: true, boostFullMatch: true });
	if (!score) {
		return NO_SCORE2;
	}

	return [score[0], createFuzzyMatches(score)];
}

//#endregion


//#region Item (label, description, path) scorer

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

const NO_ITEM_SCORE = Object.freeze<IItemScore>({ score: 0 });

export interface IItemAccessor<T> {

	/**
	 * Just the label of the item to score on.
	 */
	getItemLabel(item: T): string | undefined;

	/**
	 * The optional description of the item to score on.
	 */
	getItemDescription(item: T): string | undefined;

	/**
	 * If the item is a file, the path of the file to score on.
	 */
	getItemPath(file: T): string | undefined;
}

const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE_THRESHOLD = 1 << 17;
const LABEL_SCORE_THRESHOLD = 1 << 16;

function getCacheHash(label: string, description: string | undefined, allowNonContiguousMatches: boolean, query: IPreparedQuery) {
	const values = query.values ? query.values : [query];
	const cacheHash = hash({
		[query.normalized]: {
			values: values.map(v => ({ value: v.normalized, expectContiguousMatch: v.expectContiguousMatch })),
			label,
			description,
			allowNonContiguousMatches
		}
	});
	return cacheHash;
}

export function scoreItemFuzzy<T>(item: T, query: IPreparedQuery, allowNonContiguousMatches: boolean, accessor: IItemAccessor<T>, cache: FuzzyScorerCache): IItemScore {
	if (!item || !query.normalized) {
		return NO_ITEM_SCORE; // we need an item and query to score on at least
	}

	const label = accessor.getItemLabel(item);
	if (!label) {
		return NO_ITEM_SCORE; // we need a label at least
	}

	const description = accessor.getItemDescription(item);

	// in order to speed up scoring, we cache the score with a unique hash based on:
	// - label
	// - description (if provided)
	// - whether non-contiguous matching is enabled or not
	// - hash of the query (normalized) values
	const cacheHash = getCacheHash(label, description, allowNonContiguousMatches, query);
	const cached = cache[cacheHash];
	if (cached) {
		return cached;
	}

	const itemScore = doScoreItemFuzzy(label, description, accessor.getItemPath(item), query, allowNonContiguousMatches);
	cache[cacheHash] = itemScore;

	return itemScore;
}

function doScoreItemFuzzy(label: string, description: string | undefined, path: string | undefined, query: IPreparedQuery, allowNonContiguousMatches: boolean): IItemScore {
	const preferLabelMatches = !path || !query.containsPathSeparator;

	// Treat identity matches on full path highest
	if (path && (isLinux ? query.pathNormalized === path : equalsIgnoreCase(query.pathNormalized, path))) {
		return { score: PATH_IDENTITY_SCORE, labelMatch: [{ start: 0, end: label.length }], descriptionMatch: description ? [{ start: 0, end: description.length }] : undefined };
	}

	// Score: multiple inputs
	if (query.values && query.values.length > 1) {
		return doScoreItemFuzzyMultiple(label, description, path, query.values, preferLabelMatches, allowNonContiguousMatches);
	}

	// Score: single input
	return doScoreItemFuzzySingle(label, description, path, query, preferLabelMatches, allowNonContiguousMatches);
}

function doScoreItemFuzzyMultiple(label: string, description: string | undefined, path: string | undefined, query: IPreparedQueryPiece[], preferLabelMatches: boolean, allowNonContiguousMatches: boolean): IItemScore {
	let totalScore = 0;
	const totalLabelMatches: IMatch[] = [];
	const totalDescriptionMatches: IMatch[] = [];

	for (const queryPiece of query) {
		const { score, labelMatch, descriptionMatch } = doScoreItemFuzzySingle(label, description, path, queryPiece, preferLabelMatches, allowNonContiguousMatches);
		if (score === NO_MATCH) {
			// if a single query value does not match, return with
			// no score entirely, we require all queries to match
			return NO_ITEM_SCORE;
		}

		totalScore += score;
		if (labelMatch) {
			totalLabelMatches.push(...labelMatch);
		}

		if (descriptionMatch) {
			totalDescriptionMatches.push(...descriptionMatch);
		}
	}

	// if we have a score, ensure that the positions are
	// sorted in ascending order and distinct
	return {
		score: totalScore,
		labelMatch: normalizeMatches(totalLabelMatches),
		descriptionMatch: normalizeMatches(totalDescriptionMatches)
	};
}

function doScoreItemFuzzySingle(label: string, description: string | undefined, path: string | undefined, query: IPreparedQueryPiece, preferLabelMatches: boolean, allowNonContiguousMatches: boolean): IItemScore {

	// Prefer label matches if told so or we have no description
	if (preferLabelMatches || !description) {
		const [labelScore, labelPositions] = scoreFuzzy(
			label,
			query.normalized,
			query.normalizedLowercase,
			allowNonContiguousMatches && !query.expectContiguousMatch);
		if (labelScore) {

			// If we have a prefix match on the label, we give a much
			// higher baseScore to elevate these matches over others
			// This ensures that typing a file name wins over results
			// that are present somewhere in the label, but not the
			// beginning.
			const labelPrefixMatch = matchesPrefix(query.normalized, label);
			let baseScore: number;
			if (labelPrefixMatch) {
				baseScore = LABEL_PREFIX_SCORE_THRESHOLD;

				// We give another boost to labels that are short, e.g. given
				// files "window.ts" and "windowActions.ts" and a query of
				// "window", we want "window.ts" to receive a higher score.
				// As such we compute the percentage the query has within the
				// label and add that to the baseScore.
				const prefixLengthBoost = Math.round((query.normalized.length / label.length) * 100);
				baseScore += prefixLengthBoost;
			} else {
				baseScore = LABEL_SCORE_THRESHOLD;
			}

			return { score: baseScore + labelScore, labelMatch: labelPrefixMatch || createMatches(labelPositions) };
		}
	}

	// Finally compute description + label scores if we have a description
	if (description) {
		let descriptionPrefix = description;
		if (!!path) {
			descriptionPrefix = `${description}${sep}`; // assume this is a file path
		}

		const descriptionPrefixLength = descriptionPrefix.length;
		const descriptionAndLabel = `${descriptionPrefix}${label}`;

		const [labelDescriptionScore, labelDescriptionPositions] = scoreFuzzy(
			descriptionAndLabel,
			query.normalized,
			query.normalizedLowercase,
			allowNonContiguousMatches && !query.expectContiguousMatch);
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

function createMatches(offsets: number[] | undefined): IMatch[] {
	const ret: IMatch[] = [];
	if (!offsets) {
		return ret;
	}

	let last: IMatch | undefined;
	for (const pos of offsets) {
		if (last && last.end === pos) {
			last.end += 1;
		} else {
			last = { start: pos, end: pos + 1 };
			ret.push(last);
		}
	}

	return ret;
}

function normalizeMatches(matches: IMatch[]): IMatch[] {

	// sort matches by start to be able to normalize
	const sortedMatches = matches.sort((matchA, matchB) => {
		return matchA.start - matchB.start;
	});

	// merge matches that overlap
	const normalizedMatches: IMatch[] = [];
	let currentMatch: IMatch | undefined = undefined;
	for (const match of sortedMatches) {

		// if we have no current match or the matches
		// do not overlap, we take it as is and remember
		// it for future merging
		if (!currentMatch || !matchOverlaps(currentMatch, match)) {
			currentMatch = match;
			normalizedMatches.push(match);
		}

		// otherwise we merge the matches
		else {
			currentMatch.start = Math.min(currentMatch.start, match.start);
			currentMatch.end = Math.max(currentMatch.end, match.end);
		}
	}

	return normalizedMatches;
}

function matchOverlaps(matchA: IMatch, matchB: IMatch): boolean {
	if (matchA.end < matchB.start) {
		return false;	// A ends before B starts
	}

	if (matchB.end < matchA.start) {
		return false; // B ends before A starts
	}

	return true;
}

//#endregion


//#region Comparers

export function compareItemsByFuzzyScore<T>(itemA: T, itemB: T, query: IPreparedQuery, allowNonContiguousMatches: boolean, accessor: IItemAccessor<T>, cache: FuzzyScorerCache): number {
	const itemScoreA = scoreItemFuzzy(itemA, query, allowNonContiguousMatches, accessor, cache);
	const itemScoreB = scoreItemFuzzy(itemB, query, allowNonContiguousMatches, accessor, cache);

	const scoreA = itemScoreA.score;
	const scoreB = itemScoreB.score;

	// 1.) identity matches have highest score
	if (scoreA === PATH_IDENTITY_SCORE || scoreB === PATH_IDENTITY_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === PATH_IDENTITY_SCORE ? -1 : 1;
		}
	}

	// 2.) matches on label are considered higher compared to label+description matches
	if (scoreA > LABEL_SCORE_THRESHOLD || scoreB > LABEL_SCORE_THRESHOLD) {
		if (scoreA !== scoreB) {
			return scoreA > scoreB ? -1 : 1;
		}

		// prefer more compact matches over longer in label (unless this is a prefix match where
		// longer prefix matches are actually preferred)
		if (scoreA < LABEL_PREFIX_SCORE_THRESHOLD && scoreB < LABEL_PREFIX_SCORE_THRESHOLD) {
			const comparedByMatchLength = compareByMatchLength(itemScoreA.labelMatch, itemScoreB.labelMatch);
			if (comparedByMatchLength !== 0) {
				return comparedByMatchLength;
			}
		}

		// prefer shorter labels over longer labels
		const labelA = accessor.getItemLabel(itemA) || '';
		const labelB = accessor.getItemLabel(itemB) || '';
		if (labelA.length !== labelB.length) {
			return labelA.length - labelB.length;
		}
	}

	// 3.) compare by score in label+description
	if (scoreA !== scoreB) {
		return scoreA > scoreB ? -1 : 1;
	}

	// 4.) scores are identical: prefer matches in label over non-label matches
	const itemAHasLabelMatches = Array.isArray(itemScoreA.labelMatch) && itemScoreA.labelMatch.length > 0;
	const itemBHasLabelMatches = Array.isArray(itemScoreB.labelMatch) && itemScoreB.labelMatch.length > 0;
	if (itemAHasLabelMatches && !itemBHasLabelMatches) {
		return -1;
	} else if (itemBHasLabelMatches && !itemAHasLabelMatches) {
		return 1;
	}

	// 5.) scores are identical: prefer more compact matches (label and description)
	const itemAMatchDistance = computeLabelAndDescriptionMatchDistance(itemA, itemScoreA, accessor);
	const itemBMatchDistance = computeLabelAndDescriptionMatchDistance(itemB, itemScoreB, accessor);
	if (itemAMatchDistance && itemBMatchDistance && itemAMatchDistance !== itemBMatchDistance) {
		return itemBMatchDistance > itemAMatchDistance ? -1 : 1;
	}

	// 6.) scores are identical: start to use the fallback compare
	return fallbackCompare(itemA, itemB, query, accessor);
}

function computeLabelAndDescriptionMatchDistance<T>(item: T, score: IItemScore, accessor: IItemAccessor<T>): number {
	let matchStart: number = -1;
	let matchEnd: number = -1;

	// If we have description matches, the start is first of description match
	if (score.descriptionMatch && score.descriptionMatch.length) {
		matchStart = score.descriptionMatch[0].start;
	}

	// Otherwise, the start is the first label match
	else if (score.labelMatch && score.labelMatch.length) {
		matchStart = score.labelMatch[0].start;
	}

	// If we have label match, the end is the last label match
	// If we had a description match, we add the length of the description
	// as offset to the end to indicate this.
	if (score.labelMatch && score.labelMatch.length) {
		matchEnd = score.labelMatch[score.labelMatch.length - 1].end;
		if (score.descriptionMatch && score.descriptionMatch.length) {
			const itemDescription = accessor.getItemDescription(item);
			if (itemDescription) {
				matchEnd += itemDescription.length;
			}
		}
	}

	// If we have just a description match, the end is the last description match
	else if (score.descriptionMatch && score.descriptionMatch.length) {
		matchEnd = score.descriptionMatch[score.descriptionMatch.length - 1].end;
	}

	return matchEnd - matchStart;
}

function compareByMatchLength(matchesA?: IMatch[], matchesB?: IMatch[]): number {
	if ((!matchesA && !matchesB) || ((!matchesA || !matchesA.length) && (!matchesB || !matchesB.length))) {
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

function fallbackCompare<T>(itemA: T, itemB: T, query: IPreparedQuery, accessor: IItemAccessor<T>): number {

	// check for label + description length and prefer shorter
	const labelA = accessor.getItemLabel(itemA) || '';
	const labelB = accessor.getItemLabel(itemB) || '';

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
		return compareAnything(labelA, labelB, query.normalized);
	}

	// compare by description
	if (descriptionA && descriptionB && descriptionA !== descriptionB) {
		return compareAnything(descriptionA, descriptionB, query.normalized);
	}

	// compare by path
	if (pathA && pathB && pathA !== pathB) {
		return compareAnything(pathA, pathB, query.normalized);
	}

	// equal
	return 0;
}

//#endregion


//#region Query Normalizer

export interface IPreparedQueryPiece {

	/**
	 * The original query as provided as input.
	 */
	original: string;
	originalLowercase: string;

	/**
	 * Original normalized to platform separators:
	 * - Windows: \
	 * - Posix: /
	 */
	pathNormalized: string;

	/**
	 * In addition to the normalized path, will have
	 * whitespace and wildcards removed.
	 */
	normalized: string;
	normalizedLowercase: string;

	/**
	 * The query is wrapped in quotes which means
	 * this query must be a substring of the input.
	 * In other words, no fuzzy matching is used.
	 */
	expectContiguousMatch: boolean;
}

export interface IPreparedQuery extends IPreparedQueryPiece {

	/**
	 * Query split by spaces into pieces.
	 */
	values: IPreparedQueryPiece[] | undefined;

	/**
	 * Whether the query contains path separator(s) or not.
	 */
	containsPathSeparator: boolean;
}

/*
 * If a query is wrapped in quotes, the user does not want to
 * use fuzzy search for this query.
 */
function queryExpectsExactMatch(query: string) {
	return query.startsWith('"') && query.endsWith('"');
}

/**
 * Helper function to prepare a search value for scoring by removing unwanted characters
 * and allowing to score on multiple pieces separated by whitespace character.
 */
const MULTIPLE_QUERY_VALUES_SEPARATOR = ' ';
export function prepareQuery(original: string): IPreparedQuery {
	if (typeof original !== 'string') {
		original = '';
	}

	const originalLowercase = original.toLowerCase();
	const { pathNormalized, normalized, normalizedLowercase } = normalizeQuery(original);
	const containsPathSeparator = pathNormalized.indexOf(sep) >= 0;
	const expectExactMatch = queryExpectsExactMatch(original);

	let values: IPreparedQueryPiece[] | undefined = undefined;

	const originalSplit = original.split(MULTIPLE_QUERY_VALUES_SEPARATOR);
	if (originalSplit.length > 1) {
		for (const originalPiece of originalSplit) {
			const expectExactMatchPiece = queryExpectsExactMatch(originalPiece);
			const {
				pathNormalized: pathNormalizedPiece,
				normalized: normalizedPiece,
				normalizedLowercase: normalizedLowercasePiece
			} = normalizeQuery(originalPiece);

			if (normalizedPiece) {
				if (!values) {
					values = [];
				}

				values.push({
					original: originalPiece,
					originalLowercase: originalPiece.toLowerCase(),
					pathNormalized: pathNormalizedPiece,
					normalized: normalizedPiece,
					normalizedLowercase: normalizedLowercasePiece,
					expectContiguousMatch: expectExactMatchPiece
				});
			}
		}
	}

	return { original, originalLowercase, pathNormalized, normalized, normalizedLowercase, values, containsPathSeparator, expectContiguousMatch: expectExactMatch };
}

function normalizeQuery(original: string): { pathNormalized: string; normalized: string; normalizedLowercase: string } {
	let pathNormalized: string;
	if (isWindows) {
		pathNormalized = original.replace(/\//g, sep); // Help Windows users to search for paths when using slash
	} else {
		pathNormalized = original.replace(/\\/g, sep); // Help macOS/Linux users to search for paths when using backslash
	}

	// remove certain characters that help find better results:
	// - quotes: are used for exact match search
	// - wildcards: are used for fuzzy matching
	// - whitespace: are used to separate queries
	// - ellipsis: sometimes used to indicate any path segments
	const normalized = pathNormalized.replace(/[\*\u2026\s"]/g, '');

	return {
		pathNormalized,
		normalized,
		normalizedLowercase: normalized.toLowerCase()
	};
}

export function pieceToQuery(piece: IPreparedQueryPiece): IPreparedQuery;
export function pieceToQuery(pieces: IPreparedQueryPiece[]): IPreparedQuery;
export function pieceToQuery(arg1: IPreparedQueryPiece | IPreparedQueryPiece[]): IPreparedQuery {
	if (Array.isArray(arg1)) {
		return prepareQuery(arg1.map(piece => piece.original).join(MULTIPLE_QUERY_VALUES_SEPARATOR));
	}

	return prepareQuery(arg1.original);
}

//#endregion
