/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IWordAtPosition} from 'vs/editor/common/editorCommon';

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
export function createWordRegExp(allowInWords:string = ''): RegExp {
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

export function ensureValidWordDefinition(wordDefinition?:RegExp): RegExp {
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

export function getWordAtText(column:number, wordDefinition:RegExp, text:string, textOffset:number): IWordAtPosition {

	// console.log('_getWordAtText: ', column, text, textOffset);

	var words = text.match(wordDefinition),
		k:number,
		startWord:number,
		endWord:number,
		startColumn:number,
		endColumn:number,
		word:string;

	if (words) {
		for (k = 0; k < words.length; k++) {
			word = words[k].trim();
			if (word.length > 0) {
				startWord = text.indexOf(word, endWord);
				endWord = startWord + word.length;

				startColumn = textOffset + startWord + 1;
				endColumn = textOffset + endWord + 1;

				if (startColumn <= column && column <= endColumn) {
					return {
						word: word,
						startColumn: startColumn,
						endColumn: endColumn
					};
				}
			}
		}
	}

	return null;
}
