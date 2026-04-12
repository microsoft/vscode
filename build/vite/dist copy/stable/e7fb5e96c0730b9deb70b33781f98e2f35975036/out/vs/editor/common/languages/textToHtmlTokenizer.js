/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../base/common/strings.js';
import { LineTokens } from '../tokens/lineTokens.js';
import { TokenizationRegistry } from '../languages.js';
import { NullState, nullTokenizeEncoded } from './nullTokenize.js';
const fallback = {
    getInitialState: () => NullState,
    tokenizeEncoded: (buffer, hasEOL, state) => nullTokenizeEncoded(0 /* LanguageId.Null */, state)
};
export function tokenizeToStringSync(languageService, text, languageId) {
    return _tokenizeToString(text, languageService.languageIdCodec, TokenizationRegistry.get(languageId) || fallback);
}
export async function tokenizeToString(languageService, text, languageId) {
    if (!languageId) {
        return _tokenizeToString(text, languageService.languageIdCodec, fallback);
    }
    const tokenizationSupport = await TokenizationRegistry.getOrCreate(languageId);
    return _tokenizeToString(text, languageService.languageIdCodec, tokenizationSupport || fallback);
}
export function tokenizeLineToHTML(text, viewLineTokens, colorMap, startOffset, endOffset, tabSize, useNbsp) {
    let result = `<div>`;
    let charIndex = 0;
    let width = 0;
    let prevIsSpace = true;
    for (let tokenIndex = 0, tokenCount = viewLineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
        const tokenEndIndex = viewLineTokens.getEndOffset(tokenIndex);
        let partContent = '';
        for (; charIndex < tokenEndIndex && charIndex < endOffset; charIndex++) {
            const charCode = text.charCodeAt(charIndex);
            const isTab = charCode === 9 /* CharCode.Tab */;
            width += strings.isFullWidthCharacter(charCode) ? 2 : (isTab ? 0 : 1);
            if (charIndex < startOffset) {
                if (isTab) {
                    const remainder = width % tabSize;
                    width += remainder === 0 ? tabSize : tabSize - remainder;
                }
                continue;
            }
            switch (charCode) {
                case 9 /* CharCode.Tab */: {
                    const remainder = width % tabSize;
                    const insertSpacesCount = remainder === 0 ? tabSize : tabSize - remainder;
                    width += insertSpacesCount;
                    let spacesRemaining = insertSpacesCount;
                    while (spacesRemaining > 0) {
                        if (useNbsp && prevIsSpace) {
                            partContent += '&#160;';
                            prevIsSpace = false;
                        }
                        else {
                            partContent += ' ';
                            prevIsSpace = true;
                        }
                        spacesRemaining--;
                    }
                    break;
                }
                case 60 /* CharCode.LessThan */:
                    partContent += '&lt;';
                    prevIsSpace = false;
                    break;
                case 62 /* CharCode.GreaterThan */:
                    partContent += '&gt;';
                    prevIsSpace = false;
                    break;
                case 38 /* CharCode.Ampersand */:
                    partContent += '&amp;';
                    prevIsSpace = false;
                    break;
                case 0 /* CharCode.Null */:
                    partContent += '&#00;';
                    prevIsSpace = false;
                    break;
                case 65279 /* CharCode.UTF8_BOM */:
                case 8232 /* CharCode.LINE_SEPARATOR */:
                case 8233 /* CharCode.PARAGRAPH_SEPARATOR */:
                case 133 /* CharCode.NEXT_LINE */:
                    partContent += '\ufffd';
                    prevIsSpace = false;
                    break;
                case 13 /* CharCode.CarriageReturn */:
                    // zero width space, because carriage return would introduce a line break
                    partContent += '&#8203';
                    prevIsSpace = false;
                    break;
                case 32 /* CharCode.Space */:
                    if (useNbsp && prevIsSpace) {
                        partContent += '&#160;';
                        prevIsSpace = false;
                    }
                    else {
                        partContent += ' ';
                        prevIsSpace = true;
                    }
                    break;
                default:
                    partContent += String.fromCharCode(charCode);
                    prevIsSpace = false;
            }
        }
        if (tokenEndIndex <= startOffset) {
            continue;
        }
        result += `<span style="${viewLineTokens.getInlineStyle(tokenIndex, colorMap)}">${partContent}</span>`;
        if (tokenEndIndex > endOffset || charIndex >= endOffset || startOffset >= endOffset) {
            break;
        }
    }
    result += `</div>`;
    return result;
}
export function _tokenizeToString(text, languageIdCodec, tokenizationSupport) {
    let result = `<div class="monaco-tokenized-source">`;
    const lines = strings.splitLines(text);
    let currentState = tokenizationSupport.getInitialState();
    for (let i = 0, len = lines.length; i < len; i++) {
        const line = lines[i];
        if (i > 0) {
            result += `<br/>`;
        }
        const tokenizationResult = tokenizationSupport.tokenizeEncoded(line, true, currentState);
        LineTokens.convertToEndOffset(tokenizationResult.tokens, line.length);
        const lineTokens = new LineTokens(tokenizationResult.tokens, line, languageIdCodec);
        const viewLineTokens = lineTokens.inflate();
        let startOffset = 0;
        for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
            const type = viewLineTokens.getClassName(j);
            const endIndex = viewLineTokens.getEndOffset(j);
            result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
            startOffset = endIndex;
        }
        currentState = tokenizationResult.endState;
    }
    result += `</div>`;
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFRvSHRtbFRva2VuaXplci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQW1CLFVBQVUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RFLE9BQU8sRUFBa0Qsb0JBQW9CLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUV2RyxPQUFPLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFLbkUsTUFBTSxRQUFRLEdBQWdDO0lBQzdDLGVBQWUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO0lBQ2hDLGVBQWUsRUFBRSxDQUFDLE1BQWMsRUFBRSxNQUFlLEVBQUUsS0FBYSxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsMEJBQWtCLEtBQUssQ0FBQztDQUNoSCxDQUFDO0FBRUYsTUFBTSxVQUFVLG9CQUFvQixDQUFDLGVBQWlDLEVBQUUsSUFBWSxFQUFFLFVBQWtCO0lBQ3ZHLE9BQU8saUJBQWlCLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQ25ILENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLGdCQUFnQixDQUFDLGVBQWlDLEVBQUUsSUFBWSxFQUFFLFVBQXlCO0lBQ2hILElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQixPQUFPLGlCQUFpQixDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFDRCxNQUFNLG1CQUFtQixH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