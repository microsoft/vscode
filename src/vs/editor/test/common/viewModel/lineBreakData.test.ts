/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InjectedTextCursorStops, PositionAffinity } from '../../../common/model.js';
import { ModelDecorationInjectedTextOptions } from '../../../common/model/textModel.js';
import { ModelLineProjectionData } from '../../../common/modelLineProjectionData.js';

suite('Editor ViewModel - LineBreakData', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Basic', () => {
		const data = new ModelLineProjectionData([], [], [100], [0], 10);

		assert.strictEqual(data.translateToInputOffset(0, 50), 50);
		assert.strictEqual(data.translateToInputOffset(1, 60), 150);
	});

	suite('Injected text cursor stops', () => {
		const { Both, Left, Right, None } = InjectedTextCursorStops;
		const content = 'hint';

		function createData(cursorStops: InjectedTextCursorStops[]): ModelLineProjectionData {
			return new ModelLineProjectionData(
				cursorStops.map(() => 2),
				cursorStops.map(cursorStops => ModelDecorationInjectedTextOptions.from({ content, cursorStops })),
				[100], [], 0
			);
		}

		test('default affinity preserves the left edge of right-only injected text', () => {
			const data = createData([None, Right]);
			assert.deepStrictEqual({
				implicit: data.translateToOutputPosition(2).toString(),
				explicit: data.translateToOutputPosition(2, PositionAffinity.None).toString(),
				normalized: sequence(9, 2).map(offset => data.normalizeOutputPosition(0, offset, PositionAffinity.None).toString()),
			}, {
				implicit: '0:2',
				explicit: '0:2',
				normalized: ['0:2', '0:2', '0:2', '0:2', '0:2', '0:2', '0:2', '0:2', '0:10'],
			});
		});

		test('block cursor follows a right stop across a wrapped line', () => {
			const data = createData([Right]);
			data.breakOffsets = [4, 100];
			data.wrappedTextIndentLength = 2;
			assert.deepStrictEqual({
				defaultPosition: data.translateToOutputPosition(2).toString(),
				blockPosition: data.translateToOutputPosition(2, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
				normalized: data.normalizeOutputPosition(0, 3, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
			}, {
				defaultPosition: '0:2',
				blockPosition: '1:4',
				normalized: '1:4',
			});
		});

		for (const { name, cursorStops, expectedOffset } of [
			{ name: 'right stop', cursorStops: [Right], expectedOffset: 6 },
			{ name: 'left stop', cursorStops: [Left], expectedOffset: 2 },
			{ name: 'no stops', cursorStops: [None], expectedOffset: 2 },
			{ name: 'adjacent right stop', cursorStops: [None, Right], expectedOffset: 10 },
			{ name: 'adjacent left stop', cursorStops: [None, Left], expectedOffset: 6 },
			{ name: 'preceding right stop', cursorStops: [Right, None], expectedOffset: 6 },
			{ name: 'no adjacent stops', cursorStops: [None, None], expectedOffset: 2 },
		]) {
			test(`block cursor: ${name}`, () => {
				const data = createData(cursorStops);
				const offsets = sequence(cursorStops.length * content.length + 1, 2);
				const expectedPosition = `0:${expectedOffset}`;

				assert.deepStrictEqual({
					translated: data.translateToOutputPosition(2, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
					normalized: offsets.map(offset => data.normalizeOutputPosition(0, offset, PositionAffinity.LeftOfInjectedTextBlockCursor).toString()),
				}, {
					translated: expectedPosition,
					normalized: offsets.map(() => expectedPosition),
				});
			});
		}

		test('preserves both edges when both cursor stops are allowed', () => {
			const data = createData([Both]);
			assert.deepStrictEqual({
				translated: data.translateToOutputPosition(2, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
				leftEdge: data.normalizeOutputPosition(0, 2, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
				interior: data.normalizeOutputPosition(0, 3, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
				rightEdge: data.normalizeOutputPosition(0, 6, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
			}, {
				translated: '0:2',
				leftEdge: '0:2',
				interior: '0:2',
				rightEdge: '0:6',
			});
		});

		test('explicit affinity selects the outer edges of adjacent injected text', () => {
			const data = createData([None, Right]);
			assert.deepStrictEqual({
				left: data.translateToOutputPosition(2, PositionAffinity.Left).toString(),
				right: data.translateToOutputPosition(2, PositionAffinity.Right).toString(),
				leftOfInjectedText: data.translateToOutputPosition(2, PositionAffinity.LeftOfInjectedText).toString(),
				rightOfInjectedText: data.translateToOutputPosition(2, PositionAffinity.RightOfInjectedText).toString(),
			}, {
				left: '0:2',
				right: '0:10',
				leftOfInjectedText: '0:2',
				rightOfInjectedText: '0:10',
			});
		});

		test('does not search for cursor stops at other input offsets', () => {
			const data = new ModelLineProjectionData(
				[0, 2, 4],
				[
					ModelDecorationInjectedTextOptions.from({ content: 'x' }),
					ModelDecorationInjectedTextOptions.from({ content: 'hint', cursorStops: None }),
					ModelDecorationInjectedTextOptions.from({ content: 'tail', cursorStops: Right }),
				],
				[100],
				[],
				0
			);

			assert.deepStrictEqual({
				translated: data.translateToOutputPosition(2, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
				normalized: data.normalizeOutputPosition(0, 7, PositionAffinity.LeftOfInjectedTextBlockCursor).toString(),
			}, {
				translated: '0:3',
				normalized: '0:3',
			});
		});
	});

	function sequence(length: number, start = 0): number[] {
		const result = new Array<number>();
		for (let i = 0; i < length; i++) {
			result.push(i + start);
		}
		return result;
	}

	function testInverse(data: ModelLineProjectionData) {
		for (let i = 0; i < 100; i++) {
			const output = data.translateToOutputPosition(i);
			assert.deepStrictEqual(data.translateToInputOffset(output.outputLineIndex, output.outputOffset), i);
		}
	}

	function getInputOffsets(data: ModelLineProjectionData, outputLineIdx: number): number[] {
		return sequence(20).map(i => data.translateToInputOffset(outputLineIdx, i));
	}

	function getOutputOffsets(data: ModelLineProjectionData, affinity: PositionAffinity): string[] {
		return sequence(25).map(i => data.translateToOutputPosition(i, affinity).toString());
	}

	function mapTextToInjectedTextOptions(arr: string[]): ModelDecorationInjectedTextOptions[] {
		return arr.map(e => ModelDecorationInjectedTextOptions.from({ content: e }));
	}

	suite('Injected Text 1', () => {
		const data = new ModelLineProjectionData([2, 3, 10], mapTextToInjectedTextOptions(['1', '22', '333']), [10, 100], [], 10);

		test('getInputOffsetOfOutputPosition', () => {
			// For every view model position, what is the model position?
			assert.deepStrictEqual(getInputOffsets(data, 0), ([0, 1, 2, 2, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11, 12, 13]));
			assert.deepStrictEqual(getInputOffsets(data, 1), ([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 9, 10, 10, 10, 10, 11, 12, 13]));
		});

		test('getOutputPositionOfInputOffset', () => {
			data.translateToOutputPosition(20);
			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.None), [
				'0:0',
				'0:1',
				'0:2',
				'0:4',
				'0:7',
				'0:8',
				'0:9',
				'1:10',
				'1:11',
				'1:12',
				'1:13',
				'1:17',
				'1:18',
				'1:19',
				'1:20',
				'1:21',
				'1:22',
				'1:23',
				'1:24',
				'1:25',
				'1:26',
				'1:27',
				'1:28',
				'1:29',
				'1:30',
			]);

			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.Left), [
				'0:0',
				'0:1',
				'0:2',
				'0:4',
				'0:7',
				'0:8',
				'0:9',
				'0:10',
				'1:11',
				'1:12',
				'1:13',
				'1:17',
				'1:18',
				'1:19',
				'1:20',
				'1:21',
				'1:22',
				'1:23',
				'1:24',
				'1:25',
				'1:26',
				'1:27',
				'1:28',
				'1:29',
				'1:30',
			]);

			assert.deepStrictEqual(getOutputOffsets(data, PositionAffinity.Right), [
				'0:0',
				'0:1',
				'0:3',
				'0:6',
				'0:7',
				'0:8',
				'0:9',
				'1:10',
				'1:11',
				'1:12',
				'1:16',
				'1:17',
				'1:18',
				'1:19',
				'1:20',
				'1:21',
				'1:22',
				'1:23',
				'1:24',
				'1:25',
				'1:26',
				'1:27',
				'1:28',
				'1:29',
				'1:30',
			]);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});


		test('normalization', () => {
			assert.deepStrictEqual(
				sequence(25)
					.map((v) =>
						data.normalizeOutputPosition(1, v, PositionAffinity.Right)
					)
					.map((s) => s.toString()),
				[
					'1:0',
					'1:1',
					'1:2',
					'1:3',
					'1:4',
					'1:5',
					'1:6',
					'1:7',
					'1:8',
					'1:9',
					'1:10',
					'1:11',
					'1:12',
					'1:16',
					'1:16',
					'1:16',
					'1:16',
					'1:17',
					'1:18',
					'1:19',
					'1:20',
					'1:21',
					'1:22',
					'1:23',
					'1:24',
				]
			);
		});
	});

	suite('Injected Text 2', () => {
		const data = new ModelLineProjectionData([2, 2, 6], mapTextToInjectedTextOptions(['1', '22', '333']), [10, 100], [], 0);

		test('getInputOffsetOfOutputPosition', () => {
			assert.deepStrictEqual(
				getInputOffsets(data, 0),
				[0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 6, 6, 6, 7, 8, 9, 10, 11, 12, 13]
			);
			assert.deepStrictEqual(
				getInputOffsets(data, 1),
				[
					6, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
					23,
				]
			);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});
	});

	suite('Injected Text 3', () => {
		const data = new ModelLineProjectionData([2, 2, 7], mapTextToInjectedTextOptions(['1', '22', '333']), [10, 100], [], 0);

		test('getInputOffsetOfOutputPosition', () => {
			assert.deepStrictEqual(
				getInputOffsets(data, 0),
				[0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 7, 7, 7, 7, 8, 9, 10, 11, 12, 13]
			);
			assert.deepStrictEqual(
				getInputOffsets(data, 1),
				[
					7, 7, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
					23,
				]
			);
		});

		test('getInputOffsetOfOutputPosition is inverse of getOutputPositionOfInputOffset', () => {
			testInverse(data);
		});
	});
});
