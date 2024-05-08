/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { RangeCoverageTracker } from './v8CoverageWrangling';

suite('v8CoverageWrangling', () => {
	suite('RangeCoverageTracker', () => {
		test('covers new range', () => {
			const rt = new RangeCoverageTracker();
			rt.cover(5, 10);
			assert.deepStrictEqual([...rt], [{ start: 5, end: 10, covered: true }]);
		});

		test('non overlapping ranges', () => {
			const rt = new RangeCoverageTracker();
			rt.cover(5, 10);
			rt.cover(15, 20);
			assert.deepStrictEqual([...rt], [
				{ start: 5, end: 10, covered: true },
				{ start: 15, end: 20, covered: true },
			]);
		});

		test('covers exact', () => {
			const rt = new RangeCoverageTracker();
			rt.uncovered(5, 10);
			rt.cover(5, 10);
			assert.deepStrictEqual([...rt], [
				{ start: 5, end: 10, covered: true },
			]);
		});

		test('overlap at start', () => {
			const rt = new RangeCoverageTracker();
			rt.uncovered(5, 10);
			rt.cover(2, 7);
			assert.deepStrictEqual([...rt], [
				{ start: 2, end: 5, covered: true },
				{ start: 5, end: 7, covered: true },
				{ start: 7, end: 10, covered: false },
			]);
		});

		test('overlap at end', () => {
			const rt = new RangeCoverageTracker();
			rt.cover(5, 10);
			rt.uncovered(2, 7);
			assert.deepStrictEqual([...rt], [
				{ start: 2, end: 5, covered: false },
				{ start: 5, end: 7, covered: true },
				{ start: 7, end: 10, covered: true },
			]);
		});

		test('inner contained', () => {
			const rt = new RangeCoverageTracker();
			rt.cover(5, 10);
			rt.uncovered(2, 12);
			assert.deepStrictEqual([...rt], [
				{ start: 2, end: 5, covered: false },
				{ start: 5, end: 10, covered: true },
				{ start: 10, end: 12, covered: false },
			]);
		});

		test('outer contained', () => {
			const rt = new RangeCoverageTracker();
			rt.uncovered(5, 10);
			rt.cover(7, 9);
			assert.deepStrictEqual([...rt], [
				{ start: 5, end: 7, covered: false },
				{ start: 7, end: 9, covered: true },
				{ start: 9, end: 10, covered: false },
			]);
		});

		test('boundary touching', () => {
			const rt = new RangeCoverageTracker();
			rt.uncovered(5, 10);
			rt.cover(10, 15);
			rt.uncovered(15, 20);
			assert.deepStrictEqual([...rt], [
				{ start: 5, end: 10, covered: false },
				{ start: 10, end: 15, covered: true },
				{ start: 15, end: 20, covered: false },
			]);
		});

		test('initializeBlock', () => {
			const rt = RangeCoverageTracker.initializeBlock([
				{ count: 1, startOffset: 5, endOffset: 30 },
				{ count: 1, startOffset: 8, endOffset: 10 },
				{ count: 0, startOffset: 15, endOffset: 20 },
			]);

			assert.deepStrictEqual([...rt], [
				{ start: 5, end: 15, covered: true },
				{ start: 15, end: 20, covered: false },
				{ start: 20, end: 30, covered: true },
			]);
		});
	});
});
