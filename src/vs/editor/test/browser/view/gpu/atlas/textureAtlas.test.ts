/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { isNumber } from 'vs/base/common/types';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import type { ITextureAtlasPageGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/atlas/textureAtlas';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
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
	ok(glyph.w < atlas.pageSize);
	ok(isNumber(glyph.h));
	ok(glyph.h > 0);
	ok(glyph.h < atlas.pageSize);

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

suite('TextureAtlas', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		lastUniqueGlyph = undefined;
	});

	let instantiationService: IInstantiationService;
	let glyphRasterizer: GlyphRasterizer;

	setup(() => {
		instantiationService = createCodeEditorServices(store);
		glyphRasterizer = new GlyphRasterizer(10, 'monospace');
	});

	test('get single glyph', () => {
		const atlas = store.add(instantiationService.createInstance(TextureAtlas, 512));
		assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
	});

	test('get multiple glyphs', () => {
		const atlas = store.add(instantiationService.createInstance(TextureAtlas, 512));
		for (let i = 0; i < 10; i++) {
			assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
		}
	});

	test.skip('adding glyph to full page creates new page', () => {
		throw new Error('NYI'); // TODO: Implement
	});
});
