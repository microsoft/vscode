/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getCharIndex } from './minimapCharSheet.js';
import { toUint8 } from '../../../../base/common/uint.js';
export class MinimapCharRenderer {
    constructor(charData, scale) {
        this.scale = scale;
        this._minimapCharRendererBrand = undefined;
        this.charDataNormal = MinimapCharRenderer.soften(charData, 12 / 15);
        this.charDataLight = MinimapCharRenderer.soften(charData, 50 / 60);
    }
    static soften(input, ratio) {
        const result = new Uint8ClampedArray(input.length);
        for (let i = 0, len = input.length; i < len; i++) {
            result[i] = toUint8(input[i] * ratio);
        }
        return result;
    }
    renderChar(target, dx, dy, chCode, color, foregroundAlpha, backgroundColor, backgroundAlpha, fontScale, useLighterFont, force1pxHeight) {
        const charWidth = 1 /* Constants.BASE_CHAR_WIDTH */ * this.scale;
        const charHeight = 2 /* Constants.BASE_CHAR_HEIGHT */ * this.scale;
        const renderHeight = (force1pxHeight ? 1 : charHeight);
        if (dx + charWidth > target.width || dy + renderHeight > target.height) {
            console.warn('bad render request outside image data');
            return;
        }
        const charData = useLighterFont ? this.charDataLight : this.charDataNormal;
        const charIndex = getCharIndex(chCode, fontScale);
        const destWidth = target.width * 4 /* Constants.RGBA_CHANNELS_CNT */;
        const backgroundR = backgroundColor.r;
        const backgroundG = backgroundColor.g;
        const backgroundB = backgroundColor.b;
        const deltaR = color.r - backgroundR;
        const deltaG = color.g - backgroundG;
        const deltaB = color.b - backgroundB;
        const destAlpha = Math.max(foregroundAlpha, backgroundAlpha);
        const dest = target.data;
        let sourceOffset = charIndex * charWidth * charHeight;
        let row = dy * destWidth + dx * 4 /* Constants.RGBA_CHANNELS_CNT */;
        for (let y = 0; y < renderHeight; y++) {
            let column = row;
            for (let x = 0; x < charWidth; x++) {
                const c = (charData[sourceOffset++] / 255) * (foregroundAlpha / 255);
                dest[column++] = backgroundR + deltaR * c;
                dest[column++] = backgroundG + deltaG * c;
                dest[column++] = backgroundB + deltaB * c;
                dest[column++] = destAlpha;
            }
            row += destWidth;
        }
    }
    blockRenderChar(target, dx, dy, color, foregroundAlpha, backgroundColor, backgroundAlpha, force1pxHeight) {
        const charWidth = 1 /* Constants.BASE_CHAR_WIDTH */ * this.scale;
        const charHeight = 2 /* Constants.BASE_CHAR_HEIGHT */ * this.scale;
        const renderHeight = (force1pxHeight ? 1 : charHeight);
        if (dx + charWidth > target.width || dy + renderHeight > target.height) {
            console.warn('bad render request outside image data');
            return;
        }
        const destWidth = target.width * 4 /* Constants.RGBA_CHANNELS_CNT */;
        const c = 0.5 * (foregroundAlpha / 255);
        const backgroundR = backgroundColor.r;
        const backgroundG = backgroundColor.g;
        const backgroundB = backgroundColor.b;
        const deltaR = color.r - backgroundR;
        const deltaG = color.g - backgroundG;
        const deltaB = color.b - backgroundB;
        const colorR = backgroundR + deltaR * c;
        const colorG = backgroundG + deltaG * c;
        const colorB = backgroundB + deltaB * c;
        const destAlpha = Math.max(foregroundAlpha, backgroundAlpha);
        const dest = target.data;
        let row = dy * destWidth + dx * 4 /* Constants.RGBA_CHANNELS_CNT */;
        for (let y = 0; y < renderHeight; y++) {
            let column = row;
            for (let x = 0; x < charWidth; x++) {
                dest[column++] = colorR;
                dest[column++] = colorG;
                dest[column++] = colorB;
                dest[column++] = destAlpha;
            }
            row += destWidth;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hcENoYXJSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9taW5pbWFwL21pbmltYXBDaGFyUmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFhLFlBQVksRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUxRCxNQUFNLE9BQU8sbUJBQW1CO0lBTS9CLFlBQVksUUFBMkIsRUFBa0IsS0FBYTtRQUFiLFVBQUssR0FBTCxLQUFLLENBQVE7UUFMdEUsOEJBQXlCLEdBQVMsU0FBUyxDQUFDO1FBTTNDLElBQUksQ0FBQyxjQUFjLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLGFBQWEsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUF3QixFQUFFLEtBQWE7UUFDNUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJ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