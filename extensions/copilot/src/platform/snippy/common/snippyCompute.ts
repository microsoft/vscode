/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import unicodeDigits from '@unicode/unicode-15.0.0/General_Category/Decimal_Number/regex.mjs';
import unicodeLetters from '@unicode/unicode-15.0.0/General_Category/Letter/regex.mjs';
import unicodePunctuation from '@unicode/unicode-15.0.0/General_Category/Punctuation/regex.mjs';
import unicodeSymbols from '@unicode/unicode-15.0.0/General_Category/Symbol/regex.mjs';

// Pin the server tokenizer's Unicode categories rather than inheriting the JavaScript runtime's version.
const SnippyLexemeRegex = new RegExp(`(?:_|${unicodeLetters.source}|${unicodeDigits.source})+|====+|----+|####+|////+|\\*{4,}|${unicodePunctuation.source}|${unicodeSymbols.source}`, 'g');

// Client-side Match minimum in Snippy lexemes; the server minimum is index-specific.
export const MinTokenLength = 110;
export const MaxTokenLength = 3000;

export function lexemeLength(text: string, limit = MinTokenLength) {
	let count = 0;
	for (const _match of text.matchAll(SnippyLexemeRegex)) {
		count++;
		if (count >= limit) {
			break;
		}
	}
	return count;
}

/** Return the start of the last `n` lexemes beginning before `beforeOffset`, without splitting tokens. */
export function offsetLastLexemes(text: string, n: number, beforeOffset = text.length) {
	if (n === 0) {
		return beforeOffset;
	}
	const offsets = new Array<number>(n);
	let count = 0;
	for (const match of text.matchAll(SnippyLexemeRegex)) {
		if (match.index >= beforeOffset) {
			break;
		}
		offsets[count % n] = match.index;
		count++;
	}
	return count < n ? 0 : offsets[count % n];
}

export function hasMinLexemeLength(text: string) {
	return lexemeLength(text) >= MinTokenLength;
}

type MatchSource = { source: string; startOffset: number } | { reason: 'empty' | 'tooShort' | 'tooLong' | 'invalidUnicode' };

/** Build a bounded Match source from the insertion and genuine preceding document context. */
export function computeMatchSource(prefix: string, completion: string): MatchSource {
	if (completion === '') {
		return { reason: 'empty' };
	}
	const completionLength = lexemeLength(completion, MaxTokenLength + 1);
	if (completionLength > MaxTokenLength) {
		return { reason: 'tooLong' };
	}

	let source = completion;
	let startOffset = prefix.length;
	if (completionLength < MinTokenLength) {
		const combined = prefix + completion;
		// Tokenize across the join: identifiers and separator runs can merge with the insertion.
		startOffset = offsetLastLexemes(combined, MinTokenLength, prefix.length);
		source = combined.slice(startOffset);
	}

	// In Unicode mode this range matches only unpaired surrogates.
	if (/[\uD800-\uDFFF]/u.test(source)) {
		return { reason: 'invalidUnicode' };
	}
	const length = lexemeLength(source, MaxTokenLength + 1);
	if (length < MinTokenLength) {
		return { reason: 'tooShort' };
	}
	if (length > MaxTokenLength) {
		return { reason: 'tooLong' };
	}
	return { source, startOffset };
}
