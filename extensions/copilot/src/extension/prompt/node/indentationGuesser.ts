/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FormattingOptions, TextDocument } from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import * as strings from '../../../util/vs/base/common/strings';
import { isLines, Lines } from './editGeneration';

/**
 * An inlined enum containing useful character codes (to be used with String.charCodeAt).
 * Please leave the const keyword such that it gets inlined when compiled to JavaScript!
 */
const enum CharCode {
	/**
	 * The `\t` character.
	 */
	Tab = 9,
	Space = 32,
	/**
	 * The `,` character.
	 */
	Comma = 44,
}

export interface IIndentationTextBuffer {
	getLineCount(): number;
	getLineLength(lineNumber: number): number;
	getLineContent(lineNumber: number): string;
}

class SpacesDiffResult {
	public spacesDiff = 0;
	public looksLikeAlignment = false;
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

	let aSpacesCnt = 0,
		aTabsCount = 0;
	for (let j = i; j < aLength; j++) {
		const aCharCode = a.charCodeAt(j);
		if (aCharCode === CharCode.Space) {
			aSpacesCnt++;
		} else {
			aTabsCount++;
		}
	}

	let bSpacesCnt = 0,
		bTabsCount = 0;
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
}

export function guessFileIndentInfo(source: Lines | TextDocument | TextDocumentSnapshot): FormattingOptions {
	return { ...guessIndentation(source, 4, false) };
}

export function guessIndentation(
	source: Lines | TextDocument | TextDocumentSnapshot,
	defaultTabSize: number,
	defaultInsertSpaces: boolean
): IGuessedIndentation {
	// Look at most at the first 10k lines
	const linesCount = Math.min(isLines(source) ? source.length : source.lineCount, 10000);

	let linesIndentedWithTabsCount = 0; // number of lines that contain at least one tab in indentation
	let linesIndentedWithSpacesCount = 0; // number of lines that contain only spaces in indentation

	let previousLineText = ''; // content of latest line that contained non-whitespace chars
	let previousLineIndentation = 0; // index at which latest line contained the first non-whitespace char

	const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7]; // prefer even guesses for `tabSize`, limit to [2, 8].
	const MAX_ALLOWED_TAB_SIZE_GUESS = 8; // max(ALLOWED_TAB_SIZE_GUESSES) = 8

	const spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // `tabSize` scores
	const tmp = new SpacesDiffResult();

	for (let lineNumber = 0; lineNumber < linesCount; lineNumber++) {
		const currentLineText = isLines(source) ? source[lineNumber] : source.lineAt(lineNumber).text;
		const currentLineLength = currentLineText.length;

		let currentLineHasContent = false; // does `currentLineText` contain non-whitespace chars
		let currentLineIndentation = 0; // index at which `currentLineText` contains the first non-whitespace char
		let currentLineSpacesCount = 0; // count of spaces found in `currentLineText` indentation
		let currentLineTabsCount = 0; // count of tabs found in `currentLineText` indentation
		for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
			const charCode = currentLineText.charCodeAt(j);

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
		insertSpaces = linesIndentedWithTabsCount < linesIndentedWithSpacesCount;
	}

	let tabSize = defaultTabSize;

	// Guess tabSize only if inserting spaces...
	if (insertSpaces) {
		let tabSizeScore = insertSpaces ? 0 : 0.1 * linesCount;

		// console.log("score threshold: " + tabSizeScore);

		ALLOWED_TAB_SIZE_GUESSES.forEach(possibleTabSize => {
			const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
			if (possibleTabSizeScore > tabSizeScore) {
				tabSizeScore = possibleTabSizeScore;
				tabSize = possibleTabSize;
			}
		});

		// Let a tabSize of 2 win even if it is not the maximum
		// (only in case 4 was guessed)
		if (
			tabSize === 4 &&
			spacesDiffCount[4] > 0 &&
			spacesDiffCount[2] > 0 &&
			spacesDiffCount[2] >= spacesDiffCount[4] / 2
		) {
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
	};
}

/**
 * Returns:
 *  - if the result is positive => the indent level is returned value
 *  - if the result is negative => the line contains only whitespace and the indent level is ~(result)
 */
function computeIndentLevel(line: string, tabSize: number): number {
	let indent = 0;
	let i = 0;
	const len = line.length;

	while (i < len) {
		const chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			indent++;
		} else if (chCode === CharCode.Tab) {
			indent = indent - indent % tabSize + tabSize;
		} else {
			break;
		}
		i++;
	}

	if (i === len) {
		return ~indent; // line only consists of whitespace
	}

	return indent;
}

export function computeIndentLevel2(line: string, tabSize: number): number {
	const result = computeIndentLevel(line, tabSize);
	if (result < 0) {
		return Math.floor(~result / tabSize);
	}
	return Math.floor(result / tabSize);
}

function nextIndentTabStop(visibleColumn: number, indentSize: number): number {
	return visibleColumn + indentSize - visibleColumn % indentSize;
}

function _normalizeIndentationFromWhitespace(str: string, indentSize: number, insertSpaces: boolean): string {
	let spacesCnt = 0;
	for (let i = 0; i < str.length; i++) {
		if (str.charAt(i) === '\t') {
			spacesCnt = nextIndentTabStop(spacesCnt, indentSize);
		} else {
			spacesCnt++;
		}
	}

	let result = '';
	if (!insertSpaces) {
		const tabsCnt = Math.floor(spacesCnt / indentSize);
		spacesCnt = spacesCnt % indentSize;
		for (let i = 0; i < tabsCnt; i++) {
			result += '\t';
		}
	}

	for (let i = 0; i < spacesCnt; i++) {
		result += ' ';
	}

	return result;
}

export function normalizeIndentation(str: string, indentSize: number, insertSpaces: boolean): string {
	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
	if (firstNonWhitespaceIndex === -1) {
		firstNonWhitespaceIndex = str.length;
	}
	return _normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), indentSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
}

export function getIndentationChar(indentation: IGuessedIndentation): string {
	if (indentation.insertSpaces) {
		return ' '.repeat(indentation.tabSize);
	} else {
		return '\t';
	}
}

export function transformIndentation(content: string, fromIndent: IGuessedIndentation, toIndent: IGuessedIndentation): string {
	if (fromIndent.insertSpaces === toIndent.insertSpaces && fromIndent.tabSize === toIndent.tabSize) {
		return content;
	}

	const fromChr = getIndentationChar(fromIndent);
	const toChr = getIndentationChar(toIndent);

	const lines = content.split('\n');
	for (let i = 0; i < lines.length; i++) {
		let k = 0;
		while (lines[i].slice(k, k + fromChr.length) === fromChr) {
			k += fromChr.length;
		}

		lines[i] = toChr.repeat(k / fromChr.length) + lines[i].slice(k);
	}

	return lines.join('\n');
}
