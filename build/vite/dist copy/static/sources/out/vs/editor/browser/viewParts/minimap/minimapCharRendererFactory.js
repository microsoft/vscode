/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MinimapCharRenderer } from './minimapCharRenderer.js';
import { allCharCodes } from './minimapCharSheet.js';
import { prebakedMiniMaps } from './minimapPreBaked.js';
import { toUint8 } from '../../../../base/common/uint.js';
/**
 * Creates character renderers. It takes a 'scale' that determines how large
 * characters should be drawn. Using this, it draws data into a canvas and
 * then downsamples the characters as necessary for the current display.
 * This makes rendering more efficient, rather than drawing a full (tiny)
 * font, or downsampling in real-time.
 */
export class MinimapCharRendererFactory {
    /**
     * Creates a new character renderer factory with the given scale.
     */
    static create(scale, fontFamily) {
        // renderers are immutable. By default we'll 'create' a new minimap
        // character renderer whenever we switch editors, no need to do extra work.
        if (this.lastCreated && scale === this.lastCreated.scale && fontFamily === this.lastFontFamily) {
            return this.lastCreated;
        }
        let factory;
        if (prebakedMiniMaps[scale]) {
            factory = new MinimapCharRenderer(prebakedMiniMaps[scale](), scale);
        }
        else {
            factory = MinimapCharRendererFactory.createFromSampleData(MinimapCharRendererFactory.createSampleData(fontFamily).data, scale);
        }
        this.lastFontFamily = fontFamily;
        this.lastCreated = factory;
        return factory;
    }
    /**
     * Creates the font sample data, writing to a canvas.
     */
    static createSampleData(fontFamily) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.style.height = `${16 /* Constants.SAMPLED_CHAR_HEIGHT */}px`;
        canvas.height = 16 /* Constants.SAMPLED_CHAR_HEIGHT */;
        canvas.width = 96 /* Constants.CHAR_COUNT */ * 10 /* Constants.SAMPLED_CHAR_WIDTH */;
        canvas.style.width = 96 /* Constants.CHAR_COUNT */ * 10 /* Constants.SAMPLED_CHAR_WIDTH */ + 'px';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${16 /* Constants.SAMPLED_CHAR_HEIGHT */}px ${fontFamily}`;
        ctx.textBaseline = 'middle';
        let x = 0;
        for (const code of allCharCodes) {
            ctx.fillText(String.fromCharCode(code), x, 16 /* Constants.SAMPLED_CHAR_HEIGHT */ / 2);
            x += 10 /* Constants.SAMPLED_CHAR_WIDTH */;
        }
        return ctx.getImageData(0, 0, 96 /* Constants.CHAR_COUNT */ * 10 /* Constants.SAMPLED_CHAR_WIDTH */, 16 /* Constants.SAMPLED_CHAR_HEIGHT */);
    }
    /**
     * Creates a character renderer from the canvas sample data.
     */
    static createFromSampleData(source, scale) {
        const expectedLength = 16 /* Constants.SAMPLED_CHAR_HEIGHT */ * 10 /* Constants.SAMPLED_CHAR_WIDTH */ * 4 /* Constants.RGBA_CHANNELS_CNT */ * 96 /* Constants.CHAR_COUNT */;
        if (source.length !== expectedLength) {
            throw new Error('Unexpected source in MinimapCharRenderer');
        }
        const charData = MinimapCharRendererFactory._downsample(source, scale);
        return new MinimapCharRenderer(charData, scale);
    }
    static _downsampleChar(source, sourceOffset, dest, destOffset, scale) {
        const width = 1 /* Constants.BASE_CHAR_WIDTH */ * scale;
        const height = 2 /* Constants.BASE_CHAR_HEIGHT */ * scale;
        let targetIndex = destOffset;
        let brightest = 0;
        // This is essentially an ad-hoc rescaling algorithm. Standard approaches
        // like bicubic interpolation are awesome for scaling between image sizes,
        // but don't work so well when scaling to very small pixel values, we end
        // up with blurry, indistinct forms.
        //
        // The approach taken here is simply mapping each source pixel to the target
        // pixels, and taking the weighted values for all pixels in each, and then
        // averaging them out. Finally we apply an intensity boost in _downsample,
        // since when scaling to the smallest pixel sizes there's more black space
        // which causes characters to be much less distinct.
        for (let y = 0; y < height; y++) {
            // 1. For this destination pixel, get the source pixels we're sampling
            // from (x1, y1) to the next pixel (x2, y2)
            const sourceY1 = (y / height) * 16 /* Constants.SAMPLED_CHAR_HEIGHT */;
            const sourceY2 = ((y + 1) / height) * 16 /* Constants.SAMPLED_CHAR_HEIGHT */;
            for (let x = 0; x < width; x++) {
                const sourceX1 = (x / width) * 10 /* Constants.SAMPLED_CHAR_WIDTH */;
                const sourceX2 = ((x + 1) / width) * 10 /* Constants.SAMPLED_CHAR_WIDTH */;
                // 2. Sample all of them, summing them up and weighting them. Similar
                // to bilinear interpolation.
                let value = 0;
                let samples = 0;
                for (let sy = sourceY1; sy < sourceY2; sy++) {
                    const sourceRow = sourceOffset + Math.floor(sy) * 3840 /* Constants.RGBA_SAMPLED_ROW_WIDTH */;
                    const yBalance = 1 - (sy - Math.floor(sy));
                    for (let sx = sourceX1; sx < sourceX2; sx++) {
                        const xBalance = 1 - (sx - Math.floor(sx));
                        const sourceIndex = sourceRow + Math.floor(sx) * 4 /* Constants.RGBA_CHANNELS_CNT */;
                        const weight = xBalance * yBalance;
                        samples += weight;
                        value += ((source[sourceIndex] * source[sourceIndex + 3]) / 255) * weight;
                    }
                }
                const final = value / samples;
                brightest = Math.max(brightest, final);
                dest[targetIndex++] = toUint8(final);
            }
        }
        return brightest;
    }
    static _downsample(data, scale) {
        const pixelsPerCharacter = 2 /* Constants.BASE_CHAR_HEIGHT */ * scale * 1 /* Constants.BASE_CHAR_WIDTH */ * scale;
        const resultLen = pixelsPerCharacter * 96 /* Constants.CHAR_COUNT */;
        const result = new Uint8ClampedArray(resultLen);
        let resultOffset = 0;
        let sourceOffset = 0;
        let brightest = 0;
        for (let charIndex = 0; charIndex < 96 /* Constants.CHAR_COUNT */; charIndex++) {
            brightest = Math.max(brightest, this._downsampleChar(data, sourceOffset, result, resultOffset, scale));
            resultOffset += pixelsPerCharacter;
            sourceOffset += 10 /* Constants.SAMPLED_CHAR_WIDTH */ * 4 /* Constants.RGBA_CHANNELS_CNT */;
        }
        if (brightest > 0) {
            const adjust = 255 / brightest;
            for (let i = 0; i < resultLen; i++) {
                result[i] *= adjust;
            }
        }
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hcENoYXJSZW5kZXJlckZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvbWluaW1hcC9taW5pbWFwQ2hhclJlbmRlcmVyRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsWUFBWSxFQUFhLE1BQU0sdUJBQXVCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTFEOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTywwQkFBMEI7SUFJdEM7O09BRUc7SUFDSSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQWEsRUFBRSxVQUFrQjtRQUNyRCxtRUFBbUU7UUFDbkUsMkVBQTJFO1FBQzNFLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLElBQUksVUFBVSxLQUFLLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNoRyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksT0FBNEIsQ0FBQztRQUNqQyxJQUFJLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLElBQUksbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRSxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sR0FBRywwQkFBMEIsQ0FBQyxvQkFBb0IsQ0FDeEQsMEJBQTBCLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxD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