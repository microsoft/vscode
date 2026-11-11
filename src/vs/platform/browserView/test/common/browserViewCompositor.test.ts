/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { composeDevToolsScreenshot, IBrowserViewBitmap } from '../../common/browserViewCompositor.js';

suite('composeDevToolsScreenshot', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function solid(width: number, height: number, value: number): IBrowserViewBitmap {
		return { width, height, data: new Uint8Array(width * height * 4).fill(value) };
	}

	/** One character per pixel, using the first byte of each pixel. */
	function render(bitmap: IBrowserViewBitmap): string[] {
		const rows: string[] = [];
		for (let y = 0; y < bitmap.height; y++) {
			let row = '';
			for (let x = 0; x < bitmap.width; x++) {
				row += String.fromCharCode(bitmap.data[(y * bitmap.width + x) * 4]);
			}
			rows.push(row);
		}
		return rows;
	}

	const P = 'P'.charCodeAt(0);
	const D = 'D'.charCodeAt(0);
	const viewSize = { width: 4, height: 3 };

	test('places the page beside a right-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(3, 3, P), solid(1, 3, D), { viewSize, bounds: { x: 3, y: 0, width: 1, height: 3 } });
		assert.deepStrictEqual(render(result), ['PPPD', 'PPPD', 'PPPD']);
	});

	test('places the page beside a left-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(3, 3, P), solid(1, 3, D), { viewSize, bounds: { x: 0, y: 0, width: 1, height: 3 } });
		assert.deepStrictEqual(render(result), ['DPPP', 'DPPP', 'DPPP']);
	});

	test('places the page above a bottom-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(4, 20, P), solid(4, 10, D), { viewSize: { width: 4, height: 30 }, bounds: { x: 0, y: 20, width: 4, height: 10 } });
		assert.deepStrictEqual(render(result).filter((_, i) => i === 0 || i === 19 || i === 20 || i === 29), ['PPPP', 'PPPP', 'DDDD', 'DDDD']);
	});

	test('scales the output to device pixels', () => {
		const result = composeDevToolsScreenshot(solid(6, 6, P), solid(2, 6, D), { viewSize: { width: 4, height: 3 }, bounds: { x: 3, y: 0, width: 1, height: 3 } });
		assert.deepStrictEqual({ width: result.width, height: result.height }, { width: 8, height: 6 });
	});
});
