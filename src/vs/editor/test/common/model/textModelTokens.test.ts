/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/offsetRange.js';
import { RangePriorityQueueImpl } from '../../../common/model/textModelTokens.js';

suite('RangePriorityQueueImpl', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('addRange', () => {
		const ranges: OffsetRange[] = [];

		OffsetRange.addRange(new OffsetRange(0, 2), ranges);
		OffsetRange.addRange(new OffsetRange(10, 13), ranges);
		OffsetRange.addRange(new OffsetRange(20, 24), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[0, 2)', '[10, 13)', '[20, 24)'])
		);

		OffsetRange.addRange(new OffsetRange(2, 10), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[0, 13)', '[20, 24)'])
		);

		OffsetRange.addRange(new OffsetRange(14, 19), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[0, 13)', '[14, 19)', '[20, 24)'])
		);

		OffsetRange.addRange(new OffsetRange(10, 22), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[0, 24)'])
		);

		OffsetRange.addRange(new OffsetRange(-1, 29), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[-1, 29)'])
		);

		OffsetRange.addRange(new OffsetRange(-10, -5), ranges);

		assert.deepStrictEqual(
			ranges.map(r => r.toString()),
			(['[-10, -5)', '[-1, 29)'])
		);
	});

	test('addRangeAndResize', () => {
		const queue = new RangePriorityQueueImpl();

		queue.addRange(new OffsetRange(0, 20));
		queue.addRange(new OffsetRange(100, 120));
		queue.addRange(new OffsetRange(200, 220));

		// disjoint
		queue.addRangeAndResize(new OffsetRange(25, 27), 0);

		assert.deepStrictEqual(
			queue.getRanges().map(r => r.toString()),
			(['[0, 20)', '[98, 118)', '[198, 218)'])
		);

		queue.addRangeAndResize(new OffsetRange(19, 20), 0);

		assert.deepStrictEqual(
			queue.getRanges().map(r => r.toString()),
			(['[0, 19)', '[97, 117)', '[197, 217)'])
		);

		queue.addRangeAndResize(new OffsetRange(19, 97), 0);

		assert.deepStrictEqual(
			queue.getRanges().map(r => r.toString()),
			(['[0, 39)', '[119, 139)'])
		);

		queue.addRangeAndResize(new OffsetRange(-1000, 1000), 0);

		assert.deepStrictEqual(
			queue.getRanges().map(r => r.toString()),
			([])
		);
	});
});
