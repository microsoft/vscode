/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';

export interface IIndentationFactors {
	/**
	 * The number of lines that are indented with tabs
	 */
	linesIndentedWithTabs:number;
	/**
	 * relativeSpaceCounts[i] contains the number of times (i spaces) have been encountered in a relative indentation
	 */
	relativeSpaceCounts:number[];
	/**
	 * absoluteSpaceCounts[i] contains the number of times (i spaces) have been encounted in an indentation
	 */
	absoluteSpaceCounts:number[];
}

const __space = ' '.charCodeAt(0);
const __tab = '\t'.charCodeAt(0);

function _extractIndentationFactors(lines:string[]): IIndentationFactors {
	let previousLineTextWithContent = '';		// The content of the previous line that had non whitespace characters
	let previousLineIndentation = 0;			// The char index at which `previousLineTextWithContent` has a non whitespace character
	/**
	 * relativeSpaceCounts[i] contains the number of times (i spaces) have been encountered in a relative indentation
	 */
	let relativeSpaceCounts:number[] = [];
	/**
	 * The total number of tabs that appear in indentations
	 */
	let linesIndentedWithTabs:number = 0;
	/**
	 * absoluteSpaceCounts[i] contains the number of times (i spaces) have been encounted in an indentation
	 */
	let absoluteSpaceCounts:number[] = [];

	for (let i = 0, len = lines.length; i < len; i++) {
		let currentLineText = lines[i];

		let currentLineHasContent = false;
		let currentLineIndentation = 0;
		let tmpSpaceCounts = 0;
		let tmpTabCounts = 0;
		for (let j = 0, lenJ = currentLineText.length; j < lenJ; j++) {
			let charCode = currentLineText.charCodeAt(j);

			if (charCode === __tab) {
				tmpTabCounts++;
			} else if (charCode === __space) {
				tmpSpaceCounts++;
			} else {
				// Hit non whitespace character on this line
				currentLineHasContent = true;
				currentLineIndentation = j;
				break;
			}
		}

		// Ignore `space` if it occurs exactly once in the indentation
		if (tmpSpaceCounts === 1) {
			tmpSpaceCounts = 0;
		}

		if (currentLineHasContent && (tmpTabCounts > 0 || tmpSpaceCounts > 0)) {
			if (tmpTabCounts > 0) {
				linesIndentedWithTabs++;
			}
			if (tmpSpaceCounts > 0) {
				absoluteSpaceCounts[tmpSpaceCounts] = (absoluteSpaceCounts[tmpSpaceCounts] || 0) + 1;
			}
		}

		if (currentLineHasContent) {
			// Only considering lines with content, look at the relative indentation between previous line's indentation and current line's indentation

			// This can go both ways (e.g.):
			//  - previousLineIndentation: "\t\t"
			//  - currentLineIndentation: "\t    "
			//  => This should count 1 tab and 4 spaces
			tmpSpaceCounts = 0;

			let stillMatchingIndentation = true;
			let j:number;
			for (j = 0; j < previousLineIndentation && j < currentLineIndentation; j++) {
				let prevLineCharCode = previousLineTextWithContent.charCodeAt(j);
				let charCode = currentLineText.charCodeAt(j);

				if (stillMatchingIndentation && prevLineCharCode !== charCode) {
					stillMatchingIndentation = false;
				}

				if (!stillMatchingIndentation) {
					if (prevLineCharCode === __space) {
						tmpSpaceCounts++;
					}
					if (charCode === __space) {
						tmpSpaceCounts++;
					}
				}
			}

			for (;j < previousLineIndentation; j++) {
				let prevLineCharCode = previousLineTextWithContent.charCodeAt(j);
				if (prevLineCharCode === __space) {
					tmpSpaceCounts++;
				}
			}

			for (;j < currentLineIndentation; j++) {
				let charCode = currentLineText.charCodeAt(j);
				if (charCode === __space) {
					tmpSpaceCounts++;
				}
			}

			// Ignore `space` if it occurs exactly once in the indentation
			if (tmpSpaceCounts === 1) {
				tmpSpaceCounts = 0;
			}

			if (tmpSpaceCounts > 0) {
				relativeSpaceCounts[tmpSpaceCounts] = (relativeSpaceCounts[tmpSpaceCounts] || 0) + 1;
			}

			previousLineIndentation = currentLineIndentation;
			previousLineTextWithContent = currentLineText;
		}
	}

	return {
		linesIndentedWithTabs: linesIndentedWithTabs,
		relativeSpaceCounts: relativeSpaceCounts,
		absoluteSpaceCounts: absoluteSpaceCounts
	};
}

export function guessIndentation(lines:string[], defaultTabSize:number): editorCommon.IGuessedIndentation {

	let factors = _extractIndentationFactors(lines);
	let linesIndentedWithTabs = factors.linesIndentedWithTabs;
	let absoluteSpaceCounts = factors.absoluteSpaceCounts;
	let relativeSpaceCounts = factors.relativeSpaceCounts;

	// Count the absolute number of times tabs or spaces have been used as indentation
	let linesIndentedWithSpaces = 0;
	for (let i = 1, len = absoluteSpaceCounts.length; i < len; i++) {
		linesIndentedWithSpaces += (absoluteSpaceCounts[i] || 0);
	}

	// let candidate:number,
	// 	candidateScore:number,
	// 	penalization:number,
	// 	m:number,
	let scores:number[] = [];

	for (let candidate = 2, len = absoluteSpaceCounts.length; candidate < len; candidate++) {
		if (!absoluteSpaceCounts[candidate]) {
			continue;
		}

		// Try to compute a score that `candidate` is the `tabSize`
		let candidateScore = 0;
		let penalization = 0;
		for (let m = candidate; m < len; m += candidate) {
			if (absoluteSpaceCounts[m]) {
				candidateScore += absoluteSpaceCounts[m];
			} else {
				// Penalize this candidate, but penalize less with every mutliple..
				penalization += candidate / m;
			}
		}
		scores[candidate] = candidateScore / (1 + penalization);
	}

	// console.log('----------');
	// console.log('linesIndentedWithTabs: ', linesIndentedWithTabs);
	// console.log('absoluteSpaceCounts: ', absoluteSpaceCounts);
	// console.log('relativeSpaceCounts: ', relativeSpaceCounts);
	// console.log('=> linesIndentedWithSpaces: ', linesIndentedWithSpaces);
	// console.log('=> scores: ', scores);

	let bestCandidate = defaultTabSize,
		bestCandidateScore = 0;

	let allowedGuesses = [2, 4, 6, 8];

	for (let i = 0; i < allowedGuesses.length; i++) {
		let candidate = allowedGuesses[i];
		let candidateScore = (scores[candidate] || 0) + (relativeSpaceCounts[candidate] || 0);
		if (candidateScore > bestCandidateScore) {
			bestCandidate = candidate;
			bestCandidateScore = candidateScore;
		}
	}

	let insertSpaces = true;
	if (linesIndentedWithTabs > linesIndentedWithSpaces) {
		// More lines indented with tabs
		insertSpaces = false;
	}

	return {
		insertSpaces: insertSpaces,
		tabSize: bestCandidate
	};
}