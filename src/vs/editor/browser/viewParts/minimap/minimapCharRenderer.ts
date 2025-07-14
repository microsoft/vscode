/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RGBA8 } from '../../../common/core/misc/rgba.js';
import { Constants, getCharIndex } from './minimapCharSheet.js';
import { toUint8 } from '../../../../base/common/uint.js';

export class MinimapCharRenderer {
	_minimapCharRendererBrand: void = undefined;

	private readonly charDataNormal: Uint8ClampedArray;
	private readonly charDataLight: Uint8ClampedArray;

	constructor(charData: Uint8ClampedArray, public readonly scale: number) {
		this.charDataNormal = MinimapCharRenderer.soften(charData, 12 / 15);
		this.charDataLight = MinimapCharRenderer.soften(charData, 50 / 60);
	}

	private static soften(input: Uint8ClampedArray, ratio: number): Uint8ClampedArray {
		const result = new Uint8ClampedArray(input.length);
		for (let i = 0, len = input.length; i < len; i++) {
			result[i] = toUint8(input[i] * ratio);
		}
		return result;
	}

	public renderChar(
		target: ImageData,
		dx: number,
		dy: number,
		chCode: number,
		color: RGBA8,
		foregroundAlpha: number,
		backgroundColor: RGBA8,
		backgroundAlpha: number,
		fontScale: number,
		useLighterFont: boolean,
		force1pxHeight: boolean
	): void {
		const charWidth = Constants.BASE_CHAR_WIDTH * this.scale;
		const charHeight = Constants.BASE_CHAR_HEIGHT * this.scale;
		const renderHeight = (force1pxHeight ? 1 : charHeight);
		if (dx + charWidth > target.width || dy + renderHeight > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const charData = useLighterFont ? this.charDataLight : this.charDataNormal;
		const charIndex = getCharIndex(chCode, fontScale);

		const destWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const destAlpha = Math.max(foregroundAlpha, backgroundAlpha);

		const dest = target.data;
		let sourceOffset = charIndex * charWidth * charHeight;

		let row = dy * destWidth + dx * Constants.RGBA_CHANNELS_CNT;
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

	public blockRenderChar(
		target: ImageData,
		dx: number,
		dy: number,
		color: RGBA8,
		foregroundAlpha: number,
		backgroundColor: RGBA8,
		backgroundAlpha: number,
		force1pxHeight: boolean
	): void {
		const charWidth = Constants.BASE_CHAR_WIDTH * this.scale;
		const charHeight = Constants.BASE_CHAR_HEIGHT * this.scale;
		const renderHeight = (force1pxHeight ? 1 : charHeight);
		if (dx + charWidth > target.width || dy + renderHeight > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const destWidth = target.width * Constants.RGBA_CHANNELS_CNT;

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

		let row = dy * destWidth + dx * Constants.RGBA_CHANNELS_CNT;
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
