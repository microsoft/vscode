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

		test('Modern vowels', () => {
			const cases = new Map([
				['ᅡ', 'k'],
				['ᅢ', 'o'],
				['ᅣ', 'i'],
				['ᅤ', 'O'],
				['ᅥ', 'j'],
				['ᅦ', 'p'],
				['ᅧ', 'u'],
				['ᅨ', 'P'],
				['ᅩ', 'h'],
				['ᅪ', 'hk'],
				['ᅫ', 'ho'],
				['ᅬ', 'hl'],
				['ᅭ', 'y'],
				['ᅮ', 'n'],
				['ᅯ', 'nj'],
				['ᅰ', 'np'],
				['ᅱ', 'nl'],
				['ᅲ', 'b'],
				['ᅳ', 'm'],
				['ᅴ', 'ml'],
				['ᅵ', 'l'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});

		test('Compatibility Jamo', () => {
			const cases = new Map([
				['ㄱ', 'r'],
				['ㄲ', 'R'],
				['ㄳ', 'rt'],
				['ㄴ', 's'],
				['ㄵ', 'sw'],
				['ㄶ', 'sg'],
				['ㄷ', 'e'],
				['ㄸ', 'E'],
				['ㄹ', 'f'],
				['ㄺ', 'fr'],
				['ㄻ', 'fa'],
				['ㄼ', 'fq'],
				['ㄽ', 'ft'],
				['ㄾ', 'fx'],
				['ㄿ', 'fv'],
				['ㅀ', 'fg'],
				['ㅁ', 'a'],
				['ㅂ', 'q'],
				['ㅃ', 'Q'],
				['ㅄ', 'qt'],
				['ㅅ', 't'],
				['ㅆ', 'T'],
				['ㅇ', 'd'],
				['ㅈ', 'w'],
				['ㅉ', 'W'],
				['ㅊ', 'c'],
				['ㅋ', 'z'],
				['ㅌ', 'x'],
				['ㅍ', 'v'],
				['ㅎ', 'g'],
				['ㅏ', 'k'],
				['ㅐ', 'o'],
				['ㅑ', 'i'],
				['ㅒ', 'O'],
				['ㅓ', 'j'],
				['ㅔ', 'p'],
				['ㅕ', 'u'],
				['ㅖ', 'P'],
				['ㅗ', 'h'],
				['ㅘ', 'hk'],
				['ㅙ', 'ho'],
				['ㅚ', 'hl'],
				['ㅛ', 'y'],
				['ㅜ', 'n'],
				['ㅝ', 'nj'],
				['ㅞ', 'np'],
				['ㅟ', 'nl'],
				['ㅠ', 'b'],
				['ㅡ', 'm'],
				['ㅢ', 'ml'],
				['ㅣ', 'l'],
				// HF: Hangul Filler (everything after this is archaic)
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});
	});
});
