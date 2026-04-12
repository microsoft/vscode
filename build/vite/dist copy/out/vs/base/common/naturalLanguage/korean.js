/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
/**
 * Gets alternative Korean characters for the character code. This will return the ascii
 * character code(s) that a Hangul character may have been input with using a qwerty layout.
 *
 * This only aims to cover modern (not archaic) Hangul syllables.
 *
 * @param code The character code to get alternate characters for
 */
export function getKoreanAltChars(code) {
    const result = disassembleKorean(code);
    if (result && result.length > 0) {
        return new Uint32Array(result);
    }
    return undefined;
}
let codeBufferLength = 0;
const codeBuffer = new Uint32Array(10);
function disassembleKorean(code) {
    codeBufferLength = 0;
    // Initial consonants (초성)
    getCodesFromArray(code, modernConsonants, 4352 /* HangulRangeStartCode.InitialConsonant */);
    if (codeBufferLength > 0) {
        return codeBuffer.subarray(0, codeBufferLength);
    }
    // Vowels (중성)
    getCodesFromArray(code, modernVowels, 4449 /* HangulRangeStartCode.Vowel */);
    if (codeBufferLength > 0) {
        return codeBuffer.subarray(0, codeBufferLength);
    }
    // Final consonants (종성)
    getCodesFromArray(code, modernFinalConsonants, 4520 /* HangulRangeStartCode.FinalConsonant */);
    if (codeBufferLength > 0) {
        return codeBuffer.subarray(0, codeBufferLength);
    }
    // Hangul Compatibility Jamo
    getCodesFromArray(code, compatibilityJamo, 12593 /* HangulRangeStartCode.CompatibilityJamo */);
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
        // 0-based starting at 0x11A8
        // Subtract 1 as the standard algorithm uses the 0 index to represent no
        // final consonant
        const finalConsonantIndex = vowelAndFinalConsonantProduct % 28 - 1;
        if (initialConsonantIndex < modernConsonants.length) {
            getCodesFromArray(initialConsonantIndex, modernConsonants, 0);
        }
        else if (4352 /* HangulRangeStartCode.InitialConsonant */ + initialConsonantIndex - 12593 /* HangulRangeStartCode.CompatibilityJamo */ < compatibilityJamo.length) {
            getCodesFromArray(4352 /* HangulRangeStartCode.InitialConsonant */ + initialConsonantIndex, compatibilityJamo, 12593 /* HangulRangeStartCode.CompatibilityJamo */);
        }
        if (vowelIndex < modernVowels.length) {
            getCodesFromArray(vowelIndex, modernVowels, 0);
        }
        else if (4449 /* HangulRangeStartCode.Vowel */ + vowelIndex - 12593 /* HangulRangeStartCode.CompatibilityJamo */ < compatibilityJamo.length) {
            getCodesFromArray(4449 /* HangulRangeStartCode.Vowel */ + vowelIndex - 12593 /* HangulRangeStartCode.CompatibilityJamo */, compatibilityJamo, 12593 /* HangulRangeStartCode.CompatibilityJamo */);
        }
        if (finalConsonantIndex >= 0) {
            if (finalConsonantIndex < modernFinalConsonants.length) {
                getCodesFromArray(finalConsonantIndex, modernFinalConsonants, 0);
            }
            else if (4520 /* HangulRangeStartCode.FinalConsonant */ + finalConsonantIndex - 12593 /* HangulRangeStartCode.CompatibilityJamo */ < compatibilityJamo.length) {
                getCodesFromArray(4520 /* HangulRangeStartCode.FinalConsonant */ + finalConsonantIndex - 12593 /* HangulRangeStartCode.CompatibilityJamo */, compatibilityJamo, 12593 /* HangulRangeStartCode.CompatibilityJamo */);
            }
        }
        if (codeBufferLength > 0) {
            return codeBuffer.subarray(0, codeBufferLength);
        }
    }
    return undefined;
}
function getCodesFromArray(code, array, arrayStartIndex) {
    // Verify the code is within the array's range
    if (code >= arrayStartIndex && code < arrayStartIndex + array.length) {
        addCodesToBuffer(array[code - arrayStartIndex]);
    }
}
function addCodesToBuffer(codes) {
    // NUL is ignored, this is used for archaic characters to avoid using a Map
    // for the data
    if (codes === 0 /* AsciiCode.NUL */) {
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
var HangulRangeStartCode;
(function (HangulRangeStartCode) {
    HangulRangeStartCode[HangulRangeStartCode["InitialConsonant"] = 4352] = "InitialConsonant";
    HangulRangeStartCode[HangulRangeStartCode["Vowel"] = 4449] = "Vowel";
    HangulRangeStartCode[HangulRangeStartCode["FinalConsonant"] = 4520] = "FinalConsonant";
    HangulRangeStartCode[HangulRangeStartCode["CompatibilityJamo"] = 12593] = "CompatibilityJamo";
})(HangulRangeStartCode || (HangulRangeStartCode = {}));
var AsciiCode;
(function (AsciiCode) {
    AsciiCode[AsciiCode["NUL"] = 0] = "NUL";
    AsciiCode[AsciiCode["A"] = 65] = "A";
    AsciiCode[AsciiCode["B"] = 66] = "B";
    AsciiCode[AsciiCode["C"] = 67] = "C";
    AsciiCode[AsciiCode["D"] = 68] = "D";
    AsciiCode[AsciiCode["E"] = 69] = "E";
    AsciiCode[AsciiCode["F"] = 70] = "F";
    AsciiCode[AsciiCode["G"] = 71] = "G";
    AsciiCode[AsciiCode["H"] = 72] = "H";
    AsciiCode[AsciiCode["I"] = 73] = "I";
    AsciiCode[AsciiCode["J"] = 74] = "J";
    AsciiCode[AsciiCode["K"] = 75] = "K";
    AsciiCode[AsciiCode["L"] = 76] = "L";
    AsciiCode[AsciiCode["M"] = 77] = "M";
    AsciiCode[AsciiCode["N"] = 78] = "N";
    AsciiCode[AsciiCode["O"] = 79] = "O";
    AsciiCode[AsciiCode["P"] = 80] = "P";
    AsciiCode[AsciiCode["Q"] = 81] = "Q";
    AsciiCode[AsciiCode["R"] = 82] = "R";
    AsciiCode[AsciiCode["S"] = 83] = "S";
    AsciiCode[AsciiCode["T"] = 84] = "T";
    AsciiCode[AsciiCode["U"] = 85] = "U";
    AsciiCode[AsciiCode["V"] = 86] = "V";
    AsciiCode[AsciiCode["W"] = 87] = "W";
    AsciiCode[AsciiCode["X"] = 88] = "X";
    AsciiCode[AsciiCode["Y"] = 89] = "Y";
    AsciiCode[AsciiCode["Z"] = 90] = "Z";
    AsciiCode[AsciiCode["a"] = 97] = "a";
    AsciiCode[AsciiCode["b"] = 98] = "b";
    AsciiCode[AsciiCode["c"] = 99] = "c";
    AsciiCode[AsciiCode["d"] = 100] = "d";
    AsciiCode[AsciiCode["e"] = 101] = "e";
    AsciiCode[AsciiCode["f"] = 102] = "f";
    AsciiCode[AsciiCode["g"] = 103] = "g";
    AsciiCode[AsciiCode["h"] = 104] = "h";
    AsciiCode[AsciiCode["i"] = 105] = "i";
    AsciiCode[AsciiCode["j"] = 106] = "j";
    AsciiCode[AsciiCode["k"] = 107] = "k";
    AsciiCode[AsciiCode["l"] = 108] = "l";
    AsciiCode[AsciiCode["m"] = 109] = "m";
    AsciiCode[AsciiCode["n"] = 110] = "n";
    AsciiCode[AsciiCode["o"] = 111] = "o";
    AsciiCode[AsciiCode["p"] = 112] = "p";
    AsciiCode[AsciiCode["q"] = 113] = "q";
    AsciiCode[AsciiCode["r"] = 114] = "r";
    AsciiCode[AsciiCode["s"] = 115] = "s";
    AsciiCode[AsciiCode["t"] = 116] = "t";
    AsciiCode[AsciiCode["u"] = 117] = "u";
    AsciiCode[AsciiCode["v"] = 118] = "v";
    AsciiCode[AsciiCode["w"] = 119] = "w";
    AsciiCode[AsciiCode["x"] = 120] = "x";
    AsciiCode[AsciiCode["y"] = 121] = "y";
    AsciiCode[AsciiCode["z"] = 122] = "z";
})(AsciiCode || (AsciiCode = {}));
/**
 * Numbers that represent multiple ascii codes. These are precomputed at compile time to reduce
 * bundle and runtime overhead.
 */
var AsciiCodeCombo;
(function (AsciiCodeCombo) {
    AsciiCodeCombo[AsciiCodeCombo["fa"] = 24934] = "fa";
    AsciiCodeCombo[AsciiCodeCombo["fg"] = 26470] = "fg";
    AsciiCodeCombo[AsciiCodeCombo["fq"] = 29030] = "fq";
    AsciiCodeCombo[AsciiCodeCombo["fr"] = 29286] = "fr";
    AsciiCodeCombo[AsciiCodeCombo["ft"] = 29798] = "ft";
    AsciiCodeCombo[AsciiCodeCombo["fv"] = 30310] = "fv";
    AsciiCodeCombo[AsciiCodeCombo["fx"] = 30822] = "fx";
    AsciiCodeCombo[AsciiCodeCombo["hk"] = 27496] = "hk";
    AsciiCodeCombo[AsciiCodeCombo["hl"] = 27752] = "hl";
    AsciiCodeCombo[AsciiCodeCombo["ho"] = 28520] = "ho";
    AsciiCodeCombo[AsciiCodeCombo["ml"] = 27757] = "ml";
    AsciiCodeCombo[AsciiCodeCombo["nj"] = 27246] = "nj";
    AsciiCodeCombo[AsciiCodeCombo["nl"] = 27758] = "nl";
    AsciiCodeCombo[AsciiCodeCombo["np"] = 28782] = "np";
    AsciiCodeCombo[AsciiCodeCombo["qt"] = 29809] = "qt";
    AsciiCodeCombo[AsciiCodeCombo["rt"] = 29810] = "rt";
    AsciiCodeCombo[AsciiCodeCombo["sg"] = 26483] = "sg";
    AsciiCodeCombo[AsciiCodeCombo["sw"] = 30579] = "sw";
})(AsciiCodeCombo || (AsciiCodeCombo = {}));
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
    114 /* AsciiCode.r */, // ㄱ
    82 /* AsciiCode.R */, // ㄲ
    115 /* AsciiCode.s */, // ㄴ
    101 /* AsciiCode.e */, // ㄷ
    69 /* AsciiCode.E */, // ㄸ
    102 /* AsciiCode.f */, // ㄹ
    97 /* AsciiCode.a */, // ㅁ
    113 /* AsciiCode.q */, // ㅂ
    81 /* AsciiCode.Q */, // ㅃ
    116 /* AsciiCode.t */, // ㅅ
    84 /* AsciiCode.T */, // ㅆ
    100 /* AsciiCode.d */, // ㅇ
    119 /* AsciiCode.w */, // ㅈ
    87 /* AsciiCode.W */, // ㅉ
    99 /* AsciiCode.c */, // ㅊ
    122 /* AsciiCode.z */, // ㅋ
    120 /* AsciiCode.x */, // ㅌ
    118 /* AsciiCode.v */, // ㅍ
    103 /* AsciiCode.g */, // ㅎ
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
    107 /* AsciiCode.k */, //  -> ㅏ
    111 /* AsciiCode.o */, //  -> ㅐ
    105 /* AsciiCode.i */, //  -> ㅑ
    79 /* AsciiCode.O */, //  -> ㅒ
    106 /* AsciiCode.j */, //  -> ㅓ
    112 /* AsciiCode.p */, //  -> ㅔ
    117 /* AsciiCode.u */, //  -> ㅕ
    80 /* AsciiCode.P */, //  -> ㅖ
    104 /* AsciiCode.h */, //  -> ㅗ
    27496 /* AsciiCodeCombo.hk */, //  -> ㅘ
    28520 /* AsciiCodeCombo.ho */, //  -> ㅙ
    27752 /* AsciiCodeCombo.hl */, //  -> ㅚ
    121 /* AsciiCode.y */, //  -> ㅛ
    110 /* AsciiCode.n */, //  -> ㅜ
    27246 /* AsciiCodeCombo.nj */, //  -> ㅝ
    28782 /* AsciiCodeCombo.np */, //  -> ㅞ
    27758 /* AsciiCodeCombo.nl */, //  -> ㅟ
    98 /* AsciiCode.b */, //  -> ㅠ
    109 /* AsciiCode.m */, //  -> ㅡ
    27757 /* AsciiCodeCombo.ml */, //  -> ㅢ
    108 /* AsciiCode.l */, //  -> ㅣ
]);
/**
 * Hangul Jamo - Modern Consonants #2
 *
 * Range U+11A8..U+11C2
 *
 * |        | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
 * |--------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
 * | U+11Ax |   |   |   |   |   |   |   |   | ᆨ | ᆩ | ᆪ | ᆫ | ᆬ | ᆭ | ᆮ | ᆯ |
 * | U+11Bx | ᆰ | ᆱ | ᆲ | ᆳ | ᆴ | ᆵ | ᆶ | ᆷ | ᆸ | ᆹ | ᆺ | ᆻ | ᆼ | ᆽ | ᆾ | ᆿ |
 * | U+11Cx | ᇀ | ᇁ | ᇂ |
 */
const modernFinalConsonants = new Uint16Array([
    114 /* AsciiCode.r */, // ㄱ
    82 /* AsciiCode.R */, // ㄲ
    29810 /* AsciiCodeCombo.rt */, // ㄳ
    115 /* AsciiCode.s */, // ㄴ
    30579 /* AsciiCodeCombo.sw */, // ㄵ
    26483 /* AsciiCodeCombo.sg */, // ㄶ
    101 /* AsciiCode.e */, // ㄷ
    102 /* AsciiCode.f */, // ㄹ
    29286 /* AsciiCodeCombo.fr */, // ㄺ
    24934 /* AsciiCodeCombo.fa */, // ㄻ
    29030 /* AsciiCodeCombo.fq */, // ㄼ
    29798 /* AsciiCodeCombo.ft */, // ㄽ
    30822 /* AsciiCodeCombo.fx */, // ㄾ
    30310 /* AsciiCodeCombo.fv */, // ㄿ
    26470 /* AsciiCodeCombo.fg */, // ㅀ
    97 /* AsciiCode.a */, // ㅁ
    113 /* AsciiCode.q */, // ㅂ
    29809 /* AsciiCodeCombo.qt */, // ㅄ
    116 /* AsciiCode.t */, // ㅅ
    84 /* AsciiCode.T */, // ㅆ
    100 /* AsciiCode.d */, // ㅇ
    119 /* AsciiCode.w */, // ㅈ
    99 /* AsciiCode.c */, // ㅊ
    122 /* AsciiCode.z */, // ㅋ
    120 /* AsciiCode.x */, // ㅌ
    118 /* AsciiCode.v */, // ㅍ
    103 /* AsciiCode.g */, // ㅎ
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
    114 /* AsciiCode.r */, // ㄱ
    82 /* AsciiCode.R */, // ㄲ
    29810 /* AsciiCodeCombo.rt */, // ㄳ
    115 /* AsciiCode.s */, // ㄴ
    30579 /* AsciiCodeCombo.sw */, // ㄵ
    26483 /* AsciiCodeCombo.sg */, // ㄶ
    101 /* AsciiCode.e */, // ㄷ
    69 /* AsciiCode.E */, // ㄸ
    102 /* AsciiCode.f */, // ㄹ
    29286 /* AsciiCodeCombo.fr */, // ㄺ
    24934 /* AsciiCodeCombo.fa */, // ㄻ
    29030 /* AsciiCodeCombo.fq */, // ㄼ
    29798 /* AsciiCodeCombo.ft */, // ㄽ
    30822 /* AsciiCodeCombo.fx */, // ㄾ
    30310 /* AsciiCodeCombo.fv */, // ㄿ
    26470 /* AsciiCodeCombo.fg */, // ㅀ
    97 /* AsciiCode.a */, // ㅁ
    113 /* AsciiCode.q */, // ㅂ
    81 /* AsciiCode.Q */, // ㅃ
    29809 /* AsciiCodeCombo.qt */, // ㅄ
    116 /* AsciiCode.t */, // ㅅ
    84 /* AsciiCode.T */, // ㅆ
    100 /* AsciiCode.d */, // ㅇ
    119 /* AsciiCode.w */, // ㅈ
    87 /* AsciiCode.W */, // ㅉ
    99 /* AsciiCode.c */, // ㅊ
    122 /* AsciiCode.z */, // ㅋ
    120 /* AsciiCode.x */, // ㅌ
    118 /* AsciiCode.v */, // ㅍ
    103 /* AsciiCode.g */, // ㅎ
    107 /* AsciiCode.k */, // ㅏ
    111 /* AsciiCode.o */, // ㅐ
    105 /* AsciiCode.i */, // ㅑ
    79 /* AsciiCode.O */, // ㅒ
    106 /* AsciiCode.j */, // ㅓ
    112 /* AsciiCode.p */, // ㅔ
    117 /* AsciiCode.u */, // ㅕ
    80 /* AsciiCode.P */, // ㅖ
    104 /* AsciiCode.h */, // ㅗ
    27496 /* AsciiCodeCombo.hk */, // ㅘ
    28520 /* AsciiCodeCombo.ho */, // ㅙ
    27752 /* AsciiCodeCombo.hl */, // ㅚ
    121 /* AsciiCode.y */, // ㅛ
    110 /* AsciiCode.n */, // ㅜ
    27246 /* AsciiCodeCombo.nj */, // ㅝ
    28782 /* AsciiCodeCombo.np */, // ㅞ
    27758 /* AsciiCodeCombo.nl */, // ㅟ
    98 /* AsciiCode.b */, // ㅠ
    109 /* AsciiCode.m */, // ㅡ
    27757 /* AsciiCodeCombo.ml */, // ㅢ
    108 /* AsciiCode.l */, // ㅣ
    // HF: Hangul Filler (everything after this is archaic)
    // ㅥ
    // ㅦ
    // ㅧ
    // ㅨ
    // ㅩ
    // ㅪ
    // ㅫ
    // ㅬ
    // ㅮ
    // ㅯ
    // ㅰ
    // ㅱ
    // ㅲ
    // ㅳ
    // ㅴ
    // ㅵ
    // ㅶ
    // ㅷ
    // ㅸ
    // ㅹ
    // ㅺ
    // ㅻ
    // ㅼ
    // ㅽ
    // ㅾ
    // ㅿ
    // ㆀ
    // ㆁ
    // ㆂ
    // ㆃ
    // ㆄ
    // ㆅ
    // ㆆ
    // ㆇ
    // ㆈ
    // ㆉ
    // ㆊ
    // ㆋ
    // ㆌ
    // ㆍ
    // ㆎ
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia29yZWFuLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vbmF0dXJhbExhbmd1YWdlL2tvcmVhbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxpQ0FBaUM7QUFFakM7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxJQUFZO0lBQzdDLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZDLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDakMsT0FBTyxJQUFJLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0FBQ3pCLE1BQU0sVUFBVSxHQUFHLElBQUksV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZDLFNBQVMsaUJBQWlCLENBQUMsSUFBWTtJQUN0QyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7SUFFckIsMEJBQTBCO0lBQzFCLGlCQUFpQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsbURBQXdDLENBQUM7SUFDakYsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMxQixPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELGNBQWM7SUFDZCxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsWUFBWSx3Q0FBNkIsQ0FBQztJQUNsRSxJQUFJLGdCQUFnQixHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzFCLE9BQU8sVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQs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QUFJOzJCQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTswQkFDSixJQUFJOzJCQUNKLElBQUk7bUNBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzJCQUNKLElBQUk7MkJBQ0osSUFBSTtDQUN2QixDQUFDLENBQUM7QUFFSDs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxXQUFXLENBQUM7MkJBQ3JCLElBQUk7MEJBQ0osSUFBSTttQ0FDSixJQUFJOzJCQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJOzJCQUNKLElBQUk7MEJBQ0osSUFBSTsyQkFDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJO21DQUNKLElBQUk7MEJBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7bUNBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7MEJBQ0osSUFBSTsyQkFDSixJQUFJOzJCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzJCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzBCQUNKLElBQUk7MkJBQ0osSUFBSTsyQkFDSixJQUFJOzJCQUNKLElBQUk7MEJBQ0osSUFBSTsyQkFDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTttQ0FDSixJQUFJOzJCQUNKLElBQUk7MkJBQ0osSUFBSTttQ0FDSixJQUFJO21DQUNKLElBQUk7bUNBQ0osSUFBSTswQkFDSixJQUFJOzJCQUNKLElBQUk7bUNBQ0osSUFBSTsyQkFDSixJQUFJO0lBQ3hCLHVEQUF1RDtJQUN2RCxJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtDQUNKLENBQUMsQ0FBQyJ9