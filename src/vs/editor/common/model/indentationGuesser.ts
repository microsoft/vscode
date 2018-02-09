/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';
import { ITextBuffer } from 'vs/editor/common/model';

/**
 * Compute the diff in spaces between two line's indentation.
 */
function spacesDiff(a: string, aLength: number, b: string, bLength: number): number {

	// This can go both ways (e.g.):
	//  - a: "\t"
	//  - b: "\t    "
	//  => This should count 1 tab and 4 spaces

	let i: number;

	for (i = 0; i < aLength && i < bLength; i++) {
		let aCharCode = a.charCodeAt(i);
		let bCharCode = b.charCodeAt(i);

		if (aCharCode !== bCharCode) {
			break;
		}
	}

	let aSpacesCnt = 0, aTabsCount = 0;
	for (let j = i; j < aLength; j++) {
		let aCharCode = a.charCodeAt(j);
		if (aCharCode === CharCode.Space) {
			aSpacesCnt++;
		} else {
			aTabsCount++;
		}
	}

	let bSpacesCnt = 0, bTabsCount = 0;
	for (let j = i; j < bLength; j++) {
		let bCharCode = b.charCodeAt(j);
		if (bCharCode === CharCode.Space) {
			bSpacesCnt++;
		} else {
			bTabsCount++;
		}
	}

	if (aSpacesCnt > 0 && aTabsCount > 0) {
		return 0;
	}
	if (bSpacesCnt > 0 && bTabsCount > 0) {
		return 0;
	}

	let tabsDiff = Math.abs(aTabsCount - bTabsCount);
	let spacesDiff = Math.abs(aSpacesCnt - bSpacesCnt);

	if (tabsDiff === 0) {
		return spacesDiff;
	}
	if (spacesDiff % tabsDiff === 0) {
		return spacesDiff / tabsDiff;
	}
	return 0;
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
}

export function guessIndentation(source: ITextBuffer, defaultTabSize: number, defaultInsertSpaces: boolean): IGuessedIndentation {
	// Look at most at the first 10k lines
	const linesCount = Math.min(source.getLineCount(), 10000);

	let linesIndentedWithTabsCount = 0;				// number of lines that contain at least one tab in indentation
	let linesIndentedWithSpacesCount = 0;			// number of lines that contain only spaces in indentation

	let previousLineText = '';						// content of latest line that contained non-whitespace chars
	let previousLineIndentation = 0;				// index at which latest line contained the first non-whitespace char

	const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8];	// limit guesses for `tabSize` to 2, 4, 6 or 8.
	const MAX_ALLOWED_TAB_SIZE_GUESS = 8;			// max(2,4,6,8) = 8

	let spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];		// `tabSize` scores

	for (let lineNumber = 1; lineNumber <= linesCount; lineNumber++) {
		let currentLineLength = source.getLineLength(lineNumber);
		let currentLineText = source.getLineContent(lineNumber);
		let charCodeAt: (offset: number) => number;
		if (currentLineLength > 65536) {
			// if the text buffer is chunk based, so long lines are cons-string, v8 will flattern the string when we check charCode.
			// checking charCode on chunks directly is cheaper.
			charCodeAt = (offset: number) => source.getLineCharCode(lineNumber, offset);
		} else {
			charCodeAt = (offset: number) => currentLineText.charCodeAt(offset);
		}

		let currentLineHasContent = false;			// does `currentLineText` contain non-whitespace chars
		let currentLineIndentation = 0;				// index at which `currentLineText` contains the first non-whitespace char
		let currentLineSpacesCount = 0;				// count of spaces found in `currentLineText` indentation
		let currentLineTabsCount = 0;				// count of tabs found in `currentLineText` indentation
		for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
			let charCode = charCodeAt(j);

			if (charCode === CharCode.Tab) {
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
		} else if (currentLineSpacesCount > 1) {
			linesIndentedWithSpacesCount++;
		}

		let currentSpacesDiff = spacesDiff(previousLineText, previousLineIndentation, currentLineText, currentLineIndentation);
		if (currentSpacesDiff <= MAX_ALLOWED_TAB_SIZE_GUESS) {
			spacesDiffCount[currentSpacesDiff]++;
		}

		previousLineText = currentLineText;
		previousLineIndentation = currentLineIndentation;
	}

	// Take into account the last line as well
	let deltaSpacesCount = spacesDiff(previousLineText, previousLineIndentation, '', 0);
	if (deltaSpacesCount <= MAX_ALLOWED_TAB_SIZE_GUESS) {
		spacesDiffCount[deltaSpacesCount]++;
	}

	let insertSpaces = defaultInsertSpaces;
	if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
		insertSpaces = (linesIndentedWithTabsCount < linesIndentedWithSpacesCount);
	}

	let tabSize = defaultTabSize;
	let tabSizeScore = (insertSpaces ? 0 : 0.1 * linesCount);

	// console.log("score threshold: " + tabSizeScore);

	ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
		let possibleTabSizeScore = spacesDiffCount[possibleTabSize];
		if (possibleTabSizeScore > tabSizeScore) {
			tabSizeScore = possibleTabSizeScore;
			tabSize = possibleTabSize;
		}
	});


	// console.log('--------------------------');
	// console.log('linesIndentedWithTabsCount: ' + linesIndentedWithTabsCount + ', linesIndentedWithSpacesCount: ' + linesIndentedWithSpacesCount);
	// console.log('spacesDiffCount: ' + spacesDiffCount);
	// console.log('tabSize: ' + tabSize + ', tabSizeScore: ' + tabSizeScore);

	return {
		insertSpaces: insertSpaces,
		tabSize: tabSize
	};
}
