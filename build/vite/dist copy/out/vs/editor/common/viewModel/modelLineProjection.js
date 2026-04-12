/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from '../core/position.js';
import { LineInjectedText } from '../textModelEvents.js';
import { ViewLineData } from '../viewModel.js';
import { InjectedTextInlineDecorationsComputer } from './inlineDecorations.js';
import { getLineTokensWithInjections } from '../model/textModel.js';
export function createModelLineProjection(lineBreakData, isVisible) {
    if (lineBreakData === null) {
        // No mapping needed
        if (isVisible) {
            return IdentityModelLineProjection.INSTANCE;
        }
        return HiddenModelLineProjection.INSTANCE;
    }
    else {
        return new ModelLineProjection(lineBreakData, isVisible);
    }
}
/**
 * This projection is used to
 * * wrap model lines
 * * inject text
 */
class ModelLineProjection {
    constructor(lineBreakData, isVisible) {
        this._projectionData = lineBreakData;
        this._isVisible = isVisible;
    }
    isVisible() {
        return this._isVisible;
    }
    setVisible(isVisible) {
        this._isVisible = isVisible;
        return this;
    }
    getProjectionData() {
        return this._projectionData;
    }
    getViewLineCount() {
        if (!this._isVisible) {
            return 0;
        }
        return this._projectionData.getOutputLineCount();
    }
    getViewLineContent(model, modelLineNumber, outputLineIndex) {
        this._assertVisible();
        const startOffsetInInputWithInjections = outputLineIndex > 0 ? this._projectionData.breakOffsets[outputLineIndex - 1] : 0;
        const endOffsetInInputWithInjections = this._projectionData.breakOffsets[outputLineIndex];
        let r;
        if (this._projectionData.injectionOffsets !== null) {
            const injectedTexts = this._projectionData.injectionOffsets.map((offset, idx) => new LineInjectedText(0, 0, offset + 1, this._projectionData.injectionOptions[idx], 0));
            const lineWithInjections = LineInjectedText.applyInjectedText(model.getLineContent(modelLineNumber), injectedTexts);
            r = lineWithInjections.substring(startOffsetInInputWithInjections, endOffsetInInputWithInjections);
        }
        else {
            r = model.getValueInRange({
                startLineNumber: modelLineNumber,
                startColumn: startOffsetInInputWithInjections + 1,
                endLineNumber: modelLineNumber,
                endColumn: endOffsetInInputWithInjections + 1
            });
        }
        if (outputLineIndex > 0) {
            r = spaces(this._projectionData.wrappedTextIndentLength) + r;
        }
        return r;
    }
    getViewLineLength(model, modelLineNumber, outputLineIndex) {
        this._assertVisible();
        return this._projectionData.getLineLength(outputLineIndex);
    }
    getViewLineMinColumn(_model, _modelLineNumber, outputLineIndex) {
        this._assertVisible();
        return this._projectionData.getMinOutputOffset(outputLineIndex) + 1;
    }
    getViewLineMaxColumn(model, modelLineNumber, outputLineIndex) {
        this._assertVisible();
        return this._projectionData.getMaxOutputOffset(outputLineIndex) + 1;
    }
    /**
     * Try using {@link getViewLinesData} instead.
    */
    getViewLineData(model, modelLineNumber, outputLineIndex, baseViewLineNumber) {
        const arr = new Array();
        this.getViewLinesData(model, modelLineNumber, outputLineIndex, 1, baseViewLineNumber, 0, [true], arr);
        return arr[0];
    }
    getViewLinesData(model, modelLineNumber, outputLineIdx, lineCount, baseViewLineNumber, globalStartIndex, needed, result) {
        this._assertVisible();
        const lineBreakData = this._projectionData;
        const injectionOffsets = lineBreakData.injectionOffsets;
        const injectionOptions = lineBreakData.injectionOptions;
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => injectionOffsets,
            getBreakOffsets: () => lineBreakData.breakOffsets,
            getWrappedTextIndentLength: () => lineBreakData.wrappedTextIndentLength,
            getBaseViewLineNumber: () => baseViewLineNumber
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const lineInlineDecorations = computer.getInlineDecorations(modelLineNumber);
        const lineTokens = model.tokenization.getLineTokens(modelLineNumber);
        const lineWithInjections = getLineTokensWithInjections(lineTokens, injectionOptions, injectionOffsets);
        for (let outputLineIndex = outputLineIdx; outputLineIndex < outputLineIdx + lineCount; outputLineIndex++) {
            const globalIndex = globalStartIndex + outputLineIndex - outputLineIdx;
            if (!needed[globalIndex]) {
                result[globalIndex] = null;
                continue;
            }
            result[globalIndex] = this._getViewLineData(lineWithInjections, lineInlineDecorations ? lineInlineDecorations[outputLineIndex] : null, outputLineIndex);
        }
    }
    _getViewLineData(lineWithInjections, inlineDecorations, outputLineIndex) {
        this._assertVisible();
        const lineBreakData = this._projectionData;
        const deltaStartIndex = (outputLineIndex > 0 ? lineBreakData.wrappedTextIndentLength : 0);
        const lineStartOffsetInInputWithInjections = outputLineIndex > 0 ? lineBreakData.breakOffsets[outputLineIndex - 1] : 0;
        const lineEndOffsetInInputWithInjections = lineBreakData.breakOffsets[outputLineIndex];
        const tokens = lineWithInjections.sliceAndInflate(lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections, deltaStartIndex);
        let lineContent = tokens.getLineContent();
        if (outputLineIndex > 0) {
            lineContent = spaces(lineBreakData.wrappedTextIndentLength) + lineContent;
        }
        const minColumn = this._projectionData.getMinOutputOffset(outputLineIndex) + 1;
        const maxColumn = lineContent.length + 1;
        const continuesWithWrappedLine = (outputLineIndex + 1 < this.getViewLineCount());
        const startVisibleColumn = (outputLineIndex === 0 ? 0 : lineBreakData.breakOffsetsVisibleColumn[outputLineIndex - 1]);
        return new ViewLineData(lineContent, continuesWithWrappedLine, minColumn, maxColumn, startVisibleColumn, tokens, inlineDecorations);
    }
    getModelColumnOfViewPosition(outputLineIndex, outputColumn) {
        this._assertVisible();
        return this._projectionData.translateToInputOffset(outputLineIndex, outputColumn - 1) + 1;
    }
    getViewPositionOfModelPosition(deltaLineNumber, inputColumn, affinity = 2 /* PositionAffinity.None */) {
        this._assertVisible();
        const r = this._projectionData.translateToOutputPosition(inputColumn - 1, affinity);
        return r.toPosition(deltaLineNumber);
    }
    getViewLineNumberOfModelPosition(deltaLineNumber, inputColumn) {
        this._assertVisible();
        const r = this._projectionData.translateToOutputPosition(inputColumn - 1);
        return deltaLineNumber + r.outputLineIndex;
    }
    normalizePosition(outputLineIndex, outputPosition, affinity) {
        const baseViewLineNumber = outputPosition.lineNumber - outputLineIndex;
        const normalizedOutputPosition = this._projectionData.normalizeOutputPosition(outputLineIndex, outputPosition.column - 1, affinity);
        const result = normalizedOutputPosition.toPosition(baseViewLineNumber);
        return result;
    }
    getInjectedTextAt(outputLineIndex, outputColumn) {
        return this._projectionData.getInjectedText(outputLineIndex, outputColumn - 1);
    }
    _assertVisible() {
        if (!this._isVisible) {
            throw new Error('Not supported');
        }
    }
}
/**
 * This projection does not change the model line.
*/
class IdentityModelLineProjection {
    static { this.INSTANCE = new IdentityModelLineProjection(); }
    constructor() { }
    isVisible() {
        return true;
    }
    setVisible(isVisible) {
        if (isVisible) {
            return this;
        }
        return HiddenModelLineProjection.INSTANCE;
    }
    getProjectionData() {
        return null;
    }
    getViewLineCount() {
        return 1;
    }
    getViewLineContent(model, modelLineNumber, _outputLineIndex) {
        return model.getLineContent(modelLineNumber);
    }
    getViewLineLength(model, modelLineNumber, _outputLineIndex) {
        return model.getLineLength(modelLineNumber);
    }
    getViewLineMinColumn(model, modelLineNumber, _outputLineIndex) {
        return model.getLineMinColumn(modelLineNumber);
    }
    getViewLineMaxColumn(model, modelLineNumber, _outputLineIndex) {
        return model.getLineMaxColumn(modelLineNumber);
    }
    getViewLineData(model, modelLineNumber, _outputLineIndex, _baseViewLineNumber) {
        const lineTokens = model.tokenization.getLineTokens(modelLineNumber);
        const lineContent = lineTokens.getLineContent();
        return new ViewLineData(lineContent, false, 1, lineContent.length + 1, 0, lineTokens.inflate(), null);
    }
    getViewLinesData(model, modelLineNumber, _fromOuputLineIndex, _toOutputLineIndex, _baseViewLineNumber, globalStartIndex, needed, result) {
        if (!needed[globalStartIndex]) {
            result[globalStartIndex] = null;
            return;
        }
        result[globalStartIndex] = this.getViewLineData(model, modelLineNumber, 0, _baseViewLineNumber);
    }
    getModelColumnOfViewPosition(_outputLineIndex, outputColumn) {
        return outputColumn;
    }
    getViewPositionOfModelPosition(deltaLineNumber, inputColumn) {
        return new Position(deltaLineNumber, inputColumn);
    }
    getViewLineNumberOfModelPosition(deltaLineNumber, _inputColumn) {
        return deltaLineNumber;
    }
    normalizePosition(outputLineIndex, outputPosition, affinity) {
        return outputPosition;
    }
    getInjectedTextAt(_outputLineIndex, _outputColumn) {
        return null;
    }
}
/**
 * This projection hides the model line.
 */
class HiddenModelLineProjection {
    static { this.INSTANCE = new HiddenModelLineProjection(); }
    constructor() { }
    isVisible() {
        return false;
    }
    setVisible(isVisible) {
        if (!isVisible) {
            return this;
        }
        return IdentityModelLineProjection.INSTANCE;
    }
    getProjectionData() {
        return null;
    }
    getViewLineCount() {
        return 0;
    }
    getViewLineContent(_model, _modelLineNumber, _outputLineIndex) {
        throw new Error('Not supported');
    }
    getViewLineLength(_model, _modelLineNumber, _outputLineIndex) {
        throw new Error('Not supported');
    }
    getViewLineMinColumn(_model, _modelLineNumber, _outputLineIndex) {
        throw new Error('Not supported');
    }
    getViewLineMaxColumn(_model, _modelLineNumber, _outputLineIndex) {
        throw new Error('Not supported');
    }
    getViewLineData(_model, _modelLineNumber, _outputLineIndex, _baseViewLineNumber) {
        throw new Error('Not supported');
    }
    getViewLinesData(_model, _modelLineNumber, _fromOuputLineIndex, _toOutputLineIndex, _baseViewLineNumber, _globalStartIndex, _needed, _result) {
        throw new Error('Not supported');
    }
    getModelColumnOfViewPosition(_outputLineIndex, _outputColumn) {
        throw new Error('Not supported');
    }
    getViewPositionOfModelPosition(_deltaLineNumber, _inputColumn) {
        throw new Error('Not supported');
    }
    getViewLineNumberOfModelPosition(_deltaLineNumber, _inputColumn) {
        throw new Error('Not supported');
    }
    normalizePosition(outputLineIndex, outputPosition, affinity) {
        throw new Error('Not supported');
    }
    getInjectedTextAt(_outputLineIndex, _outputColumn) {
        throw new Error('Not supported');
    }
}
const _spaces = [''];
function spaces(count) {
    if (count >= _spaces.length) {
        for (let i = 1; i <= count; i++) {
            _spaces[i] = _makeSpaces(i);
        }
    }
    return _spaces[count];
}
function _makeSpaces(count) {
    return new Array(count + 1).join(' ');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxMaW5lUHJvamVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vdmlld01vZGVsL21vZGVsTGluZVByb2plY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRy9DLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXpELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMvQyxPQUFPLEVBQWlELHFDQUFxQyxFQUFvQixNQUFNLHdCQUF3QixDQUFDO0FBQ2hKLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBc0NwRSxNQUFNLFVBQVUseUJBQXlCLENBQUMsYUFBNkMsRUFBRSxTQUFrQjtJQUMxRyxJQUFJLGFBQWEsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM1QixvQkFBb0I7UUFDcEIsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sMkJBQTJCLENBQUMsUUFBUSxDQUFDO1FBQzdDLENBQUM7UUFDRCxPQUFPLHlCQUF5QixDQUFDLFFBQVEsQ0FBQztJQUMzQyxDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDMUQsQ0FBQztBQUNGLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxtQkFBbUI7SUFJeEIsWUFBWSxhQUFzQyxFQUFFLFNBQWtCO1FBQ3JFLElBQUksQ0FBQyxlQUFlLEdBQUcsYUFBYSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO0lBQzdCLENBQUM7SUFFTSxTQUFTO1FBQ2YsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3hC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