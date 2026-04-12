"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStringScanner = void 0;
/**
 * This class has a very specific purpose:
 *
 *	It can return convert offset within a decoded JSON string to offset within the encoded JSON string.
 */
class JsonStringScanner {
    text;
    resultChars = 0;
    pos = 0;
    /**
     *
     * @param text the encoded JSON string
     * @param pos must not include ", ie must be `stringJSONNode.offset + 1`
     */
    constructor(text, initialPos /* offset within `text` */) {
        this.text = text;
        this.pos = initialPos;
    }
    // note that we don't do bound checks here, because we know that the offset is within the string
    getOffsetInEncoded(offsetDecoded) {
        let start = this.pos;
        while (true) {
            if (this.resultChars > offsetDecoded) {
                return start;
            }
            const ch = this.text.charCodeAt(this.pos);
            if (ch === 92 /* CharacterCodes.backslash */) {
                start = this.pos;
                this.pos++;
                const ch2 = this.text.charCodeAt(this.pos++);
                switch (ch2) {
                    case 34 /* CharacterCodes.doubleQuote */:
                    case 92 /* CharacterCodes.backslash */:
                    case 47 /* CharacterCodes.slash */:
                    case 98 /* CharacterCodes.b */:
                    case 102 /* CharacterCodes.f */:
                    case 110 /* CharacterCodes.n */:
                    case 114 /* CharacterCodes.r */:
                    case 116 /* CharacterCodes.t */:
                        this.resultChars += 1;
                        break;
                    case 117 /* CharacterCodes.u */: {
                        const ch3 = this.scanHexDigits(4, true);
                        if (ch3 >= 0) {
                            this.resultChars += String.fromCharCode(ch3).length;
                        }
                        break;
                    }
                }
                continue;
            }
            start = this.pos;
            this.pos++;
            this.resultChars++;
        }
    }
    scanHexDigits(count, exact) {
        let digits = 0;
        let value = 0;
        while (digits < count || !exact) {
            const ch = this.text.charCodeAt(this.pos);
            if (ch >= 48 /* CharacterCodes._0 */ && ch <= 57 /* CharacterCodes._9 */) {
                value = value * 16 + ch - 48 /* CharacterCodes._0 */;
            }
            else if (ch >= 65 /* CharacterCodes.A */ && ch <= 70 /* CharacterCodes.F */) {
                value = value * 16 + ch - 65 /* CharacterCodes.A */ + 10;
            }
            else if (ch >= 97 /* CharacterCodes.a */ && ch <= 102 /* CharacterCodes.f */) {
                value = value * 16 + ch - 97 /* CharacterCodes.a */ + 10;
            }
            else {
                break;
            }
            this.pos++;
            digits++;
        }
        if (digits < count) {
            value = -1;
        }
        return value;
    }
}
exports.JsonStringScanner = JsonStringScanner;
//# sourceMappingURL=jsonReconstruct.js.map