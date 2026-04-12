/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual, throws } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ensureNonNullable } from '../../../../browser/gpu/gpuUtils.js';
import { TextureAtlas } from '../../../../browser/gpu/atlas/textureAtlas.js';
import { createCodeEditorServices } from '../../testCodeEditor.js';
import { assertIsValidGlyph } from './testUtil.js';
import { TextureAtlasSlabAllocator } from '../../../../browser/gpu/atlas/textureAtlasSlabAllocator.js';
import { DecorationStyleCache } from '../../../../browser/gpu/css/decorationStyleCache.js';
const blackInt = 0x000000FF;
const nullCharMetadata = 0x0;
let lastUniqueGlyph;
function getUniqueGlyphId() {
    if (!lastUniqueGlyph) {
        lastUniqueGlyph = 'a';
    }
    else {
        lastUniqueGlyph = String.fromCharCode(lastUniqueGlyph.charCodeAt(0) + 1);
    }
    return [lastUniqueGlyph, blackInt, nullCharMetadata, 0];
}
class TestGlyphRasterizer {
    constructor() {
        this.id = 0;
        this.cacheKey = '';
        this.nextGlyphColor = [0, 0, 0, 0];
        this.nextGlyphDimensions = [0, 0];
    }
    rasterizeGlyph(chars, tokenMetadata, charMetadata, colorMap) {
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
    getTextMetrics(text) {
        return null;
    }
}
suite('TextureAtlas', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        lastUniqueGlyph = undefined;
    });
    let instantiationService;
    let atlas;
    let glyphRasterizer;
    setup(() => {
        instantiationService = createCodeEditorServices(store);
        atlas = store.add(instantiationService.createInstance(TextureAtlas, 2, undefined, new DecorationStyleCache()));
        glyphRasterizer = new TestGlyphRasterizer();
        glyphRasterizer.nextGlyphDimensions = [1, 1];
        glyphRasterizer.nextGlyphColor = [0, 0, 0, 0xFF];
    });
    test('get single glyph', () => {
        assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
    });
    test('get multiple glyphs', () => {
        atlas = store.add(instantiationService.createInstance(TextureAtlas, 32, undefined, new DecorationStyleCache()));
        for (let i = 0; i < 10; i++) {
            assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
        }
    });
    test('adding glyph to full page creates new page', () => {
        let pageCount;
        for (let i = 0; i < 4; i++) {
            assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
            if (pageCount === undefined) {
                pageCount = atlas.pages.length;
            }
            else {
                strictEqual(atlas.pages.length, pageCount, 'the number of pages should not change when the page is being filled');
            }
        }
        assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
        strictEqual(atlas.pages.length, pageCount + 1, 'the 5th glyph should overflow to a new page');
    });
    test('adding a glyph larger than the atlas', () => {
        glyphRasterizer.nextGlyphDimensions = [3, 2];
        throws(() => atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), 'should throw when the glyph is too large, this should not happen in practice');
    });
    test('adding a glyph larger than the standard slab size', () => {
        glyphRasterizer.nextGlyphDimensions = [2, 2];
        atlas = store.add(instantiationService.createInstance(TextureAtlas, 32, {
            allocatorType: (canvas, textureIndex) => new TextureAtlasSlabAllocator(canvas, textureIndex, { slabW: 1, slabH: 1 })
        }, new DecorationStyleCache()));
        assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
    });
    test('adding a non-first glyph larger than the standard slab size, causing an overflow to a new page', () => {
        atlas = store.add(instantiationService.createInstance(TextureAtlas, 2, {
            allocatorType: (canvas, textureIndex) => new TextureAtlasSlabAllocator(canvas, textureIndex, { slabW: 1, slabH: 1 })
        }, new DecorationStyleCache()));
        assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
        strictEqual(atlas.pages.length, 1);
        glyphRasterizer.nextGlyphDimensions = [2, 2];
        assertIsValidGlyph(atlas.getGlyph(glyphRasterizer, ...getUniqueGlyphId()), atlas);
        strictEqual(atlas.pages.length, 2, 'the 2nd glyph should overflow to a new page with a larger slab size');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZUF0bGFzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL2dwdS9hdGxhcy90ZXh0dXJlQXRsYXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM3QyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV4RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDbkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ25ELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTNGLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQztBQUM1QixNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQztBQUU3QixJQUFJLGVBQW1DLENBQUM7QUFDeEMsU0FBUyxnQkFBZ0I7SUFDeEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3RCLGVBQWUsR0FBRyxHQUFHLENBQUM7SUFDdkIsQ0FBQztTQUFNLENBQUM7UUFDUCxlQUFlLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFDRCxPQUFPLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUMs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