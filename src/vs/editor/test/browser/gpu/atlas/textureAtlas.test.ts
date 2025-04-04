/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, throws } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IGlyphRasterizer, IRasterizedGlyph } from '../../../../browser/gpu/raster/raster.js';
import { ensureNonNullable } from '../../../../browser/gpu/gpuUtils.js';
import type { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextureAtlas } from '../../../../browser/gpu/atlas/textureAtlas.js';
import { createCodeEditorServices } from '../../testCodeEditor.js';
import { assertIsValidGlyph } from './testUtil.js';
import { TextureAtlasSlabAllocator } from '../../../../browser/gpu/atlas/textureAtlasSlabAllocator.js';

const blackInt = 0x000000FF;
const nullCharMetadata = 0x0;

let lastUniqueGlyph: string | undefined;
function getUniqueGlyphId(): [chars: string, tokenMetadata: number, charMetadata: number, x: number] {
	if (!lastUniqueGlyph) {
		lastUniqueGlyph = 'a';
	} else {
		lastUniqueGlyph = String.fromCharCode(lastUniqueGlyph.charCodeAt(0) + 1);
	}
	return [lastUniqueGlyph, blackInt, nullCharMetadata, 0];
}

class TestGlyphRasterizer implements IGlyphRasterizer {
	readonly id = 0;
	readonly cacheKey = '';
	nextGlyphColor: [number, number, number, number] = [0, 0, 0, 0];
	nextGlyphDimensions: [number, number] = [0, 0];
	rasterizeGlyph(chars: string, tokenMetadata: number, charMetadata: number, colorMap: string[]): Readonly<IRasterizedGlyph> {
		const w = this.nextGlyphDimensions[0];
		const h = this.nextGlyphDimensions[1];
		if (w === 0 || h === 0) {
			throw new Error('TestGlyphRasterizer.nextGlyphDimensions must be set to a non-zero value before calling rasterizeGlyph');
		}
		const imageData = new ImageData(w, h);
		let i = 0;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const [r, g, b, a] = this.nextGlyphColor;
				i = (y * w + x) * 4;
				imageData.data[i + 0] = r;
				imageData.data[i + 1] = g;
				imageData.data[i + 2] = b;
				imageData.data[i + 3] = a;
			}
		}
		const canvas = new OffscreenCanvas(w, h);
		const ctx = ensureNonNullable(canvas.getContext('2d'));
		ctx.putImageData(imageData, 0, 0);
		return {
			source: canvas,
			boundingBox: { top: 0, left: 0, bottom: h - 1, right: w - 1 },
			originOffset: { x: 0, y: 0 },
			fontBoundingBoxAscent: 0,
			fontBoundingBoxDescent: 0,
		};
	}
	getTextMetrics(text: string): TextMetrics {
		return null!;
	}
}

suite('TextureAtlas', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		lastUniqueGlyph = undefined;
	});

	let instantiationService: IInstantiationService;

	let atlas: TextureAtlas;
	let glyphRasterizer: TestGlyphRasterizer;

	setup(() => {
		instantiationService = createCodeEditorServices(store);
		atlas = store.add(instantiationService.createInstance(TextureAtlas, 2, undefined));
		glyphRasterizer = new TestGlyphRasterizer();
		glyphRasterizer.nextGlyphDimensions = [1, 1];
		glyphRasterizer.nextGlyphColor = [0, 0, 0, 0xFF];
	});

	test('get single glyph', () => {
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
	});

	test('get multiple glyphs', () => {
		atlas = store.add(instantiationService.createInstance(TextureAtlas, 32, undefined));
		for (let i = 0; i < 10; i++) {
			assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		}
	});

	test('adding glyph to full page creates new page', () => {
		let pageCount: number | undefined;
		for (let i = 0; i < 4; i++) {
			assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
			if (pageCount === undefined) {
				pageCount = atlas.pages.length;
			} else {
				strictEqual(atlas.pages.length, pageCount, 'the number of pages should not change when the page is being filled');
			}
		}
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		strictEqual(atlas.pages.length, pageCount! + 1, 'the 5th glyph should overflow to a new page');
	});

	test('adding a glyph larger than the atlas', () => {
		glyphRasterizer.nextGlyphDimensions = [3, 2];
		throws(() => atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), 'should throw when the glyph is too large, this should not happen in practice');
	});

	test('adding a glyph larger than the standard slab size', () => {
		glyphRasterizer.nextGlyphDimensions = [2, 2];
		atlas = store.add(instantiationService.createInstance(TextureAtlas, 32, {
			allocatorType: (canvas, textureIndex) => new TextureAtlasSlabAllocator(canvas, textureIndex, { slabW: 1, slabH: 1 })
		}));
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
	});

	test('adding a non-first glyph larger than the standard slab size, causing an overflow to a new page', () => {
		atlas = store.add(instantiationService.createInstance(TextureAtlas, 2, {
			allocatorType: (canvas, textureIndex) => new TextureAtlasSlabAllocator(canvas, textureIndex, { slabW: 1, slabH: 1 })
		}));
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		strictEqual(atlas.pages.length, 1);
		glyphRasterizer.nextGlyphDimensions = [2, 2];
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		strictEqual(atlas.pages.length, 2, 'the 2nd glyph should overflow to a new page with a larger slab size');
	});
});
