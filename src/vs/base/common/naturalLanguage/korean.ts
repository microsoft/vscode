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

const enum AsciiCode {
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
 * This includes archaic jamo which are excluded, this is why it's stored as
 * a Map.
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
const compatibilityJamo = new Map<number, number>([
	[0x3131, AsciiCode.r],        // ㄱ
	[0x3132, AsciiCode.R],        // ㄲ
	[0x3133, AsciiCodeCombo.rt],  // ㄳ
	[0x3134, AsciiCode.s],        // ㄴ
	[0x3135, AsciiCodeCombo.sw],  // ㄵ
	[0x3136, AsciiCodeCombo.sg],  // ㄶ
	[0x3137, AsciiCode.e],        // ㄷ
	[0x3138, AsciiCode.E],        // ㄸ
	[0x3139, AsciiCode.f],        // ㄹ
	[0x313a, AsciiCodeCombo.fr],  // ㄺ
	[0x313b, AsciiCodeCombo.fa],  // ㄻ
	[0x313c, AsciiCodeCombo.fq],  // ㄼ
	[0x313d, AsciiCodeCombo.ft],  // ㄽ
	[0x313e, AsciiCodeCombo.fx],  // ㄾ
	[0x313f, AsciiCodeCombo.fv],  // ㄿ
	[0x3140, AsciiCodeCombo.fg],  // ㅀ
	[0x3141, AsciiCode.a],        // ㅁ
	[0x3142, AsciiCode.q],        // ㅂ
	[0x3143, AsciiCode.Q],        // ㅃ
	[0x3144, AsciiCodeCombo.qt],  // ㅄ
	[0x3145, AsciiCode.t],        // ㅅ
	[0x3146, AsciiCode.T],        // ㅆ
	[0x3147, AsciiCode.d],        // ㅇ
	[0x3148, AsciiCode.w],        // ㅈ
	[0x3149, AsciiCode.W],        // ㅉ
	[0x314a, AsciiCode.c],        // ㅊ
	[0x314b, AsciiCode.z],        // ㅋ
	[0x314c, AsciiCode.x],        // ㅌ
	[0x314d, AsciiCode.v],        // ㅍ
	[0x314e, AsciiCode.g],        // ㅎ
	[0x314f, AsciiCode.k],        // ㅏ
	[0x3150, AsciiCode.o],        // ㅐ
	[0x3151, AsciiCode.i],        // ㅑ
	[0x3152, AsciiCode.O],        // ㅒ
	[0x3153, AsciiCode.j],        // ㅓ
	[0x3154, AsciiCode.p],        // ㅔ
	[0x3155, AsciiCode.u],        // ㅕ
	[0x3156, AsciiCode.P],        // ㅖ
	[0x3157, AsciiCode.h],        // ㅗ
	[0x3158, AsciiCodeCombo.hk],  // ㅘ
	[0x3159, AsciiCodeCombo.ho],  // ㅙ
	[0x315a, AsciiCodeCombo.hl],  // ㅚ
	[0x315b, AsciiCode.y],        // ㅛ
	[0x315c, AsciiCode.n],        // ㅜ
	[0x315d, AsciiCodeCombo.nj],  // ㅝ
	[0x315e, AsciiCodeCombo.np],  // ㅞ
	[0x315f, AsciiCodeCombo.nl],  // ㅟ
	[0x3160, AsciiCode.b],        // ㅠ
	[0x3161, AsciiCode.m],        // ㅡ
	[0x3162, AsciiCodeCombo.ml],  // ㅢ
	[0x3163, AsciiCode.l],        // ㅣ
	[0x3165, AsciiCodeCombo.ss],  // ㅥ
	[0x3166, AsciiCodeCombo.se],  // ㅦ
	[0x3167, AsciiCodeCombo.st],  // ㅧ
	[0x3169, AsciiCodeCombo.frt], // ㅩ
	[0x316a, AsciiCodeCombo.fe],  // ㅪ
	[0x316b, AsciiCodeCombo.fqt], // ㅫ
	[0x316d, AsciiCodeCombo.fg],  // ㅭ
	[0x316e, AsciiCodeCombo.aq],  // ㅮ
	[0x316f, AsciiCodeCombo.at],  // ㅯ
	[0x3172, AsciiCodeCombo.qr],  // ㅲ
	[0x3173, AsciiCodeCombo.qe],  // ㅳ
	[0x3174, AsciiCodeCombo.qtr], // ㅴ
	[0x3175, AsciiCodeCombo.qte], // ㅵ
	[0x3176, AsciiCodeCombo.qw],  // ㅶ
	[0x3177, AsciiCodeCombo.qx],  // ㅷ
	[0x317a, AsciiCodeCombo.tr],  // ㅺ
	[0x317b, AsciiCodeCombo.ts],  // ㅻ
	[0x317c, AsciiCodeCombo.te],  // ㅼ
	[0x317d, AsciiCodeCombo.tq],  // ㅽ
	[0x317e, AsciiCodeCombo.tw],  // ㅾ
	[0x3180, AsciiCodeCombo.dd],  // ㆀ
	[0x3185, AsciiCodeCombo.gg],  // ㆅ
	[0x3187, AsciiCodeCombo.yi],  // ㆇ
	[0x3188, AsciiCodeCombo.yO],  // ㆈ
	[0x3189, AsciiCodeCombo.yl],  // ㆉ
	[0x318a, AsciiCodeCombo.yu],  // ㆊ
	[0x318b, AsciiCodeCombo.yP],  // ㆋ
	[0x318c, AsciiCodeCombo.yl],  // ㆌ
]);

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
	const compatJamo = compatibilityJamo.get(code);
	if (compatJamo) {
		addCodesToBuffer(compatJamo);
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
		// 0-based starting at 0x11A7
		// Subtract 1 to skip initial null final consonant
		const finalConsonantIndex = vowelAndFinalConsonantProduct % 28 - 1;

		if (initialConsonantIndex < modernConsonants.length) {
			getCodesFromArray(initialConsonantIndex, modernConsonants, 0);
		} else {
			const compatJamo = compatibilityJamo.get(0x1100 + initialConsonantIndex);
			if (compatJamo) {
				addCodesToBuffer(compatJamo);
			}
		}

		if (vowelIndex < modernVowels.length) {
			getCodesFromArray(vowelIndex, modernVowels, 0);
		} else {
			const compatJamo = compatibilityJamo.get(0x1161 + vowelIndex);
			if (compatJamo) {
				addCodesToBuffer(compatJamo);
			}
		}

		if (finalConsonantIndex >= 0) {
			if (finalConsonantIndex < modernLatterConsonants.length) {
				getCodesFromArray(finalConsonantIndex, modernLatterConsonants, 0);
			} else {
				const compatJamo = compatibilityJamo.get(0x11A8 + finalConsonantIndex);
				if (compatJamo) {
					addCodesToBuffer(compatJamo);
				}
			}
		}

		if (codeBufferLength > 0) {
			return codeBuffer.subarray(0, codeBufferLength);
		}
	}
	return undefined;
}

function getCodesFromArray(code: number, array: ArrayLike<number>, arrayStartIndex: number): void {
	if (code >= arrayStartIndex && code < arrayStartIndex + array.length) {
		if (code - arrayStartIndex < array.length) {
			addCodesToBuffer(array[code - arrayStartIndex]);
			return;
		}
	}
}

function addCodesToBuffer(codes: number): void {
	// Number stored in format: OptionalThirdCode << 16 | OptionalSecondCode << 8 | Code
	codeBuffer[codeBufferLength++] = codes & 0xFF;
	if (codes >> 8) {
		codeBuffer[codeBufferLength++] = (codes >> 8) & 0xFF;
	}
	if (codes >> 16) {
		codeBuffer[codeBufferLength++] = (codes >> 16) & 0xFF;
	}
}
