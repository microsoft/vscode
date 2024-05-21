/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy } from 'vs/base/common/arrays';
import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { isDefined } from 'vs/base/common/types';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TextLength } from 'vs/editor/common/core/textLength';
import { RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { ModifiedBaseRange } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { addLength, lengthBetweenPositions, lengthOfRange } from 'vs/workbench/contrib/mergeEditor/browser/model/rangeUtils';

export type LineAlignment = [input1LineNumber: number | undefined, baseLineNumber: number, input2LineNumber: number | undefined];

export function getAlignments(m: ModifiedBaseRange): LineAlignment[] {
	const equalRanges1 = toEqualRangeMappings(m.input1Diffs.flatMap(d => d.rangeMappings), m.baseRange.toRange(), m.input1Range.toRange());
	const equalRanges2 = toEqualRangeMappings(m.input2Diffs.flatMap(d => d.rangeMappings), m.baseRange.toRange(), m.input2Range.toRange());

	const commonRanges = splitUpCommonEqualRangeMappings(equalRanges1, equalRanges2);

	let result: LineAlignment[] = [];
	result.push([m.input1Range.startLineNumber - 1, m.baseRange.startLineNumber - 1, m.input2Range.startLineNumber - 1]);

	function isFullSync(lineAlignment: LineAlignment) {
		return lineAlignment.every((i) => i !== undefined);
	}

	// One base line has either up to one full sync or up to two half syncs.
	for (const m of commonRanges) {
		const lineAlignment: LineAlignment = [m.output1Pos?.lineNumber, m.inputPos.lineNumber, m.output2Pos?.lineNumber];
		const alignmentIsFullSync = isFullSync(lineAlignment);

		let shouldAdd = true;
		if (alignmentIsFullSync) {
			const isNewFullSyncAlignment = !result.some(r => isFullSync(r) && r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			if (isNewFullSyncAlignment) {
				// Remove half syncs
				result = result.filter(r => !r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			}
			shouldAdd = isNewFullSyncAlignment;
		} else {
			const isNew = !result.some(r => r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			shouldAdd = isNew;
		}

		if (shouldAdd) {
			result.push(lineAlignment);
		} else {
			if (m.length.isGreaterThan(new TextLength(1, 0))) {
				result.push([
					m.output1Pos ? m.output1Pos.lineNumber + 1 : undefined,
					m.inputPos.lineNumber + 1,
					m.output2Pos ? m.output2Pos.lineNumber + 1 : undefined
				]);
			}
		}
	}

	const finalLineAlignment: LineAlignment = [m.input1Range.endLineNumberExclusive, m.baseRange.endLineNumberExclusive, m.input2Range.endLineNumberExclusive];
	result = result.filter(r => r.every((v, idx) => v !== finalLineAlignment[idx]));
	result.push(finalLineAlignment);

	assertFn(() => checkAdjacentItems(result.map(r => r[0]).filter(isDefined), (a, b) => a < b)
		&& checkAdjacentItems(result.map(r => r[1]).filter(isDefined), (a, b) => a <= b)
		&& checkAdjacentItems(result.map(r => r[2]).filter(isDefined), (a, b) => a < b)
		&& result.every(alignment => alignment.filter(isDefined).length >= 2)
	);

	return result;
}
interface CommonRangeMapping {
	output1Pos: Position | undefined;
	output2Pos: Position | undefined;
	inputPos: Position;
	length: TextLength;
}

function toEqualRangeMappings(diffs: RangeMapping[], inputRange: Range, outputRange: Range): RangeMapping[] {
	const result: RangeMapping[] = [];

	let equalRangeInputStart = inputRange.getStartPosition();
	let equalRangeOutputStart = outputRange.getStartPosition();

	for (const d of diffs) {
		const equalRangeMapping = new RangeMapping(
			Range.fromPositions(equalRangeInputStart, d.inputRange.getStartPosition()),
			Range.fromPositions(equalRangeOutputStart, d.outputRange.getStartPosition())
		);
		assertFn(() => lengthOfRange(equalRangeMapping.inputRange).equals(
			lengthOfRange(equalRangeMapping.outputRange)
		)
		);
		if (!equalRangeMapping.inputRange.isEmpty()) {
			result.push(equalRangeMapping);
		}

		equalRangeInputStart = d.inputRange.getEndPosition();
		equalRangeOutputStart = d.outputRange.getEndPosition();
	}

	const equalRangeMapping = new RangeMapping(
		Range.fromPositions(equalRangeInputStart, inputRange.getEndPosition()),
		Range.fromPositions(equalRangeOutputStart, outputRange.getEndPosition())
	);
	assertFn(() => lengthOfRange(equalRangeMapping.inputRange).equals(
		lengthOfRange(equalRangeMapping.outputRange)
	)
	);
	if (!equalRangeMapping.inputRange.isEmpty()) {
		result.push(equalRangeMapping);
	}

	return result;
}

/**
 * It is `result[i][0].inputRange.equals(result[i][1].inputRange)`.
*/
function splitUpCommonEqualRangeMappings(
	equalRangeMappings1: RangeMapping[],
	equalRangeMappings2: RangeMapping[]
): CommonRangeMapping[] {
	const result: CommonRangeMapping[] = [];

	const events: { input: 0 | 1; start: boolean; inputPos: Position; outputPos: Position }[] = [];
	for (const [input, rangeMappings] of [[0, equalRangeMappings1], [1, equalRangeMappings2]] as const) {
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

	const starts: [Position | undefined, Position | undefined] = [undefined, undefined];
	let lastInputPos: Position | undefined;

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
