/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Size2D } from '../../../../common/core/2d/size.js';
import { canFitInAvailableArea } from '../../browser/view/inlineEdits/inlineEditsViews/layout.js';

suite('Layout - canFitInAvailableArea', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tower fits within single available area', () => {
		const towerSize = new Size2D(10, 20);
		const towerLeftOffset = 5;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower too tall for available area', () => {
		const towerSize = new Size2D(10, 40);
		const towerLeftOffset = 5;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});

	test('tower extends beyond available width', () => {
		const towerSize = new Size2D(60, 20);
		const towerLeftOffset = 0;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});

	test('tower fits across multiple available areas', () => {
		const towerSize = new Size2D(30, 20);
		const towerLeftOffset = 10;
		const availableTowerAreas = [
			new Size2D(20, 30),
			new Size2D(20, 25),
			new Size2D(20, 30)
		];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower too tall for one of the overlapping areas', () => {
		const towerSize = new Size2D(30, 20);
		const towerLeftOffset = 10;
		const availableTowerAreas = [
			new Size2D(20, 30),
			new Size2D(20, 15), // Too short
			new Size2D(20, 30)
		];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});

	test('tower at left edge of available areas', () => {
		const towerSize = new Size2D(10, 20);
		const towerLeftOffset = 0;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower at right edge of available areas', () => {
		const towerSize = new Size2D(10, 20);
		const towerLeftOffset = 40;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower exactly matches available area', () => {
		const towerSize = new Size2D(50, 30);
		const towerLeftOffset = 0;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('empty available areas', () => {
		const towerSize = new Size2D(10, 20);
		const towerLeftOffset = 0;
		const availableTowerAreas: Size2D[] = [];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});

	test('tower spans exactly two available areas', () => {
		const towerSize = new Size2D(40, 20);
		const towerLeftOffset = 10;
		const availableTowerAreas = [
			new Size2D(30, 25),
			new Size2D(30, 25)
		];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower starts at boundary between two areas', () => {
		const towerSize = new Size2D(20, 20);
		const towerLeftOffset = 30;
		const availableTowerAreas = [
			new Size2D(30, 25),
			new Size2D(30, 25)
		];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), true);
	});

	test('tower with varying height available areas', () => {
		const towerSize = new Size2D(50, 20);
		const towerLeftOffset = 0;
		const availableTowerAreas = [
			new Size2D(10, 30),
			new Size2D(10, 15), // Too short - should fail
			new Size2D(10, 25),
			new Size2D(10, 30),
			new Size2D(10, 40)
		];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});

	test('tower beyond all available areas to the right', () => {
		const towerSize = new Size2D(10, 20);
		const towerLeftOffset = 100;
		const availableTowerAreas = [new Size2D(50, 30)];

		assert.strictEqual(canFitInAvailableArea(towerSize, towerLeftOffset, availableTowerAreas), false);
	});
});
