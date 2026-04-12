/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var ScanError;
(function (ScanError) {
    ScanError[ScanError["None"] = 0] = "None";
    ScanError[ScanError["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
    ScanError[ScanError["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
    ScanError[ScanError["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
    ScanError[ScanError["InvalidUnicode"] = 4] = "InvalidUnicode";
    ScanError[ScanError["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
    ScanError[ScanError["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
export var SyntaxKind;
(function (SyntaxKind) {
    SyntaxKind[SyntaxKind["OpenBraceToken"] = 1] = "OpenBraceToken";
    SyntaxKind[SyntaxKind["CloseBraceToken"] = 2] = "CloseBraceToken";
    SyntaxKind[SyntaxKind["OpenBracketToken"] = 3] = "OpenBracketToken";
    SyntaxKind[SyntaxKind["CloseBracketToken"] = 4] = "CloseBracketToken";
    SyntaxKind[SyntaxKind["CommaToken"] = 5] = "CommaToken";
    SyntaxKind[SyntaxKind["ColonToken"] = 6] = "ColonToken";
    SyntaxKind[SyntaxKind["NullKeyword"] = 7] = "NullKeyword";
    SyntaxKind[SyntaxKind["TrueKeyword"] = 8] = "TrueKeyword";
    SyntaxKind[SyntaxKind["FalseKeyword"] = 9] = "FalseKeyword";
    SyntaxKind[SyntaxKind["StringLiteral"] = 10] = "StringLiteral";
    SyntaxKind[SyntaxKind["NumericLiteral"] = 11] = "NumericLiteral";
    SyntaxKind[SyntaxKind["LineCommentTrivia"] = 12] = "LineCommentTrivia";
    SyntaxKind[SyntaxKind["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
    SyntaxKind[SyntaxKind["LineBreakTrivia"] = 14] = "LineBreakTrivia";
    SyntaxKind[SyntaxKind["Trivia"] = 15] = "Trivia";
    SyntaxKind[SyntaxKind["Unknown"] = 16] = "Unknown";
    SyntaxKind[SyntaxKind["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
export var ParseErrorCode;
(function (ParseErrorCode) {
    ParseErrorCode[ParseErrorCode["InvalidSymbol"] = 1] = "InvalidSymbol";
    ParseErrorCode[ParseErrorCode["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
    ParseErrorCode[ParseErrorCode["PropertyNameExpected"] = 3] = "PropertyNameExpected";
    ParseErrorCode[ParseErrorCode["ValueExpected"] = 4] = "ValueExpected";
    ParseErrorCode[ParseErrorCode["ColonExpected"] = 5] = "ColonExpected";
    ParseErrorCode[ParseErrorCode["CommaExpected"] = 6] = "CommaExpected";
    ParseErrorCode[ParseErrorCode["CloseBraceExpected"] = 7] = "CloseBraceExpected";
    ParseErrorCode[ParseErrorCode["CloseBracketExpected"] = 8] = "CloseBracketExpected";
    ParseErrorCode[ParseErrorCode["EndOfFileExpected"] = 9] = "EndOfFileExpected";
    ParseErrorCode[ParseErrorCode["InvalidCommentToken"] = 10] = "InvalidCommentToken";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
    ParseErrorCode[ParseErrorCode["InvalidUnicode"] = 14] = "InvalidUnicode";
    ParseErrorCode[ParseErrorCode["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
    ParseErrorCode[ParseErrorCode["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
export var ParseOptions;
(function (ParseOptions) {
    ParseOptions.DEFAULT = {
        allowTrailingComma: true
    };
})(ParseOptions || (ParseOptions = {}));
/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
export function createScanner(text, ignoreTrivia = false) {
    let pos = 0;
    const len = text.length;
    let value = '';
    let tokenOffset = 0;
    let token = 16 /* SyntaxKind.Unknown */;
    let scanError = 0 /* ScanError.None */;
    function scanHexDigits(count) {
        let digits = 0;
        let hexValue = 0;
        while (digits < count) {
            const ch = text.charCodeAt(pos);
            if (ch >= 48 /* CharacterCodes._0 */ && ch <= 57 /* CharacterCodes._9 */) {
                hexValue = hexValue * 16 + ch - 48 /* CharacterCodes._0 */;
            }
            else if (ch >= 65 /* CharacterCodes.A */ && ch <= 70 /* CharacterCodes.F */) {
                hexValue = hexValue * 16 + ch - 65 /* CharacterCodes.A */ + 10;
            }
            else if (ch >= 97 /* CharacterCodes.a */ && ch <= 102 /* CharacterCodes.f */) {
                hexValue = hexValue * 16 + ch - 97 /* CharacterCodes.a */ + 10;
            }
            else {
                break;
            }
            pos++;
            digits++;
        }
        if (digits < count) {
            hexValue = -1;
        }
        return hexValue;
    }
    function setPosition(newPosition) {
        pos = newPosition;
        value = '';
        tokenOffset = 0;
        token = 16 /* SyntaxKind.Unknown */;
        scanError = 0 /* ScanError.None */;
    }
    function scanNumber() {
        const start = pos;
        if (text.charCodeAt(pos) === 48 /* CharacterCodes._0 */) {
            pos++;
        }
        else {
            pos++;
            while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
            }
        }
        if (pos < text.length && text.charCodeAt(pos) === 46 /* CharacterCodes.dot */) {
            pos++;
            if (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
                while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                    pos++;
                }
            }
            else {
                scanError = 3 /* ScanError.UnexpectedEndOfNumber */;
                return text.substring(start, pos);
            }
        }
        let end = pos;
        if (pos < text.length && (text.charCodeAt(pos) === 69 /* CharacterCodes.E */ || text.charCodeAt(pos) === 101 /* CharacterCodes.e */)) {
            pos++;
            if (pos < text.length && text.charCodeAt(pos) === 43 /* CharacterCodes.plus */ || text.charCodeAt(pos) === 45 /* CharacterCodes.minus */) {
                pos++;
            }
            if (pos < text.length && isDigit(text.charCodeAt(pos))) {
                pos++;
                while (pos < text.length && isDigit(text.charCodeAt(pos))) {
                    pos++;
                }
                end = pos;
            }
            else {
                scanError = 3 /* ScanError.UnexpectedEndOfNumber */;
            }
        }
        return text.substring(start, end);
    }
    function scanString() {
        let result = '', start = pos;
        while (true) {
            if (pos >= len) {
                result += text.substring(start, pos);
                scanError = 2 /* ScanError.UnexpectedEndOfString */;
                break;
            }
            const ch = text.charCodeAt(pos);
            if (ch === 34 /* CharacterCodes.doubleQuote */) {
                result += text.substring(start, pos);
                pos++;
                break;
            }
            if (ch === 92 /* CharacterCodes.backslash */) {
                result += text.substring(start, pos);
                pos++;
                if (pos >= len) {
                    scanError = 2 /* ScanError.UnexpectedEndOfString */;
                    break;
                }
                const ch2 = text.charCodeAt(pos++);
                switch (ch2) {
                    case 34 /* CharacterCodes.doubleQuote */:
                        result += '\"';
                        break;
                    case 92 /* CharacterCodes.backslash */:
                        result += '\\';
                        break;
                    case 47 /* CharacterCodes.slash */:
                        result += '/';
                        break;
                    case 98 /* CharacterCodes.b */:
                        result += '\b';
                        break;
                    case 102 /* CharacterCodes.f */:
                        result += '\f';
                        break;
                    case 110 /* CharacterCodes.n */:
                        result += '\n';
                        break;
                    case 114 /* CharacterCodes.r */:
                        result += '\r';
                        break;
                    case 116 /* CharacterCodes.t */:
                        result += '\t';
                        break;
                    case 117 /* CharacterCodes.u */: {
                        const ch3 = scanHexDigits(4);
                        if (ch3 >= 0) {
                            result += String.fromCharCode(ch3);
                        }
                        else {
                            scanError = 4 /* ScanError.InvalidUnicode */;
                        }
                        break;
                    }
                    default:
                        scanError = 5 /* ScanError.InvalidEscapeCharacter */;
                }
                start = pos;
                continue;
            }
            if (ch >= 0 && ch <= 0x1F) {
                if (isLineBreak(ch)) {
                    result += text.substring(start, pos);
                    scanError = 2 /* ScanError.UnexpectedEndOfString */;
                    break;
                }
                else {
                    scanError = 6 /* ScanError.InvalidCharacter */;
                    // mark as error but continue with string
                }
            }
            pos++;
        }
        return result;
    }
    function scanNext() {
        value = '';
        scanError = 0 /* ScanError.None */;
        tokenOffset = pos;
        if (pos >= len) {
            // at the end
            tokenOffset = len;
            return token = 17 /* SyntaxKind.EOF */;
        }
        let code = text.charCodeAt(pos);
        // trivia: whitespace
        if (isWhitespace(code)) {
            do {
                pos++;
                value += String.fromCharCode(code);
                code = text.charCodeAt(pos);
            } while (isWhitespace(code));
            return token = 15 /* SyntaxKind.Trivia */;
        }
        // trivia: newlines
        if (isLineBreak(code)) {
            pos++;
            value += String.fromCharCode(code);
            if (code === 13 /* CharacterCodes.carriageReturn */ && text.charCodeAt(pos) === 10 /* CharacterCodes.lineFeed */) {
                pos++;
                value += '\n';
            }
            return token = 14 /* SyntaxKind.LineBreakTrivia */;
        }
        switch (code) {
            // tokens: []{}:,
            case 123 /* CharacterCodes.openBrace */:
                pos++;
                return token = 1 /* SyntaxKind.OpenBraceToken */;
            case 125 /* CharacterCodes.closeBrace */:
                pos++;
                return token = 2 /* SyntaxKind.CloseBraceToken */;
            case 91 /* CharacterCodes.openBracket */:
                pos++;
                return token = 3 /* SyntaxKind.OpenBracketToken */;
            case 93 /* CharacterCodes.closeBracket */:
                pos++;
                return token = 4 /* SyntaxKind.CloseBracketToken */;
            case 58 /* CharacterCodes.colon */:
                pos++;
                return token = 6 /* SyntaxKind.ColonToken */;
            case 44 /* CharacterCodes.comma */:
                pos++;
                return token = 5 /* SyntaxKind.CommaToken */;
            // strings
            case 34 /* CharacterCodes.doubleQuote */:
                pos++;
                value = scanString();
                return token = 10 /* SyntaxKind.StringLiteral */;
            // comments
            case 47 /* CharacterCodes.slash */: {
                const start = pos - 1;
                // Single-line comment
                if (text.charCodeAt(pos + 1) === 47 /* CharacterCodes.slash */) {
                    pos += 2;
                    while (pos < len) {
                        if (isLineBreak(text.charCodeAt(pos))) {
                            break;
                        }
                        pos++;
                    }
                    value = text.substring(start, pos);
                    return token = 12 /* SyntaxKind.LineCommentTrivia */;
                }
                // Multi-line comment
                if (text.charCodeAt(pos + 1) === 42 /* CharacterCodes.asterisk */) {
                    pos += 2;
                    const safeLength = len - 1; // For lookahead.
                    let commentClosed = false;
                    while (pos < safeLength) {
                        const ch = text.charCodeAt(pos);
                        if (ch === 42 /* CharacterCodes.asterisk */ && text.charCodeAt(pos + 1) === 47 /* CharacterCodes.slash */) {
                            pos += 2;
                            commentClosed = true;
                            break;
                        }
                        pos++;
                    }
                    if (!commentClosed) {
                        pos++;
                        scanError = 1 /* ScanError.UnexpectedEndOfComment */;
                    }
                    value = text.substring(start, pos);
                    return token = 13 /* SyntaxKind.BlockCommentTrivia */;
                }
                // just a single slash
                value += String.fromCharCode(code);
                pos++;
                return token = 16 /* SyntaxKind.Unknown */;
            }
            // numbers
            case 45 /* CharacterCodes.minus */:
                value += String.fromCharCode(code);
                pos++;
                if (pos === len || !isDigit(text.charCodeAt(pos))) {
                    return token = 16 /* SyntaxKind.Unknown */;
                }
            // found a minus, followed by a number so
            // we fall through to proceed with scanning
            // numbers
            case 48 /* CharacterCodes._0 */:
            case 49 /* CharacterCodes._1 */:
            case 50 /* CharacterCodes._2 */:
            case 51 /* CharacterCodes._3 */:
            case 52 /* CharacterCodes._4 */:
            case 53 /* CharacterCodes._5 */:
            case 54 /* CharacterCodes._6 */:
            case 55 /* CharacterCodes._7 */:
            case 56 /* CharacterCodes._8 */:
            case 57 /* CharacterCodes._9 */:
                value += scanNumber();
                return token = 11 /* SyntaxKind.NumericLiteral */;
            // literals and unknown symbols
            default:
                // is a literal? Read the full word.
                while (pos < len && isUnknownContentCharacter(code)) {
                    pos++;
                    code = text.charCodeAt(pos);
                }
                if (tokenOffset !== pos) {
                    value = text.substring(tokenOffset, pos);
                    // keywords: true, false, null
                    switch (value) {
                        case 'true': return token = 8 /* SyntaxKind.TrueKeyword */;
                        case 'false': return token = 9 /* SyntaxKind.FalseKeyword */;
                        case 'null': return token = 7 /* SyntaxKind.NullKeyword */;
                    }
                    return token = 16 /* SyntaxKind.Unknown */;
                }
                // some
                value += String.fromCharCode(code);
                pos++;
                return token = 16 /* SyntaxKind.Unknown */;
        }
    }
    function isUnknownContentCharacter(code) {
        if (isWhitespace(code) || isLineBreak(code)) {
            return false;
        }
        switch (code) {
            case 125 /* CharacterCodes.closeBrace */:
            case 93 /* CharacterCodes.closeBracket */:
            case 123 /* CharacterCodes.openBrace */:
            case 91 /* CharacterCodes.openBracket */:
            case 34 /* CharacterCodes.doubleQuote */:
            case 58 /* CharacterCodes.colon */:
            case 44 /* CharacterCodes.comma */:
            case 47 /* CharacterCodes.slash */:
                return false;
        }
        return true;
    }
    function scanNextNonTrivia() {
        let result;
        do {
            result = scanNext();
        } while (result >= 12 /* SyntaxKind.LineCommentTrivia */ && result <= 15 /* SyntaxKind.Trivia */);
        return result;
    }
    return {
        setPosition: setPosition,
        getPosition: () => pos,
        scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
        getToken: () => token,
        getTokenValue: () => value,
        getTokenOffset: () => tokenOffset,
        getTokenLength: () => pos - tokenOffset,
        getTokenError: () => scanError
    };
}
function isWhitespace(ch) {
    return ch === 32 /* CharacterCodes.space */ || ch === 9 /* CharacterCodes.tab */ || ch === 11 /* CharacterCodes.verticalTab */ || ch === 12 /* CharacterCodes.formFeed */ ||
        ch === 160 /* CharacterCodes.nonBreakingSpace */ || ch === 5760 /* CharacterCodes.ogham */ || ch >= 8192 /* CharacterCodes.enQuad */ && ch <= 8203 /* CharacterCodes.zeroWidthSpace */ ||
        ch === 8239 /* CharacterCodes.narrowNoBreakSpace */ || ch === 8287 /* CharacterCodes.mathematicalSpace */ || ch === 12288 /* CharacterCodes.ideographicSpace */ || ch === 65279 /* CharacterCodes.byteOrderMark */;
}
function isLineBreak(ch) {
    return ch === 10 /* CharacterCodes.lineFeed */ || ch === 13 /* CharacterCodes.carriageReturn */ || ch === 8232 /* CharacterCodes.lineSeparator */ || ch === 8233 /* CharacterCodes.paragraphSeparator */;
}
function isDigit(ch) {
    return ch >= 48 /* CharacterCodes._0 */ && ch <= 57 /* CharacterCodes._9 */;
}
var CharacterCodes;
(function (CharacterCodes) {
    CharacterCodes[CharacterCodes["nullCharacter"] = 0] = "nullCharacter";
    CharacterCodes[CharacterCodes["maxAsciiCharacter"] = 127] = "maxAsciiCharacter";
    CharacterCodes[CharacterCodes["lineFeed"] = 10] = "lineFeed";
    CharacterCodes[CharacterCodes["carriageReturn"] = 13] = "carriageReturn";
    CharacterCodes[CharacterCodes["lineSeparator"] = 8232] = "lineSeparator";
    CharacterCodes[CharacterCodes["paragraphSeparator"] = 8233] = "paragraphSeparator";
    // REVIEW: do we need to support this?  The scanner doesn't, but our IText does.  This seems
    // like an odd disparity?  (Or maybe it's completely fine for them to be different).
    CharacterCodes[CharacterCodes["nextLine"] = 133] = "nextLine";
    // Unicode 3.0 space characters
    CharacterCodes[CharacterCodes["space"] = 32] = "space";
    CharacterCodes[CharacterCodes["nonBreakingSpace"] = 160] = "nonBreakingSpace";
    CharacterCodes[CharacterCodes["enQuad"] = 8192] = "enQuad";
    CharacterCodes[CharacterCodes["emQuad"] = 8193] = "emQuad";
    CharacterCodes[CharacterCodes["enSpace"] = 8194] = "enSpace";
    CharacterCodes[CharacterCodes["emSpace"] = 8195] = "emSpace";
    CharacterCodes[CharacterCodes["threePerEmSpace"] = 8196] = "threePerEmSpace";
    CharacterCodes[CharacterCodes["fourPerEmSpace"] = 8197] = "fourPerEmSpace";
    CharacterCodes[CharacterCodes["sixPerEmSpace"] = 8198] = "sixPerEmSpace";
    CharacterCodes[CharacterCodes["figureSpace"] = 8199] = "figureSpace";
    CharacterCodes[CharacterCodes["punctuationSpace"] = 8200] = "punctuationSpace";
    CharacterCodes[CharacterCodes["thinSpace"] = 8201] = "thinSpace";
    CharacterCodes[CharacterCodes["hairSpace"] = 8202] = "hairSpace";
    CharacterCodes[CharacterCodes["zeroWidthSpace"] = 8203] = "zeroWidthSpace";
    CharacterCodes[CharacterCodes["narrowNoBreakSpace"] = 8239] = "narrowNoBreakSpace";
    CharacterCodes[CharacterCodes["ideographicSpace"] = 12288] = "ideographicSpace";
    CharacterCodes[CharacterCodes["mathematicalSpace"] = 8287] = "mathematicalSpace";
    CharacterCodes[CharacterCodes["ogham"] = 5760] = "ogham";
    CharacterCodes[CharacterCodes["_"] = 95] = "_";
    CharacterCodes[CharacterCodes["$"] = 36] = "$";
    CharacterCodes[CharacterCodes["_0"] = 48] = "_0";
    CharacterCodes[CharacterCodes["_1"] = 49] = "_1";
    CharacterCodes[CharacterCodes["_2"] = 50] = "_2";
    CharacterCodes[CharacterCodes["_3"] = 51] = "_3";
    CharacterCodes[CharacterCodes["_4"] = 52] = "_4";
    CharacterCodes[CharacterCodes["_5"] = 53] = "_5";
    CharacterCodes[CharacterCodes["_6"] = 54] = "_6";
    CharacterCodes[CharacterCodes["_7"] = 55] = "_7";
    CharacterCodes[CharacterCodes["_8"] = 56] = "_8";
    CharacterCodes[CharacterCodes["_9"] = 57] = "_9";
    CharacterCodes[CharacterCodes["a"] = 97] = "a";
    CharacterCodes[CharacterCodes["b"] = 98] = "b";
    CharacterCodes[CharacterCodes["c"] = 99] = "c";
    CharacterCodes[CharacterCodes["d"] = 100] = "d";
    CharacterCodes[CharacterCodes["e"] = 101] = "e";
    CharacterCodes[CharacterCodes["f"] = 102] = "f";
    CharacterCodes[CharacterCodes["g"] = 103] = "g";
    CharacterCodes[CharacterCodes["h"] = 104] = "h";
    CharacterCodes[CharacterCodes["i"] = 105] = "i";
    CharacterCodes[CharacterCodes["j"] = 106] = "j";
    CharacterCodes[CharacterCodes["k"] = 107] = "k";
    CharacterCodes[CharacterCodes["l"] = 108] = "l";
    CharacterCodes[CharacterCodes["m"] = 109] = "m";
    CharacterCodes[CharacterCodes["n"] = 110] = "n";
    CharacterCodes[CharacterCodes["o"] = 111] = "o";
    CharacterCodes[CharacterCodes["p"] = 112] = "p";
    CharacterCodes[CharacterCodes["q"] = 113] = "q";
    CharacterCodes[CharacterCodes["r"] = 114] = "r";
    CharacterCodes[CharacterCodes["s"] = 115] = "s";
    CharacterCodes[CharacterCodes["t"] = 116] = "t";
    CharacterCodes[CharacterCodes["u"] = 117] = "u";
    CharacterCodes[CharacterCodes["v"] = 118] = "v";
    CharacterCodes[CharacterCodes["w"] = 119] = "w";
    CharacterCodes[CharacterCodes["x"] = 120] = "x";
    CharacterCodes[CharacterCodes["y"] = 121] = "y";
    CharacterCodes[CharacterCodes["z"] = 122] = "z";
    CharacterCodes[CharacterCodes["A"] = 65] = "A";
    CharacterCodes[CharacterCodes["B"] = 66] = "B";
    CharacterCodes[CharacterCodes["C"] = 67] = "C";
    CharacterCodes[CharacterCodes["D"] = 68] = "D";
    CharacterCodes[CharacterCodes["E"] = 69] = "E";
    CharacterCodes[CharacterCodes["F"] = 70] = "F";
    CharacterCodes[CharacterCodes["G"] = 71] = "G";
    CharacterCodes[CharacterCodes["H"] = 72] = "H";
    CharacterCodes[CharacterCodes["I"] = 73] = "I";
    CharacterCodes[CharacterCodes["J"] = 74] = "J";
    CharacterCodes[CharacterCodes["K"] = 75] = "K";
    CharacterCodes[CharacterCodes["L"] = 76] = "L";
    CharacterCodes[CharacterCodes["M"] = 77] = "M";
    CharacterCodes[CharacterCodes["N"] = 78] = "N";
    CharacterCodes[CharacterCodes["O"] = 79] = "O";
    CharacterCodes[CharacterCodes["P"] = 80] = "P";
    CharacterCodes[CharacterCodes["Q"] = 81] = "Q";
    CharacterCodes[CharacterCodes["R"] = 82] = "R";
    CharacterCodes[CharacterCodes["S"] = 83] = "S";
    CharacterCodes[CharacterCodes["T"] = 84] = "T";
    CharacterCodes[CharacterCodes["U"] = 85] = "U";
    CharacterCodes[CharacterCodes["V"] = 86] = "V";
    CharacterCodes[CharacterCodes["W"] = 87] = "W";
    CharacterCodes[CharacterCodes["X"] = 88] = "X";
    CharacterCodes[CharacterCodes["Y"] = 89] = "Y";
    CharacterCodes[CharacterCodes["Z"] = 90] = "Z";
    CharacterCodes[CharacterCodes["ampersand"] = 38] = "ampersand";
    CharacterCodes[CharacterCodes["asterisk"] = 42] = "asterisk";
    CharacterCodes[CharacterCodes["at"] = 64] = "at";
    CharacterCodes[CharacterCodes["backslash"] = 92] = "backslash";
    CharacterCodes[CharacterCodes["bar"] = 124] = "bar";
    CharacterCodes[CharacterCodes["caret"] = 94] = "caret";
    CharacterCodes[CharacterCodes["closeBrace"] = 125] = "closeBrace";
    CharacterCodes[CharacterCodes["closeBracket"] = 93] = "closeBracket";
    CharacterCodes[CharacterCodes["closeParen"] = 41] = "closeParen";
    CharacterCodes[CharacterCodes["colon"] = 58] = "colon";
    CharacterCodes[CharacterCodes["comma"] = 44] = "comma";
    CharacterCodes[CharacterCodes["dot"] = 46] = "dot";
    CharacterCodes[CharacterCodes["doubleQuote"] = 34] = "doubleQuote";
    CharacterCodes[CharacterCodes["equals"] = 61] = "equals";
    CharacterCodes[CharacterCodes["exclamation"] = 33] = "exclamation";
    CharacterCodes[CharacterCodes["greaterThan"] = 62] = "greaterThan";
    CharacterCodes[CharacterCodes["lessThan"] = 60] = "lessThan";
    CharacterCodes[CharacterCodes["minus"] = 45] = "minus";
    CharacterCodes[CharacterCodes["openBrace"] = 123] = "openBrace";
    CharacterCodes[CharacterCodes["openBracket"] = 91] = "openBracket";
    CharacterCodes[CharacterCodes["openParen"] = 40] = "openParen";
    CharacterCodes[CharacterCodes["percent"] = 37] = "percent";
    CharacterCodes[CharacterCodes["plus"] = 43] = "plus";
    CharacterCodes[CharacterCodes["question"] = 63] = "question";
    CharacterCodes[CharacterCodes["semicolon"] = 59] = "semicolon";
    CharacterCodes[CharacterCodes["singleQuote"] = 39] = "singleQuote";
    CharacterCodes[CharacterCodes["slash"] = 47] = "slash";
    CharacterCodes[CharacterCodes["tilde"] = 126] = "tilde";
    CharacterCodes[CharacterCodes["backspace"] = 8] = "backspace";
    CharacterCodes[CharacterCodes["formFeed"] = 12] = "formFeed";
    CharacterCodes[CharacterCodes["byteOrderMark"] = 65279] = "byteOrderMark";
    CharacterCodes[CharacterCodes["tab"] = 9] = "tab";
    CharacterCodes[CharacterCodes["verticalTab"] = 11] = "verticalTab";
})(CharacterCodes || (CharacterCodes = {}));
/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
export function getLocation(text, position) {
    const segments = []; // strings or numbers
    const earlyReturnException = new Object();
    let previousNode = undefined;
    const previousNodeInst = {
        value: {},
        offset: 0,
        length: 0,
        type: 'object',
        parent: undefined
    };
    let isAtPropertyKey = false;
    function setPreviousNode(value, offset, length, type) {
        previousNodeInst.value = value;
        previousNodeInst.offset = offset;
        previousNodeInst.length = length;
        previousNodeInst.type = type;
        previousNodeInst.colonOffset = undefined;
        previousNode = previousNodeInst;
    }
    try {
        visit(text, {
            onObjectBegin: (offset, length) => {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = undefined;
                isAtPropertyKey = position > offset;
                segments.push(''); // push a placeholder (will be replaced)
            },
            onObjectProperty: (name, offset, length) => {
                if (position < offset) {
                    throw earlyReturnException;
                }
                setPreviousNode(name, offset, length, 'property');
                segments[segments.length - 1] = name;
                if (position <= offset + length) {
                    throw earlyReturnException;
                }
            },
            onObjectEnd: (offset, length) => {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = undefined;
                segments.pop();
            },
            onArrayBegin: (offset, length) => {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = undefined;
                segments.push(0);
            },
            onArrayEnd: (offset, length) => {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                previousNode = undefined;
                segments.pop();
            },
            onLiteralValue: (value, offset, length) => {
                if (position < offset) {
                    throw earlyReturnException;
                }
                setPreviousNode(value, offset, length, getNodeType(value));
                if (position <= offset + length) {
                    throw earlyReturnException;
                }
            },
            onSeparator: (sep, offset, length) => {
                if (position <= offset) {
                    throw earlyReturnException;
                }
                if (sep === ':' && previousNode && previousNode.type === 'property') {
                    previousNode.colonOffset = offset;
                    isAtPropertyKey = false;
                    previousNode = undefined;
                }
                else if (sep === ',') {
                    const last = segments[segments.length - 1];
                    if (typeof last === 'number') {
                        segments[segments.length - 1] = last + 1;
                    }
                    else {
                        isAtPropertyKey = true;
                        segments[segments.length - 1] = '';
                    }
                    previousNode = undefined;
                }
            }
        });
    }
    catch (e) {
        if (e !== earlyReturnException) {
            throw e;
        }
    }
    return {
        path: segments,
        previousNode,
        isAtPropertyKey,
        matches: (pattern) => {
            let k = 0;
            for (let i = 0; k < pattern.length && i < segments.length; i++) {
                if (pattern[k] === segments[i] || pattern[k] === '*') {
                    k++;
                }
                else if (pattern[k] !== '**') {
                    return false;
                }
            }
            return k === pattern.length;
        }
    };
}
/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
export function parse(text, errors = [], options = ParseOptions.DEFAULT) {
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    function onValue(value) {
        if (Array.isArray(currentParent)) {
            currentParent.push(value);
        }
        else if (currentProperty !== null) {
            currentParent[currentProperty] = value;
        }
    }
    const visitor = {
        onObjectBegin: () => {
            const object = {};
            onValue(object);
            previousParents.push(currentParent);
            currentParent = object;
            currentProperty = null;
        },
        onObjectProperty: (name) => {
            currentProperty = name;
        },
        onObjectEnd: () => {
            currentParent = previousParents.pop();
        },
        onArrayBegin: () => {
            const array = [];
            onValue(array);
            previousParents.push(currentParent);
            currentParent = array;
            currentProperty = null;
        },
        onArrayEnd: () => {
            currentParent = previousParents.pop();
        },
        onLiteralValue: onValue,
        onError: (error, offset, length) => {
            errors.push({ error, offset, length });
        }
    };
    visit(text, visitor, options);
    return currentParent[0];
}
/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export function parseTree(text, errors = [], options = ParseOptions.DEFAULT) {
    let currentParent = { type: 'array', offset: -1, length: -1, children: [], parent: undefined }; // artificial root
    function ensurePropertyComplete(endOffset) {
        if (currentParent.type === 'property') {
            currentParent.length = endOffset - currentParent.offset;
            currentParent = currentParent.parent;
        }
    }
    function onValue(valueNode) {
        currentParent.children.push(valueNode);
        return valueNode;
    }
    const visitor = {
        onObjectBegin: (offset) => {
            currentParent = onValue({ type: 'object', offset, length: -1, parent: currentParent, children: [] });
        },
        onObjectProperty: (name, offset, length) => {
            currentParent = onValue({ type: 'property', offset, length: -1, parent: currentParent, children: [] });
            currentParent.children.push({ type: 'string', value: name, offset, length, parent: currentParent });
        },
        onObjectEnd: (offset, length) => {
            currentParent.length = offset + length - currentParent.offset;
            currentParent = currentParent.parent;
            ensurePropertyComplete(offset + length);
        },
        onArrayBegin: (offset, length) => {
            currentParent = onValue({ type: 'array', offset, length: -1, parent: currentParent, children: [] });
        },
        onArrayEnd: (offset, length) => {
            currentParent.length = offset + length - currentParent.offset;
            currentParent = currentParent.parent;
            ensurePropertyComplete(offset + length);
        },
        onLiteralValue: (value, offset, length) => {
            onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
            ensurePropertyComplete(offset + length);
        },
        onSeparator: (sep, offset, length) => {
            if (currentParent.type === 'property') {
                if (sep === ':') {
                    currentParent.colonOffset = offset;
                }
                else if (sep === ',') {
                    ensurePropertyComplete(offset);
                }
            }
        },
        onError: (error, offset, length) => {
            errors.push({ error, offset, length });
        }
    };
    visit(text, visitor, options);
    const result = currentParent.children[0];
    if (result) {
        delete result.parent;
    }
    return result;
}
/**
 * Finds the node at the given path in a JSON DOM.
 */
export function findNodeAtLocation(root, path) {
    if (!root) {
        return undefined;
    }
    let node = root;
    for (const segment of path) {
        if (typeof segment === 'string') {
            if (node.type !== 'object' || !Array.isArray(node.children)) {
                return undefined;
            }
            let found = false;
            for (const propertyNode of node.children) {
                if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment) {
                    node = propertyNode.children[1];
                    found = true;
                    break;
                }
            }
            if (!found) {
                return undefined;
            }
        }
        else {
            const index = segment;
            if (node.type !== 'array' || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
                return undefined;
            }
            node = node.children[index];
        }
    }
    return node;
}
/**
 * Gets the JSON path of the given JSON DOM node
 */
export function getNodePath(node) {
    if (!node.parent || !node.parent.children) {
        return [];
    }
    const path = getNodePath(node.parent);
    if (node.parent.type === 'property') {
        const key = node.parent.children[0].value;
        path.push(key);
    }
    else if (node.parent.type === 'array') {
        const index = node.parent.children.indexOf(node);
        if (index !== -1) {
            path.push(index);
        }
    }
    return path;
}
/**
 * Evaluates the JavaScript object of the given JSON DOM node
 */
export function getNodeValue(node) {
    switch (node.type) {
        case 'array':
            return node.children.map(getNodeValue);
        case 'object': {
            const obj = Object.create(null);
            for (const prop of node.children) {
                const valueNode = prop.children[1];
                if (valueNode) {
                    obj[prop.children[0].value] = getNodeValue(valueNode);
                }
            }
            return obj;
        }
        case 'null':
        case 'string':
        case 'number':
        case 'boolean':
            return node.value;
        default:
            return undefined;
    }
}
export function contains(node, offset, includeRightBound = false) {
    return (offset >= node.offset && offset < (node.offset + node.length)) || includeRightBound && (offset === (node.offset + node.length));
}
/**
 * Finds the most inner node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
export function findNodeAtOffset(node, offset, includeRightBound = false) {
    if (contains(node, offset, includeRightBound)) {
        const children = node.children;
        if (Array.isArray(children)) {
            for (let i = 0; i < children.length && children[i].offset <= offset; i++) {
                const item = findNodeAtOffset(children[i], offset, includeRightBound);
                if (item) {
                    return item;
                }
            }
        }
        return node;
    }
    return undefined;
}
/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export function visit(text, visitor, options = ParseOptions.DEFAULT) {
    const _scanner = createScanner(text, false);
    function toNoArgVisit(visitFunction) {
        return visitFunction ? () => visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
    }
    function toOneArgVisit(visitFunction) {
        return visitFunction ? (arg) => visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
    }
    const onObjectBegin = toNoArgVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisit(visitor.onObjectProperty), onObjectEnd = toNoArgVisit(visitor.onObjectEnd), onArrayBegin = toNoArgVisit(visitor.onArrayBegin), onArrayEnd = toNoArgVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisit(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
    const disallowComments = options && options.disallowComments;
    const allowTrailingComma = options && options.allowTrailingComma;
    function scanNext() {
        while (true) {
            const token = _scanner.scan();
            switch (_scanner.getTokenError()) {
                case 4 /* ScanError.InvalidUnicode */:
                    handleError(14 /* ParseErrorCode.InvalidUnicode */);
                    break;
                case 5 /* ScanError.InvalidEscapeCharacter */:
                    handleError(15 /* ParseErrorCode.InvalidEscapeCharacter */);
                    break;
                case 3 /* ScanError.UnexpectedEndOfNumber */:
                    handleError(13 /* ParseErrorCode.UnexpectedEndOfNumber */);
                    break;
                case 1 /* ScanError.UnexpectedEndOfComment */:
                    if (!disallowComments) {
                        handleError(11 /* ParseErrorCode.UnexpectedEndOfComment */);
                    }
                    break;
                case 2 /* ScanError.UnexpectedEndOfString */:
                    handleError(12 /* ParseErrorCode.UnexpectedEndOfString */);
                    break;
                case 6 /* ScanError.InvalidCharacter */:
                    handleError(16 /* ParseErrorCode.InvalidCharacter */);
                    break;
            }
            switch (token) {
                case 12 /* SyntaxKind.LineCommentTrivia */:
                case 13 /* SyntaxKind.BlockCommentTrivia */:
                    if (disallowComments) {
                        handleError(10 /* ParseErrorCode.InvalidCommentToken */);
                    }
                    else {
                        onComment();
                    }
                    break;
                case 16 /* SyntaxKind.Unknown */:
                    handleError(1 /* ParseErrorCode.InvalidSymbol */);
                    break;
                case 15 /* SyntaxKind.Trivia */:
                case 14 /* SyntaxKind.LineBreakTrivia */:
                    break;
                default:
                    return token;
            }
        }
    }
    function handleError(error, skipUntilAfter = [], skipUntil = []) {
        onError(error);
        if (skipUntilAfter.length + skipUntil.length > 0) {
            let token = _scanner.getToken();
            while (token !== 17 /* SyntaxKind.EOF */) {
                if (skipUntilAfter.indexOf(token) !== -1) {
                    scanNext();
                    break;
                }
                else if (skipUntil.indexOf(token) !== -1) {
                    break;
                }
                token = scanNext();
            }
        }
    }
    function parseString(isValue) {
        const value = _scanner.getTokenValue();
        if (isValue) {
            onLiteralValue(value);
        }
        else {
            onObjectProperty(value);
        }
        scanNext();
        return true;
    }
    function parseLiteral() {
        switch (_scanner.getToken()) {
            case 11 /* SyntaxKind.NumericLiteral */: {
                let value = 0;
                try {
                    value = JSON.parse(_scanner.getTokenValue());
                    if (typeof value !== 'number') {
                        handleError(2 /* ParseErrorCode.InvalidNumberFormat */);
                        value = 0;
                    }
                }
                catch (e) {
                    handleError(2 /* ParseErrorCode.InvalidNumberFormat */);
                }
                onLiteralValue(value);
                break;
            }
            case 7 /* SyntaxKind.NullKeyword */:
                onLiteralValue(null);
                break;
            case 8 /* SyntaxKind.TrueKeyword */:
                onLiteralValue(true);
                break;
            case 9 /* SyntaxKind.FalseKeyword */:
                onLiteralValue(false);
                break;
            default:
                return false;
        }
        scanNext();
        return true;
    }
    function parseProperty() {
        if (_scanner.getToken() !== 10 /* SyntaxKind.StringLiteral */) {
            handleError(3 /* ParseErrorCode.PropertyNameExpected */, [], [2 /* SyntaxKind.CloseBraceToken */, 5 /* SyntaxKind.CommaToken */]);
            return false;
        }
        parseString(false);
        if (_scanner.getToken() === 6 /* SyntaxKind.ColonToken */) {
            onSeparator(':');
            scanNext(); // consume colon
            if (!parseValue()) {
                handleError(4 /* ParseErrorCode.ValueExpected */, [], [2 /* SyntaxKind.CloseBraceToken */, 5 /* SyntaxKind.CommaToken */]);
            }
        }
        else {
            handleError(5 /* ParseErrorCode.ColonExpected */, [], [2 /* SyntaxKind.CloseBraceToken */, 5 /* SyntaxKind.CommaToken */]);
        }
        return true;
    }
    function parseObject() {
        onObjectBegin();
        scanNext(); // consume open brace
        let needsComma = false;
        while (_scanner.getToken() !== 2 /* SyntaxKind.CloseBraceToken */ && _scanner.getToken() !== 17 /* SyntaxKind.EOF */) {
            if (_scanner.getToken() === 5 /* SyntaxKind.CommaToken */) {
                if (!needsComma) {
                    handleError(4 /* ParseErrorCode.ValueExpected */, [], []);
                }
                onSeparator(',');
                scanNext(); // consume comma
                if (_scanner.getToken() === 2 /* SyntaxKind.CloseBraceToken */ && allowTrailingComma) {
                    break;
                }
            }
            else if (needsComma) {
                handleError(6 /* ParseErrorCode.CommaExpected */, [], []);
            }
            if (!parseProperty()) {
                handleError(4 /* ParseErrorCode.ValueExpected */, [], [2 /* SyntaxKind.CloseBraceToken */, 5 /* SyntaxKind.CommaToken */]);
            }
            needsComma = true;
        }
        onObjectEnd();
        if (_scanner.getToken() !== 2 /* SyntaxKind.CloseBraceToken */) {
            handleError(7 /* ParseErrorCode.CloseBraceExpected */, [2 /* SyntaxKind.CloseBraceToken */], []);
        }
        else {
            scanNext(); // consume close brace
        }
        return true;
    }
    function parseArray() {
        onArrayBegin();
        scanNext(); // consume open bracket
        let needsComma = false;
        while (_scanner.getToken() !== 4 /* SyntaxKind.CloseBracketToken */ && _scanner.getToken() !== 17 /* SyntaxKind.EOF */) {
            if (_scanner.getToken() === 5 /* SyntaxKind.CommaToken */) {
                if (!needsComma) {
                    handleError(4 /* ParseErrorCode.ValueExpected */, [], []);
                }
                onSeparator(',');
                scanNext(); // consume comma
                if (_scanner.getToken() === 4 /* SyntaxKind.CloseBracketToken */ && allowTrailingComma) {
                    break;
                }
            }
            else if (needsComma) {
                handleError(6 /* ParseErrorCode.CommaExpected */, [], []);
            }
            if (!parseValue()) {
                handleError(4 /* ParseErrorCode.ValueExpected */, [], [4 /* SyntaxKind.CloseBracketToken */, 5 /* SyntaxKind.CommaToken */]);
            }
            needsComma = true;
        }
        onArrayEnd();
        if (_scanner.getToken() !== 4 /* SyntaxKind.CloseBracketToken */) {
            handleError(8 /* ParseErrorCode.CloseBracketExpected */, [4 /* SyntaxKind.CloseBracketToken */], []);
        }
        else {
            scanNext(); // consume close bracket
        }
        return true;
    }
    function parseValue() {
        switch (_scanner.getToken()) {
            case 3 /* SyntaxKind.OpenBracketToken */:
                return parseArray();
            case 1 /* SyntaxKind.OpenBraceToken */:
                return parseObject();
            case 10 /* SyntaxKind.StringLiteral */:
                return parseString(true);
            default:
                return parseLiteral();
        }
    }
    scanNext();
    if (_scanner.getToken() === 17 /* SyntaxKind.EOF */) {
        if (options.allowEmptyContent) {
            return true;
        }
        handleError(4 /* ParseErrorCode.ValueExpected */, [], []);
        return false;
    }
    if (!parseValue()) {
        handleError(4 /* ParseErrorCode.ValueExpected */, [], []);
        return false;
    }
    if (_scanner.getToken() !== 17 /* SyntaxKind.EOF */) {
        handleError(9 /* ParseErrorCode.EndOfFileExpected */, [], []);
    }
    return true;
}
export function getNodeType(value) {
    switch (typeof value) {
        case 'boolean': return 'boolean';
        case 'number': return 'number';
        case 'string': return 'string';
        case 'object': {
            if (!value) {
                return 'null';
            }
            else if (Array.isArray(value)) {
                return 'array';
            }
            return 'object';
        }
        default: return 'null';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2pzb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFOLElBQWtCLFNBUWpCO0FBUkQsV0FBa0IsU0FBUztJQUMxQix5Q0FBUSxDQUFBO0lBQ1IsNkVBQTBCLENBQUE7SUFDMUIsMkVBQXlCLENBQUE7SUFDekIsMkVBQXlCLENBQUE7SUFDekIsNkRBQWtCLENBQUE7SUFDbEIsNkVBQTBCLENBQUE7SUFDMUIsaUVBQW9CLENBQUE7QUFDckIsQ0FBQyxFQVJpQixTQUFTLEtBQVQsU0FBUyxRQVExQjtBQUVELE1BQU0sQ0FBTixJQUFrQixVQWtCakI7QUFsQkQsV0FBa0IsVUFBVTtJQUMzQiwrREFBa0IsQ0FBQTtJQUNsQixpRUFBbUIsQ0FBQTtJQUNuQixtRUFBb0IsQ0FBQTtJQUNwQixxRUFBcUIsQ0FBQTtJQUNyQix1REFBYyxDQUFBO0lBQ2QsdURBQWMsQ0FBQTtJQUNkLHlEQUFlLENBQUE7SUFDZix5REFBZSxDQUFBO0lBQ2YsMkRBQWdCLENBQUE7SUFDaEIsOERBQWtCLENBQUE7SUFDbEIsZ0VBQW1CLENBQUE7SUFDbkIsc0VBQXNCLENBQUE7SUFDdEIsd0VBQXVCLENBQUE7SUFDdkIsa0VBQW9CLENBQUE7SUFDcEIsZ0RBQVcsQ0FBQTtJQUNYLGtEQUFZLENBQUE7SUFDWiwwQ0FBUSxDQUFBO0FBQ1QsQ0FBQyxFQWxCaUIsVUFBVSxLQUFWLFVBQVUsUUFrQjNCO0FBZ0RELE1BQU0sQ0FBTixJQUFrQixjQWlCakI7QUFqQkQsV0FBa0IsY0FBYztJQUMvQixxRUFBaUIsQ0FBQTtJQUNqQixpRkFBdUIsQ0FBQTtJQUN2QixtRkFBd0IsQ0FBQTtJQUN4QixxRUFBaUIsQ0FBQTtJQUNqQixxRUFBaUIsQ0FBQTtJQUNqQixxRUFBaUIsQ0FBQTtJQUNq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