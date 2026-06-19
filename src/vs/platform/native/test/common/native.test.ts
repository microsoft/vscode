/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getResizedWindowBounds } from '../../common/native.js';

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
});
