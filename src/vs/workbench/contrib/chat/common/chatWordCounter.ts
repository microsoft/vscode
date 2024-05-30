/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWordCountResult {
	value: string;
	actualWordCount: number;
	isFullString: boolean;
}

export function getNWords(str: string, numWordsToCount: number): IWordCountResult {
	// Match words and markdown style links
	const allWordMatches = Array.from(str.matchAll(/\[([^\]]+)\]\(([^)]+)\)|[^\s\|\-]+/g));

	const targetWords = allWordMatches.slice(0, numWordsToCount);

	const endIndex = numWordsToCount > allWordMatches.length
		? str.length // Reached end of string
		: targetWords.length ? targetWords.at(-1)!.index + targetWords.at(-1)![0].length : 0;

	const value = str.substring(0, endIndex);
	return {
		value,
		actualWordCount: targetWords.length === 0 ? (value.length ? 1 : 0) : targetWords.length,
		isFullString: endIndex >= str.length
	};
}

export function countWords(str: string): number {
	const result = getNWords(str, Number.MAX_SAFE_INTEGER);
	return result.actualWordCount;
}
