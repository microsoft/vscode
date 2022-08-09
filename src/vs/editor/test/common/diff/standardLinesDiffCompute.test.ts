/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { Range } from 'vs/editor/common/core/range';
import { LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { lineRangeMappingFromRangeMappings } from 'vs/editor/common/diff/standardLinesDiffComputer';

suite('standardLinesDiffCompute', () => {
	test('1', () => {
		assert.deepStrictEqual(
			toJson(
				lineRangeMappingFromRangeMappings([
					new RangeMapping(r([1, 1, 1, 1]), r([1, 1, 1, 2])),
				])
			),
			(["{[1,2)->[1,2)}"])
		);
	});

	test('2', () => {
		assert.deepStrictEqual(
			toJson(
				lineRangeMappingFromRangeMappings([
					new RangeMapping(r([1, 1, 1, 2]), r([1, 1, 1, 1])),
				])
			),
			(["{[1,2)->[1,2)}"])
		);
	});

	test('3', () => {
		assert.deepStrictEqual(
			toJson(
				lineRangeMappingFromRangeMappings([
					new RangeMapping(r([1, 1, 2, 1]), r([1, 1, 1, 1])),
				])
			),
			(["{[1,2)->[1,1)}"])
		);
	});

	test('4', () => {
		assert.deepStrictEqual(
			toJson(
				lineRangeMappingFromRangeMappings([
					new RangeMapping(r([1, 1, 1, 1]), r([1, 1, 2, 1])),
				])
			),
			(["{[1,1)->[1,2)}"])
		);
	});
});

function r(values: [startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number]): Range {
	return new Range(values[0], values[1], values[2], values[3]);
}

function toJson(mappings: LineRangeMapping[]): unknown {
	return mappings.map(m => m.toString());
}
