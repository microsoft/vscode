/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWordCountResult {
	value: string;
	returnedWordCount: number;
	totalWordCount: number;
	isFullString: boolean;
}

export function getNWords(str: string, numWordsToCount: number): IWordCountResult {
	// This regex matches each word and skips over whitespace and separators. A word is:
	// A markdown link
	// One chinese character
	// One or more + - =, handled so that code like "a=1+2-3" is broken up better
	// One or more characters that aren't whitepace or any of the above
	const allWordMatches = Array.from(str.matchAll(/\[([^\]]+)\]\(([^)]+)\)|\p{sc=Han}|=+|\++|-+|[^\s\|\p{sc=Han}|=|\+|\-]+/gu));

	const targetWords = allWordMatches.slice(0, numWordsToCount);

	const endIndex = numWordsToCount > allWordMatches.length
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
