/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual, throws } from 'assert';
import { isNumber } from 'vs/base/common/types';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import type { ITextureAtlasPageGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/atlas/textureAtlas';
import { TextureAtlasSlabAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasSlabAllocator';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import type { IGlyphRasterizer, IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/raster';
import { createCodeEditorServices } from 'vs/editor/test/browser/testCodeEditor';
import type { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const blackInt = 0x000000FF;

let lastUniqueGlyph: string | undefined;
function getUniqueGlyphId(): [chars: string, tokenFg: number] {
	if (!lastUniqueGlyph) {
		lastUniqueGlyph = 'a';
	} else {
		lastUniqueGlyph = String.fromCharCode(lastUniqueGlyph.charCodeAt(0) + 1);
	}
	return [lastUniqueGlyph, blackInt];
}

function assertIsValidGlyph(glyph: Readonly<ITextureAtlasPageGlyph>, atlas: TextureAtlas) {
	// (x,y) are valid coordinates
	ok(isNumber(glyph.x));
	ok(glyph.x >= 0);
	ok(glyph.x < atlas.pageSize);
	ok(isNumber(glyph.y));
	ok(glyph.y >= 0);
	ok(glyph.y < atlas.pageSize);

	// (w,h) are valid dimensions
	ok(isNumber(glyph.w));
	ok(glyph.w > 0);
	ok(glyph.w <= atlas.pageSize);
	ok(isNumber(glyph.h));
	ok(glyph.h > 0);
	ok(glyph.h <= atlas.pageSize);

	// (originOffsetX, originOffsetY) are valid offsets
	ok(isNumber(glyph.originOffsetX));
	ok(isNumber(glyph.originOffsetY));

	// (x,y) + (w,h) are within the bounds of the atlas
	ok(glyph.x + glyph.w <= atlas.pageSize);
	ok(glyph.y + glyph.h <= atlas.pageSize);

	// Each of the glyph's outer pixel edges contain at least 1 non-transparent pixel
	const ctx = ensureNonNullable(atlas.pages[glyph.pageIndex].source.getContext('2d'));
	const edges = [
		ctx.getImageData(glyph.x, glyph.y, glyph.w, 1).data,
		ctx.getImageData(glyph.x, glyph.y + glyph.h - 1, glyph.w, 1).data,
		ctx.getImageData(glyph.x, glyph.y, 1, glyph.h).data,
		ctx.getImageData(glyph.x + glyph.w - 1, glyph.y, 1, glyph.h).data,
	];
	for (const edge of edges) {
		ok(edge.some(color => (color & 0xFF) !== 0));
	}
}

class TestGlyphRasterizer implements IGlyphRasterizer {
	readonly id = 0;
	nextGlyphColor: [number, number, number, number] = [0, 0, 0, 0];
	nextGlyphDimensions: [number, number] = [0, 0];
	rasterizeGlyph(chars: string, metadata: number, colorMap: string[]): Readonly<IRasterizedGlyph> {
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
		};
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
		for (let i = 0; i < 4; i++) {
			assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		}
		strictEqual(atlas.pages.length, 1);
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		strictEqual(atlas.pages.length, 2, 'the 5th glyph should overflow to a new page');
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
