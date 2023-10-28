/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-file

/**
 * Gets alternative Korean characters for the character code. This will return the ascii
 * character code(s) that a Hangul character may have been input with using a qwerty layout.
 *
 * This only aims to cover modern (not archaic) Hangul syllables.
 *
 * @param code The character code to get alternate characters for
 */
export function getKoreanAltChars(code: number): number[] | undefined {
	return disassembleKorean(code);
}

/**
 * Hangul Jamo - Modern consonants #1
 *
 * Range U+1100..U+1112
 *
 * |        | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
 * |--------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
 * | U+110x | ᄀ | ᄁ | ᄂ | ᄃ | ᄄ | ᄅ | ᄆ | ᄇ | ᄈ | ᄉ | ᄊ | ᄋ | ᄌ | ᄍ | ᄎ | ᄏ |
 * | U+111x | ᄐ | ᄑ | ᄒ |
 */
const modernConsonants: string[] = [
	'r', // ㄱ
	'R', // ㄲ
	's', // ㄴ
	'e', // ㄷ
	'E', // ㄸ
	'f', // ㄹ
	'a', // ㅁ
	'q', // ㅂ
	'Q', // ㅃ
	't', // ㅅ
	'T', // ㅆ
	'd', // ㅇ
	'w', // ㅈ
	'W', // ㅉ
	'c', // ㅊ
	'z', // ㅋ
	'x', // ㅌ
	'v', // ㅍ
	'g', // ㅎ
];

/**
 * Hangul Jamo - Modern Vowels
 *
 * Range U+1161..U+1175
 *
 * |        | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
 * |--------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
 * | U+116x |   | ᅡ | ᅢ | ᅣ | ᅤ | ᅥ | ᅦ | ᅧ | ᅨ | ᅩ | ᅪ | ᅫ | ᅬ | ᅭ | ᅮ | ᅯ |
 * | U+117x | ᅰ | ᅱ | ᅲ | ᅳ | ᅴ | ᅵ |
 */
const modernVowels: string[] = [
	'k', // ㅏ
	'o', // ㅐ
	'i', // ㅑ
	'O', // ㅒ
	'j', // ㅓ
	'p', // ㅔ
	'u', // ㅕ
	'P', // ㅖ
	'h', // ㅗ
	'hk', // ㅘ
	'ho', // ㅙ
	'hl', // ㅚ
	'y', // ㅛ
	'n', // ㅜ
	'nj', // ㅝ
	'np', // ㅞ
	'nl', // ㅟ
	'b', // ㅠ
	'm', // ㅡ
	'ml', // ㅢ
	'l', // ㅣ
];

/**
 * Hangul Jamo - Modern Consonants #2
 *
 * Range U+11A9..U+11C2
 *
 * |        | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
 * |--------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
 * | U+11Ax |   |   |   |   |   |   |   |   | ᆨ | ᆩ | ᆪ | ᆫ | ᆬ | ᆭ | ᆮ | ᆯ |
 * | U+11Bx | ᆰ | ᆱ | ᆲ | ᆳ | ᆴ | ᆵ | ᆶ | ᆷ | ᆸ | ᆹ | ᆺ | ᆻ | ᆼ | ᆽ | ᆾ | ᆿ |
 * | U+11Cx | ᇀ | ᇁ | ᇂ |
 */
const modernLatterConsonants: string[] = [
	'r', // ㄱ
	'R', // ㄲ
	'rt', // ㄳ
	's', // ㄴ
	'sw', // ㄵ
	'sg', // ㄶ
	'e', // ㄷ
	'f', // ㄹ
	'fr', // ㄺ
	'fa', // ㄻ
	'fq', // ㄼ
	'ft', // ㄽ
	'fx', // ㄾ
	'fv', // ㄿ
	'fg', // ㅀ
	'a', // ㅁ
	'q', // ㅂ
	'qt', // ㅄ
	't', // ㅅ
	'T', // ㅆ
	'd', // ㅇ
	'w', // ㅈ
	'c', // ㅊ
	'z', // ㅋ
	'x', // ㅌ
	'v', // ㅍ
	'g', // ㅎ
];
/**
 * Hangul Compatibility Jamo
 *
 * Range U+3131..U+318F
 *
 * |        | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
 * |--------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
 * | U+313x |   | ㄱ | ㄲ | ㄳ | ㄴ | ㄵ | ㄶ | ㄷ | ㄸ | ㄹ | ㄺ | ㄻ | ㄼ | ㄽ | ㄾ | ㄿ |
 * | U+314x | ㅀ | ㅁ | ㅂ | ㅃ | ㅄ | ㅅ | ㅆ | ㅇ | ㅈ | ㅉ | ㅊ | ㅋ | ㅌ | ㅍ | ㅎ | ㅏ |
 * | U+315x | ㅐ | ㅑ | ㅒ | ㅓ | ㅔ | ㅕ | ㅖ | ㅗ | ㅘ | ㅙ | ㅚ | ㅛ | ㅜ | ㅝ | ㅞ | ㅟ |
 * | U+316x | ㅠ | ㅡ | ㅢ | ㅣ | HF | ㅥ | ㅦ | ㅧ | ㅨ | ㅩ | ㅪ | ㅫ | ㅬ | ㅭ | ㅮ | ㅯ |
 * | U+317x | ㅰ | ㅱ | ㅲ | ㅳ | ㅴ | ㅵ | ㅶ | ㅷ | ㅸ | ㅹ | ㅺ | ㅻ | ㅼ | ㅽ | ㅾ | ㅿ |
 * | U+318x | ㆀ | ㆁ | ㆂ | ㆃ | ㆄ | ㆅ | ㆆ | ㆇ | ㆈ | ㆉ | ㆊ | ㆋ | ㆌ | ㆍ | ㆎ |
 */
const compatibilityJamo = new Map<number, string>([
	/* ㄱ */[0x3131, 'r'],
	/* ㄲ */[0x3132, 'R'],
	/* ㄳ */[0x3133, 'rt'],
	/* ㄴ */[0x3134, 's'],
	/* ㄵ */[0x3135, 'sw'],
	/* ㄶ */[0x3136, 'sg'],
	/* ㄷ */[0x3137, 'e'],
	/* ㄸ */[0x3138, 'E'],
	/* ㄹ */[0x3139, 'f'],
	/* ㄺ */[0x313a, 'fr'],
	/* ㄻ */[0x313b, 'fa'],
	/* ㄼ */[0x313c, 'fq'],
	/* ㄽ */[0x313d, 'ft'],
	/* ㄾ */[0x313e, 'fx'],
	/* ㄿ */[0x313f, 'fv'],
	/* ㅀ */[0x3140, 'fg'],
	/* ㅁ */[0x3141, 'a'],
	/* ㅂ */[0x3142, 'q'],
	/* ㅃ */[0x3143, 'Q'],
	/* ㅄ */[0x3144, 'qt'],
	/* ㅅ */[0x3145, 't'],
	/* ㅆ */[0x3146, 'T'],
	/* ㅇ */[0x3147, 'd'],
	/* ㅈ */[0x3148, 'w'],
	/* ㅉ */[0x3149, 'W'],
	/* ㅊ */[0x314a, 'c'],
	/* ㅋ */[0x314b, 'z'],
	/* ㅌ */[0x314c, 'x'],
	/* ㅍ */[0x314d, 'v'],
	/* ㅎ */[0x314e, 'g'],
	/* ㅏ */[0x314f, 'k'],
	/* ㅐ */[0x3150, 'o'],
	/* ㅑ */[0x3151, 'i'],
	/* ㅒ */[0x3152, 'O'],
	/* ㅓ */[0x3153, 'j'],
	/* ㅔ */[0x3154, 'p'],
	/* ㅕ */[0x3155, 'u'],
	/* ㅖ */[0x3156, 'P'],
	/* ㅗ */[0x3157, 'h'],
	/* ㅘ */[0x3158, 'hk'],
	/* ㅙ */[0x3159, 'ho'],
	/* ㅚ */[0x315a, 'hl'],
	/* ㅛ */[0x315b, 'y'],
	/* ㅜ */[0x315c, 'n'],
	/* ㅝ */[0x315d, 'nj'],
	/* ㅞ */[0x315e, 'np'],
	/* ㅟ */[0x315f, 'nl'],
	/* ㅠ */[0x3160, 'b'],
	/* ㅡ */[0x3161, 'm'],
	/* ㅢ */[0x3162, 'ml'],
	/* ㅣ */[0x3163, 'l'],
	// HF,
	/* ㅥ */[0x3165, 'ss'],
	/* ㅦ */[0x3166, 'se'],
	/* ㅧ */[0x3167, 'st'],
	// /* ㅨ */ [0x0, 'a'],
	/* ㅩ */[0x03169, 'frt'],
	/* ㅪ */[0x0316a, 'fe'],
	/* ㅫ */[0x0316b, 'fqt'],
	// /* ㅬ */ [0x0, ''],
	/* ㅭ */[0x316d, 'fg'],
	/* ㅮ */[0x316e, 'aq'],
	/* ㅯ */[0x316f, 'at'],
	// /* ㅰ */ [0x0, ''],
	// /* ㅱ */ [0x0, 'a'],
	/* ㅲ */[0x3172, 'qr'],
	/* ㅳ */[0x3173, 'qe'],
	/* ㅴ */[0x3174, 'qtr'],
	/* ㅵ */[0x3175, 'qte'],
	/* ㅶ */[0x3176, 'qw'],
	/* ㅷ */[0x3177, 'qx'],
	// /* ㅸ */ [0x0, 'a'],
	// /* ㅹ */ [0x0, 'a'],
	/* ㅺ */[0x317a, 'tr'],
	/* ㅻ */[0x317b, 'ts'],
	/* ㅼ */[0x317c, 'te'],
	/* ㅽ */[0x317d, 'tq'],
	/* ㅾ */[0x317e, 'tw'],
	// /* ㅿ */ [0x0, 'a'],
	/* ㆀ */[0x3180, 'dd'],
	// /* ㆁ */ [0x0, 'a'],
	// /* ㆂ */ [0x0, 'a'],
	// /* ㆃ */ [0x0, 'a'],
	// /* ㆄ */ [0x0, 'a'],
	/* ㆅ */[0x3185, 'gg'],
	// /* ㆆ */ [0x0, 'a'],
	/* ㆇ */[0x3187, 'yi'],
	/* ㆈ */[0x3188, 'yO'],
	/* ㆉ */[0x3189, 'yl'],
	/* ㆊ */[0x318a, 'yu'],
	/* ㆋ */[0x318b, 'yP'],
	/* ㆌ */[0x318c, 'yl'],
	// /* ㆍ */ [0x0, 'a'],
	// /* ㆎ */ [0x0, 'a'],
]);

function disassembleKorean(code: number): number[] | undefined {
	// Hangul Jamo - Modern consonants #1
	if (code >= 0x1100 && code <= 0x1112) {
		if (code - 0x1100 < modernConsonants.length) {
			return Array.from(modernConsonants[code - 0x1100]).map(e => e.charCodeAt(0));
		}
	}

	// Hangul Jamo - Modern Vowels
	if (code >= 0x1161 && code <= 0x1175) {
		if (code - 0x1161 < modernVowels.length) {
			return Array.from(modernVowels[code - 0x1161]).map(e => e.charCodeAt(0));
		}
	}

	// Hangul Jamo - Modern Consonants #2
	if (code >= 0x11A9 && code <= 0x11C2) {
		if (code - 0x11A9 < modernLatterConsonants.length) {
			return Array.from(modernLatterConsonants[code - 0x11A9]).map(e => e.charCodeAt(0));
		}
	}

	// Hangul Compatibility Jamo
	const compatJamo = compatibilityJamo.get(code);
	if (compatJamo) {
		return Array.from(compatJamo).map(e => e.charCodeAt(0));
	}

	// Hangul Syllables
	if (code >= 0xAC00 && code <= 0xD7A3) {
		const hangulIndex = code - 0xAC00;
		const vowelAndFinalConsonantProduct = hangulIndex % 588;

		// 0-based starting at 0x1100
		const initialConsonantIndex = Math.floor(hangulIndex / 588);
		// 0-based starting at 0x1161
		const vowelIndex = Math.floor(vowelAndFinalConsonantProduct / 28);
		// 0-based starting at 0x11A7
		// Subtract 1 to skip initial null final consonant
		const finalConsonantIndex = vowelAndFinalConsonantProduct % 28 - 1;

		const result: number[] = [
			...[...(
				initialConsonantIndex < modernConsonants.length
					? modernConsonants[initialConsonantIndex]
					: compatibilityJamo.get(0x1100 + initialConsonantIndex) ?? ''
			)].map(e => e.charCodeAt(0)),
			...[...(
				vowelIndex < modernVowels.length
					? modernVowels[vowelIndex]
					: compatibilityJamo.get(0x1161 + vowelIndex) ?? ''
			)].map(e => e.charCodeAt(0)),
		];
		if (finalConsonantIndex >= 0) {
			result.push(...[...(
				finalConsonantIndex < modernLatterConsonants.length
					? modernLatterConsonants[finalConsonantIndex]
					: compatibilityJamo.get(0x11A9 + finalConsonantIndex) ?? ''
			)].map(e => e.charCodeAt(0)));
		}

		return result;
	}
	return undefined;
}
