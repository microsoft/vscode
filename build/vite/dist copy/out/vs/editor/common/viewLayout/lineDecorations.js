/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../base/common/strings.js';
export class LineDecoration {
    constructor(startColumn, endColumn, className, type) {
        this.startColumn = startColumn;
        this.endColumn = endColumn;
        this.className = className;
        this.type = type;
        this._lineDecorationBrand = undefined;
    }
    static _equals(a, b) {
        return (a.startColumn === b.startColumn
            && a.endColumn === b.endColumn
            && a.className === b.className
            && a.type === b.type);
    }
    static equalsArr(a, b) {
        const aLen = a.length;
        const bLen = b.length;
        if (aLen !== bLen) {
            return false;
        }
        for (let i = 0; i < aLen; i++) {
            if (!LineDecoration._equals(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    static extractWrapped(arr, startOffset, endOffset) {
        if (arr.length === 0) {
            return arr;
        }
        const startColumn = startOffset + 1;
        const endColumn = endOffset + 1;
        const lineLength = endOffset - startOffset;
        const r = [];
        let rLength = 0;
        for (const dec of arr) {
            if (dec.endColumn <= startColumn || dec.startColumn >= endColumn) {
                continue;
            }
            r[rLength++] = new LineDecoration(Math.max(1, dec.startColumn - startColumn + 1), Math.min(lineLength + 1, dec.endColumn - startColumn + 1), dec.className, dec.type);
        }
        return r;
    }
    static filter(lineDecorations, lineNumber, minLineColumn, maxLineColumn) {
        if (lineDecorations.length === 0) {
            return [];
        }
        const result = [];
        let resultLen = 0;
        for (let i = 0, len = lineDecorations.length; i < len; i++) {
            const d = lineDecorations[i];
            const range = d.range;
            if (range.endLineNumber < lineNumber || range.startLineNumber > lineNumber) {
                // Ignore decorations that sit outside this line
                continue;
            }
            if (range.isEmpty() && (d.type === 0 /* InlineDecorationType.Regular */ || d.type === 3 /* InlineDecorationType.RegularAffectingLetterSpacing */)) {
                // Ignore empty range decorations
                continue;
            }
            const startColumn = (range.startLineNumber === lineNumber ? range.startColumn : minLineColumn);
            const endColumn = (range.endLineNumber === lineNumber ? range.endColumn : maxLineColumn);
            result[resultLen++] = new LineDecoration(startColumn, endColumn, d.inlineClassName, d.type);
        }
        return result;
    }
    static _typeCompare(a, b) {
        const ORDER = [2, 0, 1, 3];
        return ORDER[a] - ORDER[b];
    }
    static compare(a, b) {
        if (a.startColumn !== b.startColumn) {
            return a.startColumn - b.startColumn;
        }
        if (a.endColumn !== b.endColumn) {
            return a.endColumn - b.endColumn;
        }
        const typeCmp = LineDecoration._typeCompare(a.type, b.type);
        if (typeCmp !== 0) {
            return typeCmp;
        }
        if (a.className !== b.className) {
            return a.className < b.className ? -1 : 1;
        }
        return 0;
    }
}
export class DecorationSegment {
    constructor(startOffset, endOffset, className, metadata) {
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.className = className;
        this.metadata = metadata;
    }
}
class Stack {
    constructor() {
        this.stopOffsets = [];
        this.classNames = [];
        this.metadata = [];
        this.count = 0;
    }
    static _metadata(metadata) {
        let result = 0;
        for (let i = 0, len = metadata.length; i < len; i++) {
            result |= metadata[i];
        }
        return result;
    }
    consumeLowerThan(maxStopOffset, nextStartOffset, result) {
        while (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
            let i = 0;
            // Take all equal stopping offsets
            while (i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
                i++;
            }
            // Basically we are consuming the first i + 1 elements of the stack
            result.push(new DecorationSegment(nextStartOffset, this.stopOffsets[i], this.classNames.join(' '), Stack._metadata(this.metadata)));
            nextStartOffset = this.stopOffsets[i] + 1;
            // Consume them
            this.stopOffsets.splice(0, i + 1);
            this.classNames.splice(0, i + 1);
            this.metadata.splice(0, i + 1);
            this.count -= (i + 1);
        }
        if (this.count > 0 && nextStartOffset < maxStopOffset) {
            result.push(new DecorationSegment(nextStartOffset, maxStopOffset - 1, this.classNames.join(' '), Stack._metadata(this.metadata)));
            nextStartOffset = maxStopOffset;
        }
        return nextStartOffset;
    }
    insert(stopOffset, className, metadata) {
        if (this.count === 0 || this.stopOffsets[this.count - 1] <= stopOffset) {
            // Insert at the end
            this.stopOffsets.push(stopOffset);
            this.classNames.push(className);
            this.metadata.push(metadata);
        }
        else {
            // Find the insertion position for `stopOffset`
            for (let i = 0; i < this.count; i++) {
                if (this.stopOffsets[i] >= stopOffset) {
                    this.stopOffsets.splice(i, 0, stopOffset);
                    this.classNames.splice(i, 0, className);
                    this.metadata.splice(i, 0, metadata);
                    break;
                }
            }
        }
        this.count++;
        return;
    }
}
export class LineDecorationsNormalizer {
    /**
     * Normalize line decorations. Overlapping decorations will generate multiple segments
     */
    static normalize(lineContent, lineDecorations) {
        if (lineDecorations.length === 0) {
            return [];
        }
        const result = [];
        const stack = new Stack();
        let nextStartOffset = 0;
        for (let i = 0, len = lineDecorations.length; i < len; i++) {
            const d = lineDecorations[i];
            let startColumn = d.startColumn;
            let endColumn = d.endColumn;
            const className = d.className;
            const metadata = (d.type === 1 /* InlineDecorationType.Before */
                ? 2 /* LinePartMetadata.PSEUDO_BEFORE */
                : d.type === 2 /* InlineDecorationType.After */
                    ? 4 /* LinePartMetadata.PSEUDO_AFTER */
                    : 0);
            // If the position would end up in the middle of a high-low surrogate pair, we move it to before the pair
            if (startColumn > 1) {
                const charCodeBefore = lineContent.charCodeAt(startColumn - 2);
                if (strings.isHighSurrogate(charCodeBefore)) {
                    startColumn--;
                }
            }
            if (endColumn > 1) {
                const charCodeBefore = lineContent.charCodeAt(endColumn - 2);
                if (strings.isHighSurrogate(charCodeBefore)) {
                    endColumn--;
                }
            }
            const currentStartOffset = startColumn - 1;
            const currentEndOffset = endColumn - 2;
            nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);
            if (stack.count === 0) {
                nextStartOffset = currentStartOffset;
            }
            stack.insert(currentEndOffset, className, metadata);
        }
        stack.consumeLowerThan(1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */, nextStartOffset, result);
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZURlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi92aWV3TGF5b3V0L2xpbmVEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBSzNELE1BQU0sT0FBTyxjQUFjO0lBRzFCLFlBQ2lCLFdBQW1CLEVBQ25CLFNBQWlCLEVBQ2pCLFNBQWlCLEVBQ2pCLElBQTBCO1FBSDFCLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBQ25CLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFDakIsY0FBUyxHQUFULFNBQVMsQ0FBUTtRQUNqQixTQUFJLEdBQUosSUFBSSxDQUFzQjtRQU4zQyx5QkFBb0IsR0FBUyxTQUFTLENBQUM7SUFRdkMsQ0FBQztJQUVPLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBaUIsRUFBRSxDQUFpQjtRQUMxRCxPQUFPLENBQ04sQ0FBQyxDQUFDLFdBQVcsS0FBSyxDQUFDLENBQUMsV0FBVztlQUM1QixDQUFDLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxTQUFTO2VBQzNCLENBQUMsQ0FBQyxTQUFTLEtBQUssQ0FBQyxDQUFDLFNBQVM7ZUFDM0IsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsSUFBSSxDQUNwQixDQUFDO0lBQ0gsQ0FBQztJQUVNLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBNEIsRUFBRSxDQUE0QjtRQUNqRixNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3RCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsSUFBSSxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDbkIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsS0FBSyxJQUFJLENBQUMs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