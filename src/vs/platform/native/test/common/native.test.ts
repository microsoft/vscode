/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getResizedWindowBounds, getZoomedWindowResizeDelta } from '../../common/native.js';

suite('getResizedWindowBounds', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const bounds = { x: 100, y: 200, width: 800, height: 600 };

	test('left/top anchor keeps the origin fixed when growing', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 50, height: 30 }, { right: false, bottom: false }),
			{ x: 100, y: 200, width: 850, height: 630 }
		);
	});

	test('right anchor keeps the right edge fixed when growing', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 50, height: 0 }, { right: true, bottom: false }),
			{ x: 50, y: 200, width: 850, height: 600 }
		);
	});

	test('bottom anchor keeps the bottom edge fixed when growing', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 0, height: 30 }, { right: false, bottom: true }),
			{ x: 100, y: 170, width: 800, height: 630 }
		);
	});

	test('right and bottom anchor keeps the bottom-right corner fixed when growing', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 50, height: 30 }, { right: true, bottom: true }),
			{ x: 50, y: 170, width: 850, height: 630 }
		);
	});

	test('negative delta shrinks the window toward the anchored edge', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: -50, height: -30 }, { right: true, bottom: true }),
			{ x: 150, y: 230, width: 750, height: 570 }
		);
	});

	test('zero delta leaves the bounds unchanged', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 0, height: 0 }, { right: true, bottom: true }),
			{ x: 100, y: 200, width: 800, height: 600 }
		);
	});

	test('minimum size clamping preserves the anchored edges', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: -500, height: -400 }, { right: true, bottom: true }, { width: 500, height: 400 }),
			{ x: 400, y: 400, width: 500, height: 400 }
		);
	});

	test('minimum size clamping preserves the origin', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: -500, height: -400 }, { right: false, bottom: false }, { width: 500, height: 400 }),
			{ x: 100, y: 200, width: 500, height: 400 }
		);
	});

	test('extreme negative deltas cannot produce nonpositive dimensions', () => {
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: -1000, height: -1000 }, { right: true, bottom: true }, { width: 0, height: 0 }),
			{ x: 899, y: 799, width: 1, height: 1 }
		);
	});

	test('clamping does not mutate the input bounds', () => {
		const immutableBounds = Object.freeze({ ...bounds });
		getResizedWindowBounds(immutableBounds, { width: -500, height: -400 }, { right: true, bottom: true }, { width: 500, height: 400 });
		assert.deepStrictEqual(immutableBounds, bounds);
	});

	test('repositions top and left growth without sacrificing the requested size', () => {
		const workArea = { x: 0, y: 30, width: 1600, height: 1000 };
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 200, height: 300 }, { right: true, bottom: true }, undefined, workArea),
			{ x: 0, y: 30, width: 1000, height: 900 }
		);
	});

	test('repositions bottom and right growth without sacrificing the requested size', () => {
		const workArea = { x: 0, y: 0, width: 1100, height: 900 };
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 300, height: 200 }, { right: false, bottom: false }, undefined, workArea),
			{ x: 0, y: 100, width: 1100, height: 800 }
		);
	});

	test('preserves the anchor when the requested rectangle fits', () => {
		const workArea = { x: 0, y: 30, width: 1600, height: 1000 };
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 50, height: 100 }, { right: true, bottom: true }, undefined, workArea),
			{ x: 50, y: 100, width: 850, height: 700 }
		);
	});

	test('uses the work area origin on displays with negative coordinates', () => {
		const workArea = { x: -1600, y: -1000, width: 1600, height: 960 };
		assert.deepStrictEqual(
			getResizedWindowBounds({ x: -1500, y: -900, width: 800, height: 600 }, { width: 200, height: 300 }, { right: true, bottom: true }, undefined, workArea),
			{ x: -1600, y: -1000, width: 1000, height: 900 }
		);
	});

	test('limits oversized requests to the work area', () => {
		const workArea = Object.freeze({ x: 1600, y: 40, width: 1200, height: 900 });
		const immutableBounds = Object.freeze({ x: 1700, y: 200, width: 800, height: 600 });
		assert.deepStrictEqual(
			getResizedWindowBounds(immutableBounds, { width: 1000, height: 1000 }, { right: true, bottom: true }, undefined, workArea),
			{ x: 1600, y: 40, width: 1200, height: 900 }
		);
	});

	test('keeps the title bar in the work area when minimum dimensions exceed it', () => {
		const workArea = { x: 1600, y: 40, width: 400, height: 300 };
		assert.deepStrictEqual(
			getResizedWindowBounds(bounds, { width: 200, height: 300 }, { right: true, bottom: true }, { width: 500, height: 400 }, workArea),
			{ x: 1600, y: 40, width: 500, height: 400 }
		);
	});
});

suite('getZoomedWindowResizeDelta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts CSS pixels at default, increased and decreased zoom', () => {
		assert.deepStrictEqual(
			[1, 1.2, 0.8].map(zoom => getZoomedWindowResizeDelta({ width: 300, height: -300 }, zoom)),
			[{ width: 300, height: -300 }, { width: 360, height: -360 }, { width: 240, height: -240 }]
		);
	});

	test('rounds opposite deltas symmetrically at half-pixel boundaries', () => {
		assert.deepStrictEqual(
			[1, -1].map(sign => getZoomedWindowResizeDelta({ width: sign * 201, height: 0 }, 1.5)),
			[{ width: 302, height: 0 }, { width: -302, height: 0 }]
		);
	});
});
