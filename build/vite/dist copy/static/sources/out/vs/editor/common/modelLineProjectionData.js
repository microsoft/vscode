/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../base/common/assert.js';
import { Position } from './core/position.js';
import { InjectedTextCursorStops } from './model.js';
/**
 * *input*:
 * ```
 * xxxxxxxxxxxxxxxxxxxxxxxxxxx
 * ```
 *
 * -> Applying injections `[i...i]`, *inputWithInjections*:
 * ```
 * xxxxxx[iiiiiiiiii]xxxxxxxxxxxxxxxxx[ii]xxxx
 * ```
 *
 * -> breaking at offsets `|` in `xxxxxx[iiiiiii|iii]xxxxxxxxxxx|xxxxxx[ii]xxxx|`:
 * ```
 * xxxxxx[iiiiiii
 * iii]xxxxxxxxxxx
 * xxxxxx[ii]xxxx
 * ```
 *
 * -> applying wrappedTextIndentLength, *output*:
 * ```
 * xxxxxx[iiiiiii
 *    iii]xxxxxxxxxxx
 *    xxxxxx[ii]xxxx
 * ```
 */
export class ModelLineProjectionData {
    constructor(injectionOffsets, 
    /**
     * `injectionOptions.length` must equal `injectionOffsets.length`
     */
    injectionOptions, 
    /**
     * Refers to offsets after applying injections to the source.
     * The last break offset indicates the length of the source after applying injections.
     */
    breakOffsets, 
    /**
     * Refers to offsets after applying injections
     */
    breakOffsetsVisibleColumn, wrappedTextIndentLength) {
        this.injectionOffsets = injectionOffsets;
        this.injectionOptions = injectionOptions;
        this.breakOffsets = breakOffsets;
        this.breakOffsetsVisibleColumn = breakOffsetsVisibleColumn;
        this.wrappedTextIndentLength = wrappedTextIndentLength;
    }
    getOutputLineCount() {
        return this.breakOffsets.length;
    }
    getMinOutputOffset(outputLineIndex) {
        if (outputLineIndex > 0) {
            return this.wrappedTextIndentLength;
        }
        return 0;
    }
    getLineLength(outputLineIndex) {
        // These offsets refer to model text with injected text.
        const startOffset = outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0;
        const endOffset = this.breakOffsets[outputLineIndex];
        let lineLength = endOffset - startOffset;
        if (outputLineIndex > 0) {
            lineLength += this.wrappedTextIndentLength;
        }
        return lineLength;
    }
    getMaxOutputOffset(outputLineIndex) {
        return this.getLineLength(outputLineIndex);
    }
    translateToInputOffset(outputLineIndex, outputOffset) {
        if (outputLineIndex > 0) {
            outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength);
        }
        const offsetInInputWithInjection = outputLineIndex === 0 ? outputOffset : this.breakOffsets[outputLineIndex - 1] + outputOffset;
        let offsetInInput = offsetInInputWithInjection;
        if (this.injectionOffsets !== null) {
            for (let i = 0; i < this.injectionOffsets.length; i++) {
                if (offsetInInput > this.injectionOffsets[i]) {
                    if (offsetInInput < this.injectionOffsets[i] + this.injectionOptions[i].content.length) {
                        // `inputOffset` is within injected text
                        offsetInInput = this.injectionOffsets[i];
                    }
                    else {
                        offsetInInput -= this.injectionOptions[i].content.length;
                    }
                }
                else {
                    break;
                }
            }
        }
        return offsetInInput;
    }
    translateToOutputPosition(inputOffset, affinity = 2 /* PositionAffinity.None */) {
        let inputOffsetInInputWithInjection = inputOffset;
        if (this.injectionOffsets !== null) {
            for (let i = 0; i < this.injectionOffsets.length; i++) {
                if (inputOffset < this.injectionOffsets[i]) {
                    break;
                }
                if (affinity !== 1 /* PositionAffinity.Right */ && inputOffset === this.injectionOffsets[i]) {
                    break;
                }
                inputOffsetInInputWithInjection += this.injectionOptions[i].content.length;
            }
        }
        return this.offsetInInputWithInjectionsToOutputPosition(inputOffsetInInputWithInjection, affinity);
    }
    offsetInInputWithInjectionsToOutputPosition(offsetInInputWithInjections, affinity = 2 /* PositionAffinity.None */) {
        let low = 0;
        let high = this.breakOffsets.length - 1;
        let mid = 0;
        let midStart = 0;
        while (low <= high) {
            mid = low + ((high - low) / 2) | 0;
            const midStop = this.breakOffsets[mid];
            midStart = mid > 0 ? this.breakOffsets[mid - 1] : 0;
            if (affinity === 0 /* PositionAffinity.Left */) {
                if (offsetInInputWithInjections <= midStart) {
                    high = mid - 1;
                }
                else if (offsetInInputWithInjections > midStop) {
                    low = mid + 1;
                }
                else {
                    break;
                }
            }
            else {
                if (offsetInInputWithInjections < midStart) {
                    high = mid - 1;
                }
                else if (offsetInInputWithInjections >= midStop) {
                    low = mid + 1;
                }
                else {
                    break;
                }
            }
        }
        let outputOffset = offsetInInputWithInjections - midStart;
        if (mid > 0) {
            outputOffset += this.wrappedTextIndentLength;
        }
        return new OutputPosition(mid, outputOffset);
    }
    normalizeOutputPosition(outputLineIndex, outputOffset, affinity) {
        if (this.injectionOffsets !== null) {
            const offsetInInputWithInjections = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset);
            const normalizedOffsetInUnwrappedLine = this.normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections, affinity);
            if (normalizedOffsetInUnwrappedLine !== offsetInInputWithInjections) {
                // injected text caused a change
                return this.offsetInInputWithInjectionsToOutputPosition(normalizedOffsetInUnwrappedLine, affinity);
            }
        }
        if (affinity === 0 /* PositionAffinity.Left */) {
            if (outputLineIndex > 0 && outputOffset === this.getMinOutputOffset(outputLineIndex)) {
                return new OutputPosition(outputLineIndex - 1, this.getMaxOutputOffset(outputLineIndex - 1));
            }
        }
        else if (affinity === 1 /* PositionAffinity.Right */) {
            const maxOutputLineIndex = this.getOutputLineCount() - 1;
            if (outputLineIndex < maxOutputLineIndex && outputOffset === this.getMaxOutputOffset(outputLineIndex)) {
                return new OutputPosition(outputLineIndex + 1, this.getMinOutputOffset(outputLineIndex + 1));
            }
        }
        return new OutputPosition(outputLineIndex, outputOffset);
    }
    outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset) {
        if (outputLineIndex > 0) {
            outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength);
        }
        const result = (outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0) + outputOffset;
        return result;
    }
    normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections, affinity) {
        const injectedText = this.getInjectedTextAtOffset(offsetInInputWithInjections);
        if (!injectedText) {
            return offsetInInputWithInjections;
        }
        if (affinity === 2 /* PositionAffinity.None */) {
            if (offsetInInputWithInjections === injectedText.offsetInInputWithInjections + injectedText.length
                && hasRightCursorStop(this.injectionOptions[injectedText.injectedTextIndex].cursorStops)) {
                return injectedText.offsetInInputWithInjections + injectedText.length;
            }
            else {
                let result = injectedText.offsetInInputWithInjections;
                if (hasLeftCursorStop(this.injectionOptions[injectedText.injectedTextIndex].cursorStops)) {
                    return result;
                }
                let index = injectedText.injectedTextIndex - 1;
                while (index >= 0 && this.injectionOffsets[index] === this.injectionOffsets[injectedText.injectedTextIndex]) {
                    if (hasRightCursorStop(this.injectionOptions[index].cursorStops)) {
                        break;
                    }
                    result -= this.injectionOptions[index].content.length;
                    if (hasLeftCursorStop(this.injectionOptions[index].cursorStops)) {
                        break;
                    }
                    index--;
                }
                return result;
            }
        }
        else if (affinity === 1 /* PositionAffinity.Right */ || affinity === 4 /* PositionAffinity.RightOfInjectedText */) {
            let result = injectedText.offsetInInputWithInjections + injectedText.length;
            let index = injectedText.injectedTextIndex;
            // traverse all injected text that touch each other
            while (index + 1 < this.injectionOffsets.length && this.injectionOffsets[index + 1] === this.injectionOffsets[index]) {
                result += this.injectionOptions[index + 1].content.length;
                index++;
            }
            return result;
        }
        else if (affinity === 0 /* PositionAffinity.Left */ || affinity === 3 /* PositionAffinity.LeftOfInjectedText */) {
            // affinity is left
            let result = injectedText.offsetInInputWithInjections;
            let index = injectedText.injectedTextIndex;
            // traverse all injected text that touch each other
            while (index - 1 >= 0 && this.injectionOffsets[index - 1] === this.injectionOffsets[index]) {
                result -= this.injectionOptions[index - 1].content.length;
                index--;
            }
            return result;
        }
        assertNever(affinity);
    }
    getInjectedText(outputLineIndex, outputOffset) {
        const offset = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset);
        const injectedText = this.getInjectedTextAtOffset(offset);
        if (!injectedText) {
            return null;
        }
        return {
            options: this.injectionOptions[injectedText.injectedTextIndex]
        };
    }
    getInjectedTextAtOffset(offsetInInputWithInjections) {
        const injectionOffsets = this.injectionOffsets;
        const injectionOptions = this.injectionOptions;
        if (injectionOffsets !== null) {
            let totalInjectedTextLengthBefore = 0;
            for (let i = 0; i < injectionOffsets.length; i++) {
                const length = injectionOptions[i].content.length;
                const injectedTextStartOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore;
                const injectedTextEndOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore + length;
                if (injectedTextStartOffsetInInputWithInjections > offsetInInputWithInjections) {
                    // Injected text starts later.
                    break; // All later injected texts have an even larger offset.
                }
                if (offsetInInputWithInjections <= injectedTextEndOffsetInInputWithInjections) {
                    // Injected text ends after or with the given position (but also starts with or before it).
                    return {
                        injectedTextIndex: i,
                        offsetInInputWithInjections: injectedTextStartOffsetInInputWithInjections,
                        length
                    };
                }
                totalInjectedTextLengthBefore += length;
            }
        }
        return undefined;
    }
}
function hasRightCursorStop(cursorStop) {
    if (cursorStop === null || cursorStop === undefined) {
        return true;
    }
    return cursorStop === InjectedTextCursorStops.Right || cursorStop === InjectedTextCursorStops.Both;
}
function hasLeftCursorStop(cursorStop) {
    if (cursorStop === null || cursorStop === undefined) {
        return true;
    }
    return cursorStop === InjectedTextCursorStops.Left || cursorStop === InjectedTextCursorStops.Both;
}
export class InjectedText {
    constructor(options) {
        this.options = options;
    }
}
export class OutputPosition {
    constructor(outputLineIndex, outputOffset) {
        this.outputLineIndex = outputLineIndex;
        this.outputOffset = outputOffset;
    }
    toString() {
        return `${this.outputLineIndex}:${this.outputOffset}`;
    }
    toPosition(baseLineNumber) {
        return new Position(baseLineNumber + this.outputLineIndex, this.outputOffset + 1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsTGluZVByb2plY3Rpb25EYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUcxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHVCQUF1QixFQUF5QyxNQUFNLFlBQVksQ0FBQztBQUc1Rjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBd0JHO0FBQ0gsTUFBTSxPQUFPLHVCQUF1QjtJQUNuQyxZQUNRLGdCQUFpQztJQUN4Qzs7T0FFRztJQUNJLGdCQUE4QztJQUNyRDs7O09BR0c7SUFDSSxZQUFzQjtJQUM3Qjs7T0FFRztJQUNJLHlCQUFtQyxFQUNuQyx1QkFBK0I7UUFkL0IscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFpQjtRQUlqQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQThCO1FBSzlDLGlCQUFZLEdBQVosWUFBWSxDQUFVO1FBSXRCLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBVTtRQUNuQyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQVE7SUFFdkMsQ0FBQztJQUVNLGtCQUFrQjtRQUN4QixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO0lBQ2pDLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxlQUF1QjtRQUNoRCxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN6QixPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBRU0sYUFBYSxDQUFDLGVBQXVCO1FBQzNDLHdEQUF3RDtRQUN4RCxNQUFNLFdBQVcs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