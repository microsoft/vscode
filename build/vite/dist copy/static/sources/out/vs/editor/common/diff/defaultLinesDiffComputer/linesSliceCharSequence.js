/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findLastIdxMonotonous, findLastMonotonous, findFirstMonotonous } from '../../../../base/common/arraysFind.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';
import { Position } from '../../core/position.js';
import { Range } from '../../core/range.js';
import { isSpace } from './utils.js';
export class LinesSliceCharSequence {
    constructor(lines, range, considerWhitespaceChanges) {
        this.lines = lines;
        this.range = range;
        this.considerWhitespaceChanges = considerWhitespaceChanges;
        this.elements = [];
        this.firstElementOffsetByLineIdx = [];
        this.lineStartOffsets = [];
        this.trimmedWsLengthsByLineIdx = [];
        this.firstElementOffsetByLineIdx.push(0);
        for (let lineNumber = this.range.startLineNumber; lineNumber <= this.range.endLineNumber; lineNumber++) {
            let line = lines[lineNumber - 1];
            let lineStartOffset = 0;
            if (lineNumber === this.range.startLineNumber && this.range.startColumn > 1) {
                lineStartOffset = this.range.startColumn - 1;
                line = line.substring(lineStartOffset);
            }
            this.lineStartOffsets.push(lineStartOffset);
            let trimmedWsLength = 0;
            if (!considerWhitespaceChanges) {
                const trimmedStartLine = line.trimStart();
                trimmedWsLength = line.length - trimmedStartLine.length;
                line = trimmedStartLine.trimEnd();
            }
            this.trimmedWsLengthsByLineIdx.push(trimmedWsLength);
            const lineLength = lineNumber === this.range.endLineNumber ? Math.min(this.range.endColumn - 1 - lineStartOffset - trimmedWsLength, line.length) : line.length;
            for (let i = 0; i < lineLength; i++) {
                this.elements.push(line.charCodeAt(i));
            }
            if (lineNumber < this.range.endLineNumber) {
                this.elements.push('\n'.charCodeAt(0));
                this.firstElementOffsetByLineIdx.push(this.elements.length);
            }
        }
    }
    toString() {
        return `Slice: "${this.text}"`;
    }
    get text() {
        return this.getText(new OffsetRange(0, this.length));
    }
    getText(range) {
        return this.elements.slice(range.start, range.endExclusive).map(e => String.fromCharCode(e)).join('');
    }
    getElement(offset) {
        return this.elements[offset];
    }
    get length() {
        return this.elements.length;
    }
    getBoundaryScore(length) {
        //   a   b   c   ,           d   e   f
        // 11  0   0   12  15  6   13  0   0   11
        const prevCategory = getCategory(length > 0 ? this.elements[length - 1] : -1);
        const nextCategory = getCategory(length < this.elements.length ? this.elements[length] : -1);
        if (prevCategory === 7 /* CharBoundaryCategory.LineBreakCR */ && nextCategory === 8 /* CharBoundaryCategory.LineBreakLF */) {
            // don't break between \r and \n
            return 0;
        }
        if (prevCategory === 8 /* CharBoundaryCategory.LineBreakLF */) {
            // prefer the linebreak before the change
            return 150;
        }
        let score = 0;
        if (prevCategory !== nextCategory) {
            score += 10;
            if (prevCategory === 0 /* CharBoundaryCategory.WordLower */ && nextCategory === 1 /* CharBoundaryCategory.WordUpper */) {
                score += 1;
            }
        }
        score += getCategoryBoundaryScore(prevCategory);
        score += getCategoryBoundaryScore(nextCategory);
        return score;
    }
    translateOffset(offset, preference = 'right') {
        // find smallest i, so that lineBreakOffsets[i] <= offset using binary search
        const i = findLastIdxMonotonous(this.firstElementOffsetByLineIdx, (value) => value <= offset);
        const lineOffset = offset - this.firstElementOffsetByLineIdx[i];
        return new Position(this.range.startLineNumber + i, 1 + this.lineStartOffsets[i] + lineOffset + ((lineOffset === 0 && preference === 'left') ? 0 : this.trimmedWsLengthsByLineIdx[i]));
    }
    translateRange(range) {
        const pos1 = this.translateOffset(range.start, 'right');
        const pos2 = this.translateOffset(range.endExclusive, 'left');
        if (pos2.isBefore(pos1)) {
            return Range.fromPositions(pos2, pos2);
        }
        return Range.fromPositions(pos1, pos2);
    }
    /**
     * Finds the word that contains the character at the given offset
     */
    findWordContaining(offset) {
        if (offset < 0 || offset >= this.elements.length) {
            return undefined;
        }
        if (!isWordChar(this.elements[offset])) {
            return undefined;
        }
        // find start
        let start = offset;
        while (start > 0 && isWordChar(this.elements[start - 1])) {
            start--;
        }
        // find end
        let end = offset;
        while (end < this.elements.length && isWordChar(this.elements[end])) {
            end++;
        }
        return new OffsetRange(start, end);
    }
    /** fooBar has the two sub-words foo and bar */
    findSubWordContaining(offset) {
        if (offset < 0 || offset >= this.elements.length) {
            return undefined;
        }
        if (!isWordChar(this.elements[offset])) {
            return undefined;
        }
        // find start
        let start = offset;
        while (start > 0 && isWordChar(this.elements[start - 1]) && !isUpperCase(this.elements[start])) {
            start--;
        }
        // find end
        let end = offset;
        while (end < this.elements.length && isWordChar(this.elements[end]) && !isUpperCase(this.elements[end])) {
            end++;
        }
        return new OffsetRange(start, end);
    }
    countLinesIn(range) {
        return this.translateOffset(range.endExclusive).lineNumber - this.translateOffset(range.start).lineNumber;
    }
    isStronglyEqual(offset1, offset2) {
        return this.elements[offset1] === this.elements[offset2];
    }
    extendToFullLines(range) {
        const start = findLastMonotonous(this.firstElementOffsetByLineIdx, x => x <= range.start) ?? 0;
        const end = findFirstMonotonous(this.firstElementOffsetByLineIdx, x => range.endExclusive <= x) ?? this.elements.length;
        return new OffsetRange(start, end);
    }
}
function isWordChar(charCode) {
    return charCode >= 97 /* CharCode.a */ && charCode <= 122 /* CharCode.z */
        || charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */
        || charCode >= 48 /* CharCode.Digit0 */ && charCode <= 57 /* CharCode.Digit9 */;
}
function isUpperCase(charCode) {
    return charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */;
}
var CharBoundaryCategory;
(function (CharBoundaryCategory) {
    CharBoundaryCategory[CharBoundaryCategory["WordLower"] = 0] = "WordLower";
    CharBoundaryCategory[CharBoundaryCategory["WordUpper"] = 1] = "WordUpper";
    CharBoundaryCategory[CharBoundaryCategory["WordNumber"] = 2] = "WordNumber";
    CharBoundaryCategory[CharBoundaryCategory["End"] = 3] = "End";
    CharBoundaryCategory[CharBoundaryCategory["Other"] = 4] = "Other";
    CharBoundaryCategory[CharBoundaryCategory["Separator"] = 5] = "Separator";
    CharBoundaryCategory[CharBoundaryCategory["Space"] = 6] = "Space";
    CharBoundaryCategory[CharBoundaryCategory["LineBreakCR"] = 7] = "LineBreakCR";
    CharBoundaryCategory[CharBoundaryCategory["LineBreakLF"] = 8] = "LineBreakLF";
})(CharBoundaryCategory || (CharBoundaryCategory = {}));
const score = {
    [0 /* CharBoundaryCategory.WordLower */]: 0,
    [1 /* CharBoundaryCategory.WordUpper */]: 0,
    [2 /* CharBoundaryCategory.WordNumber */]: 0,
    [3 /* CharBoundaryCategory.End */]: 10,
    [4 /* CharBoundaryCategory.Other */]: 2,
    [5 /* CharBoundaryCategory.Separator */]: 30,
    [6 /* CharBoundaryCategory.Space */]: 3,
    [7 /* CharBoundaryCategory.LineBreakCR */]: 10,
    [8 /* CharBoundaryCategory.LineBreakLF */]: 10,
};
function getCategoryBoundaryScore(category) {
    return score[category];
}
function getCategory(charCode) {
    if (charCode === 10 /* CharCode.LineFeed */) {
        return 8 /* CharBoundaryCategory.LineBreakLF */;
    }
    else if (charCode === 13 /* CharCode.CarriageReturn */) {
        return 7 /* CharBoundaryCategory.LineBreakCR */;
    }
    else if (isSpace(charCode)) {
        return 6 /* CharBoundaryCategory.Space */;
    }
    else if (charCode >= 97 /* CharCode.a */ && charCode <= 122 /* CharCode.z */) {
        return 0 /* CharBoundaryCategory.WordLower */;
    }
    else if (charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */) {
        return 1 /* CharBoundaryCategory.WordUpper */;
    }
    else if (charCode >= 48 /* CharCode.Digit0 */ && charCode <= 57 /* CharCode.Digit9 */) {
        return 2 /* CharBoundaryCategory.WordNumber */;
    }
    else if (charCode === -1) {
        return 3 /* CharBoundaryCategory.End */;
    }
    else if (charCode === 44 /* CharCode.Comma */ || charCode === 59 /* CharCode.Semicolon */) {
        return 5 /* CharBoundaryCategory.Separator */;
    }
    else {
        return 4 /* CharBoundaryCategory.Other */;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZXNTbGljZUNoYXJTZXF1ZW5jZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvbGluZXNTbGljZUNoYXJTZXF1ZW5jZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV2SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUU1QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJDLE1BQU0sT0FBTyxzQkFBc0I7SUFNbEMsWUFBNEIsS0FBZSxFQUFtQixLQUFZLEVBQWtCLHlCQUFrQztRQUFsRyxVQUFLLEdBQUwsS0FBSyxDQUFVO1FBQW1CLFVBQUssR0FBTCxLQUFLLENBQU87UUFBa0IsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUFTO1FBTDdHLGFBQVEsR0FBYSxFQUFFLENBQUM7UUFDeEIsZ0NBQTJCLEdBQWEsRUFBRSxDQUFDO1FBQzNDLHFCQUFnQixHQUFhLEVBQUUsQ0FBQztRQUNoQyw4QkFBeUIsR0FBYSxFQUFFLENBQUM7UUFHekQsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QyxLQUFLLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLFVBQVUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ3hHLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDakMsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLElBQUksVUFBVSxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM3RSxlQUFlLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN4QyxDQUFDO1lBQ0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUU1QyxJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUMxQyxlQUFlLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7Z0JBQ3hELElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUVyRCxNQUFNLFVBQVUsR0FBRyxVQUFVLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLGVBQWUsR0FBRyxlQUFlLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQy9KLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFFRCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUMzQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM3RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxRQUFRO1FBQ1AsT0FBTyxXQUFXLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQztJQUNoQyxDQUFDO0lBRUQsSUFBSSxJQUFJO1FBQ1AsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksV0FBVyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsT0FBTyxDQUFDLEtBQWtCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBRUQsVUFBVSxDQUFDLE1BQWM7UUFDeEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFRCxJQUFJLE1BQU07UUFDVCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQzdCLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxNQUFjO1FBQ3JDLHNDQUFzQztRQUN0Qyx5Q0FBeUM7UUFFekMsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0YsSUFBSSxZQUFZLDZDQUFxQyxJQUFJLFlBQVksNkNBQXFDLEVBQUUsQ0FBQztZQUM1RyxnQ0FBZ0M7WUFDaEMsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBQ0QsSUFBSSxZQUFZLDZDQUFxQyxFQUFFLENBQUM7WUFDdkQseUNBQXlDO1lBQ3pDLE9BQU8sR0FBRyxDQUFDO1FBQ1osQ0FBQztRQUVELElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksWUFBWSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQ25DLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDWixJQUFJLFlBQVksMkNBQW1DLElBQUksWUFBWSwyQ0FBbUMsRUFBRSxDQUFDO2dCQUN4RyxLQUFLLElBQUksQ0FBQyxDQUFDO1lBQ1osQ0FBQztRQUNGLENBQUM7UUFFRCxLQUFLLElBQUksd0JBQXdCLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDaEQsS0FBSyxJQUFJLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWhELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVNLGVBQWUsQ0FBQyxNQUFjLEVBQUUsYUFBK0IsT0FBTztRQUM1RSw2RUFBNkU7UUFDN0UsTUFBTSxDQUFDLEdBQUcscUJBQXFCLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLENBQUM7UUFDOUYsTUFBTSxVQUFVLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRSxPQUFPLElBQUksUUFBUSxDQUNsQixJQUFJLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxDQUFDLEVBQzlCLENBQUMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxHQUFHLENBQUMsQ0FBQyxVQUFVLEtBQUssQ0FBQyxJQUFJLFVBQVUsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDakksQ0FBQztJQUNILENBQUM7SUFFTSxjQUFjLENBQUMsS0FBa0I7UUFDdkMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5RCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN6QixPQUFPLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRDs7T0FFRztJQUNJLGtCQUFrQixDQUFDLE1BQWM7UUFDdkMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxhQUFhO1FBQ2IsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDO1FBQ25CLE9BQU8sS0FBSyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzFELEtBQUssRUFBRSxDQUFDO1FBQ1QsQ0FBQztRQUVELFdBQVc7UUFDWCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUM7UUFDakIsT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JFLEdBQUcsRUFBRSxDQUFDO1FBQ1AsQ0FBQztRQUVELE9BQU8sSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCwrQ0FBK0M7SUFDeEMscUJBQXFCLENBQUMsTUFBYztRQUMxQyxJQUFJLE1BQU0sR0FBRyxDQUFDLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbEQsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDeEMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELGFBQWE7UUFDYixJQUFJLEtBQUssR0FBRyxNQUFNLENBQUM7UUFDbkIsT0FBTyxLQUFLLEdBQUcsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2hHLEtBQUssRUFBRSxDQUFDO1FBQ1QsQ0FBQztRQUVELFdBQVc7UUFDWCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUM7UUFDakIsT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN6RyxHQUFHLEVBQUUsQ0FBQztRQUNQLENBQUM7UUFFRCxPQUFPLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRU0sWUFBWSxDQUFDLEtBQWtCO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQztJQUMzRyxDQUFDO0lBRU0sZUFBZSxDQUFDLE9BQWUsRUFBRSxPQUFlO1FBQ3RELE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxLQUFrQjtRQUMxQyxNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvRixNQUFNLEdBQUcsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ3hILE9BQU8sSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7Q0FDRDtBQUVELFNBQVMsVUFBVSxDQUFDLFFBQWdCO0lBQ25DLE9BQU8sUUFBUSx1QkFBYyxJQUFJLFFBQVEsd0JBQWM7V0FDbkQsUUFBUSx1QkFBYyxJQUFJLFFBQVEsdUJBQWM7V0FDaEQsUUFBUSw0QkFBbUIsSUFBSSxRQUFRLDRCQUFtQixDQUFDO0FBQ2hFLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxRQUFnQjtJQUNwQyxPQUFPLFFBQVEsdUJBQWMsSUFBSSxRQUFRLHVCQUFjLENBQUM7QUFDekQsQ0FBQztBQUVELElBQVcsb0JBVVY7QUFWRCxXQUFXLG9CQUFvQjtJQUM5Qix5RUFBUyxDQUFBO0lBQ1QseUVBQVMsQ0FBQTtJQUNULDJFQUFVLENBQUE7SUFDViw2REFBRyxDQUFBO0lBQ0gsaUVBQUssQ0FBQTtJQUNMLHlFQUFTLENBQUE7SUFDVCxpRUFBSyxDQUFBO0lBQ0wsNkVBQVcsQ0FBQTtJQUNYLDZFQUFXLENBQUE7QUFDWixDQUFDLEVBVlUsb0JBQW9CLEtBQXBCLG9CQUFvQixRQVU5QjtBQUVELE1BQU0sS0FBSyxHQUF5QztJQUNuRCx3Q0FBZ0MsRUFBRSxDQUFDO0lBQ25DLHdDQUFnQyxFQUFFLENBQUM7SUFDbkMseUNBQWlDLEVBQUUsQ0FBQztJQUNwQyxrQ0FBMEIsRUFBRSxFQUFFO0lBQzlCLG9DQUE0QixFQUFFLENBQUM7SUFDL0Isd0NBQWdDLEVBQUUsRUFBRTtJQUNwQyxvQ0FBNEIsRUFBRSxDQUFDO0lBQy9CLDBDQUFrQyxFQUFFLEVBQUU7SUFDdEMsMENBQWtDLEVBQUUsRUFBRTtDQUN0QyxDQUFDO0FBRUYsU0FBUyx3QkFBd0IsQ0FBQyxRQUE4QjtJQUMvRCxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsUUFBZ0I7SUFDcEMsSUFBSSxRQUFRLCtCQUFzQixFQUFFLENBQUM7UUFDcEMsZ0RBQXdDO0lBQ3pDLENBQUM7U0FBTSxJQUFJLFFBQVEscUNBQTRCLEVBQUUsQ0FBQztRQUNqRCxnREFBd0M7SUFDekMsQ0FBQztTQUFNLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDOUIsMENBQWtDO0lBQ25DLENBQUM7U0FBTSxJQUFJLFFBQVEsdUJBQWMsSUFBSSxRQUFRLHdCQUFjLEVBQUUsQ0FBQztRQUM3RCw4Q0FBc0M7SUFDdkMsQ0FBQztTQUFNLElBQUksUUFBUSx1QkFBYyxJQUFJLFFBQVEsdUJBQWMsRUFBRSxDQUFDO1FBQzdELDhDQUFzQztJQUN2QyxDQUFDO1NBQU0sSUFBSSxRQUFRLDRCQUFtQixJQUFJLFFBQVEsNEJBQW1CLEVBQUUsQ0FBQztRQUN2RSwrQ0FBdUM7SUFDeEMsQ0FBQztTQUFNLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDNUIsd0NBQWdDO0lBQ2pDLENBQUM7U0FBTSxJQUFJLFFBQVEsNEJBQW1CLElBQUksUUFBUSxnQ0FBdUIsRUFBRSxDQUFDO1FBQzNFLDhDQUFzQztJQUN2QyxDQUFDO1NBQU0sQ0FBQztRQUNQLDBDQUFrQztJQUNuQyxDQUFDO0FBQ0YsQ0FBQyJ9