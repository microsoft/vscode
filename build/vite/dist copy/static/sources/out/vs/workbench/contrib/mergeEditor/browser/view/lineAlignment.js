/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy } from '../../../../../base/common/arrays.js';
import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
import { isDefined } from '../../../../../base/common/types.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextLength } from '../../../../../editor/common/core/text/textLength.js';
import { RangeMapping } from '../model/mapping.js';
import { addLength, lengthBetweenPositions, lengthOfRange } from '../model/rangeUtils.js';
export function getAlignments(m) {
    const equalRanges1 = toEqualRangeMappings(m.input1Diffs.flatMap(d => d.rangeMappings), m.baseRange.toExclusiveRange(), m.input1Range.toExclusiveRange());
    const equalRanges2 = toEqualRangeMappings(m.input2Diffs.flatMap(d => d.rangeMappings), m.baseRange.toExclusiveRange(), m.input2Range.toExclusiveRange());
    const commonRanges = splitUpCommonEqualRangeMappings(equalRanges1, equalRanges2);
    let result = [];
    result.push([m.input1Range.startLineNumber - 1, m.baseRange.startLineNumber - 1, m.input2Range.startLineNumber - 1]);
    function isFullSync(lineAlignment) {
        return lineAlignment.every((i) => i !== undefined);
    }
    // One base line has either up to one full sync or up to two half syncs.
    for (const m of commonRanges) {
        const lineAlignment = [m.output1Pos?.lineNumber, m.inputPos.lineNumber, m.output2Pos?.lineNumber];
        const alignmentIsFullSync = isFullSync(lineAlignment);
        let shouldAdd = true;
        if (alignmentIsFullSync) {
            const isNewFullSyncAlignment = !result.some(r => isFullSync(r) && r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
            if (isNewFullSyncAlignment) {
                // Remove half syncs
                result = result.filter(r => !r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
            }
            shouldAdd = isNewFullSyncAlignment;
        }
        else {
            const isNew = !result.some(r => r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
            shouldAdd = isNew;
        }
        if (shouldAdd) {
            result.push(lineAlignment);
        }
        else {
            if (m.length.isGreaterThan(new TextLength(1, 0))) {
                result.push([
                    m.output1Pos ? m.output1Pos.lineNumber + 1 : undefined,
                    m.inputPos.lineNumber + 1,
                    m.output2Pos ? m.output2Pos.lineNumber + 1 : undefined
                ]);
            }
        }
    }
    const finalLineAlignment = [m.input1Range.endLineNumberExclusive, m.baseRange.endLineNumberExclusive, m.input2Range.endLineNumberExclusive];
    result = result.filter(r => r.every((v, idx) => v !== finalLineAlignment[idx]));
    result.push(finalLineAlignment);
    assertFn(() => checkAdjacentItems(result.map(r => r[0]).filter(isDefined), (a, b) => a < b)
        && checkAdjacentItems(result.map(r => r[1]).filter(isDefined), (a, b) => a <= b)
        && checkAdjacentItems(result.map(r => r[2]).filter(isDefined), (a, b) => a < b)
        && result.every(alignment => alignment.filter(isDefined).length >= 2));
    return result;
}
function toEqualRangeMappings(diffs, inputRange, outputRange) {
    const result = [];
    let equalRangeInputStart = inputRange.getStartPosition();
    let equalRangeOutputStart = outputRange.getStartPosition();
    for (const d of diffs) {
        const equalRangeMapping = new RangeMapping(Range.fromPositions(equalRangeInputStart, d.inputRange.getStartPosition()), Range.fromPositions(equalRangeOutputStart, d.outputRange.getStartPosition()));
        assertFn(() => lengthOfRange(equalRangeMapping.inputRange).equals(lengthOfRange(equalRangeMapping.outputRange)));
        if (!equalRangeMapping.inputRange.isEmpty()) {
            result.push(equalRangeMapping);
        }
        equalRangeInputStart = d.inputRange.getEndPosition();
        equalRangeOutputStart = d.outputRange.getEndPosition();
    }
    const equalRangeMapping = new RangeMapping(Range.fromPositions(equalRangeInputStart, inputRange.getEndPosition()), Range.fromPositions(equalRangeOutputStart, outputRange.getEndPosition()));
    assertFn(() => lengthOfRange(equalRangeMapping.inputRange).equals(lengthOfRange(equalRangeMapping.outputRange)));
    if (!equalRangeMapping.inputRange.isEmpty()) {
        result.push(equalRangeMapping);
    }
    return result;
}
/**
 * It is `result[i][0].inputRange.equals(result[i][1].inputRange)`.
*/
function splitUpCommonEqualRangeMappings(equalRangeMappings1, equalRangeMappings2) {
    const result = [];
    const events = [];
    for (const [input, rangeMappings] of [[0, equalRangeMappings1], [1, equalRangeMappings2]]) {
        for (const rangeMapping of rangeMappings) {
            events.push({
                input: input,
                start: true,
                inputPos: rangeMapping.inputRange.getStartPosition(),
                outputPos: rangeMapping.outputRange.getStartPosition()
            });
            events.push({
                input: input,
                start: false,
                inputPos: rangeMapping.inputRange.getEndPosition(),
                outputPos: rangeMapping.outputRange.getEndPosition()
            });
        }
    }
    events.sort(compareBy((m) => m.inputPos, Position.compare));
    const starts = [undefined, undefined];
    let lastInputPos;
    for (const event of events) {
        if (lastInputPos && starts.some(s => !!s)) {
            const length = lengthBetweenPositions(lastInputPos, event.inputPos);
            if (!length.isZero()) {
                result.push({
                    inputPos: lastInputPos,
                    length,
                    output1Pos: starts[0],
                    output2Pos: starts[1]
                });
                if (starts[0]) {
                    starts[0] = addLength(starts[0], length);
                }
                if (starts[1]) {
                    starts[1] = addLength(starts[1], length);
                }
            }
        }
        starts[event.input] = event.start ? event.outputPos : undefined;
        lastInputPos = event.inputPos;
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZUFsaWdubWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvdmlldy9saW5lQWxpZ25tZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUVuRCxPQUFPLEVBQUUsU0FBUyxFQUFFLHNCQUFzQixFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBSTFGLE1BQU0sVUFBVSxhQUFhLENBQUMsQ0FBb0I7SUFDakQsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0lBQ3pKLE1BQU0sWUFBWSxHQUFHLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFB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