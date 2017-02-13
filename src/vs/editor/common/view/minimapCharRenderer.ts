/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';
import { ColorId, TokenizationRegistry } from 'vs/editor/common/modes';

export class ParsedColor {

	public readonly r: number;
	public readonly g: number;
	public readonly b: number;

	constructor(r, g, b) {
		this.r = r;
		this.g = g;
		this.b = b;
	}
}

export class MinimapColors {

	private readonly _colors: ParsedColor[];

	constructor(colorMap: string[]) {
		this._colors = [null];
		for (let colorId = 1; colorId < colorMap.length; colorId++) {
			this._colors[colorId] = MinimapColors._parseColor(colorMap[colorId]);
		}
	}

	public getColor(colorId: ColorId): ParsedColor {
		if (colorId < 1 || colorId >= this._colors.length) {
			// background color (basically invisible)
			colorId = 2;
		}
		return this._colors[colorId];
	}

	public static _parseColor(color: string): ParsedColor {
		if (!color) {
			return new ParsedColor(0, 0, 0);
		}
		if (color.charCodeAt(0) === CharCode.Hash) {
			color = color.substr(1, 6);
		} else {
			color = color.substr(0, 6);
		}
		if (color.length !== 6) {
			return new ParsedColor(0, 0, 0);
		}

		let r = 16 * this._parseHexDigit(color.charCodeAt(0)) + this._parseHexDigit(color.charCodeAt(1));
		let g = 16 * this._parseHexDigit(color.charCodeAt(2)) + this._parseHexDigit(color.charCodeAt(3));
		let b = 16 * this._parseHexDigit(color.charCodeAt(4)) + this._parseHexDigit(color.charCodeAt(5));
		return new ParsedColor(r, g, b);
	}

	private static _parseHexDigit(charCode: CharCode): number {
		switch (charCode) {
			case CharCode.Digit0: return 0;
			case CharCode.Digit1: return 1;
			case CharCode.Digit2: return 2;
			case CharCode.Digit3: return 3;
			case CharCode.Digit4: return 4;
			case CharCode.Digit5: return 5;
			case CharCode.Digit6: return 6;
			case CharCode.Digit7: return 7;
			case CharCode.Digit8: return 8;
			case CharCode.Digit9: return 9;
			case CharCode.a: return 10;
			case CharCode.A: return 10;
			case CharCode.b: return 11;
			case CharCode.B: return 11;
			case CharCode.c: return 12;
			case CharCode.C: return 12;
			case CharCode.d: return 13;
			case CharCode.D: return 13;
			case CharCode.e: return 14;
			case CharCode.E: return 14;
			case CharCode.f: return 15;
			case CharCode.F: return 15;
		}
		return 0;
	}
}

export class MinimapTokensColorTracker {
	private static _INSTANCE: MinimapTokensColorTracker = null;
	public static getInstance(): MinimapTokensColorTracker {
		if (!this._INSTANCE) {
			this._INSTANCE = new MinimapTokensColorTracker();
		}
		return this._INSTANCE;
	}

	private _lastColorMap: string[];
	private _colorMaps: MinimapColors;

	private constructor() {
		this._lastColorMap = [];
		this._setColorMap(TokenizationRegistry.getColorMap());
		TokenizationRegistry.onDidChange(() => this._setColorMap(TokenizationRegistry.getColorMap()));
	}

	private static _equals(a: string[], b: string[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	}

	private _setColorMap(colorMap: string[]): void {
		if (MinimapTokensColorTracker._equals(this._lastColorMap, colorMap)) {
			return;
		}
		this._lastColorMap = colorMap.slice(0);
		this._colorMaps = new MinimapColors(this._lastColorMap);
	}

	public getColorMaps(): MinimapColors {
		return this._colorMaps;
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
	CA_CHANNELS_CNT = 2,
}

export class MinimapCharRenderer2 {

	_minimapCharRendererBrand: void;

	public static create(x2CharData: Uint8ClampedArray, x1CharData: Uint8ClampedArray): MinimapCharRenderer2 {
		let _x2CharData = this.toGrayscale(x2CharData);
		let _x1CharData = this.toGrayscale(x1CharData);
		return new MinimapCharRenderer2(_x2CharData, _x1CharData);
	}

	private static toGrayscale(charData: Uint8ClampedArray): Uint8ClampedArray {
		let newLength = charData.length / 2;
		let result = new Uint8ClampedArray(newLength);
		let sourceOffset = 0;
		for (var i = 0; i < newLength; i++) {
			let color = charData[sourceOffset];
			let alpha = charData[sourceOffset + 1];
			let newColor = Math.round((color * alpha) / 255);
			result[i] = newColor;
			sourceOffset += 2;
		}
		return result;
	}

	public readonly x2charData: Uint8ClampedArray;
	public readonly x1charData: Uint8ClampedArray;

	constructor(x2CharData: Uint8ClampedArray, x1CharData: Uint8ClampedArray) {
		const x2ExpectedLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH /** Constants.CA_CHANNELS_CNT*/ * Constants.CHAR_COUNT;
		if (x2CharData.length !== x2ExpectedLen) {
			throw new Error('Invalid x2CharData');
		}
		const x1ExpectedLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH /** Constants.CA_CHANNELS_CNT*/ * Constants.CHAR_COUNT;
		if (x1CharData.length !== x1ExpectedLen) {
			throw new Error('Invalid x1CharData');
		}
		this.x2charData = x2CharData;
		this.x1charData = x1CharData;
	}

	private static _getChIndex(chCode: number): number {
		if (chCode < Constants.START_CH_CODE || chCode > Constants.END_CH_CODE) {
			chCode = CharCode.N;
		}
		return chCode - Constants.START_CH_CODE;
	}

	public x2RenderChar(target: ImageData, dx: number, dy: number, chCode: number, color: ParsedColor, backgroundColor: ParsedColor): void {
		const x2CharData = this.x2charData;
		const chIndex = MinimapCharRenderer2._getChIndex(chCode);

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

	public x1RenderChar(target: ImageData, dx: number, dy: number, chCode: number): void {
		const x1CharData = this.x1charData;
		const chIndex = MinimapCharRenderer2._getChIndex(chCode);
		const sourceOffset = chIndex * Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH;
		const c1 = x1CharData[sourceOffset];
		const c2 = x1CharData[sourceOffset + 1];

		const outWidth = target.width * Constants.RGBA_CHANNELS_CNT;
		let resultOffset = dy * outWidth + dx * Constants.RGBA_CHANNELS_CNT;

		const dest = target.data;
		dest[resultOffset + 0] = c1;
		dest[resultOffset + 1] = c1;
		dest[resultOffset + 2] = c1;
		dest[resultOffset + 3] = 255;
		resultOffset += outWidth;
		dest[resultOffset + 0] = c2;
		dest[resultOffset + 1] = c2;
		dest[resultOffset + 2] = c2;
		dest[resultOffset + 3] = 255;
	}
}

export class MinimapCharRenderer {

	_minimapCharRendererBrand: void;

	public readonly x2charData: Uint8ClampedArray;
	public readonly x1charData: Uint8ClampedArray;

	constructor(x2CharData: Uint8ClampedArray, x1CharData: Uint8ClampedArray) {
		const x2ExpectedLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		if (x2CharData.length !== x2ExpectedLen) {
			throw new Error('Invalid x2CharData');
		}
		const x1ExpectedLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		if (x1CharData.length !== x1ExpectedLen) {
			throw new Error('Invalid x1CharData');
		}
		this.x2charData = x2CharData;
		this.x1charData = x1CharData;
	}

	/**
	 * Assumes a line height of 4px and a char width of 2px
	 */
	public x2RenderChar(target: Uint8ClampedArray, lineLen: number, lineIndex: number, charIndex: number, chCode: number): void {
		const x2CharData = this.x2charData;

		const outWidth = Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * lineLen;

		if (chCode < Constants.START_CH_CODE || chCode > Constants.END_CH_CODE) {
			chCode = CharCode.N;
		}
		const chIndex = chCode - Constants.START_CH_CODE;

		let sourceOffset = chIndex * Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const c1 = x2CharData[sourceOffset];
		const a1 = x2CharData[sourceOffset + 1];
		const c2 = x2CharData[sourceOffset + 2];
		const a2 = x2CharData[sourceOffset + 3];

		const c3 = x2CharData[sourceOffset + 4];
		const a3 = x2CharData[sourceOffset + 5];
		const c4 = x2CharData[sourceOffset + 6];
		const a4 = x2CharData[sourceOffset + 7];

		const c5 = x2CharData[sourceOffset + 8];
		const a5 = x2CharData[sourceOffset + 9];
		const c6 = x2CharData[sourceOffset + 10];
		const a6 = x2CharData[sourceOffset + 11];

		const c7 = x2CharData[sourceOffset + 12];
		const a7 = x2CharData[sourceOffset + 13];
		const c8 = x2CharData[sourceOffset + 14];
		const a8 = x2CharData[sourceOffset + 15];

		// console.log(c1, a1, c2, a2, c3, a3, c4, a4, c5, a5, c6, a6, c7, a7, c8, a8);

		let resultOffset = Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * charIndex;
		resultOffset += lineIndex * Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * lineLen;

		target[resultOffset + 0] = c1;
		target[resultOffset + 1] = c1;
		target[resultOffset + 2] = c1;
		target[resultOffset + 3] = a1;
		target[resultOffset + 4] = c2;
		target[resultOffset + 5] = c2;
		target[resultOffset + 6] = c2;
		target[resultOffset + 7] = a2;
		resultOffset += outWidth;
		target[resultOffset + 0] = c3;
		target[resultOffset + 1] = c3;
		target[resultOffset + 2] = c3;
		target[resultOffset + 3] = a3;
		target[resultOffset + 4] = c4;
		target[resultOffset + 5] = c4;
		target[resultOffset + 6] = c4;
		target[resultOffset + 7] = a4;
		resultOffset += outWidth;
		target[resultOffset + 0] = c5;
		target[resultOffset + 1] = c5;
		target[resultOffset + 2] = c5;
		target[resultOffset + 3] = a5;
		target[resultOffset + 4] = c6;
		target[resultOffset + 5] = c6;
		target[resultOffset + 6] = c6;
		target[resultOffset + 7] = a6;
		resultOffset += outWidth;
		target[resultOffset + 0] = c7;
		target[resultOffset + 1] = c7;
		target[resultOffset + 2] = c7;
		target[resultOffset + 3] = a7;
		target[resultOffset + 4] = c8;
		target[resultOffset + 5] = c8;
		target[resultOffset + 6] = c8;
		target[resultOffset + 7] = a8;
	}

	/**
	 * Assumes a line height of 2px and a char width of 1px
	 */
	public x1RenderChar(target: Uint8ClampedArray, lineLen: number, lineIndex: number, charIndex: number, chCode: number): void {
		const x1CharData = this.x1charData;

		const outWidth = Constants.x1_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * lineLen;

		if (chCode < Constants.START_CH_CODE || chCode > Constants.END_CH_CODE) {
			chCode = CharCode.N;
		}
		const chIndex = chCode - Constants.START_CH_CODE;

		let sourceOffset = chIndex * Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const c1 = x1CharData[sourceOffset];
		const a1 = x1CharData[sourceOffset + 1];
		const c2 = x1CharData[sourceOffset + 2];
		const a2 = x1CharData[sourceOffset + 3];

		let resultOffset = Constants.x1_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * charIndex;
		target[resultOffset + 0] = c1;
		target[resultOffset + 1] = c1;
		target[resultOffset + 2] = c1;
		target[resultOffset + 3] = a1;
		resultOffset += outWidth;
		target[resultOffset + 0] = c2;
		target[resultOffset + 1] = c2;
		target[resultOffset + 2] = c2;
		target[resultOffset + 3] = a2;
	}
}
