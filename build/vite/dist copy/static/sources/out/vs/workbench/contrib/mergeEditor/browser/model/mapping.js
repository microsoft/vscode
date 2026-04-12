/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, concatArrays, numberComparator } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRangeEdit } from './editing.js';
import { MergeEditorLineRange } from './lineRange.js';
import { addLength, lengthBetweenPositions, rangeContainsPosition, rangeIsBeforeOrTouching } from './rangeUtils.js';
/**
 * Represents a mapping of an input line range to an output line range.
*/
export class LineRangeMapping {
    static join(mappings) {
        return mappings.reduce((acc, cur) => acc ? acc.join(cur) : cur, undefined);
    }
    constructor(inputRange, outputRange) {
        this.inputRange = inputRange;
        this.outputRange = outputRange;
    }
    extendInputRange(extendedInputRange) {
        if (!extendedInputRange.containsRange(this.inputRange)) {
            throw new BugIndicatingError();
        }
        const startDelta = extendedInputRange.startLineNumber - this.inputRange.startLineNumber;
        const endDelta = extendedInputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
        return new LineRangeMapping(extendedInputRange, MergeEditorLineRange.fromLength(this.outputRange.startLineNumber + startDelta, this.outputRange.length - startDelta + endDelta));
    }
    join(other) {
        return new LineRangeMapping(this.inputRange.join(other.inputRange), this.outputRange.join(other.outputRange));
    }
    get resultingDeltaFromOriginalToModified() {
        return this.outputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
    }
    toString() {
        return `${this.inputRange.toString()} -> ${this.outputRange.toString()}`;
    }
    addOutputLineDelta(delta) {
        return new LineRangeMapping(this.inputRange, this.outputRange.delta(delta));
    }
    addInputLineDelta(delta) {
        return new LineRangeMapping(this.inputRange.delta(delta), this.outputRange);
    }
    reverse() {
        return new LineRangeMapping(this.outputRange, this.inputRange);
    }
}
/**
* Represents a total monotonous mapping of line ranges in one document to another document.
*/
export class DocumentLineRangeMap {
    static betweenOutputs(inputToOutput1, inputToOutput2, inputLineCount) {
        const alignments = MappingAlignment.compute(inputToOutput1, inputToOutput2);
        const mappings = alignments.map((m) => new LineRangeMapping(m.output1Range, m.output2Range));
        return new DocumentLineRangeMap(mappings, inputLineCount);
    }
    constructor(
    /**
     * The line range mappings that define this document mapping.
     * The space between two input ranges must equal the space between two output ranges.
     * These holes act as dense sequence of 1:1 line mappings.
    */
    lineRangeMappings, inputLineCount) {
        this.lineRangeMappings = lineRangeMappings;
        this.inputLineCount = inputLineCount;
        assertFn(() => {
            return checkAdjacentItems(lineRangeMappings, (m1, m2) => m1.inputRange.isBefore(m2.inputRange) && m1.outputRange.isBefore(m2.outputRange) &&
                m2.inputRange.startLineNumber - m1.inputRange.endLineNumberExclusive === m2.outputRange.startLineNumber - m1.outputRange.endLineNumberExclusive);
        });
    }
    project(lineNumber) {
        const lastBefore = findLast(this.lineRangeMappings, r => r.inputRange.startLineNumber <= lineNumber);
        if (!lastBefore) {
            return new LineRangeMapping(MergeEditorLineRange.fromLength(lineNumber, 1), MergeEditorLineRange.fromLength(lineNumber, 1));
        }
        if (lastBefore.inputRange.contains(lineNumber)) {
            return lastBefore;
        }
        const containingRange = MergeEditorLineRange.fromLength(lineNumber, 1);
        const mappedRange = MergeEditorLineRange.fromLength(lineNumber +
            lastBefore.outputRange.endLineNumberExclusive -
            lastBefore.inputRange.endLineNumberExclusive, 1);
        return new LineRangeMapping(containingRange, mappedRange);
    }
    get outputLineCount() {
        const last = this.lineRangeMappings.at(-1);
        const diff = last ? last.outputRange.endLineNumberExclusive - last.inputRange.endLineNumberExclusive : 0;
        return this.inputLineCount + diff;
    }
    reverse() {
        return new DocumentLineRangeMap(this.lineRangeMappings.map(r => r.reverse()), this.outputLineCount);
    }
}
/**
 * Aligns two mappings with a common input range.
 */
export class MappingAlignment {
    static compute(fromInputToOutput1, fromInputToOutput2) {
        const compareByStartLineNumber = compareBy((d) => d.inputRange.startLineNumber, numberComparator);
        const combinedDiffs = concatArrays(fromInputToOutput1.map((diff) => ({ source: 0, diff })), fromInputToOutput2.map((diff) => ({ source: 1, diff }))).sort(compareBy((d) => d.diff, compareByStartLineNumber));
        const currentDiffs = [new Array(), new Array()];
        const deltaFromBaseToInput = [0, 0];
        const alignments = new Array();
        function pushAndReset(inputRange) {
            const mapping1 = LineRangeMapping.join(currentDiffs[0]) || new LineRangeMapping(inputRange, inputRange.delta(deltaFromBaseToInput[0]));
            const mapping2 = LineRangeMapping.join(currentDiffs[1]) || new LineRangeMapping(inputRange, inputRange.delta(deltaFromBaseToInput[1]));
            alignments.push(new MappingAlignment(currentInputRange, mapping1.extendInputRange(currentInputRange).outputRange, currentDiffs[0], mapping2.extendInputRange(currentInputRange).outputRange, currentDiffs[1]));
            currentDiffs[0] = [];
            currentDiffs[1] = [];
        }
        let currentInputRange;
        for (const diff of combinedDiffs) {
            const range = diff.diff.inputRange;
            if (currentInputRange && !currentInputRange.intersectsOrTouches(range)) {
                pushAndReset(currentInputRange);
                currentInputRange = undefined;
            }
            deltaFromBaseToInput[diff.source] =
                diff.diff.resultingDeltaFromOriginalToModified;
            currentInputRange = currentInputRange ? currentInputRange.join(range) : range;
            currentDiffs[diff.source].push(diff.diff);
        }
        if (currentInputRange) {
            pushAndReset(currentInputRange);
        }
        return alignments;
    }
    constructor(inputRange, output1Range, output1LineMappings, output2Range, output2LineMappings) {
        this.inputRange = inputRange;
        this.output1Range = output1Range;
        this.output1LineMappings = output1LineMappings;
        this.output2Range = output2Range;
        this.output2LineMappings = output2LineMappings;
    }
    toString() {
        return `${this.output1Range} <- ${this.inputRange} -> ${this.output2Range}`;
    }
}
/**
 * A line range mapping with inner range mappings.
*/
export class DetailedLineRangeMapping extends LineRangeMapping {
    static join(mappings) {
        return mappings.reduce((acc, cur) => acc ? acc.join(cur) : cur, undefined);
    }
    constructor(inputRange, inputTextModel, outputRange, outputTextModel, rangeMappings) {
        super(inputRange, outputRange);
        this.inputTextModel = inputTextModel;
        this.outputTextModel = outputTextModel;
        this.rangeMappings = rangeMappings || [new RangeMapping(this.inputRange.toExclusiveRange(), this.outputRange.toExclusiveRange())];
    }
    addOutputLineDelta(delta) {
        return new DetailedLineRangeMapping(this.inputRange, this.inputTextModel, this.outputRange.delta(delta), this.outputTextModel, this.rangeMappings.map(d => d.addOutputLineDelta(delta)));
    }
    addInputLineDelta(delta) {
        return new DetailedLineRangeMapping(this.inputRange.delta(delta), this.inputTextModel, this.outputRange, this.outputTextModel, this.rangeMappings.map(d => d.addInputLineDelta(delta)));
    }
    join(other) {
        return new DetailedLineRangeMapping(this.inputRange.join(other.inputRange), this.inputTextModel, this.outputRange.join(other.outputRange), this.outputTextModel);
    }
    getLineEdit() {
        return new LineRangeEdit(this.inputRange, this.getOutputLines());
    }
    getReverseLineEdit() {
        return new LineRangeEdit(this.outputRange, this.getInputLines());
    }
    getOutputLines() {
        return this.outputRange.getLines(this.outputTextModel);
    }
    getInputLines() {
        return this.inputRange.getLines(this.inputTextModel);
    }
}
/**
 * Represents a mapping of an input range to an output range.
*/
export class RangeMapping {
    constructor(inputRange, outputRange) {
        this.inputRange = inputRange;
        this.outputRange = outputRange;
    }
    toString() {
        function rangeToString(range) {
            // TODO@hediet make this the default Range.toString
            return `[${range.startLineNumber}:${range.startColumn}, ${range.endLineNumber}:${range.endColumn})`;
        }
        return `${rangeToString(this.inputRange)} -> ${rangeToString(this.outputRange)}`;
    }
    addOutputLineDelta(deltaLines) {
        return new RangeMapping(this.inputRange, new Range(this.outputRange.startLineNumber + deltaLines, this.outputRange.startColumn, this.outputRange.endLineNumber + deltaLines, this.outputRange.endColumn));
    }
    addInputLineDelta(deltaLines) {
        return new RangeMapping(new Range(this.inputRange.startLineNumber + deltaLines, this.inputRange.startColumn, this.inputRange.endLineNumber + deltaLines, this.inputRange.endColumn), this.outputRange);
    }
    reverse() {
        return new RangeMapping(this.outputRange, this.inputRange);
    }
}
/**
* Represents a total monotonous mapping of ranges in one document to another document.
*/
export class DocumentRangeMap {
    constructor(
    /**
     * The line range mappings that define this document mapping.
     * Can have holes.
    */
    rangeMappings, inputLineCount) {
        this.rangeMappings = rangeMappings;
        this.inputLineCount = inputLineCount;
        assertFn(() => checkAdjacentItems(rangeMappings, (m1, m2) => rangeIsBeforeOrTouching(m1.inputRange, m2.inputRange) &&
            rangeIsBeforeOrTouching(m1.outputRange, m2.outputRange) /*&&
        lengthBetweenPositions(m1.inputRange.getEndPosition(), m2.inputRange.getStartPosition()).equals(
            lengthBetweenPositions(m1.outputRange.getEndPosition(), m2.outputRange.getStartPosition())
        )*/));
    }
    project(position) {
        const lastBefore = findLast(this.rangeMappings, r => r.inputRange.getStartPosition().isBeforeOrEqual(position));
        if (!lastBefore) {
            return new RangeMapping(Range.fromPositions(position, position), Range.fromPositions(position, position));
        }
        if (rangeContainsPosition(lastBefore.inputRange, position)) {
            return lastBefore;
        }
        const dist = lengthBetweenPositions(lastBefore.inputRange.getEndPosition(), position);
        const outputPos = addLength(lastBefore.outputRange.getEndPosition(), dist);
        return new RangeMapping(Range.fromPositions(position), Range.fromPositions(outputPos));
    }
    projectRange(range) {
        const start = this.project(range.getStartPosition());
        const end = this.project(range.getEndPosition());
        return new RangeMapping(start.inputRange.plusRange(end.inputRange), start.outputRange.plusRange(end.outputRange));
    }
    get outputLineCount() {
        const last = this.rangeMappings.at(-1);
        const diff = last ? last.outputRange.endLineNumber - last.inputRange.endLineNumber : 0;
        return this.inputLineCount + diff;
    }
    reverse() {
        return new DocumentRangeMap(this.rangeMappings.map(m => m.reverse()), this.outputLineCount);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwcGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbW9kZWwvbWFwcGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFMUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDN0MsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxzQkFBc0IsRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRXBIOztFQUVFO0FBQ0YsTUFBTSxPQUFPLGdCQUFnQjtJQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQXFDO1FBQ3ZELE9BQU8sUUFBUSxDQUFDLE1BQU0sQ0FBK0IsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMxRyxDQUFDO0lBQ0QsWUFDaUIsVUFBZ0MsRUFDaEMsV0FBaUM7UUFEakMsZUFBVSxHQUFWLFVBQVUsQ0FB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