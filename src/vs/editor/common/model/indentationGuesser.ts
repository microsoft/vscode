/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';

const __space = ' '.charCodeAt(0);
const __tab = '\t'.charCodeAt(0);

/**
 * Compute the diff in spaces between two line's indentation.
 */
function spacesDiff(a:string, aLength:number, b:string, bLength:number): number {

	// This can go both ways (e.g.):
	//  - a: "\t\t"
	//  - b: "\t    "
	//  => This should count 1 tab and 4 spaces

	let result = 0;
	let stillMatching = true;
	let j:number;

	for (j = 0; j < aLength && j < bLength; j++) {
		let aCharCode = a.charCodeAt(j);
		let bCharCode = b.charCodeAt(j);

		if (stillMatching && aCharCode !== bCharCode) {
			stillMatching = false;
		}

		if (!stillMatching) {
			if (aCharCode === __space) {
				result++;
			}
			if (bCharCode === __space) {
				result++;
			}
		}
	}

	for (;j < aLength; j++) {
		let aCharCode = a.charCodeAt(j);
		if (aCharCode === __space) {
			result++;
		}
	}

	for (;j < bLength; j++) {
		let bCharCode = b.charCodeAt(j);
		if (bCharCode === __space) {
			result++;
		}
	}

	return result;
}

export function guessIndentation(lines:string[], defaultTabSize:number, defaultInsertSpaces:boolean): editorCommon.IGuessedIndentation {
	let linesIndentedWithTabsCount = 0;				// number of lines that contain at least one tab in indentation
	let linesIndentedWithSpacesCount = 0;			// number of lines that contain only spaces in indentation

	let previousLineText = '';						// content of latest line that contained non-whitespace chars
	let previousLineIndentation = 0;				// index at which latest line contained the first non-whitespace char

	const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8];	// limit guesses for `tabSize` to 2, 4, 6 or 8.
	const MAX_ALLOWED_TAB_SIZE_GUESS = 8;			// max(2,4,6,8) = 8

	let spacesDiffCount = [0,0,0,0,0,0,0,0,0];		// `tabSize` scores

	for (let i = 0, len = lines.length; i < len; i++) {
		let currentLineText = lines[i];

		let currentLineHasContent = false;			// does `currentLineText` contain non-whitespace chars
		let currentLineIndentation = 0;				// index at which `currentLineText` contains the first non-whitespace char
		let currentLineSpacesCount = 0;				// count of spaces found in `currentLineText` indentation
		let currentLineTabsCount = 0;				// count of tabs found in `currentLineText` indentation
		for (let j = 0, lenJ = currentLineText.length; j < lenJ; j++) {
			let charCode = currentLineText.charCodeAt(j);

			if (charCode === __tab) {
				currentLineTabsCount++;
			} else if (charCode === __space) {
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

	let tabSize = defaultTabSize;
	let tabSizeScore = 0;
	ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
		let possibleTabSizeScore = spacesDiffCount[possibleTabSize];
		if (possibleTabSizeScore > tabSizeScore) {
			tabSizeScore = possibleTabSizeScore;
			tabSize = possibleTabSize;
		}
	});

	let insertSpaces = defaultInsertSpaces;
	if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
		insertSpaces = (linesIndentedWithTabsCount < linesIndentedWithSpacesCount);
	}

	// let bestInsertS

	// console.log('--------------------------');
	// console.log('linesIndentedWithTabsCount: ' + linesIndentedWithTabsCount + ', linesIndentedWithSpacesCount: ' + linesIndentedWithSpacesCount);
	// console.log('spacesDiffCount: ' + spacesDiffCount);
	// console.log('bestCandidate: ' + bestCandidate + ', bestCandidateScore: ' + bestCandidateScore);

	return {
		insertSpaces: insertSpaces,
		tabSize: tabSize
	};
}
