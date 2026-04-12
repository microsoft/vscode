/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findLast } from '../../../base/common/arraysFind.js';
import * as strings from '../../../base/common/strings.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Range } from '../core/range.js';
import { TextModelPart } from './textModelPart.js';
import { computeIndentLevel } from './utils.js';
import { HorizontalGuidesState, IndentGuide, IndentGuideHorizontalLine } from '../textModelGuides.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
export class GuidesTextModelPart extends TextModelPart {
    constructor(textModel, languageConfigurationService) {
        super();
        this.textModel = textModel;
        this.languageConfigurationService = languageConfigurationService;
    }
    getLanguageConfiguration(languageId) {
        return this.languageConfigurationService.getLanguageConfiguration(languageId);
    }
    _computeIndentLevel(lineIndex) {
        return computeIndentLevel(this.textModel.getLineContent(lineIndex + 1), this.textModel.getOptions().tabSize);
    }
    getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
        this.assertNotDisposed();
        const lineCount = this.textModel.getLineCount();
        if (lineNumber < 1 || lineNumber > lineCount) {
            throw new BugIndicatingError('Illegal value for lineNumber');
        }
        const foldingRules = this.getLanguageConfiguration(this.textModel.getLanguageId()).foldingRules;
        const offSide = Boolean(foldingRules && foldingRules.offSide);
        let up_aboveContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let up_aboveContentLineIndent = -1;
        let up_belowContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let up_belowContentLineIndent = -1;
        const up_resolveIndents = (lineNumber) => {
            if (up_aboveContentLineIndex !== -1 &&
                (up_aboveContentLineIndex === -2 ||
                    up_aboveContentLineIndex > lineNumber - 1)) {
                up_aboveContentLineIndex = -1;
                up_aboveContentLineIndent = -1;
                // must find previous line with content
                for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        up_aboveContentLineIndex = lineIndex;
                        up_aboveContentLineIndent = indent;
                        break;
                    }
                }
            }
            if (up_belowContentLineIndex === -2) {
                up_belowContentLineIndex = -1;
                up_belowContentLineIndent = -1;
                // must find next line with content
                for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        up_belowContentLineIndex = lineIndex;
                        up_belowContentLineIndent = indent;
                        break;
                    }
                }
            }
        };
        let down_aboveContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let down_aboveContentLineIndent = -1;
        let down_belowContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let down_belowContentLineIndent = -1;
        const down_resolveIndents = (lineNumber) => {
            if (down_aboveContentLineIndex === -2) {
                down_aboveContentLineIndex = -1;
                down_aboveContentLineIndent = -1;
                // must find previous line with content
                for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        down_aboveContentLineIndex = lineIndex;
                        down_aboveContentLineIndent = indent;
                        break;
                    }
                }
            }
            if (down_belowContentLineIndex !== -1 &&
                (down_belowContentLineIndex === -2 ||
                    down_belowContentLineIndex < lineNumber - 1)) {
                down_belowContentLineIndex = -1;
                down_belowContentLineIndent = -1;
                // must find next line with content
                for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        down_belowContentLineIndex = lineIndex;
                        down_belowContentLineIndent = indent;
                        break;
                    }
                }
            }
        };
        let startLineNumber = 0;
        let goUp = true;
        let endLineNumber = 0;
        let goDown = true;
        let indent = 0;
        let initialIndent = 0;
        for (let distance = 0; goUp || goDown; distance++) {
            const upLineNumber = lineNumber - distance;
            const downLineNumber = lineNumber + distance;
            if (distance > 1 && (upLineNumber < 1 || upLineNumber < minLineNumber)) {
                goUp = false;
            }
            if (distance > 1 &&
                (downLineNumber > lineCount || downLineNumber > maxLineNumber)) {
                goDown = false;
            }
            if (distance > 50000) {
                // stop processing
                goUp = false;
                goDown = false;
            }
            let upLineIndentLevel = -1;
            if (goUp && upLineNumber >= 1) {
                // compute indent level going up
                const currentIndent = this._computeIndentLevel(upLineNumber - 1);
                if (currentIndent >= 0) {
                    // This line has content (besides whitespace)
                    // Use the line's indent
                    up_belowContentLineIndex = upLineNumber - 1;
                    up_belowContentLineIndent = currentIndent;
                    upLineIndentLevel = Math.ceil(currentIndent / this.textModel.getOptions().indentSize);
                }
                else {
                    up_resolveIndents(upLineNumber);
                    upLineIndentLevel = this._getIndentLevelForWhitespaceLine(offSide, up_aboveContentLineIndent, up_belowContentLineIndent);
                }
            }
            let downLineIndentLevel = -1;
            if (goDown && downLineNumber <= lineCount) {
                // compute indent level going down
                const currentIndent = this._computeIndentLevel(downLineNumber - 1);
                if (currentIndent >= 0) {
                    // This line has content (besides whitespace)
                    // Use the line's indent
                    down_aboveContentLineIndex = downLineNumber - 1;
                    down_aboveContentLineIndent = currentIndent;
                    downLineIndentLevel = Math.ceil(currentIndent / this.textModel.getOptions().indentSize);
                }
                else {
                    down_resolveIndents(downLineNumber);
                    downLineIndentLevel = this._getIndentLevelForWhitespaceLine(offSide, down_aboveContentLineIndent, down_belowContentLineIndent);
                }
            }
            if (distance === 0) {
                initialIndent = upLineIndentLevel;
                continue;
            }
            if (distance === 1) {
                if (downLineNumber <= lineCount &&
                    downLineIndentLevel >= 0 &&
                    initialIndent + 1 === downLineIndentLevel) {
                    // This is the beginning of a scope, we have special handling here, since we want the
                    // child scope indent to be active, not the parent scope
                    goUp = false;
                    startLineNumber = downLineNumber;
                    endLineNumber = downLineNumber;
                    indent = downLineIndentLevel;
                    continue;
                }
                if (upLineNumber >= 1 &&
                    upLineIndentLevel >= 0 &&
                    upLineIndentLevel - 1 === initialIndent) {
                    // This is the end of a scope, just like above
                    goDown = false;
                    startLineNumber = upLineNumber;
                    endLineNumber = upLineNumber;
                    indent = upLineIndentLevel;
                    continue;
                }
                startLineNumber = lineNumber;
                endLineNumber = lineNumber;
                indent = initialIndent;
                if (indent === 0) {
                    // No need to continue
                    return { startLineNumber, endLineNumber, indent };
                }
            }
            if (goUp) {
                if (upLineIndentLevel >= indent) {
                    startLineNumber = upLineNumber;
                }
                else {
                    goUp = false;
                }
            }
            if (goDown) {
                if (downLineIndentLevel >= indent) {
                    endLineNumber = downLineNumber;
                }
                else {
                    goDown = false;
                }
            }
        }
        return { startLineNumber, endLineNumber, indent };
    }
    getLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options) {
        const result = [];
        for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
            result.push([]);
        }
        // If requested, this could be made configurable.
        const includeSingleLinePairs = true;
        const bracketPairs = this.textModel.bracketPairs.getBracketPairsInRangeWithMinIndentation(new Range(startLineNumber, 1, endLineNumber, this.textModel.getLineMaxColumn(endLineNumber))).toArray();
        let activeBracketPairRange = undefined;
        if (activePosition && bracketPairs.length > 0) {
            const bracketsContainingActivePosition = (startLineNumber <= activePosition.lineNumber &&
                activePosition.lineNumber <= endLineNumber
                // We don't need to query the brackets again if the cursor is in the viewport
                ? bracketPairs
                : this.textModel.bracketPairs.getBracketPairsInRange(Range.fromPositions(activePosition)).toArray()).filter((bp) => Range.strictContainsPosition(bp.range, activePosition));
            activeBracketPairRange = findLast(bracketsContainingActivePosition, (i) => includeSingleLinePairs || i.range.startLineNumber !== i.range.endLineNumber)?.range;
        }
        const independentColorPoolPerBracketType = this.textModel.getOptions().bracketPairColorizationOptions.independentColorPoolPerBracketType;
        const colorProvider = new BracketPairGuidesClassNames();
        for (const pair of bracketPairs) {
            /*


                    {
                    |
                    }

                    {
                    |
                    ----}

                ____{
                |test
                ----}

                renderHorizontalEndLineAtTheBottom:
                    {
                    |
                    |x}
                    --
                renderHorizontalEndLineAtTheBottom:
                ____{
                |test
                | x }
                ----
            */
            if (!pair.closingBracketRange) {
                continue;
            }
            const isActive = activeBracketPairRange && pair.range.equalsRange(activeBracketPairRange);
            if (!isActive && !options.includeInactive) {
                continue;
            }
            const className = colorProvider.getInlineClassName(pair.nestingLevel, pair.nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) +
                (options.highlightActive && isActive
                    ? ' ' + colorProvider.activeClassName
                    : '');
            const start = pair.openingBracketRange.getStartPosition();
            const end = pair.closingBracketRange.getStartPosition();
            const horizontalGuides = options.horizontalGuides === HorizontalGuidesState.Enabled || (options.horizontalGuides === HorizontalGuidesState.EnabledForActive && isActive);
            if (pair.range.startLineNumber === pair.range.endLineNumber) {
                if (includeSingleLinePairs && horizontalGuides) {
                    result[pair.range.startLineNumber - startLineNumber].push(new IndentGuide(-1, pair.openingBracketRange.getEndPosition().column, className, new IndentGuideHorizontalLine(false, end.column), -1, -1));
                }
                continue;
            }
            const endVisibleColumn = this.getVisibleColumnFromPosition(end);
            const startVisibleColumn = this.getVisibleColumnFromPosition(pair.openingBracketRange.getStartPosition());
            const guideVisibleColumn = Math.min(startVisibleColumn, endVisibleColumn, pair.minVisibleColumnIndentation + 1);
            let renderHorizontalEndLineAtTheBottom = false;
            const firstNonWsIndex = strings.firstNonWhitespaceIndex(this.textModel.getLineContent(pair.closingBracketRange.startLineNumber));
            const hasTextBeforeClosingBracket = firstNonWsIndex < pair.closingBracketRange.startColumn - 1;
            if (hasTextBeforeClosingBracket) {
                renderHorizontalEndLineAtTheBottom = true;
            }
            const visibleGuideStartLineNumber = Math.max(start.lineNumber, startLineNumber);
            const visibleGuideEndLineNumber = Math.min(end.lineNumber, endLineNumber);
            const offset = renderHorizontalEndLineAtTheBottom ? 1 : 0;
            for (let l = visibleGuideStartLineNumber; l < visibleGuideEndLineNumber + offset; l++) {
                result[l - startLineNumber].push(new IndentGuide(guideVisibleColumn, -1, className, null, l === start.lineNumber ? start.column : -1, l === end.lineNumber ? end.column : -1));
            }
            if (horizontalGuides) {
                if (start.lineNumber >= startLineNumber && startVisibleColumn > guideVisibleColumn) {
                    result[start.lineNumber - startLineNumber].push(new IndentGuide(guideVisibleColumn, -1, className, new IndentGuideHorizontalLine(false, start.column), -1, -1));
                }
                if (end.lineNumber <= endLineNumber && endVisibleColumn > guideVisibleColumn) {
                    result[end.lineNumber - startLineNumber].push(new IndentGuide(guideVisibleColumn, -1, className, new IndentGuideHorizontalLine(!renderHorizontalEndLineAtTheBottom, end.column), -1, -1));
                }
            }
        }
        for (const guides of result) {
            guides.sort((a, b) => a.visibleColumn - b.visibleColumn);
        }
        return result;
    }
    getVisibleColumnFromPosition(position) {
        return (CursorColumns.visibleColumnFromColumn(this.textModel.getLineContent(position.lineNumber), position.column, this.textModel.getOptions().tabSize) + 1);
    }
    getLinesIndentGuides(startLineNumber, endLineNumber) {
        this.assertNotDisposed();
        const lineCount = this.textModel.getLineCount();
        if (startLineNumber < 1 || startLineNumber > lineCount) {
            throw new Error('Illegal value for startLineNumber');
        }
        if (endLineNumber < 1 || endLineNumber > lineCount) {
            throw new Error('Illegal value for endLineNumber');
        }
        const options = this.textModel.getOptions();
        const foldingRules = this.getLanguageConfiguration(this.textModel.getLanguageId()).foldingRules;
        const offSide = Boolean(foldingRules && foldingRules.offSide);
        const result = new Array(endLineNumber - startLineNumber + 1);
        let aboveContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let aboveContentLineIndent = -1;
        let belowContentLineIndex = -2; /* -2 is a marker for not having computed it */
        let belowContentLineIndent = -1;
        for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
            const resultIndex = lineNumber - startLineNumber;
            const currentIndent = this._computeIndentLevel(lineNumber - 1);
            if (currentIndent >= 0) {
                // This line has content (besides whitespace)
                // Use the line's indent
                aboveContentLineIndex = lineNumber - 1;
                aboveContentLineIndent = currentIndent;
                result[resultIndex] = Math.ceil(currentIndent / options.indentSize);
                continue;
            }
            if (aboveContentLineIndex === -2) {
                aboveContentLineIndex = -1;
                aboveContentLineIndent = -1;
                // must find previous line with content
                for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        aboveContentLineIndex = lineIndex;
                        aboveContentLineIndent = indent;
                        break;
                    }
                }
            }
            if (belowContentLineIndex !== -1 &&
                (belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)) {
                belowContentLineIndex = -1;
                belowContentLineIndent = -1;
                // must find next line with content
                for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
                    const indent = this._computeIndentLevel(lineIndex);
                    if (indent >= 0) {
                        belowContentLineIndex = lineIndex;
                        belowContentLineIndent = indent;
                        break;
                    }
                }
            }
            result[resultIndex] = this._getIndentLevelForWhitespaceLine(offSide, aboveContentLineIndent, belowContentLineIndent);
        }
        return result;
    }
    _getIndentLevelForWhitespaceLine(offSide, aboveContentLineIndent, belowContentLineIndent) {
        const options = this.textModel.getOptions();
        if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
            // At the top or bottom of the file
            return 0;
        }
        else if (aboveContentLineIndent < belowContentLineIndent) {
            // we are inside the region above
            return 1 + Math.floor(aboveContentLineIndent / options.indentSize);
        }
        else if (aboveContentLineIndent === belowContentLineIndent) {
            // we are in between two regions
            return Math.ceil(belowContentLineIndent / options.indentSize);
        }
        else {
            if (offSide) {
                // same level as region below
                return Math.ceil(belowContentLineIndent / options.indentSize);
            }
            else {
                // we are inside the region that ends below
                return 1 + Math.floor(belowContentLineIndent / options.indentSize);
            }
        }
    }
}
export class BracketPairGuidesClassNames {
    constructor() {
        this.activeClassName = 'indent-active';
    }
    getInlineClassName(nestingLevel, nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) {
        return this.getInlineClassNameOfLevel(independentColorPoolPerBracketType ? nestingLevelOfEqualBracketType : nestingLevel);
    }
    getInlineClassNameOfLevel(level) {
        // To support a dynamic amount of colors up to 6 colors,
        // we use a number that is a lcm of all numbers from 1 to 6.
        return `bracket-indent-guide lvl-${level % 30}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VpZGVzVGV4dE1vZGVsUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbW9kZWwvZ3VpZGVzVGV4dE1vZGVsUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFekQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXpDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFaEQsT0FBTyxFQUF1QixxQkFBcUIsRUFBZ0QsV0FBVyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekssT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFcEUsTUFBTSxPQUFPLG1CQUFvQixTQUFRLGFBQWE7SUFDckQsWUFDa0IsU0FBb0IsRUFDcEIsNEJBQTJEO1FBRTVFLEtBQUssRUFBRSxDQUFDO1FBSFMsY0FBUyxHQUFULFNBQVMsQ0FBVztRQUNwQixpQ0FBNEIsR0FBNUIsNEJBQTRCLENBQStCO0lBRzdFLENBQUM7SUFFTyx3QkFBd0IsQ0FDL0IsVUFBa0I7UUFFbEIsT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUMsd0JBQXdCLENBQ2hFLFVBQVUsQ0FDVixDQUFDO0lBQ0gsQ0FBQztJQUVPLG1CQUFtQixDQUFDLFNBQWlCO1FBQzVDLE9BQU8sa0JBQWtCLENBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFNBQVMsR0FBRyxD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