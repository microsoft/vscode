/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { TokenMetadata } from '../encodedTokenAttributes.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ILogService, LogLevel } from '../../../platform/log/common/log.js';
import { SparseMultilineTokens } from '../tokens/sparseMultilineTokens.js';
import { ILanguageService } from '../languages/language.js';
var SemanticTokensProviderStylingConstants;
(function (SemanticTokensProviderStylingConstants) {
    SemanticTokensProviderStylingConstants[SemanticTokensProviderStylingConstants["NO_STYLING"] = 2147483647] = "NO_STYLING";
})(SemanticTokensProviderStylingConstants || (SemanticTokensProviderStylingConstants = {}));
const ENABLE_TRACE = false;
let SemanticTokensProviderStyling = class SemanticTokensProviderStyling {
    constructor(_legend, _themeService, _languageService, _logService) {
        this._legend = _legend;
        this._themeService = _themeService;
        this._languageService = _languageService;
        this._logService = _logService;
        this._hasWarnedOverlappingTokens = false;
        this._hasWarnedInvalidLengthTokens = false;
        this._hasWarnedInvalidEditStart = false;
        this._hashTable = new HashTable();
    }
    getMetadata(tokenTypeIndex, tokenModifierSet, languageId) {
        const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
        const entry = this._hashTable.get(tokenTypeIndex, tokenModifierSet, encodedLanguageId);
        let metadata;
        if (entry) {
            metadata = entry.metadata;
            if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
                this._logService.trace(`SemanticTokensProviderStyling [CACHED] ${tokenTypeIndex} / ${tokenModifierSet}: foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
            }
        }
        else {
            let tokenType = this._legend.tokenTypes[tokenTypeIndex];
            const tokenModifiers = [];
            if (tokenType) {
                let modifierSet = tokenModifierSet;
                for (let modifierIndex = 0; modifierSet > 0 && modifierIndex < this._legend.tokenModifiers.length; modifierIndex++) {
                    if (modifierSet & 1) {
                        tokenModifiers.push(this._legend.tokenModifiers[modifierIndex]);
                    }
                    modifierSet = modifierSet >> 1;
                }
                if (ENABLE_TRACE && modifierSet > 0 && this._logService.getLevel() === LogLevel.Trace) {
                    this._logService.trace(`SemanticTokensProviderStyling: unknown token modifier index: ${tokenModifierSet.toString(2)} for legend: ${JSON.stringify(this._legend.tokenModifiers)}`);
                    tokenModifiers.push('not-in-legend');
                }
                const tokenStyle = this._themeService.getColorTheme().getTokenStyleMetadata(tokenType, tokenModifiers, languageId);
                if (typeof tokenStyle === 'undefined') {
                    metadata = 2147483647 /* SemanticTokensProviderStylingConstants.NO_STYLING */;
                }
                else {
                    metadata = 0;
                    if (typeof tokenStyle.italic !== 'undefined') {
                        const italicBit = (tokenStyle.italic ? 1 /* FontStyle.Italic */ : 0) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */;
                        metadata |= italicBit | 1 /* MetadataConsts.SEMANTIC_USE_ITALIC */;
                    }
                    if (typeof tokenStyle.bold !== 'undefined') {
                        const boldBit = (tokenStyle.bold ? 2 /* FontStyle.Bold */ : 0) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */;
                        metadata |= boldBit | 2 /* MetadataConsts.SEMANTIC_USE_BOLD */;
                    }
                    if (typeof tokenStyle.underline !== 'undefined') {
                        const underlineBit = (tokenStyle.underline ? 4 /* FontStyle.Underline */ : 0) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */;
                        metadata |= underlineBit | 4 /* MetadataConsts.SEMANTIC_USE_UNDERLINE */;
                    }
                    if (typeof tokenStyle.strikethrough !== 'undefined') {
                        const strikethroughBit = (tokenStyle.strikethrough ? 8 /* FontStyle.Strikethrough */ : 0) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */;
                        metadata |= strikethroughBit | 8 /* MetadataConsts.SEMANTIC_USE_STRIKETHROUGH */;
                    }
                    if (tokenStyle.foreground) {
                        const foregroundBits = (tokenStyle.foreground) << 15 /* MetadataConsts.FOREGROUND_OFFSET */;
                        metadata |= foregroundBits | 16 /* MetadataConsts.SEMANTIC_USE_FOREGROUND */;
                    }
                    if (metadata === 0) {
                        // Nothing!
                        metadata = 2147483647 /* SemanticTokensProviderStylingConstants.NO_STYLING */;
                    }
                }
            }
            else {
                if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
                    this._logService.trace(`SemanticTokensProviderStyling: unknown token type index: ${tokenTypeIndex} for legend: ${JSON.stringify(this._legend.tokenTypes)}`);
                }
                metadata = 2147483647 /* SemanticTokensProviderStylingConstants.NO_STYLING */;
                tokenType = 'not-in-legend';
            }
            this._hashTable.add(tokenTypeIndex, tokenModifierSet, encodedLanguageId, metadata);
            if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
                this._logService.trace(`SemanticTokensProviderStyling ${tokenTypeIndex} (${tokenType}) / ${tokenModifierSet} (${tokenModifiers.join(' ')}): foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
            }
        }
        return metadata;
    }
    warnOverlappingSemanticTokens(lineNumber, startColumn) {
        if (!this._hasWarnedOverlappingTokens) {
            this._hasWarnedOverlappingTokens = true;
            this._logService.warn(`Overlapping semantic tokens detected at lineNumber ${lineNumber}, column ${startColumn}`);
        }
    }
    warnInvalidLengthSemanticTokens(lineNumber, startColumn) {
        if (!this._hasWarnedInvalidLengthTokens) {
            this._hasWarnedInvalidLengthTokens = true;
            this._logService.warn(`Semantic token with invalid length detected at lineNumber ${lineNumber}, column ${startColumn}`);
        }
    }
    warnInvalidEditStart(previousResultId, resultId, editIndex, editStart, maxExpectedStart) {
        if (!this._hasWarnedInvalidEditStart) {
            this._hasWarnedInvalidEditStart = true;
            this._logService.warn(`Invalid semantic tokens edit detected (previousResultId: ${previousResultId}, resultId: ${resultId}) at edit #${editIndex}: The provided start offset ${editStart} is outside the previous data (length ${maxExpectedStart}).`);
        }
    }
};
SemanticTokensProviderStyling = __decorate([
    __param(1, IThemeService),
    __param(2, ILanguageService),
    __param(3, ILogService)
], SemanticTokensProviderStyling);
export { SemanticTokensProviderStyling };
var SemanticColoringConstants;
(function (SemanticColoringConstants) {
    /**
     * Let's aim at having 8KB buffers if possible...
     * So that would be 8192 / (5 * 4) = 409.6 tokens per area
     */
    SemanticColoringConstants[SemanticColoringConstants["DesiredTokensPerArea"] = 400] = "DesiredTokensPerArea";
    /**
     * Try to keep the total number of areas under 1024 if possible,
     * simply compensate by having more tokens per area...
     */
    SemanticColoringConstants[SemanticColoringConstants["DesiredMaxAreas"] = 1024] = "DesiredMaxAreas";
})(SemanticColoringConstants || (SemanticColoringConstants = {}));
export function toMultilineTokens2(tokens, styling, languageId) {
    const srcData = tokens.data;
    const tokenCount = (tokens.data.length / 5) | 0;
    const tokensPerArea = Math.max(Math.ceil(tokenCount / 1024 /* SemanticColoringConstants.DesiredMaxAreas */), 400 /* SemanticColoringConstants.DesiredTokensPerArea */);
    const result = [];
    let tokenIndex = 0;
    let lastLineNumber = 1;
    let lastStartCharacter = 0;
    while (tokenIndex < tokenCount) {
        const tokenStartIndex = tokenIndex;
        let tokenEndIndex = Math.min(tokenStartIndex + tokensPerArea, tokenCount);
        // Keep tokens on the same line in the same area...
        if (tokenEndIndex < tokenCount) {
            let smallTokenEndIndex = tokenEndIndex;
            while (smallTokenEndIndex - 1 > tokenStartIndex && srcData[5 * smallTokenEndIndex] === 0) {
                smallTokenEndIndex--;
            }
            if (smallTokenEndIndex - 1 === tokenStartIndex) {
                // there are so many tokens on this line that our area would be empty, we must now go right
                let bigTokenEndIndex = tokenEndIndex;
                while (bigTokenEndIndex + 1 < tokenCount && srcData[5 * bigTokenEndIndex] === 0) {
                    bigTokenEndIndex++;
                }
                tokenEndIndex = bigTokenEndIndex;
            }
            else {
                tokenEndIndex = smallTokenEndIndex;
            }
        }
        let destData = new Uint32Array((tokenEndIndex - tokenStartIndex) * 4);
        let destOffset = 0;
        let areaLine = 0;
        let prevLineNumber = 0;
        let prevEndCharacter = 0;
        while (tokenIndex < tokenEndIndex) {
            const srcOffset = 5 * tokenIndex;
            const deltaLine = srcData[srcOffset];
            const deltaCharacter = srcData[srcOffset + 1];
            // Casting both `lineNumber`, `startCharacter` and `endCharacter` here to uint32 using `|0`
            // to validate below with the actual values that will be inserted in the Uint32Array result
            const lineNumber = (lastLineNumber + deltaLine) | 0;
            const startCharacter = (deltaLine === 0 ? (lastStartCharacter + deltaCharacter) | 0 : deltaCharacter);
            const length = srcData[srcOffset + 2];
            const endCharacter = (startCharacter + length) | 0;
            const tokenTypeIndex = srcData[srcOffset + 3];
            const tokenModifierSet = srcData[srcOffset + 4];
            if (endCharacter <= startCharacter) {
                // this token is invalid (most likely a negative length casted to uint32)
                styling.warnInvalidLengthSemanticTokens(lineNumber, startCharacter + 1);
            }
            else if (prevLineNumber === lineNumber && prevEndCharacter > startCharacter) {
                // this token overlaps with the previous token
                styling.warnOverlappingSemanticTokens(lineNumber, startCharacter + 1);
            }
            else {
                const metadata = styling.getMetadata(tokenTypeIndex, tokenModifierSet, languageId);
                if (metadata !== 2147483647 /* SemanticTokensProviderStylingConstants.NO_STYLING */) {
                    if (areaLine === 0) {
                        areaLine = lineNumber;
                    }
                    destData[destOffset] = lineNumber - areaLine;
                    destData[destOffset + 1] = startCharacter;
                    destData[destOffset + 2] = endCharacter;
                    destData[destOffset + 3] = metadata;
                    destOffset += 4;
                    prevLineNumber = lineNumber;
                    prevEndCharacter = endCharacter;
                }
            }
            lastLineNumber = lineNumber;
            lastStartCharacter = startCharacter;
            tokenIndex++;
        }
        if (destOffset !== destData.length) {
            destData = destData.subarray(0, destOffset);
        }
        const tokens = SparseMultilineTokens.create(areaLine, destData);
        result.push(tokens);
    }
    return result;
}
class HashTableEntry {
    constructor(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
        this.tokenTypeIndex = tokenTypeIndex;
        this.tokenModifierSet = tokenModifierSet;
        this.languageId = languageId;
        this.metadata = metadata;
        this.next = null;
    }
}
class HashTable {
    static { this._SIZES = [3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143]; }
    constructor() {
        this._elementsCount = 0;
        this._currentLengthIndex = 0;
        this._currentLength = HashTable._SIZES[this._currentLengthIndex];
        this._growCount = Math.round(this._currentLengthIndex + 1 < HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
        this._elements = [];
        HashTable._nullOutEntries(this._elements, this._currentLength);
    }
    static _nullOutEntries(entries, length) {
        for (let i = 0; i < length; i++) {
            entries[i] = null;
        }
    }
    _hash2(n1, n2) {
        return (((n1 << 5) - n1) + n2) | 0; // n1 * 31 + n2, keep as int32
    }
    _hashFunc(tokenTypeIndex, tokenModifierSet, languageId) {
        return this._hash2(this._hash2(tokenTypeIndex, tokenModifierSet), languageId) % this._currentLength;
    }
    get(tokenTypeIndex, tokenModifierSet, languageId) {
        const hash = this._hashFunc(tokenTypeIndex, tokenModifierSet, languageId);
        let p = this._elements[hash];
        while (p) {
            if (p.tokenTypeIndex === tokenTypeIndex && p.tokenModifierSet === tokenModifierSet && p.languageId === languageId) {
                return p;
            }
            p = p.next;
        }
        return null;
    }
    add(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
        this._elementsCount++;
        if (this._growCount !== 0 && this._elementsCount >= this._growCount) {
            // expand!
            const oldElements = this._elements;
            this._currentLengthIndex++;
            this._currentLength = HashTable._SIZES[this._currentLengthIndex];
            this._growCount = Math.round(this._currentLengthIndex + 1 < HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
            this._elements = [];
            HashTable._nullOutEntries(this._elements, this._currentLength);
            for (const first of oldElements) {
                let p = first;
                while (p) {
                    const oldNext = p.next;
                    p.next = null;
                    this._add(p);
                    p = oldNext;
                }
            }
        }
        this._add(new HashTableEntry(tokenTypeIndex, tokenModifierSet, languageId, metadata));
    }
    _add(element) {
        const hash = this._hashFunc(element.tokenTypeIndex, element.tokenModifierSet, element.languageId);
        element.next = this._elements[hash];
        this._elements[hash] = element;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBNkIsYUFBYSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFNUQsSUFBVyxzQ0FFVjtBQUZELFdBQVcsc0NBQXNDO0lBQ2hELHdIQUErQyxDQUFBO0FBQ2hELENBQUMsRUFGVSxzQ0FBc0MsS0FBdEMsc0NBQXNDLFFBRWhEO0FBRUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDO0FBRXBCLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQTZCO0lBT3pDLFlBQ2tCLE9BQTZCLEVBQy9CLGFBQTZDLEVBQzFDLGdCQUFtRCxFQUN4RCxXQUF5QztRQUhyQyxZQUFPLEdBQVAsT0FBTyxDQUFzQjtRQUNkLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQ3pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFDdkMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFSL0MsZ0NBQTJCLEdBQUcsS0FBSyxDQUFDO1FBQ3BDLGtDQUE2QixHQUFHLEtBQUssQ0FBQztRQUN0QywrQkFBMEIsR0FBRyxLQUFLLENBQUM7UUFRMUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJ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