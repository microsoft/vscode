/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../base/common/iterator.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * Word inside a model.
 */
export interface IWordAtPosition {
	/**
	 * The word.
	 */
	readonly word: string;
	/**
	 * The column where the word starts.
	 */
	readonly startColumn: number;
	/**
	 * The column where the word ends.
	 */
	readonly endColumn: number;
}

/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function createWordRegExp(allowInWords: string = ''): RegExp {
	let source = '(-?\\d*\\.\\d\\w*)|([^';
	for (const sep of USUAL_WORD_SEPARATORS) {
		if (allowInWords.indexOf(sep) >= 0) {
			continue;
		}
		source += '\\' + sep;
	}
	source += '\\s]+)';
	return new RegExp(source, 'g');
}

// catches numbers (including floating numbers) in the first group, and alphanum in the second
export const DEFAULT_WORD_REGEXP = createWordRegExp();

export function ensureValidWordDefinition(wordDefinition?: RegExp | null): RegExp {
	let result: RegExp = DEFAULT_WORD_REGEXP;

	if (wordDefinition && (wordDefinition instanceof RegExp)) {
		if (!wordDefinition.global) {
			let flags = 'g';
			if (wordDefinition.ignoreCase) {
				flags += 'i';
			}
			if (wordDefinition.multiline) {
				flags += 'm';
			}
			if (wordDefinition.unicode) {
				flags += 'u';
			}
			result = new RegExp(wordDefinition.source, flags);
		} else {
			result = wordDefinition;
		}
	}

	result.lastIndex = 0;

	return result;
}


export interface IGetWordAtTextConfig {
	maxLen: number;
	windowSize: number;
	timeBudget: number;
}


const _defaultConfig = new LinkedList<IGetWordAtTextConfig>();
_defaultConfig.unshift({
	maxLen: 1000,
	windowSize: 15,
	timeBudget: 150
});

export function setDefaultGetWordAtTextConfig(value: IGetWordAtTextConfig) {
	const rm = _defaultConfig.unshift(value);
	return toDisposable(rm);
}

export function getWordAtText(column: number, wordDefinition: RegExp, text: string, textOffset: number, config?: IGetWordAtTextConfig): IWordAtPosition | null {
	// Ensure the regex has the 'g' flag, otherwise this will loop forever
	wordDefinition = ensureValidWordDefinition(wordDefinition);

	if (!config) {
		config = Iterable.first(_defaultConfig)!;
	}

	if (text.length > config.maxLen) {
		// don't throw strings that long at the regexp
		// but use a sub-string in which a word must occur
		let start = column - config.maxLen / 2;
		if (start < 0) {
			start = 0;
		} else {
			textOffset += start;
		}
		text = text.substring(start, column + config.maxLen / 2);
		return getWordAtText(column, wordDefinition, text, textOffset, config);
	}

	const t1 = Date.now();
	const pos = column - 1 - textOffset;

	let prevRegexIndex = -1;
	let match: RegExpExecArray | null = null;

	for (let i = 1; ; i++) {
		// check time budget
		if (Date.now() - t1 >= config.timeBudget) {
			break;
		}

		// reset the index at which the regexp should start matching, also know where it
		// should stop so that subsequent search don't repeat previous searches
		const regexIndex = pos - config.windowSize * i;
		wordDefinition.lastIndex = Math.max(0, regexIndex);
		const thisMatch = _findRegexMatchEnclosingPosition(wordDefinition, text, pos, prevRegexIndex);

		if (!thisMatch && match) {
			// stop: we have something
			break;
		}

		match = thisMatch;

		// stop: searched at start
		if (regexIndex <= 0) {
			break;
		}
		prevRegexIndex = regexIndex;
	}

	if (match) {
		const result = {
			word: match[0],
			startColumn: textOffset + 1 + match.index,
			endColumn: textOffset + 1 + match.index + match[0].length
		};
		wordDefinition.lastIndex = 0;
		return result;
	}

	return null;
}

function _findRegexMatchEnclosingPosition(wordDefinition: RegExp, text: string, pos: number, stopPos: number): RegExpExecArray | null {
	let match: RegExpExecArray | null;
	while (match = wordDefinition.exec(text)) {
		const matchIndex = match.index || 0;
		if (matchIndex <= pos && wordDefinition.lastIndex >= pos) {
			return match;
		} else if (stopPos > 0 && matchIndex > stopPos) {
			return null;
		}
	}
	return null;
}
