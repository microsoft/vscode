/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-file

import { strictEqual } from 'assert';
import { getKoreanAltChars } from 'vs/base/common/naturalLanguage/korean';

function getKoreanAltCharsForString(text: string): string {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		const chars = getKoreanAltChars(text.charCodeAt(i));
		if (chars) {
			result += String.fromCharCode(...Array.from(chars));
		}
	}
	return result;
}

suite('Korean', () => {
	suite('getKoreanAltChars', () => {
		test('Modern initial consonants', () => {
			const cases = new Map([
				['ᄀ', 'r'],
				['ᄁ', 'R'],
				['ᄂ', 's'],
				['ᄃ', 'e'],
				['ᄄ', 'E'],
				['ᄅ', 'f'],
				['ᄆ', 'a'],
				['ᄇ', 'q'],
				['ᄈ', 'Q'],
				['ᄉ', 't'],
				['ᄊ', 'T'],
				['ᄋ', 'd'],
				['ᄌ', 'w'],
				['ᄍ', 'W'],
				['ᄎ', 'c'],
				['ᄏ', 'z'],
				['ᄐ', 'x'],
				['ᄑ', 'v'],
				['ᄒ', 'g'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" should result in "${alt}"`);
			}
		});

		test('Modern latter consonants', () => {
			const cases = new Map([
				['ᆨ', 'r'],
				['ᆩ', 'R'],
				['ᆪ', 'rt'],
				['ᆫ', 's'],
				['ᆬ', 'sw'],
				['ᆭ', 'sg'],
				['ᆮ', 'e'],
				['ᆯ', 'f'],
				['ᆰ', 'fr'],
				['ᆱ', 'fa'],
				['ᆲ', 'fq'],
				['ᆳ', 'ft'],
				['ᆴ', 'fx'],
				['ᆵ', 'fv'],
				['ᆶ', 'fg'],
				['ᆷ', 'a'],
				['ᆸ', 'q'],
				['ᆹ', 'qt'],
				['ᆺ', 't'],
				['ᆻ', 'T'],
				['ᆼ', 'd'],
				['ᆽ', 'w'],
				['ᆾ', 'c'],
				['ᆿ', 'z'],
				['ᇀ', 'x'],
				['ᇁ', 'v'],
				['ᇂ', 'g'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});
	});
});
