/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as markedKatexExtension from '../../markdown/common/markedKatexExtension.js';

export interface IWordCountResult {
	value: string;
	returnedWordCount: number;
	totalWordCount: number;
	isFullString: boolean;
}

const r = String.raw;

/**
 * Matches `[text](link title?)` or `[text](<link> title?)`
 *
 * Taken from vscode-markdown-languageservice
 */
const linkPattern =
	r`(?<!\\)` + // Must not start with escape

	// text
	r`(!?\[` + // open prefix match -->
	/**/r`(?:` +
	/*****/r`[^\[\]\\]|` + // Non-bracket chars, or...
	/*****/r`\\.|` + // Escaped char, or...
	/*****/r`\[[^\[\]]*\]` + // Matched bracket pair
	/**/r`)*` +
	r`\])` + // <-- close prefix match

	// Destination
	r`(\(\s*)` + // Pre href
	/**/r`(` +
	/*****/r`[^\s\(\)<](?:[^\s\(\)]|\([^\s\(\)]*?\))*|` + // Link without whitespace, or...
	/*****/r`<(?:\\[<>]|[^<>])+>` + // In angle brackets
	/**/r`)` +

	// Title
	/**/r`\s*(?:"[^"]*"|'[^']*'|\([^\(\)]*\))?\s*` +
	r`\)`;

export function getNWords(str: string, numWordsToCount: number): IWordCountResult {
	// This regex matches each word and skips over whitespace and separators. A word is:
	// A markdown link
	// Inline math
	// One chinese character
	// One or more + - =, handled so that code like "a=1+2-3" is broken up better
	// One or more characters that aren't whitepace or any of the above
	const backtick = '`';

	const wordRegExp = new RegExp('(?:' + linkPattern + ')|(?:' + markedKatexExtension.mathInlineRegExp.source + r`)|\p{sc=Han}|=+|\++|-+|[^\s\|\p{sc=Han}|=|\+|\-|${backtick}]+`, 'gu');
	const allWordMatches = Array.from(str.matchAll(wordRegExp));

	const targetWords = allWordMatches.slice(0, numWordsToCount);

	const endIndex = numWordsToCount >= allWordMatches.length
		? str.length // Reached end of string
		: targetWords.length ? targetWords.at(-1)!.index + targetWords.at(-1)![0].length : 0;

	const value = str.substring(0, endIndex);
	return {
		value,
		returnedWordCount: targetWords.length === 0 ? (value.length ? 1 : 0) : targetWords.length,
		isFullString: endIndex >= str.length,
		totalWordCount: allWordMatches.length
	};
}

export function countWords(str: string): number {
	const result = getNWords(str, Number.MAX_SAFE_INTEGER);
	return result.returnedWordCount;
}
