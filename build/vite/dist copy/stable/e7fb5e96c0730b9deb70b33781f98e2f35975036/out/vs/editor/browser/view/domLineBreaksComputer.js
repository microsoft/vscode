/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import * as strings from '../../../base/common/strings.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { ModelLineProjectionData } from '../../common/modelLineProjectionData.js';
import { LineInjectedText } from '../../common/textModelEvents.js';
const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });
export class DOMLineBreaksComputerFactory {
    static create(targetWindow) {
        return new DOMLineBreaksComputerFactory(new WeakRef(targetWindow));
    }
    constructor(targetWindow) {
        this.targetWindow = targetWindow;
    }
    createLineBreaksComputer(context, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
        const lineNumbers = [];
        return {
            addRequest: (lineNumber, previousLineBreakData) => {
                lineNumbers.push(lineNumber);
            },
            finalize: () => {
                return createLineBreaks(assertReturnsDefined(this.targetWindow.deref()), context, lineNumbers, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak);
            }
        };
    }
}
function createLineBreaks(targetWindow, context, lineNumbers, fontInfo, tabSize, firstLineBreakColumn, wrappingIndent, wordBreak) {
    function createEmptyLineBreakWithPossiblyInjectedText(lineNumber) {
        const injectedTexts = context.getLineInjectedText(lineNumber);
        if (injectedTexts) {
            const lineContent = context.getLineContent(lineNumber);
            const lineText = LineInjectedText.applyInjectedText(lineContent, injectedTexts);
            const injectionOptions = injectedTexts.map(t => t.options);
            const injectionOffsets = injectedTexts.map(text => text.column - 1);
            // creating a `LineBreakData` with an invalid `breakOffsetsVisibleColumn` is OK
            // because `breakOffsetsVisibleColumn` will never be used because it contains injected text
            return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
        }
        else {
            return null;
        }
    }
    if (firstLineBreakColumn === -1) {
        const result = [];
        for (let i = 0, len = lineNumbers.length; i < len; i++) {
            result[i] = createEmptyLineBreakWithPossiblyInjectedText(lineNumbers[i]);
        }
        return result;
    }
    const overallWidth = Math.round(firstLineBreakColumn * fontInfo.typicalHalfwidthCharacterWidth);
    const additionalIndent = (wrappingIndent === 3 /* WrappingIndent.DeepIndent */ ? 2 : wrappingIndent === 2 /* WrappingIndent.Indent */ ? 1 : 0);
    const additionalIndentSize = Math.round(tabSize * additionalIndent);
    const additionalIndentLength = Math.ceil(fontInfo.spaceWidth * additionalIndentSize);
    const containerDomNode = document.createElement('div');
    applyFontInfo(containerDomNode, fontInfo);
    const sb = new StringBuilder(10000);
    const firstNonWhitespaceIndices = [];
    const wrappedTextIndentLengths = [];
    const renderLineContents = [];
    const allCharOffsets = [];
    const allVisibleColumns = [];
    for (let i = 0; i < lineNumbers.length; i++) {
        const lineNumber = lineNumbers[i];
        const lineContent = LineInjectedText.applyInjectedText(context.getLineContent(lineNumber), context.getLineInjectedText(lineNumber));
        let firstNonWhitespaceIndex = 0;
        let wrappedTextIndentLength = 0;
        let width = overallWidth;
        if (wrappingIndent !== 0 /* WrappingIndent.None */) {
            firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
            if (firstNonWhitespaceIndex === -1) {
                // all whitespace line
                firstNonWhitespaceIndex = 0;
            }
            else {
                // Track existing indent
                for (let i = 0; i < firstNonWhitespaceIndex; i++) {
                    const charWidth = (lineContent.charCodeAt(i) === 9 /* CharCode.Tab */
                        ? (tabSize - (wrappedTextIndentLength % tabSize))
                        : 1);
                    wrappedTextIndentLength += charWidth;
                }
                const indentWidth = Math.ceil(fontInfo.spaceWidth * wrappedTextIndentLength);
                // Force sticking to beginning of line if no character would fit except for the indentation
                if (indentWidth + fontInfo.typicalFullwidthCharacterWidth > overallWidth) {
                    firstNonWhitespaceIndex = 0;
                    wrappedTextIndentLength = 0;
                }
                else {
                    width = overallWidth - indentWidth;
                }
            }
        }
        const renderLineContent = lineContent.substr(firstNonWhitespaceIndex);
        const tmp = renderLine(renderLineContent, wrappedTextIndentLength, tabSize, width, sb, additionalIndentLength);
        firstNonWhitespaceIndices[i] = firstNonWhitespaceIndex;
        wrappedTextIndentLengths[i] = wrappedTextIndentLength;
        renderLineContents[i] = renderLineContent;
        allCharOffsets[i] = tmp[0];
        allVisibleColumns[i] = tmp[1];
    }
    const html = sb.build();
    const trustedhtml = ttPolicy?.createHTML(html) ?? html;
    containerDomNode.innerHTML = trustedhtml;
    containerDomNode.style.position = 'absolute';
    containerDomNode.style.top = '10000px';
    if (wordBreak === 'keepAll') {
        // word-break: keep-all; overflow-wrap: anywhere
        containerDomNode.style.wordBreak = 'keep-all';
        containerDomNode.style.overflowWrap = 'anywhere';
    }
    else {
        // overflow-wrap: break-word
        containerDomNode.style.wordBreak = 'inherit';
        containerDomNode.style.overflowWrap = 'break-word';
    }
    targetWindow.document.body.appendChild(containerDomNode);
    const range = document.createRange();
    const lineDomNodes = Array.prototype.slice.call(containerDomNode.children, 0);
    const result = [];
    for (let i = 0; i < lineNumbers.length; i++) {
        const lineNumber = lineNumbers[i];
        const lineDomNode = lineDomNodes[i];
        const breakOffsets = readLineBreaks(range, lineDomNode, renderLineContents[i], allCharOffsets[i]);
        if (breakOffsets === null) {
            result[i] = createEmptyLineBreakWithPossiblyInjectedText(lineNumber);
            continue;
        }
        const firstNonWhitespaceIndex = firstNonWhitespaceIndices[i];
        const wrappedTextIndentLength = wrappedTextIndentLengths[i] + additionalIndentSize;
        const visibleColumns = allVisibleColumns[i];
        const breakOffsetsVisibleColumn = [];
        for (let j = 0, len = breakOffsets.length; j < len; j++) {
            breakOffsetsVisibleColumn[j] = visibleColumns[breakOffsets[j]];
        }
        if (firstNonWhitespaceIndex !== 0) {
            // All break offsets are relative to the renderLineContent, make them absolute again
            for (let j = 0, len = breakOffsets.length; j < len; j++) {
                breakOffsets[j] += firstNonWhitespaceIndex;
            }
        }
        let injectionOptions;
        let injectionOffsets;
        const curInjectedTexts = context.getLineInjectedText(lineNumber);
        if (curInjectedTexts) {
            injectionOptions = curInjectedTexts.map(t => t.options);
            injectionOffsets = curInjectedTexts.map(text => text.column - 1);
        }
        else {
            injectionOptions = null;
            injectionOffsets = null;
        }
        result[i] = new ModelLineProjectionData(injectionOffsets, injectionOptions, breakOffsets, breakOffsetsVisibleColumn, wrappedTextIndentLength);
    }
    containerDomNode.remove();
    return result;
}
var Constants;
(function (Constants) {
    Constants[Constants["SPAN_MODULO_LIMIT"] = 16384] = "SPAN_MODULO_LIMIT";
})(Constants || (Constants = {}));
function renderLine(lineContent, initialVisibleColumn, tabSize, width, sb, wrappingIndentLength) {
    if (wrappingIndentLength !== 0) {
        const hangingOffset = String(wrappingIndentLength);
        sb.appendString('<div style="text-indent: -');
        sb.appendString(hangingOffset);
        sb.appendString('px; padding-left: ');
        sb.appendString(hangingOffset);
        sb.appendString('px; box-sizing: border-box; width:');
    }
    else {
        sb.appendString('<div style="width:');
    }
    sb.appendString(String(width));
    sb.appendString('px;">');
    // if (containsRTL) {
    // 	sb.appendASCIIString('" dir="ltr');
    // }
    const len = lineContent.length;
    let visibleColumn = initialVisibleColumn;
    let charOffset = 0;
    const charOffsets = [];
    const visibleColumns = [];
    let nextCharCode = (0 < len ? lineContent.charCodeAt(0) : 0 /* CharCode.Null */);
    sb.appendString('<span>');
    for (let charIndex = 0; charIndex < len; charIndex++) {
        if (charIndex !== 0 && charIndex % 16384 /* Constants.SPAN_MODULO_LIMIT */ === 0) {
            sb.appendString('</span><span>');
        }
        charOffsets[charIndex] = charOffset;
        visibleColumns[charIndex] = visibleColumn;
        const charCode = nextCharCode;
        nextCharCode = (charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : 0 /* CharCode.Null */);
        let producedCharacters = 1;
        let charWidth = 1;
        switch (charCode) {
            case 9 /* CharCode.Tab */:
                producedCharacters = (tabSize - (visibleColumn % tabSize));
                charWidth = producedCharacters;
                for (let space = 1; space <= producedCharacters; space++) {
                    if (space < producedCharacters) {
                        sb.appendCharCode(0xA0); // &nbsp;
                    }
                    else {
                        sb.appendASCIICharCode(32 /* CharCode.Space */);
                    }
                }
                break;
            case 32 /* CharCode.Space */:
                if (nextCharCode === 32 /* CharCode.Space */) {
                    sb.appendCharCode(0xA0); // &nbsp;
                }
                else {
                    sb.appendASCIICharCode(32 /* CharCode.Space */);
                }
                break;
            case 60 /* CharCode.LessThan */:
                sb.appendString('&lt;');
                break;
            case 62 /* CharCode.GreaterThan */:
                sb.appendString('&gt;');
                break;
            case 38 /* CharCode.Ampersand */:
                sb.appendString('&amp;');
                break;
            case 0 /* CharCode.Null */:
                sb.appendString('&#00;');
                break;
            case 65279 /* CharCode.UTF8_BOM */:
            case 8232 /* CharCode.LINE_SEPARATOR */:
            case 8233 /* CharCode.PARAGRAPH_SEPARATOR */:
            case 133 /* CharCode.NEXT_LINE */:
                sb.appendCharCode(0xFFFD);
                break;
            default:
                if (strings.isFullWidthCharacter(charCode)) {
                    charWidth++;
                }
                if (charCode < 32) {
                    sb.appendCharCode(9216 + charCode);
                }
                else {
                    sb.appendCharCode(charCode);
                }
        }
        charOffset += producedCharacters;
        visibleColumn += charWidth;
    }
    sb.appendString('</span>');
    charOffsets[lineContent.length] = charOffset;
    visibleColumns[lineContent.length] = visibleColumn;
    sb.appendString('</div>');
    return [charOffsets, visibleColumns];
}
function readLineBreaks(range, lineDomNode, lineContent, charOffsets) {
    if (lineContent.length <= 1) {
        return null;
    }
    const spans = Array.prototype.slice.call(lineDomNode.children, 0);
    const breakOffsets = [];
    try {
        discoverBreaks(range, spans, charOffsets, 0, null, lineContent.length - 1, null, breakOffsets);
    }
    catch (err) {
        console.error(err);
        return null;
    }
    if (breakOffsets.length === 0) {
        return null;
    }
    breakOffsets.push(lineContent.length);
    return breakOffsets;
}
function discoverBreaks(range, spans, charOffsets, low, lowRects, high, highRects, result) {
    if (low === high) {
        return;
    }
    lowRects = lowRects || readClientRect(range, spans, charOffsets[low], charOffsets[low + 1]);
    highRects = highRects || readClientRect(range, spans, charOffsets[high], charOffsets[high + 1]);
    if (Math.abs(lowRects[0].top - highRects[0].top) <= 0.1) {
        // same line
        return;
    }
    // there is at least one line break between these two offsets
    if (low + 1 === high) {
        // the two characters are adjacent, so the line break must be exactly between them
        result.push(high);
        return;
    }
    const mid = low + ((high - low) / 2) | 0;
    const midRects = readClientRect(range, spans, charOffsets[mid], charOffsets[mid + 1]);
    discoverBreaks(range, spans, charOffsets, low, lowRects, mid, midRects, result);
    discoverBreaks(range, spans, charOffsets, mid, midRects, high, highRects, result);
}
function readClientRect(range, spans, startOffset, endOffset) {
    range.setStart(spans[(startOffset / 16384 /* Constants.SPAN_MODULO_LIMIT */) | 0].firstChild, startOffset % 16384 /* Constants.SPAN_MODULO_LIMIT */);
    range.setEnd(spans[(endOffset / 16384 /* Constants.SPAN_MODULO_LIMIT */) | 0].firstChild, endOffset % 16384 /* Constants.SPAN_MODULO_LIMIT */);
    return range.getClientRects();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tTGluZUJyZWFrc0NvbXB1dGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlldy9kb21MaW5lQnJlYWtzQ29tcHV0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFakYsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFekQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRW5FLE9BQU8sRUFBK0UsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvSixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUduRSxNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7QUFFbkcsTUFBTSxPQUFPLDRCQUE0QjtJQUVqQyxNQUFNLENBQUMsTUFBTSxDQUFDLFlBQW9CO1FBQ3hDLE9BQU8sSUFBSSw0QkFBNEIsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxZQUFvQixZQUE2QjtRQUE3QixpQkFBWSxHQUFaLFlBQVksQ0FBaUI7SUFDakQsQ0FBQztJQUVNLHdCQUF3QixDQUFDLE9BQW1DLEVBQUUsUUFBa0IsRUFBRSxPQUFlLEVBQUUsY0FBc0IsRUFBRSxjQUE4QixFQUFFLFNBQStCLEVBQUUsc0JBQStCO1FBQ2pPLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztRQUNqQyxPQUFPO1lBQ04sVUFBVSxFQUFFLENBQUMsVUFBa0IsRUFBRSxxQkFBcUQsRUFBRSxFQUFFO2dCQUN6RixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlCLENBQUM7WUFDRCxRQUFRLEVBQUUsR0FBRyxFQUFFO2dCQUNkLE9BQU8sZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzlKLENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxZQUFvQixFQUFFLE9BQW1DLEVBQUUsV0FBcUIsRUFBRSxRQUFrQixFQUFFLE9BQWUsRUFBRSxvQkFBNEIsRUFBRSxjQUE4QixFQUFFLFNBQStCO0lBQzdPLFNBQVMsNENBQTRDLENBQUMsVUFBa0I7UUFDdkUsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzlELElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN2RCxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFFaEYsTUFBTSxnQkFBZ0IsR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNELE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFcEUsK0VBQStFO1lBQy9FLDJGQUEyRjtZQUMzRixPQUFPLElBQUksdUJBQXVCLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksb0JBQW9CLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxNQUFNLE1BQU0sR0FBdUMsRUFBRSxDQUFDO1FBQ3RELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN4RCxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsNENBQTRDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEdBQUcsUUFBUSxDQUFDLDhCQUE4QixDQUFDLENBQUM7SUFDaEcsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLGNBQWMsc0NBQThCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxrQ0FBMEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvSCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLGdCQUFnQixDQUFDLENBQUM7SUFDcEUsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsb0JBQW9CLENBQUMsQ0FBQztJQUVyRixNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkQsYUFBYSxDQUFDLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBRTFDLE1BQU0sRUFBRSxHQUFHLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLE1BQU0seUJBQXlCLEdBQWEsRUFBRSxDQUFDO0lBQy9DLE1BQU0sd0JBQXdCLEdBQWEsRUFBRSxDQUFDO0lBQzlDLE1BQU0sa0JBQWtCLEdBQWEsRUFBRSxDQUFDO0lBQ3hDLE1BQU0sY0FBYyxHQUFlLEVBQUUsQ0FBQztJQUN0QyxNQUFNLGlCQUFpQixHQUFlLEVBQUUsQ0FBQztJQUN6QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzdDLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLFdBQVcsR0FBRyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRXBJLElBQUksdUJBQXVCLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLElBQUksdUJBQXVCLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLElBQUksS0FBSyxHQUFHLFlBQVksQ0FBQztRQUV6QixJQUFJLGNBQWMsZ0NBQXdCLEVBQUUsQ0FBQztZQUM1Qyx1QkFBdUIsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkUsSUFBSSx1QkFBdUIsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNwQyxzQkFBc0I7Z0JBQ3RCLHVCQUF1QixHQUFHLENBQUMsQ0FBQztZQUU3QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asd0JBQXdCO2dCQUV4QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsdUJBQXVCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDbEQsTUFBTSxTQUFTLEdBQUcsQ0FDakIsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMseUJBQWlCO3dCQUN6QyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyx1QkFBdUIsR0FBRyxPQUFPLENBQUMsQ0FBQzt3QkFDakQsQ0FBQyxDQUFDLENBQUMsQ0FDSixDQUFDO29CQUNGLHVCQUF1QixJQUFJLFNBQVMsQ0FBQztnQkFDdEMsQ0FBQztnQkFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsdUJBQXVCLENBQUMsQ0FBQztnQkFFN0UsMkZBQTJGO2dCQUMzRixJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsOEJBQThCLEdBQUcsWUFBWSxFQUFFLENBQUM7b0JBQzFFLHVCQUF1QixHQUFHLENBQUMsQ0FBQztvQkFDNUIsdUJBQXVCLEdBQUcsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsS0FBSyxHQUFHLFlBQVksR0FBRyxXQUFXLENBQUM7Z0JBQ3BDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQy9HLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxHQUFHLHVCQUF1QixDQUFDO1FBQ3ZELHdCQUF3QixDQUFDLENBQUMsQ0FBQyxHQUFHLHVCQUF1QixDQUFDO1FBQ3RELGtCQUFrQixDQUFDLENBQUMsQ0FBQyxHQUFHLGlCQUFpQixDQUFDO1FBQzFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDeEIsTUFBTSxXQUFXLEdBQUcsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUM7SUFDdkQsZ0JBQWdCLENBQUMsU0FBUyxHQUFHLFdBQXFCLENBQUM7SUFFbkQsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUM7SUFDN0MsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxTQUFTLENBQUM7SUFDdkMsSUFBSSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDN0IsZ0RBQWdEO1FBQ2hELGdCQUFnQixDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsVUFBVSxDQUFDO1FBQzlDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDO0lBQ2xELENBQUM7U0FBTSxDQUFDO1FBQ1AsNEJBQTRCO1FBQzVCLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzdDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO0lBQ3BELENBQUM7SUFDRCxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUV6RCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckMsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUU5RSxNQUFNLE1BQU0sR0FBdUMsRUFBRSxDQUFDO0lBQ3RELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQyxNQUFNLFlBQVksR0FBb0IsY0FBYyxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkgsSUFBSSxZQUFZLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDM0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLDRDQUE0QyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3JFLFNBQVM7UUFDVixDQUFDO1FBRUQsTUFBTSx1QkFBdUIsR0FBRyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RCxNQUFNLHVCQUF1QixHQUFHLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxHQUFHLG9CQUFvQixDQUFDO1FBQ25GLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVDLE1BQU0seUJBQXlCLEdBQWEsRUFBRSxDQUFDO1FBQy9DLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6RCx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUVELElBQUksdUJBQXVCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkMsb0ZBQW9GO1lBQ3BGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDekQsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLHVCQUF1QixDQUFDO1lBQzVDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxnQkFBOEMsQ0FBQztRQUNuRCxJQUFJLGdCQUFpQyxDQUFDO1FBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pFLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEQsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDO2FBQU0sQ0FBQztZQUNQLGdCQUFnQixHQUFHLElBQUksQ0FBQztZQUN4QixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLHVCQUF1QixDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSx5QkFBeUIsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0lBQy9JLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUMxQixPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxJQUFXLFNBRVY7QUFGRCxXQUFXLFNBQVM7SUFDbkIsdUVBQXlCLENBQUE7QUFDMUIsQ0FBQyxFQUZVLFNBQVMsS0FBVCxTQUFTLFFBRW5CO0FBRUQsU0FBUyxVQUFVLENBQUMsV0FBbUIsRUFBRSxvQkFBNEIsRUFBRSxPQUFlLEVBQUUsS0FBYSxFQUFFLEVBQWlCLEVBQUUsb0JBQTRCO0lBRXJKLElBQUksb0JBQW9CLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDaEMsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDbkQsRUFBRSxDQUFDLFlBQVksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQzlDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDL0IsRUFBRSxDQUFDLFlBQVksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3RDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDL0IsRUFBRSxDQUFDLFlBQVksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7U0FBTSxDQUFDO1FBQ1AsRUFBRSxDQUFDLFlBQVksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFDRCxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQy9CLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekIscUJBQXFCO0lBQ3JCLHVDQUF1QztJQUN2QyxJQUFJO0lBRUosTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztJQUMvQixJQUFJLGFBQWEsR0FBRyxvQkFBb0IsQ0FBQztJQUN6QyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDbkIsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO0lBQ2pDLE1BQU0sY0FBYyxHQUFhLEVBQUUsQ0FBQztJQUNwQyxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBYyxDQUFDLENBQUM7SUFFekUsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMxQixLQUFLLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsR0FBRyxFQUFFLFNBQVMsRUFBRSxFQUFFLENBQUM7UUFDdEQsSUFBSSxTQUFTLEtBQUssQ0FBQyxJQUFJLFNBQVMsMENBQThCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdEUsRUFBRSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUNwQyxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsYUFBYSxDQUFDO1FBQzFDLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQztRQUM5QixZQUFZLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBYyxDQUFDLENBQUM7UUFDN0YsSUFBSSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7UUFDM0IsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLFFBQVEsUUFBUSxFQUFFLENBQUM7WUFDbEI7Z0JBQ0Msa0JBQWtCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDM0QsU0FBUyxHQUFHLGtCQUFrQixDQUFDO2dCQUMvQixLQUFLLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUksa0JBQWtCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztvQkFDMUQsSUFBSSxLQUFLLEdBQUcsa0JBQWtCLEVBQUUsQ0FBQzt3QkFDaEMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVM7b0JBQ25DLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxFQUFFLENBQUMsbUJBQW1CLHlCQUFnQixDQUFDO29CQUN4QyxDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsTUFBTTtZQUVQO2dCQUNDLElBQUksWUFBWSw0QkFBbUIsRUFBRSxDQUFDO29CQUNyQyxFQUFFLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDbkMsQ0FBQztxQkFBTSxDQUFDO29CQUNQLEVBQUUsQ0FBQyxtQkFBbUIseUJBQWdCLENBQUM7Z0JBQ3hDLENBQUM7Z0JBQ0QsTUFBTTtZQUVQO2dCQUNDLEVBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hCLE1BQU07WUFFUDtnQkFDQyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN4QixNQUFNO1lBRVA7Z0JBQ0MsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDekIsTUFBTTtZQUVQO2dCQUNDLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU07WUFFUCxtQ0FBdUI7WUFDdkIsd0NBQTZCO1lBQzdCLDZDQUFrQztZQUNsQztnQkFDQyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxQixNQUFNO1lBRVA7Z0JBQ0MsSUFBSSxPQUFPLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDNUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLFFBQVEsR0FBRyxFQUFFLEVBQUUsQ0FBQztvQkFDbkIsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUM7Z0JBQ3BDLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxFQUFFLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO1FBQ0gsQ0FBQztRQUVELFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztRQUNqQyxhQUFhLElBQUksU0FBUyxDQUFDO0lBQzVCLENBQUM7SUFDRCxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRTNCLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsVUFBVSxDQUFDO0lBQzdDLGNBQWMsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsYUFBYSxDQUFDO0lBRW5ELEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFMUIsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUN0QyxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBWSxFQUFFLFdBQTJCLEVBQUUsV0FBbUIsRUFBRSxXQUFxQjtJQUM1RyxJQUFJLFdBQVcsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDN0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQXNCLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRXJGLE1BQU0sWUFBWSxHQUFhLEVBQUUsQ0FBQztJQUNsQyxJQUFJLENBQUM7UUFDSixjQUFjLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMvQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN0QyxPQUFPLFlBQVksQ0FBQztBQUNyQixDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBWSxFQUFFLEtBQXdCLEVBQUUsV0FBcUIsRUFBRSxHQUFXLEVBQUUsUUFBNEIsRUFBRSxJQUFZLEVBQUUsU0FBNkIsRUFBRSxNQUFnQjtJQUM5TCxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNsQixPQUFPO0lBQ1IsQ0FBQztJQUVELFFBQVEsR0FBRyxRQUFRLElBQUksY0FBYyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1RixTQUFTLEdBQUcsU0FBUyxJQUFJLGNBQWMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxXQUFXLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFaEcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3pELFlBQVk7UUFDWixPQUFPO0lBQ1IsQ0FBQztJQUVELDZEQUE2RDtJQUM3RCxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDdEIsa0ZBQWtGO1FBQ2xGLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEIsT0FBTztJQUNSLENBQUM7SUFFRCxNQUFNLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekMsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RixjQUFjLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2hGLGNBQWMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDbkYsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxLQUF3QixFQUFFLFdBQW1CLEVBQUUsU0FBaUI7SUFDckcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLDBDQUE4QixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVyxFQUFFLFdBQVcsMENBQThCLENBQUMsQ0FBQztJQUM5SCxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsMENBQThCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFXLEVBQUUsU0FBUywwQ0FBOEIsQ0FBQyxDQUFDO0lBQ3hILE9BQU8sS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQy9CLENBQUMifQ==