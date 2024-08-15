/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { getActiveWindow } from 'vs/base/browser/dom';
import { toDisposable } from 'vs/base/common/lifecycle';
import { isNumber } from 'vs/base/common/types';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import type { ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/atlas/textureAtlas';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
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

function assertIsValidGlyph(glyph: ITextureAtlasGlyph, atlas: TextureAtlas) {
	// (x,y) are valid coordinates
	ok(isNumber(glyph.x));
	ok(glyph.x >= 0);
	ok(glyph.x < atlas.source.width);
	ok(isNumber(glyph.y));
	ok(glyph.y >= 0);
	ok(glyph.y < atlas.source.height);

	// (w,h) are valid dimensions
	ok(isNumber(glyph.w));
	ok(glyph.w > 0);
	ok(glyph.w < atlas.source.width);
	ok(isNumber(glyph.h));
	ok(glyph.h > 0);
	ok(glyph.h < atlas.source.height);

	// (originOffsetX, originOffsetY) are valid offsets
	ok(isNumber(glyph.originOffsetX));
	ok(isNumber(glyph.originOffsetY));

	// (x,y) + (w,h) are within the bounds of the atlas
	ok(glyph.x + glyph.w <= atlas.source.width);
	ok(glyph.y + glyph.h <= atlas.source.height);

	// Each of the glyph's outer pixel edges contain at least 1 non-transparent pixel
	const ctx = ensureNonNullable(atlas.source.getContext('2d'));
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
	let parentElement: HTMLElement;

	setup(() => {
		instantiationService = createCodeEditorServices(store);

		const doc = getActiveWindow().document;
		parentElement = doc.createElement('div');
		doc.body.appendChild(parentElement);
		store.add(toDisposable(() => parentElement.remove()));
	});

	test('get single glyph', () => {
		const atlas = store.add(instantiationService.createInstance(TextureAtlas, parentElement, 512));
		assertIsValidGlyph(atlas.getGlyph(...getUniqueGlyphId()), atlas);
	});

	test('get multiple glyphs', () => {
		const atlas = store.add(instantiationService.createInstance(TextureAtlas, parentElement, 512));
		for (let i = 0; i < 10; i++) {
			assertIsValidGlyph(atlas.getGlyph(...getUniqueGlyphId()), atlas);
		}
	});

	test.skip('adding glyph to full page creates new page', () => {
		throw new Error('NYI'); // TODO: Implement
	});
});
