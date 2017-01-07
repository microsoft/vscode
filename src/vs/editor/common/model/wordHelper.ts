/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWordAtPosition } from 'vs/editor/common/editorCommon';

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function createWordRegExp(allowInWords: string = ''): RegExp {
	var usualSeparators = USUAL_WORD_SEPARATORS;
	var source = '(-?\\d*\\.\\d\\w*)|([^';
	for (var i = 0; i < usualSeparators.length; i++) {
		if (allowInWords.indexOf(usualSeparators[i]) >= 0) {
			continue;
		}
		source += '\\' + usualSeparators[i];
	}
	source += '\\s]+)';
	return new RegExp(source, 'g');
}

// catches numbers (including floating numbers) in the first group, and alphanum in the second
export const DEFAULT_WORD_REGEXP = createWordRegExp();

export function ensureValidWordDefinition(wordDefinition?: RegExp): RegExp {
	var result: RegExp = DEFAULT_WORD_REGEXP;

	if (wordDefinition && (wordDefinition instanceof RegExp)) {
		if (!wordDefinition.global) {
			var flags = 'g';
			if (wordDefinition.ignoreCase) {
				flags += 'i';
			}
			if (wordDefinition.multiline) {
				flags += 'm';
			}
			result = new RegExp(wordDefinition.source, flags);
		} else {
			result = wordDefinition;
		}
	}

	result.lastIndex = 0;

	return result;
}

function reverse(str: string): string {
	let reversedStr = '';
	for (let i = str.length - 1; i >= 0; i--) {
		reversedStr += str.charAt(i);
	}
	return reversedStr;
}

function getWordAtPosFast(column: number, wordDefinition: RegExp, text: string, textOffset: number): IWordAtPosition {
	// matches at the desired column, once to right
	// and once to the left. The latter is achived
	// by reversing the string. Falls back to getWordAtPosSlow
	// when a word is longer than 100 characters. Will
	// not work with regular expressions that check the
	// shape of a word, like /aabb/

	let pos = column - 1 - textOffset;
	wordDefinition.lastIndex = pos;
	let rightMatch = wordDefinition.exec(text);
	if (rightMatch && rightMatch.index > pos) {
		// |nW
		rightMatch = null;
	}

	let leftTextReverse = reverse(text.substring(pos - 100, pos));
	wordDefinition.lastIndex = 0;
	let leftMatch = wordDefinition.exec(leftTextReverse);
	if (leftMatch) {

		if (leftMatch.index > 0) {
			// |nW
			leftMatch = null;

		} else if (wordDefinition.lastIndex === 100) {
			// |W*100 -> very long word
			return getWordAtPosSlow(column, wordDefinition, text, textOffset);
		}
	}

	if (!rightMatch && !leftMatch) {
		// nothing matched
		return null;
	}

	let word = '';
	let start = pos;
	let end = pos;

	if (leftMatch) {
		let leftWord = reverse(leftMatch[0]);
		start -= leftWord.length;
		word = leftWord;
	}

	if (rightMatch) {
		let rightWord = rightMatch[0];
		end += rightWord.length;
		word += rightWord;
	}

	return {
		word,
		startColumn: textOffset + 1 + start,
		endColumn: textOffset + 1 + end
	};
}

function getWordAtPosSlow(column: number, wordDefinition: RegExp, text: string, textOffset: number): IWordAtPosition {
	// matches all words starting at the beginning
	// of the input until it finds a match that encloses
	// the desired column. slow but correct

	let pos = column - 1 - textOffset;
	wordDefinition.lastIndex = 0;

	let match: RegExpMatchArray;
	while (match = wordDefinition.exec(text)) {

		if (match.index > pos) {
			// |nW -> matched only after the pos
			return null;

		} else if (wordDefinition.lastIndex >= pos) {
			// W|W -> match encloses pos
			return {
				word: match[0],
				startColumn: textOffset + 1 + match.index,
				endColumn: textOffset + 1 + wordDefinition.lastIndex
			};
		}
	}

	return null;
}

export function getWordAtText(column: number, wordDefinition: RegExp, text: string, textOffset: number): IWordAtPosition {
	const result = getWordAtPosFast(column, wordDefinition, text, textOffset);
	// both (getWordAtPosFast and getWordAtPosSlow) leave the wordDefinition-RegExp
	// in an undefined state and to not confuse other users of the wordDefinition
	// we reset the lastIndex
	wordDefinition.lastIndex = 0;
	return result;
}
