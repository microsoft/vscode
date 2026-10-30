/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { ITextBuffer } from '../model.js';

class SpacesDiffResult {
	public spacesDiff: number = 0;
	public looksLikeAlignment: boolean = false;
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
	 * If indentation is based on spaces (`insertSpaces` = true), then what is the number of spaces that make an indent?
	 */
	tabSize: number;
	/**
	 * Is indentation based on spaces?
	 */
	insertSpaces: boolean;
	/**
	 * The number of spaces that make up one indentation level, if it could be detected
	 * independently of the render tab stop (`tabSize`). This happens for files that use a
	 * mixed tab/space indentation style (e.g. GNU style: tab size 8, indent size 2).
	 * When `undefined`, no independent indent size was detected.
	 */
	indentSize?: number;
}

/**
 * Check if the file uses the classic mixed tab/space indentation style, where tabs are hard
 * tab stops of (typically) 8 columns and the remaining columns of each indent level are filled
 * up with spaces (e.g. GNU style: tab size 8, indent size 2, where 12 columns of indent are
 * encoded as "\t    "). In that style every indent aligns to a common indentation unit, so look
 * for the largest unit (>= 2) that divides the visual indent column of almost every content
 * line. Whitespace used for alignment (e.g. in comments or on wrapped continuation lines) is
 * not part of the indentation grid and is tolerated on a small fraction of lines.
 *
 * Returns the indentation unit if the mixed style was detected, otherwise `undefined`.
 */
function detectMixedIndentationUnit(contentLineIndentColumns: number[], linesIndentedWithTabsCount: number, linesIndentedWithTabsAndSpacesCount: number): number | undefined {
	if (linesIndentedWithTabsAndSpacesCount < 2 || linesIndentedWithTabsAndSpacesCount < linesIndentedWithTabsCount * 0.25) {
		return undefined;
	}
	const misalignmentTolerance = contentLineIndentColumns.length * 0.05;
	for (let possibleIndentSize = 8; possibleIndentSize >= 2; possibleIndentSize--) {
		let misalignedCount = 0;
		for (const column of contentLineIndentColumns) {
			if (column % possibleIndentSize !== 0) {
				misalignedCount++;
				if (misalignedCount > misalignmentTolerance) {
					break;
				}
			}
		}
		if (misalignedCount <= misalignmentTolerance) {
			return possibleIndentSize;
		}
	}
	return undefined;
}

export function guessIndentation(source: ITextBuffer, defaultTabSize: number, defaultInsertSpaces: boolean): IGuessedIndentation {
	// Look at most at the first 10k lines
	const linesCount = Math.min(source.getLineCount(), 10000);

	let linesIndentedWithTabsCount = 0;				// number of lines that contain at least one tab in indentation
	let linesIndentedWithSpacesCount = 0;			// number of lines that contain only spaces in indentation
	let linesIndentedWithTabsAndSpacesCount = 0;	// number of lines that contain both tabs and spaces in indentation (mixed style)
	const contentLineIndentColumns: number[] = [];	// visual indent column (assuming tab stops of 8) of each content line

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
		let currentLineIndentColumn = 0;			// visual column (assuming tab stops of 8) at which the first non-whitespace char appears
		for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
			const charCode = (useCurrentLineText ? currentLineText.charCodeAt(j) : source.getLineCharCode(lineNumber, j));

			if (charCode === CharCode.Tab) {
				currentLineTabsCount++;
				currentLineIndentColumn = CursorColumns.nextIndentTabStop(currentLineIndentColumn, 8);
			} else if (charCode === CharCode.Space) {
				currentLineSpacesCount++;
				currentLineIndentColumn++;
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

		contentLineIndentColumns.push(currentLineIndentColumn);

		if (currentLineTabsCount > 0) {
			linesIndentedWithTabsCount++;
			if (currentLineSpacesCount > 0) {
				linesIndentedWithTabsAndSpacesCount++;
			}
		} else if (currentLineSpacesCount > 1) {
			linesIndentedWithSpacesCount++;
		}

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

			if (!(defaultInsertSpaces && defaultTabSize === tmp.spacesDiff)) {
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

	let insertSpaces = defaultInsertSpaces;
	if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
		insertSpaces = (linesIndentedWithTabsCount < linesIndentedWithSpacesCount);
	}

	let tabSize = defaultTabSize;
	let indentSize: number | undefined = undefined;

	const mixedIndentationUnit = detectMixedIndentationUnit(contentLineIndentColumns, linesIndentedWithTabsCount, linesIndentedWithTabsAndSpacesCount);
	if (mixedIndentationUnit !== undefined) {
		// Mixed style detected: keep inserting tabs and let `normalizeIndentation` fill up the
		// remaining columns of each indent level with spaces.
		insertSpaces = false;
		tabSize = 8;
		indentSize = mixedIndentationUnit;
	} else if (insertSpaces) {
		// Guess tabSize only if inserting spaces...
		let tabSizeScore = 0;
		ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
			const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
			if (possibleTabSizeScore > tabSizeScore) {
				tabSizeScore = possibleTabSizeScore;
				tabSize = possibleTabSize;
			}
		});

		// Let a tabSize of 2 win over 4 only if it has at least 2/3 of the occurrences of 4
		// This helps detect 2-space indentation in cases like YAML files where there might be
		// some 4-space diffs from deeper nesting, while still preferring 4 when it's clearly predominant
		if (tabSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= spacesDiffCount[4] * 2 / 3) {
			tabSize = 2;
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
