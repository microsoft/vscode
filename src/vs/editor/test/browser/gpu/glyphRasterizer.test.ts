/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DecorationStyleCache } from '../../../browser/gpu/css/decorationStyleCache.js';
import { GlyphRasterizer } from '../../../browser/gpu/raster/glyphRasterizer.js';

suite('GlyphRasterizer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const dpr of [0.95, 1.25, 1.5, 2]) {
		test(`matches DOM font metrics at device pixel ratio ${dpr}`, () => {
			const rasterizer = store.add(new GlyphRasterizer(14, 'monospace', dpr, new DecorationStyleCache()));
			const canvas = new OffscreenCanvas(100, 100);
			const context = canvas.getContext('2d')!;
			context.font = `${14 * dpr}px monospace`;
			const expectedWidth = context.measureText('MMMM').width;
			ok(expectedWidth > 0, 'A monospace font must be available to test fractional font metrics');
			strictEqual(rasterizer.getTextMetrics('MMMM').width, expectedWidth);
			const glyph = rasterizer.rasterizeGlyph('M', 0, 0, ['#000000', '#ffffff', '#000000']);
			strictEqual(glyph.source.getContext('2d')!.font, context.font);
			strictEqual(rasterizer.getTextMetrics('MMMM').width, expectedWidth);
		});
	}
});
