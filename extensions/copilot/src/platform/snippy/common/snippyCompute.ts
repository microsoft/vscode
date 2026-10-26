/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const SnippyLexemeRegex = new RegExp('[_\\p{L}\\p{Nd}]+|====+|----+|####+|////+|\\*\\*\\*\\*+|[\\p{P}\\p{S}]', 'gu');

export const MinTokenLength = 65;

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

export function hasMinLexemeLength(text: string) {
	return lexemeLength(text) >= MinTokenLength;
}
