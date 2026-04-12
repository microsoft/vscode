/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { fail, ok } from 'assert';
import { TextureAtlas } from '../../../../browser/gpu/atlas/textureAtlas.js';
import { isNumber } from '../../../../../base/common/types.js';
import { ensureNonNullable } from '../../../../browser/gpu/gpuUtils.js';
export function assertIsValidGlyph(glyph, atlasOrSource) {
    if (glyph === undefined) {
        fail('glyph is undefined');
    }
    const pageW = atlasOrSource instanceof TextureAtlas ? atlasOrSource.pageSize : atlasOrSource.width;
    const pageH = atlasOrSource instanceof TextureAtlas ? atlasOrSource.pageSize : atlasOrSource.width;
    const source = atlasOrSource instanceof TextureAtlas ? atlasOrSource.pages[glyph.pageIndex].source : atlasOrSource;
    // (x,y) are valid coordinates
    ok(isNumber(glyph.x));
    ok(glyph.x >= 0);
    ok(glyph.x < pageW);
    ok(isNumber(glyph.y));
    ok(glyph.y >= 0);
    ok(glyph.y < pageH);
    // (w,h) are valid dimensions
    ok(isNumber(glyph.w));
    ok(glyph.w > 0);
    ok(glyph.w <= pageW);
    ok(isNumber(glyph.h));
    ok(glyph.h > 0);
    ok(glyph.h <= pageH);
    // (originOffsetX, originOffsetY) are valid offsets
    ok(isNumber(glyph.originOffsetX));
    ok(isNumber(glyph.originOffsetY));
    // (x,y) + (w,h) are within the bounds of the atlas
    ok(glyph.x + glyph.w <= pageW);
    ok(glyph.y + glyph.h <= pageH);
    // Each of the glyph's outer pixel edges contain at least 1 non-transparent pixel
    const ctx = ensureNonNullable(source.getContext('2d'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFV0aWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL2dwdS9hdGxhcy90ZXN0VXRpbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUVsQyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXhFLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxLQUFtRCxFQUFFLGFBQTZDO0lBQ3BJLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQzVCLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxhQUFhLFlBQVksWUFBWSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDO0lBQ25HLE1BQU0sS0FBSyxHQUFHLGFBQWEsWUFBWSxZQUFZLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7SUFDbkcsTUFBTSxNQUFNLEdBQUcsYUFBYSxZQUFZLFlBQVksQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUM7SUFFbkgsOEJBQThCO0lBQzlCLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEIsRUFBRSxD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