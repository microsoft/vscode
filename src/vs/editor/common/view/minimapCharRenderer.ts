/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ColorId, TokenizationRegistry } from 'vs/editor/common/modes';
import Event, { Emitter } from 'vs/base/common/event';
import { RGBA } from 'vs/base/common/color';

export class MinimapTokensColorTracker {
	private static _INSTANCE: MinimapTokensColorTracker = null;
	public static getInstance(): MinimapTokensColorTracker {
		if (!this._INSTANCE) {
			this._INSTANCE = new MinimapTokensColorTracker();
		}
		return this._INSTANCE;
	}

	private _colors: RGBA[];
	private _backgroundIsLight: boolean;

	private _onDidChange = new Emitter<void>();
	public onDidChange: Event<void> = this._onDidChange.event;

	private constructor() {
		this._updateColorMap();
		TokenizationRegistry.onDidChange((e) => {
			if (e.changedColorMap) {
				this._updateColorMap();
			}
		});
	}

	private _updateColorMap(): void {
		const colorMap = TokenizationRegistry.getColorMap();
		if (!colorMap) {
			this._colors = [null];
			this._backgroundIsLight = true;
			return;
		}
		this._colors = [null];
		for (let colorId = 1; colorId < colorMap.length; colorId++) {
			this._colors[colorId] = colorMap[colorId].toRGBA();
		}
		let backgroundLuminosity = colorMap[ColorId.DefaultBackground].getLuminosity();
		this._backgroundIsLight = (backgroundLuminosity >= 0.5);
		this._onDidChange.fire(void 0);
	}

	public getColor(colorId: ColorId): RGBA {
		if (colorId < 1 || colorId >= this._colors.length) {
			// background color (basically invisible)
			colorId = ColorId.DefaultBackground;
		}
		return this._colors[colorId];
	}

	public backgroundIsLight(): boolean {
		return this._backgroundIsLight;
	}
}

export const enum Constants {
	START_CH_CODE = 32, // Space
	END_CH_CODE = 126, // Tilde (~)
	CHAR_COUNT = END_CH_CODE - START_CH_CODE + 1,

	SAMPLED_CHAR_HEIGHT = 16,
	SAMPLED_CHAR_WIDTH = 10,
	SAMPLED_HALF_CHAR_WIDTH = SAMPLED_CHAR_WIDTH / 2,

	x2_CHAR_HEIGHT = 4,
	x2_CHAR_WIDTH = 2,

	x1_CHAR_HEIGHT = 2,
	x1_CHAR_WIDTH = 1,

	RGBA_CHANNELS_CNT = 4,
}

export class MinimapCharRenderer {

	_minimapCharRendererBrand: void;

	public readonly x2charData: Uint8ClampedArray;
	public readonly x1charData: Uint8ClampedArray;

	public readonly x2charDataLight: Uint8ClampedArray;
	public readonly x1charDataLight: Uint8ClampedArray;

	constructor(x2CharData: Uint8ClampedArray, x1CharData: Uint8ClampedArray) {
		const x2ExpectedLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CHAR_COUNT;
		if (x2CharData.length !== x2ExpectedLen) {
			throw new Error('Invalid x2CharData');
		}
		const x1ExpectedLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CHAR_COUNT;
		if (x1CharData.length !== x1ExpectedLen) {
			throw new Error('Invalid x1CharData');
		}
		this.x2charData = x2CharData;
		this.x1charData = x1CharData;

		this.x2charDataLight = MinimapCharRenderer.soften(x2CharData, 12 / 15);
		this.x1charDataLight = MinimapCharRenderer.soften(x1CharData, 50 / 60);
	}

	private static soften(input: Uint8ClampedArray, ratio: number): Uint8ClampedArray {
		let result = new Uint8ClampedArray(input.length);
		for (let i = 0, len = input.length; i < len; i++) {
			result[i] = input[i] * ratio;
		}
		return result;
	}

	private static _getChIndex(chCode: number): number {
		chCode -= Constants.START_CH_CODE;
		if (chCode < 0) {
			chCode += Constants.CHAR_COUNT;
		}
		return (chCode % Constants.CHAR_COUNT);
	}

	public x2RenderChar(target: ImageData, dx: number, dy: number, chCode: number, color: RGBA, backgroundColor: RGBA, useLighterFont: boolean): void {
		if (dx + Constants.x2_CHAR_WIDTH > target.width || dy + Constants.x2_CHAR_HEIGHT > target.height) {
			console.warn('bad render request outside image data');
			return;
		}
		const x2CharData = useLighterFont ? this.x2charDataLight : this.x2charData;
		const chIndex = MinimapCharRenderer._getChIndex(chCode);

		const outWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const dest = target.data;
		const sourceOffset = chIndex * Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH;
		let destOffset = dy * outWidth + dx * Constants.RGBA_CHANNELS_CNT;
		{
			const c = x2CharData[sourceOffset] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}
		{
			const c = x2CharData[sourceOffset + 1] / 255;
			dest[destOffset + 4] = backgroundR + deltaR * c;
			dest[destOffset + 5] = backgroundG + deltaG * c;
			dest[destOffset + 6] = backgroundB + deltaB * c;
		}

		destOffset += outWidth;
		{
			const c = x2CharData[sourceOffset + 2] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}
		{
			const c = x2CharData[sourceOffset + 3] / 255;
			dest[destOffset + 4] = backgroundR + deltaR * c;
			dest[destOffset + 5] = backgroundG + deltaG * c;
			dest[destOffset + 6] = backgroundB + deltaB * c;
		}

		destOffset += outWidth;
		{
			const c = x2CharData[sourceOffset + 4] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}
		{
			const c = x2CharData[sourceOffset + 5] / 255;
			dest[destOffset + 4] = backgroundR + deltaR * c;
			dest[destOffset + 5] = backgroundG + deltaG * c;
			dest[destOffset + 6] = backgroundB + deltaB * c;
		}

		destOffset += outWidth;
		{
			const c = x2CharData[sourceOffset + 6] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}
		{
			const c = x2CharData[sourceOffset + 7] / 255;
			dest[destOffset + 4] = backgroundR + deltaR * c;
			dest[destOffset + 5] = backgroundG + deltaG * c;
			dest[destOffset + 6] = backgroundB + deltaB * c;
		}
	}

	public x1RenderChar(target: ImageData, dx: number, dy: number, chCode: number, color: RGBA, backgroundColor: RGBA, useLighterFont: boolean): void {
		if (dx + Constants.x1_CHAR_WIDTH > target.width || dy + Constants.x1_CHAR_HEIGHT > target.height) {
			console.warn('bad render request outside image data');
			return;
		}
		const x1CharData = useLighterFont ? this.x1charDataLight : this.x1charData;
		const chIndex = MinimapCharRenderer._getChIndex(chCode);

		const outWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const dest = target.data;
		const sourceOffset = chIndex * Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH;
		let destOffset = dy * outWidth + dx * Constants.RGBA_CHANNELS_CNT;
		{
			const c = x1CharData[sourceOffset] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}

		destOffset += outWidth;
		{
			const c = x1CharData[sourceOffset + 1] / 255;
			dest[destOffset + 0] = backgroundR + deltaR * c;
			dest[destOffset + 1] = backgroundG + deltaG * c;
			dest[destOffset + 2] = backgroundB + deltaB * c;
		}
	}

	public x2BlockRenderChar(target: ImageData, dx: number, dy: number, color: RGBA, backgroundColor: RGBA, useLighterFont: boolean): void {
		if (dx + Constants.x2_CHAR_WIDTH > target.width || dy + Constants.x2_CHAR_HEIGHT > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const outWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const c = 0.5;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const colorR = backgroundR + deltaR * c;;
		const colorG = backgroundG + deltaG * c;
		const colorB = backgroundB + deltaB * c;

		const dest = target.data;
		let destOffset = dy * outWidth + dx * Constants.RGBA_CHANNELS_CNT;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}
		{
			dest[destOffset + 4] = colorR;
			dest[destOffset + 5] = colorG;
			dest[destOffset + 6] = colorB;
		}

		destOffset += outWidth;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}
		{
			dest[destOffset + 4] = colorR;
			dest[destOffset + 5] = colorG;
			dest[destOffset + 6] = colorB;
		}

		destOffset += outWidth;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}
		{
			dest[destOffset + 4] = colorR;
			dest[destOffset + 5] = colorG;
			dest[destOffset + 6] = colorB;
		}

		destOffset += outWidth;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}
		{
			dest[destOffset + 4] = colorR;
			dest[destOffset + 5] = colorG;
			dest[destOffset + 6] = colorB;
		}
	}

	public x1BlockRenderChar(target: ImageData, dx: number, dy: number, color: RGBA, backgroundColor: RGBA, useLighterFont: boolean): void {
		if (dx + Constants.x1_CHAR_WIDTH > target.width || dy + Constants.x1_CHAR_HEIGHT > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const outWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const c = 0.5;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const colorR = backgroundR + deltaR * c;;
		const colorG = backgroundG + deltaG * c;
		const colorB = backgroundB + deltaB * c;

		const dest = target.data;

		let destOffset = dy * outWidth + dx * Constants.RGBA_CHANNELS_CNT;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}

		destOffset += outWidth;
		{
			dest[destOffset + 0] = colorR;
			dest[destOffset + 1] = colorG;
			dest[destOffset + 2] = colorB;
		}
	}
}
