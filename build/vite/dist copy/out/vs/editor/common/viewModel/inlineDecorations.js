/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../core/range.js';
import { Position } from '../core/position.js';
import { isModelDecorationVisible, ViewModelDecoration } from './viewModelDecoration.js';
export var InlineDecorationType;
(function (InlineDecorationType) {
    InlineDecorationType[InlineDecorationType["Regular"] = 0] = "Regular";
    InlineDecorationType[InlineDecorationType["Before"] = 1] = "Before";
    InlineDecorationType[InlineDecorationType["After"] = 2] = "After";
    InlineDecorationType[InlineDecorationType["RegularAffectingLetterSpacing"] = 3] = "RegularAffectingLetterSpacing";
})(InlineDecorationType || (InlineDecorationType = {}));
export class InlineDecoration {
    constructor(range, inlineClassName, type) {
        this.range = range;
        this.inlineClassName = inlineClassName;
        this.type = type;
    }
}
export class InlineModelDecorationsComputer {
    constructor(context, model, coordinatesConverter) {
        this.context = context;
        this.model = model;
        this.coordinatesConverter = coordinatesConverter;
        this._decorationsCache = Object.create(null);
    }
    getInlineDecorations(modelLineNumber) {
        const modelRange = new Range(modelLineNumber, 1, modelLineNumber, this.model.getLineMaxColumn(modelLineNumber));
        const viewRange = this.coordinatesConverter.convertModelRangeToViewRange(modelRange);
        const decorationsViewportData = this.getDecorations(viewRange, false, false);
        return decorationsViewportData.inlineDecorations;
    }
    getDecorations(viewRange, onlyMinimapDecorations, onlyMarginDecorations) {
        const modelDecorations = this.context.getModelDecorations(viewRange, onlyMinimapDecorations, onlyMarginDecorations);
        const startLineNumber = viewRange.startLineNumber;
        const endLineNumber = viewRange.endLineNumber;
        const decorationsInViewport = [];
        let decorationsInViewportLen = 0;
        const inlineDecorations = [];
        const hasVariableFonts = [];
        for (let j = startLineNumber; j <= endLineNumber; j++) {
            inlineDecorations[j - startLineNumber] = [];
            hasVariableFonts[j - startLineNumber] = false;
        }
        for (let i = 0, len = modelDecorations.length; i < len; i++) {
            const modelDecoration = modelDecorations[i];
            const decorationOptions = modelDecoration.options;
            if (!isModelDecorationVisible(this.model, modelDecoration)) {
                continue;
            }
            const viewModelDecoration = this._getOrCreateViewModelDecoration(modelDecoration);
            const viewRange = viewModelDecoration.range;
            decorationsInViewport[decorationsInViewportLen++] = viewModelDecoration;
            if (decorationOptions.inlineClassName) {
                const inlineDecoration = new InlineDecoration(viewRange, decorationOptions.inlineClassName, decorationOptions.inlineClassNameAffectsLetterSpacing ? 3 /* InlineDecorationType.RegularAffectingLetterSpacing */ : 0 /* InlineDecorationType.Regular */);
                const intersectedStartLineNumber = Math.max(startLineNumber, viewRange.startLineNumber);
                const intersectedEndLineNumber = Math.min(endLineNumber, viewRange.endLineNumber);
                for (let j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
                    inlineDecorations[j - startLineNumber].push(inlineDecoration);
                    if (decorationOptions.affectsFont) {
                        hasVariableFonts[j - startLineNumber] = true;
                    }
                }
            }
            if (decorationOptions.beforeContentClassName) {
                if (startLineNumber <= viewRange.startLineNumber && viewRange.startLineNumber <= endLineNumber) {
                    const inlineDecoration = new InlineDecoration(new Range(viewRange.startLineNumber, viewRange.startColumn, viewRange.startLineNumber, viewRange.startColumn), decorationOptions.beforeContentClassName, 1 /* InlineDecorationType.Before */);
                    inlineDecorations[viewRange.startLineNumber - startLineNumber].push(inlineDecoration);
                    if (decorationOptions.affectsFont) {
                        hasVariableFonts[viewRange.startLineNumber - startLineNumber] = true;
                    }
                }
            }
            if (decorationOptions.afterContentClassName) {
                if (startLineNumber <= viewRange.endLineNumber && viewRange.endLineNumber <= endLineNumber) {
                    const inlineDecoration = new InlineDecoration(new Range(viewRange.endLineNumber, viewRange.endColumn, viewRange.endLineNumber, viewRange.endColumn), decorationOptions.afterContentClassName, 2 /* InlineDecorationType.After */);
                    inlineDecorations[viewRange.endLineNumber - startLineNumber].push(inlineDecoration);
                    if (decorationOptions.affectsFont) {
                        hasVariableFonts[viewRange.endLineNumber - startLineNumber] = true;
                    }
                }
            }
        }
        return {
            decorations: decorationsInViewport,
            inlineDecorations: inlineDecorations,
            hasVariableFonts
        };
    }
    reset() {
        this._decorationsCache = Object.create(null);
    }
    onModelDecorationsChanged() {
        this.reset();
    }
    onLineMappingChanged() {
        this.reset();
    }
    _getOrCreateViewModelDecoration(modelDecoration) {
        const id = modelDecoration.id;
        let r = this._decorationsCache[id];
        if (!r) {
            const modelRange = modelDecoration.range;
            const options = modelDecoration.options;
            let viewRange;
            if (options.isWholeLine) {
                const start = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.startLineNumber, 1), 0 /* PositionAffinity.Left */, false, true);
                const end = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber)), 1 /* PositionAffinity.Right */);
                viewRange = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
            }
            else {
                // For backwards compatibility reasons, we want injected text before any decoration.
                // Thus, move decorations to the right.
                viewRange = this.coordinatesConverter.convertModelRangeToViewRange(modelRange, 1 /* PositionAffinity.Right */);
            }
            r = new ViewModelDecoration(viewRange, options);
            this._decorationsCache[id] = r;
        }
        return r;
    }
}
export class InjectedTextInlineDecorationsComputer {
    constructor(context) {
        this.context = context;
    }
    getInlineDecorations(modelLineNumber) {
        const injectionOffsets = this.context.getInjectionOffsets(modelLineNumber);
        if (!injectionOffsets) {
            return [];
        }
        const lineInlineDecorations = [];
        let totalInjectedTextLengthBefore = 0;
        let currentInjectedOffset = 0;
        const injectionOptions = this.context.getInjectionOptions(modelLineNumber);
        const breakOffsets = this.context.getBreakOffsets(modelLineNumber);
        for (let outputLineIndex = 0; outputLineIndex < breakOffsets.length; outputLineIndex++) {
            const inlineDecorations = new Array();
            lineInlineDecorations[outputLineIndex] = inlineDecorations;
            const lineStartOffsetInInputWithInjections = outputLineIndex > 0 ? breakOffsets[outputLineIndex - 1] : 0;
            const lineEndOffsetInInputWithInjections = breakOffsets[outputLineIndex];
            while (currentInjectedOffset < injectionOffsets.length) {
                const length = injectionOptions[currentInjectedOffset].content.length;
                const injectedTextStartOffsetInInputWithInjections = injectionOffsets[currentInjectedOffset] + totalInjectedTextLengthBefore;
                const injectedTextEndOffsetInInputWithInjections = injectedTextStartOffsetInInputWithInjections + length;
                if (injectedTextStartOffsetInInputWithInjections > lineEndOffsetInInputWithInjections) {
                    // Injected text only starts in later wrapped lines.
                    break;
                }
                if (lineStartOffsetInInputWithInjections < injectedTextEndOffsetInInputWithInjections) {
                    // Injected text ends after or in this line (but also starts in or before this line).
                    const options = injectionOptions[currentInjectedOffset];
                    if (options.inlineClassName) {
                        const wrappedTextIndentLength = this.context.getWrappedTextIndentLength(modelLineNumber);
                        const offset = (outputLineIndex > 0 ? wrappedTextIndentLength : 0);
                        const start = offset + Math.max(injectedTextStartOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, 0);
                        const end = offset + Math.min(injectedTextEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections);
                        if (start !== end) {
                            const viewLineNumber = this.context.getBaseViewLineNumber(modelLineNumber) + outputLineIndex;
                            const range = new Range(viewLineNumber, start + 1, viewLineNumber, end + 1);
                            const type = options.inlineClassNameAffectsLetterSpacing ? 3 /* InlineDecorationType.RegularAffectingLetterSpacing */ : 0 /* InlineDecorationType.Regular */;
                            inlineDecorations.push(new InlineDecoration(range, options.inlineClassName, type));
                        }
                    }
                }
                if (injectedTextEndOffsetInInputWithInjections <= lineEndOffsetInInputWithInjections) {
                    totalInjectedTextLengthBefore += length;
                    currentInjectedOffset++;
                }
                else {
                    // injected text breaks into next line, process it again
                    break;
                }
            }
        }
        return lineInlineDecorations;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRS9DLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXpGLE1BQU0sQ0FBTixJQUFrQixvQkFLakI7QUFMRCxXQUFrQixvQkFBb0I7SUFDckMscUVBQVcsQ0FBQTtJQUNYLG1FQUFVLENBQUE7SUFDVixpRUFBUyxDQUFBO0lBQ1QsaUhBQWlDLENBQUE7QUFDbEMsQ0FBQyxFQUxpQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBS3JDO0FBRUQsTUFBTSxPQUFPLGdCQUFnQjtJQUM1QixZQUNpQixLQUFZLEVBQ1osZUFBdUIsRUFDdkIsSUFBMEI7UUFGMUIsVUFBSyxHQUFMLEtBQUssQ0FBTztRQUNaLG9CQUFlLEdBQWYsZUFBZSxDQUFRO1FBQ3ZCLFNBQUksR0FBSixJQUFJLENBQXNCO0lBQ3ZDLENBQUM7Q0FDTDtBQWtDRCxNQUFNLE9BQU8sOEJBQThCO0lBSTFDLFlBQ2tCLE9BQStDLEVBQy9DLEtBQWlCLEVBQ2pCLG9CQUEyQztRQUYzQyxZQUFPLEdBQVAsT0FBTyxDQUF3QztRQUMvQyxVQUFLLEdBQUwsS0FBSyxDQUFZO1FBQ2pCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFFNUQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVNLG9CQUFvQixDQUFDLGVBQXVC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