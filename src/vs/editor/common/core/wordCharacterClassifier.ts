/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { LRUCache } from 'vs/base/common/map';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';

export const enum WordCharacterClass {
	Regular = 0,
	Whitespace = 1,
	WordSeparator = 2
}

export class WordCharacterClassifier extends CharacterClassifier<WordCharacterClass> {

	public readonly intlSegmenterLocales: Intl.UnicodeBCP47LocaleIdentifier[];

	constructor(wordSeparators: string, intlSegmenterLocales: Intl.UnicodeBCP47LocaleIdentifier[]) {
		super(WordCharacterClass.Regular);
		this.intlSegmenterLocales = intlSegmenterLocales;

		for (let i = 0, len = wordSeparators.length; i < len; i++) {
			this.set(wordSeparators.charCodeAt(i), WordCharacterClass.WordSeparator);
		}

		this.set(CharCode.Space, WordCharacterClass.Whitespace);
		this.set(CharCode.Tab, WordCharacterClass.Whitespace);
	}

}

const wordClassifierCache = new LRUCache<string, WordCharacterClassifier>(10);

export function getMapForWordSeparators(wordSeparators: string, intlSegmenterLocales: Intl.UnicodeBCP47LocaleIdentifier[]): WordCharacterClassifier {
	const key = `${wordSeparators}/${intlSegmenterLocales.join(',')}`;
	let result = wordClassifierCache.get(key)!;
	if (!result) {
		result = new WordCharacterClassifier(wordSeparators, intlSegmenterLocales);
		wordClassifierCache.set(key, result);
	}
	return result;
}
