/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { Range } from 'vs/editor/common/core/range';
import { LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { lineRangeMappingFromRangeMappings, StandardLinesDiffComputer } from 'vs/editor/common/diff/standardLinesDiffComputer';

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

	test('Suboptimal Diff (needs improving)', () => {
		const c = new StandardLinesDiffComputer();

		const lines1 =
			`
			FirstKeyword = BreakKeyword,
			LastKeyword = StringKeyword,
			FirstFutureReservedWord = ImplementsKeyword,
			LastFutureReservedWord = YieldKeyword
		}
`.split('\n');

		const lines2 =
			`
			FirstKeyword = BreakKeyword,
			LastKeyword = StringKeyword,
			FirstFutureReservedWord = ImplementsKeyword,
			LastFutureReservedWord = YieldKeyword,
			FirstTypeNode = TypeReference,
			LastTypeNode = ArrayType
		}
`.split('\n');

		const diff = c.computeDiff(lines1, lines2, { maxComputationTime: 1000, ignoreTrimWhitespace: false });

		// TODO this diff should only have one inner, not two.
		assert.deepStrictEqual(
			toJsonWithDetails(diff.changes),
			[
				{
					main: "{[5,6)->[5,8)}",
					inner: [
						"{[5,41 -> 5,41]->[5,41 -> 7,28]}"
					]
				}
			]
		);
	});
});

function r(values: [startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number]): Range {
	return new Range(values[0], values[1], values[2], values[3]);
}

function toJson(mappings: LineRangeMapping[]): unknown {
	return mappings.map(m => m.toString());
}

function toJsonWithDetails(mappings: LineRangeMapping[]): unknown {
	return mappings.map(m => {
		return { main: m.toString(), inner: m.innerChanges?.map(c => c.toString()) };
	});
}
