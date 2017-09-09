/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorFormatter, ColorFormat } from 'vs/editor/common/modes';
import { Color } from 'vs/base/common/color';

function normalize(value: number, min: number, max: number): number {
	return value * (max - min) + min;
}

export class RGBFormatter implements IColorFormatter {
	readonly supportsTransparency: boolean = true;
	readonly colorFormat: ColorFormat = ColorFormat.RGB;

	format(color: Color): string {
		const rgb = color.rgba;
		if (rgb.a === 1) {
			return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
		} else {
			return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a})`;
		}
	}
}

export class HexFormatter implements IColorFormatter {
	readonly supportsTransparency: boolean = false;
	readonly colorFormat: ColorFormat = ColorFormat.HEX;

	_toTwoDigitHex(n: number): string {
		const r = n.toString(16);
		return r.length !== 2 ? '0' + r : r;
	}

	format(color: Color): string {
		const rgb = color.rgba;
		if (rgb.a === 1) {
			return `#${this._toTwoDigitHex(rgb.r).toUpperCase()}${this._toTwoDigitHex(rgb.g).toUpperCase()}${this._toTwoDigitHex(rgb.b).toUpperCase()}`;
		} else {
			return `#${this._toTwoDigitHex(rgb.r).toUpperCase()}${this._toTwoDigitHex(rgb.g).toUpperCase()}${this._toTwoDigitHex(rgb.b).toUpperCase()}${this._toTwoDigitHex(Math.round(rgb.a * 255)).toUpperCase()}`;
		}
	}
}

export class HSLFormatter implements IColorFormatter {
	readonly supportsTransparency: boolean = true;
	readonly colorFormat: ColorFormat = ColorFormat.HSL;

	format(color: Color): string {
		const hsla = color.hsla;
		if (hsla.a === 1) {
			return `hsl(${hsla.h}, ${normalize(hsla.s, 0, 100).toFixed(0)}%, ${normalize(hsla.l, 0, 100).toFixed(0)}%)`;
		} else {
			return `hsla(${hsla.h}, ${normalize(hsla.s, 0, 100).toFixed(0)}%, ${normalize(hsla.l, 0, 100).toFixed(0)}%, ${hsla.a})`;
		}
	}
}