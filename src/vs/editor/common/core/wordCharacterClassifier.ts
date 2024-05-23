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
	private readonly _segmenter: Intl.Segmenter | null = null;
	private _cachedLine: string | null = null;
	private _cachedSegments: IntlWordSegmentData[] = [];

	constructor(wordSeparators: string, intlSegmenterLocales: Intl.UnicodeBCP47LocaleIdentifier[]) {
		super(WordCharacterClass.Regular);
		this.intlSegmenterLocales = intlSegmenterLocales;
		if (this.intlSegmenterLocales.length > 0) {
			this._segmenter = new Intl.Segmenter(this.intlSegmenterLocales, { granularity: 'word' });
		} else {
			this._segmenter = null;
		}

		for (let i = 0, len = wordSeparators.length; i < len; i++) {
			this.set(wordSeparators.charCodeAt(i), WordCharacterClass.WordSeparator);
		}

		this.set(CharCode.Space, WordCharacterClass.Whitespace);
		this.set(CharCode.Tab, WordCharacterClass.Whitespace);
	}

	public findPrevIntlWordBeforeOrAtOffset(line: string, offset: number): IntlWordSegmentData | null {
		let candidate: IntlWordSegmentData | null = null;
		for (const segment of this._getIntlSegmenterWordsOnLine(line)) {
			if (segment.index > offset) {
				break;
			}
			candidate = segment;
		}
		return candidate;
	}

	public findNextIntlWordAtOrAfterOffset(lineContent: string, offset: number): IntlWordSegmentData | null {
		for (const segment of this._getIntlSegmenterWordsOnLine(lineContent)) {
			if (segment.index < offset) {
				continue;
			}
			return segment;
		}
		return null;
	}

	private _getIntlSegmenterWordsOnLine(line: string): IntlWordSegmentData[] {
		if (!this._segmenter) {
			return [];
		}

		// Check if the line has changed from the previous call
		if (this._cachedLine === line) {
			return this._cachedSegments;
		}

		// Update the cache with the new line
		this._cachedLine = line;
		this._cachedSegments = this._filterWordSegments(this._segmenter.segment(line));

		return this._cachedSegments;
	}

	private _filterWordSegments(segments: Intl.Segments): IntlWordSegmentData[] {
		const result: IntlWordSegmentData[] = [];
		for (const segment of segments) {
			if (this._isWordLike(segment)) {
				result.push(segment);
			}
		}
		return result;
	}

	private _isWordLike(segment: Intl.SegmentData): segment is IntlWordSegmentData {
		if (segment.isWordLike) {
			return true;
		}
		return false;
	}
}

export interface IntlWordSegmentData extends Intl.SegmentData {
	isWordLike: true;
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
