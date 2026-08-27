/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import { InsertSpaces } from '../core/misc/indentation.js';
import { ITextBuffer } from '../model.js';

class SpacesDiffResult {
	public spacesDiff: number = 0;
	public looksLikeAlignment: boolean = false;
}
// TODO: reread
interface IndentationSample {
	readonly tabsCount: number;
	readonly spacesCount: number;
	readonly hasTabAfterSpace: boolean;
}

function scoreMixedTabSize(samples: readonly IndentationSample[], tabSize: number, indentSize: number): number {
	let score = 0;
	let previousVisibleColumn: number | undefined;

	for (const sample of samples) {
		if (sample.hasTabAfterSpace) {
			previousVisibleColumn = undefined;
			continue;
		}
		if (sample.tabsCount > 0 && sample.spacesCount >= tabSize) {
			return -1;
		}

		const visibleColumn = sample.tabsCount * tabSize + sample.spacesCount;
		if (visibleColumn > 0 && visibleColumn % indentSize === 0) {
			score++;
		}
		if (previousVisibleColumn !== undefined && Math.abs(visibleColumn - previousVisibleColumn) === indentSize) {
			score += samples.length + 1;
		}
		previousVisibleColumn = visibleColumn;
	}

	return score;
}

function guessMixedTabSize(samples: readonly IndentationSample[], defaultTabSize: number, indentSize: number, candidates: readonly number[]): number {
	if (samples.filter(sample => !sample.hasTabAfterSpace && (sample.tabsCount > 0 || sample.spacesCount > 0)).length < 2) {
		return defaultTabSize;
	}

	let tabSize = defaultTabSize;
	let bestScore = scoreMixedTabSize(samples, defaultTabSize, indentSize);

	for (const candidate of candidates) {
		const candidateScore = scoreMixedTabSize(samples, candidate, indentSize);
		if (candidateScore > bestScore) {
			tabSize = candidate;
			bestScore = candidateScore;
		}
	}

	return tabSize;
}

/**
 * Compute the diff in spaces between two line's indentation.
 */
function spacesDiff(a: string, aLength: number, b: string, bLength: number, result: SpacesDiffResult): void {

	result.spacesDiff = 0;
	result.looksLikeAlignment = false;

	// This can go both ways (e.g.):
	//  - a: "\t"
	//  - b: "\t    "
	//  => This should count 1 tab and 4 spaces

	let i: number;

	for (i = 0; i < aLength && i < bLength; i++) {
		const aCharCode = a.charCodeAt(i);
		const bCharCode = b.charCodeAt(i);

		if (aCharCode !== bCharCode) {
			break;
		}
	}

	let aSpacesCnt = 0, aTabsCount = 0;
	for (let j = i; j < aLength; j++) {
		const aCharCode = a.charCodeAt(j);
		if (aCharCode === CharCode.Space) {
			aSpacesCnt++;
		} else {
			aTabsCount++;
		}
	}

	let bSpacesCnt = 0, bTabsCount = 0;
	for (let j = i; j < bLength; j++) {
		const bCharCode = b.charCodeAt(j);
		if (bCharCode === CharCode.Space) {
			bSpacesCnt++;
		} else {
			bTabsCount++;
		}
	}

	if (aSpacesCnt > 0 && aTabsCount > 0) {
		return;
	}
	if (bSpacesCnt > 0 && bTabsCount > 0) {
		return;
	}

	const tabsDiff = Math.abs(aTabsCount - bTabsCount);
	const spacesDiff = Math.abs(aSpacesCnt - bSpacesCnt);

	if (tabsDiff === 0) {
		// check if the indentation difference might be caused by alignment reasons
		// sometime folks like to align their code, but this should not be used as a hint
		result.spacesDiff = spacesDiff;

		if (spacesDiff > 0 && 0 <= bSpacesCnt - 1 && bSpacesCnt - 1 < a.length && bSpacesCnt < b.length) {
			if (b.charCodeAt(bSpacesCnt) !== CharCode.Space && a.charCodeAt(bSpacesCnt - 1) === CharCode.Space) {
				if (a.charCodeAt(a.length - 1) === CharCode.Comma) {
					// This looks like an alignment desire: e.g.
					// const a = b + c,
					//       d = b - c;
					result.looksLikeAlignment = true;
				}
			}
		}
		return;
	}
	if (spacesDiff % tabsDiff === 0) {
		result.spacesDiff = spacesDiff / tabsDiff;
		return;
	}
}

/**
 * Result for a guessIndentation
 */
export interface IGuessedIndentation {
	/**
	 * If indentation is based on spaces, then what is the number of spaces that make an indent?
	 */
	tabSize: number;
	/**
	 * How indentation whitespace should be inserted.
	 */
	insertSpaces: InsertSpaces;
	/**
	 * The number of columns used for one indentation level.
	 */
	indentSize: number;
}

export function guessIndentation(source: ITextBuffer, defaultTabSize: number, defaultInsertSpaces: InsertSpaces, defaultIndentSize: number = defaultTabSize): IGuessedIndentation {
	// Look at most at the first 10k lines
	const linesCount = Math.min(source.getLineCount(), 10000);

	let linesIndentedWithTabsCount = 0;				// number of lines that contain at least one tab in indentation
	let linesIndentedWithSpacesCount = 0;			// number of lines that contain only spaces in indentation
	let linesIndentedWithCanonicalMixedWhitespaceCount = 0;
	const indentationSamples: IndentationSample[] = [];

	let previousLineText = '';						// content of latest line that contained non-whitespace chars
	let previousLineIndentation = 0;				// index at which latest line contained the first non-whitespace char

	const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7];	// prefer even guesses for `tabSize`, limit to [2, 8].
	const MAX_ALLOWED_TAB_SIZE_GUESS = 8;			// max(ALLOWED_TAB_SIZE_GUESSES) = 8

	const spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];		// `tabSize` scores
	const tmp = new SpacesDiffResult();

	for (let lineNumber = 1; lineNumber <= linesCount; lineNumber++) {
		const currentLineLength = source.getLineLength(lineNumber);
		const currentLineText = source.getLineContent(lineNumber);

		// if the text buffer is chunk based, so long lines are cons-string, v8 will flattern the string when we check charCode.
		// checking charCode on chunks directly is cheaper.
		const useCurrentLineText = (currentLineLength <= 65536);

		let currentLineHasContent = false;			// does `currentLineText` contain non-whitespace chars
		let currentLineIndentation = 0;				// index at which `currentLineText` contains the first non-whitespace char
		let currentLineSpacesCount = 0;				// count of spaces found in `currentLineText` indentation
		let currentLineTabsCount = 0;				// count of tabs found in `currentLineText` indentation
		let currentLineHasTabAfterSpace = false;
		for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
			const charCode = (useCurrentLineText ? currentLineText.charCodeAt(j) : source.getLineCharCode(lineNumber, j));

			if (charCode === CharCode.Tab) {
				currentLineHasTabAfterSpace = currentLineHasTabAfterSpace || currentLineSpacesCount > 0;
				currentLineTabsCount++;
			} else if (charCode === CharCode.Space) {
				currentLineSpacesCount++;
			} else {
				// Hit non whitespace character on this line
				currentLineHasContent = true;
				currentLineIndentation = j;
				break;
			}
		}

		// Ignore empty or only whitespace lines
		if (!currentLineHasContent) {
			continue;
		}

		if (currentLineTabsCount > 0) {
			linesIndentedWithTabsCount++;
			if (currentLineSpacesCount > 0) {
				if (!currentLineHasTabAfterSpace) {
					linesIndentedWithCanonicalMixedWhitespaceCount++;
				}
			}
		} else if (currentLineSpacesCount > 1) {
			linesIndentedWithSpacesCount++;
		}
		indentationSamples.push({
			tabsCount: currentLineTabsCount,
			spacesCount: currentLineSpacesCount,
			hasTabAfterSpace: currentLineHasTabAfterSpace
		});

		spacesDiff(previousLineText, previousLineIndentation, currentLineText, currentLineIndentation, tmp);

		if (tmp.looksLikeAlignment) {
			// if defaultInsertSpaces === true && the spaces count == tabSize, we may want to count it as valid indentation
			//
			// - item1
			//   - item2
			//
			// otherwise skip this line entirely
			//
			// const a = 1,
			//       b = 2;

			if (!(defaultInsertSpaces === InsertSpaces.Spaces && defaultTabSize === tmp.spacesDiff)) {
				continue;
			}
		}

		const currentSpacesDiff = tmp.spacesDiff;
		if (currentSpacesDiff <= MAX_ALLOWED_TAB_SIZE_GUESS) {
			spacesDiffCount[currentSpacesDiff]++;
		}

		previousLineText = currentLineText;
		previousLineIndentation = currentLineIndentation;
	}

	let insertSpaces: InsertSpaces = defaultInsertSpaces;
	if (defaultInsertSpaces === InsertSpaces.Mixed ||
		(linesIndentedWithCanonicalMixedWhitespaceCount > 1 && (
			linesIndentedWithSpacesCount > 0
			|| linesIndentedWithCanonicalMixedWhitespaceCount === linesIndentedWithTabsCount
		))) {
		insertSpaces = InsertSpaces.Mixed;
	} else if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
		insertSpaces = linesIndentedWithTabsCount < linesIndentedWithSpacesCount ? InsertSpaces.Spaces : InsertSpaces.Tabs;
	}

	let tabSize = defaultTabSize;
	let indentSize = insertSpaces === InsertSpaces.Mixed ? defaultIndentSize : defaultTabSize;

	if (insertSpaces !== InsertSpaces.Tabs) {
		let indentSizeScore = 0;
		ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
			const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
			if (possibleTabSizeScore > indentSizeScore) {
				indentSizeScore = possibleTabSizeScore;
				indentSize = possibleTabSize;
			}
		});

		// Let a tabSize of 2 win over 4 only if it has at least 2/3 of the occurrences of 4
		// This helps detect 2-space indentation in cases like YAML files where there might be
		// some 4-space diffs from deeper nesting, while still preferring 4 when it's clearly predominant
		if (indentSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= spacesDiffCount[4] * 2 / 3) {
			indentSize = 2;
		}

		if (insertSpaces === InsertSpaces.Spaces) {
			tabSize = indentSize;
		} else {
			tabSize = guessMixedTabSize(indentationSamples, defaultTabSize, indentSize, ALLOWED_TAB_SIZE_GUESSES);
		}
	}

	// console.log('--------------------------');
	// console.log('linesIndentedWithTabsCount: ' + linesIndentedWithTabsCount + ', linesIndentedWithSpacesCount: ' + linesIndentedWithSpacesCount);
	// console.log('spacesDiffCount: ' + spacesDiffCount);
	// console.log('tabSize: ' + tabSize + ', tabSizeScore: ' + tabSizeScore);

	return {
		insertSpaces: insertSpaces,
		tabSize: tabSize,
		indentSize: indentSize
	};
}
