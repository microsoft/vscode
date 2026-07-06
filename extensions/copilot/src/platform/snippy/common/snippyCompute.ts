/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const SnippyLexemeRegex = new RegExp('[_\\p{L}\\p{Nd}]+|====+|----+|####+|////+|\\*\\*\\*\\*+|[\\p{P}\\p{S}]', 'gu');

export const MinTokenLength = 65;
export const SnippyWindowSize = 65;

export function lexemeLength(text: string) {
	let i = 0;
	let m: RegExpExecArray | null;
	SnippyLexemeRegex.lastIndex = 0;
	do {
		m = SnippyLexemeRegex.exec(text);
		if (m) {
			i += 1;
		}

		if (i >= MinTokenLength) {
			break;
		}
	} while (m);
	return i;
}

/** Return the offset after the first `n` lexemes of `text`, counted in Snippy lexemes */
export function offsetFirstLexemes(text: string, n: number) {
	let i = 0;
	let m: RegExpExecArray | null;
	SnippyLexemeRegex.lastIndex = 0;
	do {
		m = SnippyLexemeRegex.exec(text);
		if (m) {
			i += 1;
			if (i >= n) {
				return SnippyLexemeRegex.lastIndex;
			}
		}
	} while (m);
	// The whole text is less than n tokens
	return text.length;
}

/** Return the offset at the beginning of the last `n` lexemes of `text`, counted in Snippy lexemes */
export function offsetLastLexemes(text: string, n: number) {
	const textRev = text.split('').reverse().join('');
	const offsetRev = offsetFirstLexemes(textRev, n);
	return textRev.length - offsetRev;
}

/**
 * Use Snippy to check for a match in the supplied string around a range of interest.
 * - `text`: The text to check for a match.
 * - `interestRange`: The range of interest in the text. Snippy will check for
 *   any match that overlaps with this range, including an appropriate window both before and
 *   after the range.
 */
export function checkInString(text: string, interestRange?: [number, number]) {
	let fromIndex: number, toIndex: number;
	if (interestRange === undefined) {
		fromIndex = 0;
		toIndex = text.length;
	} else {
		fromIndex = offsetLastLexemes(text.slice(0, interestRange[0]), SnippyWindowSize);
		toIndex = interestRange[1] + offsetFirstLexemes(text.slice(interestRange[1]), SnippyWindowSize);
	}

	return function (newText: string, snippet: { text: string }) {
		// Try first to match close to the inserted range.
		let matchOffset = newText.slice(fromIndex, toIndex).indexOf(snippet.text);
		if (matchOffset !== -1) {
			matchOffset += fromIndex;
		} else {
			// If this fails, do global match
			matchOffset = newText.indexOf(snippet.text);
		}
		return {
			foundAt: matchOffset > -1 ? matchOffset : undefined,
		};
	};
}

export function hasMinLexemeLength(text: string) {
	return lexemeLength(text) >= MinTokenLength;
}
