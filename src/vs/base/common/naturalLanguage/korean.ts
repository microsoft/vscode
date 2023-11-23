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
export function getKoreanAltChars(code: number): ArrayLike<number> | undefined {
	const result = disassembleKorean(code);
	if (result && result.length > 0) {
		return new Uint32Array(result);
	}
	return undefined;
}

let codeBufferLength = 0;
const codeBuffer = new Uint32Array(10);
function disassembleKorean(code: number): Uint32Array | undefined {
	codeBufferLength = 0;

	getCodesFromArray(code, modernConsonants, 0x1100);
	if (codeBufferLength > 0) {
		return codeBuffer.subarray(0, codeBufferLength);
	}

	getCodesFromArray(code, modernVowels, 0x01161);
	if (codeBufferLength > 0) {
		return codeBuffer.subarray(0, codeBufferLength);
	}

	getCodesFromArray(code, modernLatterConsonants, 0x11A9);
	if (codeBufferLength > 0) {
		return codeBuffer.subarray(0, codeBufferLength);
	}

	// Hangul Compatibility Jamo
	getCodesFromArray(code, compatibilityJamo, 0x3131);
	if (codeBufferLength) {
		return codeBuffer.subarray(0, codeBufferLength);
	}

	// Hangul Syllables
	if (code >= 0xAC00 && code <= 0xD7A3) {
		const hangulIndex = code - 0xAC00;
		const vowelAndFinalConsonantProduct = hangulIndex % 588;

		// 0-based starting at 0x1100
		const initialConsonantIndex = Math.floor(hangulIndex / 588);
		// 0-based starting at 0x1161
		const vowelIndex = Math.floor(vowelAndFinalConsonantProduct / 28);
		// TODO: Include initial in data array to avoid confusion
		// 0-based starting at 0x11A7
		// Subtract 1 to skip initial null final consonant
		const finalConsonantIndex = vowelAndFinalConsonantProduct % 28 - 1;

		if (initialConsonantIndex < modernConsonants.length) {
			getCodesFromArray(initialConsonantIndex, modernConsonants, 0);
		} else if (0x1100 + initialConsonantIndex - 0x3131 < compatibilityJamo.length) {
			getCodesFromArray(0x1100 + initialConsonantIndex, compatibilityJamo, 0x3131);
		}

		if (vowelIndex < modernVowels.length) {
			getCodesFromArray(vowelIndex, modernVowels, 0);
		} else if (0x1161 + vowelIndex - 0x3131 < compatibilityJamo.length) {
			getCodesFromArray(0x1161 + vowelIndex - 0x3131, compatibilityJamo, 0x3131);
		}

		if (finalConsonantIndex >= 0) {
			if (finalConsonantIndex < modernLatterConsonants.length) {
				getCodesFromArray(finalConsonantIndex, modernLatterConsonants, 0);
			} else if (0x11A8 + finalConsonantIndex - 0x3131 < compatibilityJamo.length) {
				getCodesFromArray(0x11A8 + finalConsonantIndex - 0x3131, compatibilityJamo, 0x3131);
			}
		}

		if (codeBufferLength > 0) {
			return codeBuffer.subarray(0, codeBufferLength);
		}
	}
	return undefined;
}

function getCodesFromArray(code: number, array: ArrayLike<number>, arrayStartIndex: number): void {
	// Verify the code is within the array's range
	if (code >= arrayStartIndex && code < arrayStartIndex + array.length) {
		addCodesToBuffer(array[code - arrayStartIndex]);
	}
}

function addCodesToBuffer(codes: number): void {
	// NUL is ignored, this is used for archaic characters to avoid using a Map
	// for the data
	if (codes === AsciiCode.NUL) {
		return;
	}
	// Number stored in format: OptionalThirdCode << 16 | OptionalSecondCode << 8 | Code
	codeBuffer[codeBufferLength++] = codes & 0xFF;
	if (codes >> 8) {
		codeBuffer[codeBufferLength++] = (codes >> 8) & 0xFF;
	}
	if (codes >> 16) {
		codeBuffer[codeBufferLength++] = (codes >> 16) & 0xFF;
	}
}

const enum AsciiCode {
	NUL = 0,
	A = 65,
	B = 66,
	C = 67,
	D = 68,
	E = 69,
	F = 70,
	G = 71,
	H = 72,
	I = 73,
	J = 74,
	K = 75,
	L = 76,
	M = 77,
	N = 78,
	O = 79,
	P = 80,
	Q = 81,
	R = 82,
	S = 83,
	T = 84,
	U = 85,
	V = 86,
	W = 87,
	X = 88,
	Y = 89,
	Z = 90,
	a = 97,
	b = 98,
	c = 99,
	d = 100,
	e = 101,
	f = 102,
	g = 103,
	h = 104,
	i = 105,
	j = 106,
	k = 107,
	l = 108,
	m = 109,
	n = 110,
	o = 111,
	p = 112,
	q = 113,
	r = 114,
	s = 115,
	t = 116,
	u = 117,
	v = 118,
	w = 119,
	x = 120,
	y = 121,
	z = 122,
}

/**
 * Numbers that represent multiple ascii codes. These are precomputed at compile time to reduce
 * bundle and runtime overhead.
 */
const enum AsciiCodeCombo {
	hk = AsciiCode.h << 8 | AsciiCode.k,
	ho = AsciiCode.h << 8 | AsciiCode.o,
	hl = AsciiCode.h << 8 | AsciiCode.l,
	nj = AsciiCode.n << 8 | AsciiCode.j,
	np = AsciiCode.n << 8 | AsciiCode.p,
	nl = AsciiCode.n << 8 | AsciiCode.l,
	ml = AsciiCode.m << 8 | AsciiCode.l,
	rt = AsciiCode.r << 8 | AsciiCode.t,
	sw = AsciiCode.s << 8 | AsciiCode.w,
	sg = AsciiCode.s << 8 | AsciiCode.g,
	fr = AsciiCode.f << 8 | AsciiCode.r,
	fa = AsciiCode.f << 8 | AsciiCode.a,
	fq = AsciiCode.f << 8 | AsciiCode.q,
	ft = AsciiCode.f << 8 | AsciiCode.t,
	fx = AsciiCode.f << 8 | AsciiCode.x,
	fv = AsciiCode.f << 8 | AsciiCode.v,
	fg = AsciiCode.f << 8 | AsciiCode.g,
	qt = AsciiCode.q << 8 | AsciiCode.t,

	ss = AsciiCode.s << 8 | AsciiCode.s,
	se = AsciiCode.s << 8 | AsciiCode.e,
	st = AsciiCode.s << 8 | AsciiCode.t,
	frt = AsciiCode.f << 16 | AsciiCode.r << 8 | AsciiCode.t,
	fe = AsciiCode.f << 8 | AsciiCode.e,
	fqt = AsciiCode.f << 16 | AsciiCode.q << 8 | AsciiCode.t,
	aq = AsciiCode.a << 8 | AsciiCode.q,
	at = AsciiCode.a << 8 | AsciiCode.t,
	qr = AsciiCode.q << 8 | AsciiCode.r,
	qe = AsciiCode.q << 8 | AsciiCode.e,
	qtr = AsciiCode.q << 16 | AsciiCode.t << 8 | AsciiCode.r,
	qte = AsciiCode.q << 16 | AsciiCode.t << 8 | AsciiCode.e,
	qw = AsciiCode.q << 8 | AsciiCode.w,
	qx = AsciiCode.q << 8 | AsciiCode.x,
	tr = AsciiCode.t << 8 | AsciiCode.r,
	ts = AsciiCode.t << 8 | AsciiCode.s,
	te = AsciiCode.t << 8 | AsciiCode.e,
	tq = AsciiCode.t << 8 | AsciiCode.q,
	tw = AsciiCode.t << 8 | AsciiCode.w,
	dd = AsciiCode.d << 8 | AsciiCode.d,
	gg = AsciiCode.g << 8 | AsciiCode.g,
	yi = AsciiCode.y << 8 | AsciiCode.i,
	yO = AsciiCode.y << 8 | AsciiCode.O,
	yl = AsciiCode.y << 8 | AsciiCode.l,
	yu = AsciiCode.y << 8 | AsciiCode.u,
	yP = AsciiCode.y << 8 | AsciiCode.P,
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
const modernConsonants = new Uint8Array([
	AsciiCode.r, // ㄱ
	AsciiCode.R, // ㄲ
	AsciiCode.s, // ㄴ
	AsciiCode.e, // ㄷ
	AsciiCode.E, // ㄸ
	AsciiCode.f, // ㄹ
	AsciiCode.a, // ㅁ
	AsciiCode.q, // ㅂ
	AsciiCode.Q, // ㅃ
	AsciiCode.t, // ㅅ
	AsciiCode.T, // ㅆ
	AsciiCode.d, // ㅇ
	AsciiCode.w, // ㅈ
	AsciiCode.W, // ㅉ
	AsciiCode.c, // ㅊ
	AsciiCode.z, // ㅋ
	AsciiCode.x, // ㅌ
	AsciiCode.v, // ㅍ
	AsciiCode.g, // ㅎ
]);

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
const modernVowels = new Uint16Array([
	AsciiCode.k,       //  -> ㅏ
	AsciiCode.o,       //  -> ㅐ
	AsciiCode.i,       //  -> ㅑ
	AsciiCode.O,       //  -> ㅒ
	AsciiCode.j,       //  -> ㅓ
	AsciiCode.p,       //  -> ㅔ
	AsciiCode.u,       //  -> ㅕ
	AsciiCode.P,       //  -> ㅖ
	AsciiCode.h,       //  -> ㅗ
	AsciiCodeCombo.hk, //  -> ㅘ
	AsciiCodeCombo.ho, //  -> ㅙ
	AsciiCodeCombo.hl, //  -> ㅚ
	AsciiCode.y,       //  -> ㅛ
	AsciiCode.n,       //  -> ㅜ
	AsciiCodeCombo.nj, //  -> ㅝ
	AsciiCodeCombo.np, //  -> ㅞ
	AsciiCodeCombo.nl, //  -> ㅟ
	AsciiCode.b,       //  -> ㅠ
	AsciiCode.m,       //  -> ㅡ
	AsciiCodeCombo.ml, //  -> ㅢ
	AsciiCode.l,       //  -> ㅣ
]);

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
const modernLatterConsonants = new Uint16Array([
	AsciiCode.r,       // ㄱ
	AsciiCode.R,       // ㄲ
	AsciiCodeCombo.rt, // ㄳ
	AsciiCode.s,       // ㄴ
	AsciiCodeCombo.sw, // ㄵ
	AsciiCodeCombo.sg, // ㄶ
	AsciiCode.e,       // ㄷ
	AsciiCode.f,       // ㄹ
	AsciiCodeCombo.fr, // ㄺ
	AsciiCodeCombo.fa, // ㄻ
	AsciiCodeCombo.fq, // ㄼ
	AsciiCodeCombo.ft, // ㄽ
	AsciiCodeCombo.fx, // ㄾ
	AsciiCodeCombo.fv, // ㄿ
	AsciiCodeCombo.fg, // ㅀ
	AsciiCode.a,       // ㅁ
	AsciiCode.q,       // ㅂ
	AsciiCodeCombo.qt, // ㅄ
	AsciiCode.t,       // ㅅ
	AsciiCode.T,       // ㅆ
	AsciiCode.d,       // ㅇ
	AsciiCode.w,       // ㅈ
	AsciiCode.c,       // ㅊ
	AsciiCode.z,       // ㅋ
	AsciiCode.x,       // ㅌ
	AsciiCode.v,       // ㅍ
	AsciiCode.g,       // ㅎ
]);

/**
 * Hangul Compatibility Jamo
 *
 * Range U+3131..U+318F
 *
 * This includes range includes archaic jamo which we don't consider, these are
 * given the NUL character code in order to be ignored.
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
const compatibilityJamo = new Uint16Array([
	AsciiCode.r,        // ㄱ
	AsciiCode.R,        // ㄲ
	AsciiCodeCombo.rt,  // ㄳ
	AsciiCode.s,        // ㄴ
	AsciiCodeCombo.sw,  // ㄵ
	AsciiCodeCombo.sg,  // ㄶ
	AsciiCode.e,        // ㄷ
	AsciiCode.E,        // ㄸ
	AsciiCode.f,        // ㄹ
	AsciiCodeCombo.fr,  // ㄺ
	AsciiCodeCombo.fa,  // ㄻ
	AsciiCodeCombo.fq,  // ㄼ
	AsciiCodeCombo.ft,  // ㄽ
	AsciiCodeCombo.fx,  // ㄾ
	AsciiCodeCombo.fv,  // ㄿ
	AsciiCodeCombo.fg,  // ㅀ
	AsciiCode.a,        // ㅁ
	AsciiCode.q,        // ㅂ
	AsciiCode.Q,        // ㅃ
	AsciiCodeCombo.qt,  // ㅄ
	AsciiCode.t,        // ㅅ
	AsciiCode.T,        // ㅆ
	AsciiCode.d,        // ㅇ
	AsciiCode.w,        // ㅈ
	AsciiCode.W,        // ㅉ
	AsciiCode.c,        // ㅊ
	AsciiCode.z,        // ㅋ
	AsciiCode.x,        // ㅌ
	AsciiCode.v,        // ㅍ
	AsciiCode.g,        // ㅎ
	AsciiCode.k,        // ㅏ
	AsciiCode.o,        // ㅐ
	AsciiCode.i,        // ㅑ
	AsciiCode.O,        // ㅒ
	AsciiCode.j,        // ㅓ
	AsciiCode.p,        // ㅔ
	AsciiCode.u,        // ㅕ
	AsciiCode.P,        // ㅖ
	AsciiCode.h,        // ㅗ
	AsciiCodeCombo.hk,  // ㅘ
	AsciiCodeCombo.ho,  // ㅙ
	AsciiCodeCombo.hl,  // ㅚ
	AsciiCode.y,        // ㅛ
	AsciiCode.n,        // ㅜ
	AsciiCodeCombo.nj,  // ㅝ
	AsciiCodeCombo.np,  // ㅞ
	AsciiCodeCombo.nl,  // ㅟ
	AsciiCode.b,        // ㅠ
	AsciiCode.m,        // ㅡ
	AsciiCodeCombo.ml,  // ㅢ
	AsciiCode.l,        // ㅣ
	AsciiCode.NUL,      // HF: Hangul Filler
	AsciiCodeCombo.ss,  // ㅥ
	AsciiCodeCombo.se,  // ㅦ
	AsciiCodeCombo.st,  // ㅧ
	AsciiCode.NUL,      // ㅨ
	AsciiCodeCombo.frt, // ㅩ
	AsciiCodeCombo.fe,  // ㅪ
	AsciiCodeCombo.fqt, // ㅫ
	AsciiCode.NUL,      // ㅬ
	AsciiCodeCombo.fg,  // ㅭ
	AsciiCodeCombo.aq,  // ㅮ
	AsciiCodeCombo.at,  // ㅯ
	AsciiCode.NUL,      // ㅰ
	AsciiCode.NUL,      // ㅱ
	AsciiCodeCombo.qr,  // ㅲ
	AsciiCodeCombo.qe,  // ㅳ
	AsciiCodeCombo.qtr, // ㅴ
	AsciiCodeCombo.qte, // ㅵ
	AsciiCodeCombo.qw,  // ㅶ
	AsciiCodeCombo.qx,  // ㅷ
	AsciiCode.NUL,      // ㅸ
	AsciiCode.NUL,      // ㅹ
	AsciiCodeCombo.tr,  // ㅺ
	AsciiCodeCombo.ts,  // ㅻ
	AsciiCodeCombo.te,  // ㅼ
	AsciiCodeCombo.tq,  // ㅽ
	AsciiCodeCombo.tw,  // ㅾ
	AsciiCode.NUL,      // ㅿ
	AsciiCodeCombo.dd,  // ㆀ
	AsciiCode.NUL,      // ㆁ
	AsciiCode.NUL,      // ㆂ
	AsciiCode.NUL,      // ㆃ
	AsciiCode.NUL,      // ㆄ
	AsciiCodeCombo.gg,  // ㆅ
	AsciiCode.NUL,      // ㆆ
	AsciiCodeCombo.yi,  // ㆇ
	AsciiCodeCombo.yO,  // ㆈ
	AsciiCodeCombo.yl,  // ㆉ
	AsciiCodeCombo.yu,  // ㆊ
	AsciiCodeCombo.yP,  // ㆋ
	AsciiCodeCombo.yl,  // ㆌ
	AsciiCode.NUL,      // ㆍ
	AsciiCode.NUL,      // ㆎ
]);
