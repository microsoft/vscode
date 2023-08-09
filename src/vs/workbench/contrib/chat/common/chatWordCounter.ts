/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const wordSeparatorCharPattern = /[\s\|\-]/;

export interface IWordCountResult {
	value: string;
	actualWordCount: number;
	isFullString: boolean;
}

export function getNWords(str: string, numWordsToCount: number): IWordCountResult {
	let wordCount = numWordsToCount;
	let i = 0;
	while (i < str.length && wordCount > 0) {
		// Consume word separator chars
		while (i < str.length && str[i].match(wordSeparatorCharPattern)) {
			i++;
		}

		// Consume word chars
		while (i < str.length && !str[i].match(wordSeparatorCharPattern)) {
			i++;
		}

		wordCount--;
	}

	const value = str.substring(0, i);
	return {
		value,
		actualWordCount: numWordsToCount - wordCount,
		isFullString: i >= str.length
	};
}

export function countWords(str: string): number {
	const result = getNWords(str, Number.MAX_SAFE_INTEGER);
	return result.actualWordCount;
}
