/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareAnything } from './comparers.js';
import { createMatches as createFuzzyMatches, fuzzyScore, isUpper, matchesPrefix } from './filters.js';
import { hash } from './hash.js';
import { sep } from './path.js';
import { isLinux, isWindows } from './platform.js';
import { equalsIgnoreCase } from './strings.js';
const NO_MATCH = 0;
const NO_SCORE = [NO_MATCH, []];
// const DEBUG = true;
// const DEBUG_MATRIX = false;
export function scoreFuzzy(target, query, queryLower, allowNonContiguousMatches) {
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
function doScoreFuzzy(query, queryLower, queryLength, target, targetLower, targetLength, allowNonContiguousMatches) {
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
            let score;
            if (!diagScore && queryIndexGtNull) {
                score = 0;
            }
            else {
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
                targetLower.startsWith(queryLower, targetIndex))) {
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
        }
        else {
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
function computeCharScore(queryCharAtIndex, queryLowerCharAtIndex, target, targetLower, targetIndex, matchesSequenceLength) {
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
function considerAsEqual(a, b) {
    if (a === b) {
        return true;
    }
    // Special case path separators: ignore platform differences
    if (a === '/' || a === '\\') {
        return b === '/' || b === '\\';
    }
    return false;
}
function scoreSeparatorAtPos(charCode) {
    switch (charCode) {
        case 47 /* CharCode.Slash */:
        case 92 /* CharCode.Backslash */:
            return 5; // prefer path separators...
        case 95 /* CharCode.Underline */:
        case 45 /* CharCode.Dash */:
        case 46 /* CharCode.Period */:
        case 32 /* CharCode.Space */:
        case 39 /* CharCode.SingleQuote */:
        case 34 /* CharCode.DoubleQuote */:
        case 58 /* CharCode.Colon */:
            return 4; // ...over other separators
        default:
            return 0;
    }
}
const NO_SCORE2 = [undefined, []];
export function scoreFuzzy2(target, query, patternStart = 0, wordStart = 0) {
    // Score: multiple inputs
    const preparedQuery = query;
    if (preparedQuery.values && preparedQuery.values.length > 1) {
        return doScoreFuzzy2Multiple(target, preparedQuery.values, patternStart, wordStart);
    }
    // Score: single input
    return doScoreFuzzy2Single(target, query, patternStart, wordStart);
}
function doScoreFuzzy2Multiple(target, query, patternStart, wordStart) {
    let totalScore = 0;
    const totalMatches = [];
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
function doScoreFuzzy2Single(target, query, patternStart, wordStart) {
    const score = fuzzyScore(query.normalized, query.normalizedLowercase, patternStart, target, target.toLowerCase(), wordStart, { firstMatchCanBeWeak: true, boostFullMatch: true });
    if (!score) {
        return NO_SCORE2;
    }
    return [score[0], createFuzzyMatches(score)];
}
const NO_ITEM_SCORE = Object.freeze({ score: 0 });
const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE_THRESHOLD = 1 << 17;
const LABEL_SCORE_THRESHOLD = 1 << 16;
function getCacheHash(label, description, allowNonContiguousMatches, query) {
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
export function scoreItemFuzzy(item, query, allowNonContiguousMatches, accessor, cache) {
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
function doScoreItemFuzzy(label, description, path, query, allowNonContiguousMatches) {
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
function doScoreItemFuzzyMultiple(label, description, path, query, preferLabelMatches, allowNonContiguousMatches) {
    let totalScore = 0;
    const totalLabelMatches = [];
    const totalDescriptionMatches = [];
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
function doScoreItemFuzzySingle(label, description, path, query, preferLabelMatches, allowNonContiguousMatches) {
    // Prefer label matches if told so or we have no description
    if (preferLabelMatches || !description) {
        const [labelScore, labelPositions] = scoreFuzzy(label, query.normalized, query.normalizedLowercase, allowNonContiguousMatches && !query.expectContiguousMatch);
        if (labelScore) {
            // If we have a prefix match on the label, we give a much
            // higher baseScore to elevate these matches over others
            // This ensures that typing a file name wins over results
            // that are present somewhere in the label, but not the
            // beginning.
            const labelPrefixMatch = matchesPrefix(query.normalized, label);
            let baseScore;
            if (labelPrefixMatch) {
                baseScore = LABEL_PREFIX_SCORE_THRESHOLD;
                // We give another boost to labels that are short, e.g. given
                // files "window.ts" and "windowActions.ts" and a query of
                // "window", we want "window.ts" to receive a higher score.
                // As such we compute the percentage the query has within the
                // label and add that to the baseScore.
                const prefixLengthBoost = Math.round((query.normalized.length / label.length) * 100);
                baseScore += prefixLengthBoost;
            }
            else {
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
        const [labelDescriptionScore, labelDescriptionPositions] = scoreFuzzy(descriptionAndLabel, query.normalized, query.normalizedLowercase, allowNonContiguousMatches && !query.expectContiguousMatch);
        if (labelDescriptionScore) {
            const labelDescriptionMatches = createMatches(labelDescriptionPositions);
            const labelMatch = [];
            const descriptionMatch = [];
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
function createMatches(offsets) {
    const ret = [];
    if (!offsets) {
        return ret;
    }
    let last;
    for (const pos of offsets) {
        if (last && last.end === pos) {
            last.end += 1;
        }
        else {
            last = { start: pos, end: pos + 1 };
            ret.push(last);
        }
    }
    return ret;
}
function normalizeMatches(matches) {
    // sort matches by start to be able to normalize
    const sortedMatches = matches.sort((matchA, matchB) => {
        return matchA.start - matchB.start;
    });
    // merge matches that overlap
    const normalizedMatches = [];
    let currentMatch = undefined;
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
function matchOverlaps(matchA, matchB) {
    if (matchA.end < matchB.start) {
        return false; // A ends before B starts
    }
    if (matchB.end < matchA.start) {
        return false; // B ends before A starts
    }
    return true;
}
//#endregion
//#region Comparers
export function compareItemsByFuzzyScore(itemA, itemB, query, allowNonContiguousMatches, accessor, cache) {
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
    }
    else if (itemBHasLabelMatches && !itemAHasLabelMatches) {
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
function computeLabelAndDescriptionMatchDistance(item, score, accessor) {
    let matchStart = -1;
    let matchEnd = -1;
    // If we have description matches, the start is first of description match
    if (score.descriptionMatch?.length) {
        matchStart = score.descriptionMatch[0].start;
    }
    // Otherwise, the start is the first label match
    else if (score.labelMatch?.length) {
        matchStart = score.labelMatch[0].start;
    }
    // If we have label match, the end is the last label match
    // If we had a description match, we add the length of the description
    // as offset to the end to indicate this.
    if (score.labelMatch?.length) {
        matchEnd = score.labelMatch[score.labelMatch.length - 1].end;
        if (score.descriptionMatch?.length) {
            const itemDescription = accessor.getItemDescription(item);
            if (itemDescription) {
                matchEnd += itemDescription.length;
            }
        }
    }
    // If we have just a description match, the end is the last description match
    else if (score.descriptionMatch?.length) {
        matchEnd = score.descriptionMatch[score.descriptionMatch.length - 1].end;
    }
    return matchEnd - matchStart;
}
function compareByMatchLength(matchesA, matchesB) {
    if ((!matchesA && !matchesB) || ((!matchesA?.length) && (!matchesB?.length))) {
        return 0; // make sure to not cause bad comparing when matches are not provided
    }
    if (!matchesB?.length) {
        return -1;
    }
    if (!matchesA?.length) {
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
function fallbackCompare(itemA, itemB, query, accessor) {
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
/*
 * If a query is wrapped in quotes, the user does not want to
 * use fuzzy search for this query.
 */
function queryExpectsExactMatch(query) {
    return query.startsWith('"') && query.endsWith('"');
}
/**
 * Helper function to prepare a search value for scoring by removing unwanted characters
 * and allowing to score on multiple pieces separated by whitespace character.
 */
const MULTIPLE_QUERY_VALUES_SEPARATOR = ' ';
export function prepareQuery(original) {
    if (typeof original !== 'string') {
        original = '';
    }
    const originalLowercase = original.toLowerCase();
    const { pathNormalized, normalized, normalizedLowercase } = normalizeQuery(original);
    const containsPathSeparator = pathNormalized.indexOf(sep) >= 0;
    const expectExactMatch = queryExpectsExactMatch(original);
    let values = undefined;
    const originalSplit = original.split(MULTIPLE_QUERY_VALUES_SEPARATOR);
    if (originalSplit.length > 1) {
        for (const originalPiece of originalSplit) {
            const expectExactMatchPiece = queryExpectsExactMatch(originalPiece);
            const { pathNormalized: pathNormalizedPiece, normalized: normalizedPiece, normalizedLowercase: normalizedLowercasePiece } = normalizeQuery(originalPiece);
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
function normalizeQuery(original) {
    let pathNormalized;
    if (isWindows) {
        pathNormalized = original.replace(/\//g, sep); // Help Windows users to search for paths when using slash
    }
    else {
        pathNormalized = original.replace(/\\/g, sep); // Help macOS/Linux users to search for paths when using backslash
    }
    // remove certain characters that help find better results:
    // - quotes: are used for exact match search
    // - wildcards: are used for fuzzy matching
    // - whitespace: are used to separate queries
    // - ellipsis: sometimes used to indicate any path segments
    // - trailing hash: used by some language servers (e.g. rust-analyzer) as query modifiers
    const normalized = pathNormalized.replace(/[\*\u2026\s"]/g, '').replace(/(?<=.)#$/, '');
    return {
        pathNormalized,
        normalized,
        normalizedLowercase: normalized.toLowerCase()
    };
}
export function pieceToQuery(arg1) {
    if (Array.isArray(arg1)) {
        return prepareQuery(arg1.map(piece => piece.original).join(MULTIPLE_QUERY_VALUES_SEPARATOR));
    }
    return prepareQuery(arg1.original);
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnV6enlTY29yZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDakQsT0FBTyxFQUFFLGFBQWEsSUFBSSxrQkFBa0IsRUFBRSxVQUFVLEVBQVUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDaEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDbkQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBT2hELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQztBQUNuQixNQUFNLFFBQVEsR0FBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUU1QyxzQkFBc0I7QUFDdEIsOEJBQThCO0FBRTlCLE1BQU0sVUFBVSxVQUFVLENBQUMsTUFBYyxFQUFFLEtBQWEsRUFBRSxVQUFrQixFQUFFLHlCQUFrQztJQUMvRyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdkIsT0FBTyxRQUFRLENBQUMsQ0FBQyxnREFBZ0Q7SUFDbEUsQ0FBQztJQUVELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDbkMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUVqQyxJQUFJLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQztRQUNoQyxPQUFPLFFBQVEsQ0FBQyxDQUFDLGlEQUFpRDtJQUNuRSxDQUFDO0lB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