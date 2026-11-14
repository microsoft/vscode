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

	test('places the page beside a right-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(3, 3, P), solid(4, 3, D), 'right');
		assert.deepStrictEqual(render(result), ['PPPD', 'PPPD', 'PPPD']);
	});

	test('places the page beside a left-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(3, 3, P), solid(4, 3, D), 'left');
		assert.deepStrictEqual(render(result), ['DPPP', 'DPPP', 'DPPP']);
	});

	test('places the page above a bottom-docked panel', () => {
		const result = composeDevToolsScreenshot(solid(4, 2, P), solid(4, 3, D), 'bottom');
		assert.deepStrictEqual(render(result), ['PPPP', 'PPPP', 'DDDD']);
	});

	test('does not modify the DevTools bitmap', () => {
		const devTools = solid(4, 3, D);
		composeDevToolsScreenshot(solid(3, 3, P), devTools, 'left');
		assert.deepStrictEqual(render(devTools), ['DDDD', 'DDDD', 'DDDD']);
	});
});
