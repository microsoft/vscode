/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { PositionAffinity } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { LineBreakData } from 'vs/editor/common/viewModel/viewModel';

suite('Editor ViewModel - LineBreakData', () => {
	test('Basic', () => {
		const data = new LineBreakData([100], [], 0, [], []);
		assert.strictEqual(data.getInputOffsetOfOutputPosition(0, 50), 50);
		assert.strictEqual(data.getInputOffsetOfOutputPosition(1, 50), 150);
	});

	function sequence(length: number, start = 0): number[] {
		const result = new Array<number>();
		for (let i = 0; i < length; i++) {
			result.push(i + start);
		}
		return result;
	}

	function testInverse(data: LineBreakData) {
		for (let i = 0; i < 100; i++) {
			const output = data.getOutputPositionOfInputOffset(i);
			assert.deepStrictEqual(data.getInputOffsetOfOutputPosition(output.outputLineIndex, output.outputOffset), i);
		}
	}

	function getInputOffsets(data: LineBreakData, outputLineIdx: number): number[] {
		return sequence(11).map(i => data.getInputOffsetOfOutputPosition(outputLineIdx, i));
	}

	function getOutputOffsets(data: LineBreakData, affinity: PositionAffinity): string[] {
		return sequence(25).map(i => data.getOutputPositionOfInputOffset(i, affinity).toString());
	}

	function mapTextToInjectedTextOptions(arr: string[]): ModelDecorationInjectedTextOptions[] {
		return arr.map(e => ModelDecorationInjectedTextOptions.from({ content: e }));
	}

	suite('Injected Text 1', () => {
		const data = new LineBreakData([10, 100], [], 0, [2, 3, 10], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			// For every view model position, what is the model position?
			assert.deepStrictEqual(getInputOffsets(data, 0), [0, 1, 2, 2, 3, 3, 3, 4, 5, 6, 7]);
			assert.deepStrictEqual(getInputOffsets(data, 1), [7, 8, 9, 10, 10, 10, 10, 11, 12, 13, 14]);
		});

		test('getOutputPositionOfInputOffset', () => {
			data.getOutputPositionOfInputOffset(20);
			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.None), [
				'0:0', '0:1', '0:2', '0:4', '0:7', '0:8', '0:9',
				'1:0', '1:1', '1:2', '1:3', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);

			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.Left), [
				'0:0', '0:1', '0:2', '0:4', '0:7', '0:8', '0:9', '0:10',
				'1:1', '1:2', '1:3', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);

			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.Right), [
				'0:0', '0:1', '0:3', '0:6', '0:7', '0:8', '0:9',
				'1:0', '1:1', '1:2', '1:6', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});
	});

	suite('Injected Text 2', () => {
		const data = new LineBreakData([10, 100], [], 0, [2, 2, 6], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			assert.deepStrictEqual(getInputOffsets(data, 0), [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 6]);
			assert.deepStrictEqual(getInputOffsets(data, 1), [6, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});
	});

	suite('Injected Text 3', () => {
		const data = new LineBreakData([10, 100], [], 0, [2, 2, 7], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			assert.deepStrictEqual(getInputOffsets(data, 0), [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 7]);
			assert.deepStrictEqual(getInputOffsets(data, 1), [7, 7, 7, 7, 8, 9, 10, 11, 12, 13, 14]);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});
	});
});
